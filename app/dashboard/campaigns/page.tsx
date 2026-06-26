"use client"

import React from "react"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { getLocalTodayStr, formatSafeDate } from "@/lib/date-utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Calendar, Loader2, MoreVertical, Pencil, Trash2, CheckCircle, Power, Ban, MapPin, CheckSquare } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Campaign } from "@/lib/types"
import { error } from "console"

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<Record<string, { 
    total: number, 
    completed: number,
    totalSubdivisions: number,
    completedSubdivisions: number
  }>>({})
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    start_date: "",
    end_date: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    fetchCampaigns()
  }, [])

  async function fetchCampaigns() {
    const { data: campaignsData } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false })

    if (campaignsData) {
      setCampaigns(campaignsData as Campaign[])
      
      // Fetch assignments, subdivisions, campaign progress, and territories in parallel
      const [assignmentsRes, progressRes, subdivisionsRes, territoriesRes] = await Promise.all([
        supabase.from("assignments").select("territory_id, campaign_id, status"),
        supabase.from("subdivision_campaign_progress").select("completed, campaign_id, subdivision_id"),
        supabase.from("subdivisions").select("id, territory_id"),
        supabase.from("territories").select("id, type").neq("status", "inactive")
      ])

      const allAssignments = assignmentsRes.data || []
      const allProgress = progressRes.data || []
      const allSubdivisions = subdivisionsRes.data || []
      const allActiveTerritories = territoriesRes.data || []

      // Filtrar apenas territórios residenciais ativos (tipo nulo conta como residencial por padrão)
      const residentialTerritories = allActiveTerritories.filter(
        (t: any) => !t.type || t.type === "residencial"
      )
      const residentialIds = new Set(residentialTerritories.map((t: any) => t.id))
      const totalActiveResidential = residentialIds.size

      const newStats: Record<string, { 
        total: number, 
        completed: number,
        totalSubdivisions: number,
        completedSubdivisions: number
      }> = {}
      
      campaignsData.forEach((c: Campaign) => {
        const campaignAssignments = allAssignments.filter((a: any) => a.campaign_id === c.id)
        
        // Denominador: Total de territórios residenciais ativos cadastrados
        const total = totalActiveResidential

        // Numerador: Territórios residenciais concluídos nesta campanha
        const completedAssignments = campaignAssignments.filter((a: any) => a.status === "completed")
        const uniqueCompleted = new Set(
          completedAssignments
            .map((a: any) => a.territory_id)
            .filter((tid: string) => residentialIds.has(tid))
        ).size

        // Total de quadras apenas dos territórios residenciais ativos
        const campaignSubdivisions = allSubdivisions.filter((s: any) => residentialIds.has(s.territory_id))
        const totalSubdivisions = campaignSubdivisions.length

        // Quadras concluídas nesta campanha
        const campaignProgress = allProgress.filter((p: any) => p.campaign_id === c.id && p.completed)
        const completedSubdivisions = campaignProgress.length

        newStats[c.id] = { 
          total, 
          completed: uniqueCompleted,
          totalSubdivisions,
          completedSubdivisions
        }
      })
      
      setStats(newStats)
    }
    setLoading(false)
  }

  const handleOpenDialog = (campaign?: Campaign) => {
    if (campaign) {
      setEditingCampaign(campaign)
      setFormData({
        name: campaign.name,
        description: campaign.description || "",
        start_date: campaign.start_date ? campaign.start_date.split("T")[0] : "",
        end_date: campaign.end_date ? campaign.end_date.split("T")[0] : "",
      })
    } else {
      setEditingCampaign(null)
      setFormData({
        name: "",
        description: "",
        start_date: getLocalTodayStr(),
        end_date: "",
      })
    }
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const payload = {
      name: formData.name,
      description: formData.description || null,
      start_date: formData.start_date,
      end_date: formData.end_date || null,
    }

    if (editingCampaign) {
      await supabase
        .from("campaigns")
        .update(payload)
        .eq("id", editingCampaign.id)
    } else {
      await supabase.from("campaigns").insert(payload)
    }

    setDialogOpen(false)
    setSubmitting(false)
    fetchCampaigns()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta campanha?")) return

    await supabase.from("campaigns").delete().eq("id", id)
    fetchCampaigns()
  }

  const handleToggleActive = async (campaign: Campaign) => {
    await supabase
      .from("campaigns")
      .update({ active: !campaign.active })
      .eq("id", campaign.id)
    fetchCampaigns()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">Campanhas</h1>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Gerencie as campanhas de pregação e progresso global.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingCampaign ? "Editar Campanha" : "Nova Campanha"}
                </DialogTitle>
                <DialogDescription>
                  {editingCampaign
                    ? "Atualize os dados da campanha"
                    : "Preencha os dados para criar uma nova campanha"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da campanha</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Ex: Campanha de Memorial 2024"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Descrição opcional..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_date">Data de início</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) =>
                        setFormData({ ...formData, start_date: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">Data de término</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) =>
                        setFormData({ ...formData, end_date: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : editingCampaign ? (
                    "Salvar"
                  ) : (
                    "Criar"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma campanha criada</p>
            <p className="text-sm text-muted-foreground mb-4">
              Crie sua primeira campanha para começar
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{campaign.name}</CardTitle>
                    <CardDescription>
                      {campaign.description || "Sem descrição"}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenDialog(campaign)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(campaign)}>
                        {campaign.active ? (
                          <>
                            <Ban className="mr-2 h-4 w-4" />
                            Desativar
                          </>
                        ) : (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Ativar
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(campaign.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <p>
                      Início: {formatSafeDate(campaign.start_date) || "Não definida"}
                    </p>
                    {campaign.end_date && (
                      <p>
                        Término: {formatSafeDate(campaign.end_date)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {(() => {
                      const todayStr = getLocalTodayStr()
                      const isExpired = campaign.end_date && campaign.end_date < todayStr
                      
                      if (!campaign.active) {
                        return <Badge variant="secondary">Inativa</Badge>
                      }
                      
                      if (isExpired) {
                        return (
                          <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 font-bold">
                            Finalizada
                          </Badge>
                        )
                      }
                      
                      return <Badge variant="default">Ativa</Badge>
                    })()}
                  </div>
                </div>

                {/* Progress Bar */}
                {stats[campaign.id] && stats[campaign.id].total > 0 && (
                  <div className="mt-6 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <CheckSquare className="h-3.5 w-3.5" />
                        <span>Territórios</span>
                      </div>
                      <span className="font-medium">
                        {stats[campaign.id].completed} de {stats[campaign.id].total}
                      </span>
                    </div>
                    <Progress 
                      value={(stats[campaign.id].completed / stats[campaign.id].total) * 100} 
                      className="h-2"
                    />
                    <div className="flex justify-between items-center text-[0.625rem] text-muted-foreground mt-1">
                      {campaign.active && stats[campaign.id].totalSubdivisions > 0 ? (
                        <span>
                          Quadras: {stats[campaign.id].completedSubdivisions} de {stats[campaign.id].totalSubdivisions} ({Math.round((stats[campaign.id].completedSubdivisions / stats[campaign.id].totalSubdivisions) * 100)}%)
                        </span>
                      ) : (
                        <span />
                      )}
                      <span>
                        {Math.round((stats[campaign.id].completed / stats[campaign.id].total) * 100)}% concluído
                      </span>
                    </div>
                  </div>
                )}
                {(!stats[campaign.id] || stats[campaign.id].total === 0) && (
                  <div className="mt-6 pt-4 border-t text-center">
                    <p className="text-xs text-muted-foreground italic">Nenhum território vinculado</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
