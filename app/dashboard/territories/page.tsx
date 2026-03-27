// ============================================================================
// app/dashboard/territories/page.tsx - DASHBOARD ESTRATÉGICO (Refatorado)
// ============================================================================
"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog"
import { 
  Plus, 
  Map, 
  Loader2, 
  MapPin, 
  User, 
  Calendar,
  AlertTriangle,
  TrendingUp,
  Search,
  X,
  Clock,
  CheckCircle2,
  Pencil
} from "lucide-react"
import type { Profile, Campaign, Subdivision } from "@/lib/types"

// ============================================================================
// INTERFACES
// ============================================================================

interface TerritoryWithDetails {
  id: string
  number: string
  name: string
  type: string
  color: string
  status?: string
  description?: string
  assigned_to: string | null
  last_completed_at: string | null
  created_at: string
  group?: {
    id: string
    name: string
    color: string
  }
  assigned_to_user?: {
    id: string
    name: string
    email: string
  } | null
  campaign?: {
    id: string
    name: string
  } | null
  subdivisions?: Subdivision[]
}

interface PriorityScore {
  territory: TerritoryWithDetails
  score: number
  daysInactive: number
  priority: 'critical' | 'high' | 'medium' | 'low'
  reason: string
}

// ============================================================================
// FUNÇÕES DE CÁLCULO
// ============================================================================

