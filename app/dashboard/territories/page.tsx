"use client"

import React from "react"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Map, Loader2, MoreVertical, Pencil, Trash2, Eye } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Territory, Campaign, TerritoryWithBlocks } from "@/lib/types"

const COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#eab308", // yellow
  "#f97316", // orange
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
]

export default function TerritoriesPage() {
  const [territories, setTerritories] = useState<TerritoryWithBlocks[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTerritory, setEditingTerritory] = useState<Territory | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    campaign_id: "",
    color: COLORS[0],
  })
  const [submitting, setSubmitting] = useState(false)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const [territoriesRes, campaignsRes] = await Promise.all([
      supabase
        .from("territories")
        .select(`
          *,
          blocks(*),
          campaign:campaigns(*)
        `)
        .order("created_at", { ascending: false }),
      supabase.from("campaigns").select("*").eq("is_active", true),
    ])

    if (territoriesRes.data) {
      setTerritories(territoriesRes.data as TerritoryWithBlocks[])
    }
    if (campaignsRes.data) {
      setCampaigns(campaignsRes.data as Campaign[])
    }
    setLoading(false)
  }

  const handleOpenDialog = (territory?: Territory) => {
    if (territory) {
      setEditingTerritory(territory)
      setFormData({
        name: territory.name,
        description: territory.description || "",
        campaign_id: territory.campaign_id,
        color: territory.color,
      })
    } else {
      setEditingTerritory(null)
      setFormData({
        name: "",
        description: "",
        campaign_id: campaigns[0]?.id || "",
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
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
      campaign_id: formData.campaign_id,
      color: formData.color,
    }

    if (editingTerritory) {
      await supabase
        .from("territories")
        .update(payload)
        .eq("id", editingTerritory.id)
    } else {
      await supabase.from("territories").insert(payload)
    }

    setDialogOpen(false)
    setSubmitting(false)
    fetchData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este território? Todas as quadras serão excluídas também.")) return

    await supabase.from("territories").delete().eq("id", id)
    fetchData()
  }

  const getBlockStats = (territory: TerritoryWithBlocks) => {
    const blocks = territory.blocks || []
    const total = blocks.length
    const available = blocks.filter(b => b.status === "available").length
    const assigned = blocks.filter(b => b.status === "assigned").length
    const completed = blocks.filter(b => b.status === "completed").length
    return { total, available, assigned, completed }
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
          <h1 className="text-3xl font-bold">Territórios</h1>
          <p className="text-muted-foreground">
            Gerencie os territórios e suas quadras
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} disabled={campaigns.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Território
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingTerritory ? "Editar Território" : "Novo Território"}
                </DialogTitle>
                <DialogDescription>
                  {editingTerritory
                    ? "Atualize os dados do território"
                    : "Preencha os dados para criar um novo território"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="campaign">Campanha</Label>
                  <Select
                    value={formData.campaign_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, campaign_id: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma campanha" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do território</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Ex: Centro, Zona Norte"
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
                <div className="space-y-2">
                  <Label>Cor do território</Label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`h-8 w-8 rounded-full border-2 transition-transform ${
                          formData.color === color
                            ? "scale-110 border-foreground"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
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
                  ) : editingTerritory ? (
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

      {campaigns.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Map className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Crie uma campanha primeiro</p>
            <p className="text-sm text-muted-foreground mb-4">
              Você precisa ter uma campanha ativa para criar territórios
            </p>
            <Button asChild>
              <Link href="/dashboard/campaigns">Ir para Campanhas</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {campaigns.length > 0 && territories.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Map className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum território criado</p>
            <p className="text-sm text-muted-foreground mb-4">
              Crie seu primeiro território para começar
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Território
            </Button>
          </CardContent>
        </Card>
      )}

      {territories.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {territories.map((territory) => {
            const stats = getBlockStats(territory)
            return (
              <Card key={territory.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: territory.color }}
                      />
                      <div>
                        <CardTitle className="text-lg">{territory.name}</CardTitle>
                        <CardDescription>
                          {territory.campaign?.name || "Sem campanha"}
                        </CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/territories/${territory.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            Ver detalhes
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/territories/${territory.id}/map`}>
                            <Map className="mr-2 h-4 w-4" />
                            Editar mapa
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenDialog(territory)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(territory.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{stats.total} quadras</Badge>
                    {stats.available > 0 && (
                      <Badge variant="outline" className="border-green-500 text-green-600">
                        {stats.available} disponíveis
                      </Badge>
                    )}
                    {stats.assigned > 0 && (
                      <Badge variant="outline" className="border-blue-500 text-blue-600">
                        {stats.assigned} em trabalho
                      </Badge>
                    )}
                    {stats.completed > 0 && (
                      <Badge variant="outline" className="border-gray-500 text-gray-600">
                        {stats.completed} concluídas
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