function calculatePriorityScore(territory: TerritoryWithDetails): PriorityScore {
  const now = new Date()
  let score = 0
  let daysInactive = 0
  let priority: 'critical' | 'high' | 'medium' | 'low' = 'low'
  let reason = ''

  // Calcula dias de inatividade
  if (territory.last_completed_at) {
    const lastCompleted = new Date(territory.last_completed_at)
    daysInactive = Math.floor((now.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24))
  } else {
    // Se nunca foi trabalhado, usa a data de criação
    const createdAt = new Date(territory.created_at)
    daysInactive = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Calcula score baseado em dias inativos
  if (daysInactive > 180) { // 6 meses
    score = 100
    priority = 'critical'
    reason = `Não trabalhado há ${Math.floor(daysInactive / 30)} meses`
  } else if (daysInactive > 120) { // 4 meses
    score = 75
    priority = 'high'
    reason = `Inativo há ${Math.floor(daysInactive / 30)} meses`
  } else if (daysInactive > 60) { // 2 meses
    score = 50
    priority = 'medium'
    reason = 'Precisa de atenção'
  } else {
    score = 25
    priority = 'low'
    reason = 'Em dia'
  }

  // Bonus: território nunca designado
  if (!territory.last_completed_at) {
    score += 10
    reason = 'Nunca foi trabalhado'
  }

  // Penalidade: já está designado
  if (territory.assigned_to) {
    score -= 50
  }

  return {
    territory,
    score: Math.max(0, score),
    daysInactive,
    priority,
    reason
  }
}

function getProgressStats(subdivisions?: Subdivision[]) {
  if (!subdivisions || subdivisions.length === 0) {
    return { completed: 0, total: 0, percentage: 0 }
  }

  const completed = subdivisions.filter(s => s.completed || s.status === 'completed').length
  const total = subdivisions.length
  const percentage = Math.round((completed / total) * 100)

  return { completed, total, percentage }
}

const getPriorityBadge = (priority: PriorityScore['priority']) => {
  switch (priority) {
    case 'critical':
      return <Badge className="bg-red-600 hover:bg-red-700 text-white border-transparent">Crítico</Badge>
    case 'high':
      return <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-transparent">Alta</Badge>
    case 'medium':
      return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white border-transparent">Média</Badge>
    default:
      return <Badge variant="outline" className="text-slate-500 border-slate-200 bg-slate-50">Baixa</Badge>
  }
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function TerritoriesPage() {
  const supabase = getSupabaseBrowserClient()
  const [priorityTerritories, setPriorityTerritories] = useState<PriorityScore[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  
  // Assignment modal
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedTerritory, setSelectedTerritory] = useState<TerritoryWithDetails | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [searchUser, setSearchUser] = useState("")
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  
  // Novas datas do Modal Retroativo
  const formatToday = () => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }
  const [startDate, setStartDate] = useState(formatToday())
  const [endDate, setEndDate] = useState("")
  const [assigning, setAssigning] = useState(false)

  // Edit Territory Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTerritory, setEditingTerritory] = useState<TerritoryWithDetails | null>(null)
  const [editName, setEditName] = useState("")
  const [editNumber, setEditNumber] = useState("")
  const [editColor, setEditColor] = useState("")
  const [editInactive, setEditInactive] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setErrorMsg("")
      
      const [terrRes, usersRes, campRes] = await Promise.all([
        supabase
          .from("territories")
          .select(`
            *,
            group:groups(id, name, color),
            assigned_to_user:profiles!territories_assigned_to_fkey(id, name, email),
            campaign:campaigns(id, name),
            subdivisions(id, territory_id, completed, status, name)
          `)
          .order("number"),
        supabase
          .from("profiles")
          .select("*")
          .in("role", ["admin", "dirigente", "publicador"])
          .order("name"),
        supabase
          .from("campaigns")
          .select("*")
          .eq("active", true)
          .order("name")
      ])

      if (terrRes.error) throw terrRes.error
      if (usersRes.error) throw usersRes.error
      if (campRes.error) throw campRes.error

      if (usersRes.data) setUsers(usersRes.data)
      if (campRes.data) setCampaigns(campRes.data)

      if (terrRes.data) {
        const territoriesData = terrRes.data as unknown as TerritoryWithDetails[]
        const priorities = territoriesData
          .map(t => calculatePriorityScore(t))
          .sort((a, b) => b.score - a.score) // Ordena sempre por score por padrão
        setPriorityTerritories(priorities)
      }
    } catch (err: any) {
      console.error("Erro ao carregar dados:", err.message)
      setErrorMsg("Falha ao carregar territórios. Verifique sua conexão.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleOpenAssignDialog = (territory: TerritoryWithDetails) => {
    setSelectedTerritory(territory)
    setSelectedUserId(null)
    setSelectedCampaignId(null)
    setSearchUser("")
    setStartDate(formatToday())
    setEndDate("")
    setAssignDialogOpen(true)
  }

  const handleAssign = async () => {
    if (!selectedTerritory || !selectedUserId || !startDate) return
    setAssigning(true)

    try {
      // Cria a designação convertendo datetimes ajustados
      const startDateTime = new Date(`${startDate}T12:00:00Z`).toISOString()
      const endDateTime = endDate ? new Date(`${endDate}T12:00:00Z`).toISOString() : null

      const isCompleted = !!endDateTime

      const { error: assignError } = await supabase
        .from("assignments")
        .insert({
          territory_id: selectedTerritory.id,
          user_id: selectedUserId,
          campaign_id: selectedCampaignId || null,
          status: isCompleted ? "completed" : "active",
          assigned_at: startDateTime,
          completed_at: endDateTime,
        })

      if (assignError) throw assignError

      // Atualiza o status do território
      const territoryUpdates: any = {}
      if (isCompleted) {
        territoryUpdates.assigned_to = null
        territoryUpdates.last_completed_at = endDateTime
      } else {
        territoryUpdates.assigned_to = selectedUserId
      }

      const { error: updateError } = await supabase
        .from("territories")
        .update(territoryUpdates)
        .eq("id", selectedTerritory.id)

      if (updateError) throw updateError

      setAssignDialogOpen(false)
      loadData()
    } catch (error: any) {
      alert("Erro ao designar território: " + error.message)
    } finally {
      setAssigning(false)
    }
  }

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.email.toLowerCase().includes(searchUser.toLowerCase())
  )

  const handleOpenEdit = (territory: TerritoryWithDetails) => {
    setEditingTerritory(territory)
    setEditName(territory.name)
    setEditNumber(territory.number)
    setEditColor(territory.color || "#C65D3B")
    setEditInactive(territory.status === 'inactive')
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingTerritory) return
    setEditSaving(true)
    const newStatus = editInactive ? 'inactive' : (editingTerritory.status === 'inactive' ? 'available' : editingTerritory.status)
    try {
      const { error } = await supabase
        .from("territories")
        .update({
          name: editName,
          number: editNumber,
          color: editColor,
          status: newStatus,
          assigned_to: editInactive ? null : editingTerritory.assigned_to,
        })
        .eq("id", editingTerritory.id)
      if (error) throw error
      setEditDialogOpen(false)
      loadData()
    } catch (e: any) {
      alert("Erro ao salvar: " + e.message)
    } finally {
      setEditSaving(false)
    }
  }

  // Aplica a busca comum
  let results = priorityTerritories
  if (searchTerm) {
    results = priorityTerritories.filter(p =>
      p.territory.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.territory.number.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }

  // Divisão para as Abas
  const inactiveTerritories = results.filter(p => p.territory.status === 'inactive')
  const activeResults = results.filter(p => p.territory.status !== 'inactive')
  const availableTerritories = activeResults.filter(p => !p.territory.assigned_to)
  const assignedTerritories = activeResults.filter(p => !!p.territory.assigned_to)
  const overdueTerritories = activeResults.filter(p => p.priority === 'critical' || p.priority === 'high')

  // Componente interno para reuso de Card
  const TerritoryCard = ({ p }: { p: PriorityScore }) => {
    const territory = p.territory
    const stats = getProgressStats(territory.subdivisions)
    const isOverdue = p.daysInactive > 180

    return (
      <Card className="group flex flex-col border border-slate-200 hover:border-primary hover:shadow-md transition-all bg-white h-full relative overflow-hidden">
        <CardContent className="p-4 flex flex-col h-full relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="font-mono text-sm px-2 py-0.5 shadow-none bg-slate-100 text-slate-700">
                #{territory.number}
              </Badge>
              <h3 className="font-bold text-base text-slate-800 line-clamp-1" title={territory.name}>
                {territory.name}
              </h3>
            </div>
            {getPriorityBadge(p.priority)}
          </div>

          {/* Usuário, Campanhas e Status Rápido */}
          <div className="flex-1 space-y-3 mb-4">
            {territory.campaign && (
              <div className="mb-2">
                <Badge variant="secondary" className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                  🎯 {territory.campaign.name}
                </Badge>
              </div>
            )}
            
            {territory.assigned_to_user ? (
              <div className="flex items-center gap-2 text-sm">
                <div className="bg-primary/10 text-primary p-1.5 rounded-full">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 leading-none">
                    {territory.assigned_to_user.name}
                  </p>
                  <p className="text-xs font-medium text-slate-600 mt-1">Em campo agora</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <div className="bg-slate-100 text-slate-400 p-1.5 rounded-full">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="leading-none text-muted-foreground font-normal">
                  Disponível para designação
                </div>
              </div>
            )}

            {/* Progresso de Quadras */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Progresso
                </span>
                <span className="font-semibold text-slate-700">
                  {stats.completed}/{stats.total}
                </span>
              </div>
              {stats.total > 0 ? (
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${stats.percentage === 100 ? 'bg-green-500' : 'bg-primary'}`}
                    style={{ width: `${stats.percentage}%` }}
                  />
                </div>
              ) : (
                <div className="h-2 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center">
                  <span className="text-[8px] text-slate-400">Sem áreas mapeadas</span>
                </div>
              )}
            </div>

            {/* Histórico / Aviso Crítico */}
            <div className="pt-1">
              {isOverdue && !territory.assigned_to ? (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 p-2 rounded-md font-medium border border-red-100">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{p.reason}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium bg-slate-50 p-2 rounded-md border border-slate-100">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span>
                    {!territory.last_completed_at && !territory.assigned_to ? "Nunca concluído" : 
                    `${p.daysInactive} dias desde última conclusão`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2 mt-auto border-t border-slate-100">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-slate-400 hover:text-primary hover:bg-primary/10 flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); handleOpenEdit(territory) }}
              title="Editar território"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-sm bg-muted hover:bg-muted/80 border-border text-foreground transition-colors"
              asChild
            >
              <Link href={`/dashboard/territories/${territory.id}/map`}>
                <Map className="mr-2 h-4 w-4 text-slate-500" />
                Ver Mapa
              </Link>
            </Button>
            
            {!territory.assigned_to && (
              <Button
                size="sm"
                className="flex-1 text-sm shadow-sm"
                onClick={() => handleOpenAssignDialog(territory)}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                Designar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading && priorityTerritories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p>Carregando territórios...</p>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-red-50/50 rounded-xl border border-red-100 text-red-700 max-w-lg mx-auto p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">Ops! Ocorreu um erro.</h2>
        <p className="text-sm">{errorMsg}</p>
        <Button onClick={() => loadData()} variant="outline" className="mt-6">
          Tentar Novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* Header Secção */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Territórios</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestão inteligente das quadras e designações.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por nome ou Nº..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white border-slate-200"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-slate-100"
              >
                <X className="h-3 w-3 text-slate-500" />
              </button>
            )}
          </div>
          <Button asChild className="shrink-0 shadow-sm">
            <Link href="/dashboard/territories/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs e Lista */}
      <Tabs defaultValue="available" className="w-full">
        <div className="mb-6 w-full max-w-full overflow-x-auto pb-2 -mb-2">
          <div className="inline-flex items-center bg-slate-100/50 p-1.5 rounded-lg border border-slate-200/60 w-max min-w-full sm:min-w-0 sm:w-fit">
            <TabsList className="bg-transparent h-auto p-0 border-none flex-nowrap gap-1 w-full justify-start">
              <TabsTrigger 
                value="available" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:bg-slate-200/60 data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-medium transition-all"
              >
                Disponíveis
                <Badge variant="secondary" className="ml-2 bg-black/5 hover:bg-black/10 text-inherit border-none shadow-none">{availableTerritories.length}</Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="assigned" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:bg-slate-200/60 data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-medium transition-all"
              >
                Em Campo
                <Badge variant="secondary" className="ml-2 bg-black/5 hover:bg-black/10 text-inherit border-none shadow-none">{assignedTerritories.length}</Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="overdue" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:bg-slate-200/60 data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-medium transition-all"
              >
                Prioritários
                {overdueTerritories.length > 0 && (
                  <Badge className="ml-2 bg-red-500/10 text-red-600 data-[state=active]:bg-black/10 data-[state=active]:text-inherit hover:bg-red-500/20 shadow-none border-none">{overdueTerritories.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="all" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:bg-slate-200/60 data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-medium transition-all"
              >
                Todos
                <Badge variant="secondary" className="ml-2 bg-black/5 hover:bg-black/10 text-inherit border-none shadow-none">{activeResults.length}</Badge>
              </TabsTrigger>
              {inactiveTerritories.length > 0 && (
                <TabsTrigger 
                  value="inactive" 
                  className="data-[state=active]:bg-slate-700 data-[state=active]:text-white hover:bg-slate-200/60 data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-medium transition-all"
                >
                  Inativos
                  <Badge className="ml-2 bg-slate-400/20 text-slate-500 shadow-none border-none">{inactiveTerritories.length}</Badge>
                </TabsTrigger>
              )}
            </TabsList>
          </div>
        </div>

        {/* Content Áreas */}
        <TabsContent value="all" className="mt-0 outline-none">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeResults.map((p) => <TerritoryCard key={p.territory.id} p={p} />)}
            {activeResults.length === 0 && <p className="text-slate-500 py-10 col-span-full text-center">Nenhum território encontrado.</p>}
          </div>
        </TabsContent>

        <TabsContent value="inactive" className="mt-0 outline-none">
          <p className="text-sm text-slate-500 mb-4">Territórios inativos não aparecem nas designações e são ocultados do fluxo normal.</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {inactiveTerritories.map((p) => <TerritoryCard key={p.territory.id} p={p} />)}
            {inactiveTerritories.length === 0 && <p className="text-slate-500 py-10 col-span-full text-center">Nenhum território inativo.</p>}
          </div>
        </TabsContent>

        <TabsContent value="available" className="mt-0 outline-none">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {availableTerritories.map((p) => <TerritoryCard key={p.territory.id} p={p} />)}
            {availableTerritories.length === 0 && <p className="text-slate-500 py-10 col-span-full text-center">Parabéns! Nenhum território disponível (todos em campo).</p>}
          </div>
        </TabsContent>

        <TabsContent value="assigned" className="mt-0 outline-none">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assignedTerritories.map((p) => <TerritoryCard key={p.territory.id} p={p} />)}
            {assignedTerritories.length === 0 && <p className="text-slate-500 py-10 col-span-full text-center">Nenhum território sendo trabalhado no momento.</p>}
          </div>
        </TabsContent>

        <TabsContent value="overdue" className="mt-0 outline-none">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {overdueTerritories.map((p) => <TerritoryCard key={p.territory.id} p={p} />)}
            {overdueTerritories.length === 0 && <p className="text-slate-500 py-10 col-span-full text-center">Ótimo trabalho! Sem territórios atrasados na fila de atenção.</p>}
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Avançado de Designação / Histórico */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-0 shadow-2xl rounded-2xl z-[9999]">
          <div className="bg-primary px-6 py-6 pb-8 rounded-t-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <MapPin className="w-24 h-24" />
            </div>
            <DialogHeader className="relative z-10">
              <DialogTitle className="text-2xl text-white font-bold tracking-tight">
                Designar Território
              </DialogTitle>
              <DialogDescription className="text-primary-foreground/80 pt-1 text-sm font-medium">
                #{selectedTerritory?.number} - {selectedTerritory?.name}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-6 space-y-5 bg-white -mt-4 rounded-t-2xl relative border-t z-20">
            {/* User Search */}
            <div className="space-y-2">
              <Label className="text-slate-700 font-semibold">Publicador Responsável *</Label>
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Buscar pelo nome..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="pl-9 border-slate-200 focus:ring-primary focus:border-primary shadow-sm"
                />
                {searchUser && (
                  <button onClick={() => setSearchUser("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                  </button>
                )}
              </div>

              {searchUser && (
                <div className="border border-slate-200 rounded-lg max-h-[160px] overflow-y-auto shadow-sm mt-1 animate-in fade-in slide-in-from-top-1">
                  {filteredUsers.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500 text-center">Nenhum usuário encontrado</p>
                  ) : (
                    filteredUsers.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => {
                          setSelectedUserId(user.id)
                          setSearchUser(user.name)
                        }}
                        className={`w-full text-left p-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors flex items-center justify-between ${
                          selectedUserId === user.id ? "bg-slate-50/80" : ""
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-sm text-slate-800">{user.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                        </div>
                        {selectedUserId === user.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700 font-semibold flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-slate-400" /> Início *
                </Label>
                <Input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="shadow-sm border-slate-200 text-sm"
                  required
                />
                <p className="text-[10px] text-slate-500 leading-tight">Data de designação.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-slate-400" /> Fim (Opcional)
                </Label>
                <Input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="shadow-sm border-slate-200 text-sm"
                />
                <p className="text-[10px] text-slate-500 leading-tight">Preencha para gerar histórico retroativo ou baixa imediata.</p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <Label className="text-slate-700 font-semibold">Campanha Específica (Opcional)</Label>
              <select
                value={selectedCampaignId || ""}
                onChange={(e) => setSelectedCampaignId(e.target.value || null)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="">Nenhuma / Designação Regular</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="bg-slate-50 px-6 py-4 border-t border-slate-100">
            <Button variant="ghost" onClick={() => setAssignDialogOpen(false)} className="text-slate-600 hover:text-slate-900">
              Cancelar
            </Button>
            <Button 
              onClick={handleAssign} 
              disabled={!selectedUserId || assigning || !startDate}
              className="px-6 shadow-sm"
            >
              {assigning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : endDate ? (
                "Finalizar e Salvar Histórico"
              ) : (
                "Designar Agora"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Territory Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Território</DialogTitle>
            <DialogDescription>
              Altere os dados do território.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-number">Número</Label>
              <Input
                id="edit-number"
                value={editNumber}
                onChange={(e) => setEditNumber(e.target.value)}
                placeholder="Ex: 42"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome do território"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-color">Cor</Label>
              <div className="flex items-center gap-3">
                <input
                  id="edit-color"
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-9 w-14 rounded border border-slate-200 cursor-pointer p-0.5"
                />
                <span className="text-sm text-slate-600 font-mono">{editColor}</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Inativar território</p>
                <p className="text-xs text-slate-500">Oculta das designações e do fluxo normal</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={editInactive}
                onClick={() => setEditInactive(!editInactive)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  editInactive ? 'bg-slate-500' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                    editInactive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)} disabled={editSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving || !editName || !editNumber}>
              {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}