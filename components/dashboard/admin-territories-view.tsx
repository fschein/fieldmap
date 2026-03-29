"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { createTimeoutSignal } from "@/lib/utils/api-utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
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
  Pencil,
  ArrowRight
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
  territory: TerritoryWithDetails & { assignments?: any[] }
  score: number
  daysInactive: number
  daysAssigned?: number
  isReturned?: boolean
  priority: 'critical' | 'high' | 'medium' | 'low'
  reason: string
}

// ============================================================================
// FUNÇÕES DE CÁLCULO
// ============================================================================

function calculatePriorityScore(territory: TerritoryWithDetails & { assignments?: any[] }): PriorityScore {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  let score = 0
  let daysInactive = 0
  let daysAssigned = 0
  let priority: 'critical' | 'high' | 'medium' | 'low' = 'low'
  let reason = ''

  // 1. Dias Inativo (LIVRE): hoje - (last_completed_at || created_at)
  // Isso define a URGÊNCIA do território ser trabalhado.
  const lastActivityDate = territory.last_completed_at || territory.created_at
  const lastActivity = new Date(lastActivityDate)
  const activityDay = new Date(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate())

  const diffInactive = today.getTime() - activityDay.getTime()
  daysInactive = Math.max(0, Math.floor(diffInactive / (1000 * 60 * 60 * 24)))

  // 2. Status Devolvido: última designação foi devolvida e não está designado agora
  const latestAssignment = [...(territory.assignments || [])].sort((a, b) =>
    new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
  )[0]
  const isReturned = !territory.assigned_to && latestAssignment?.status === 'returned'

  // 3. Dias Designado: hoje - (assigned_at da designação ativa)
  if (territory.assigned_to) {
    const activeAssignment = territory.assignments?.find((a: any) => a.status === 'active')
    if (activeAssignment) {
      const assignedDate = new Date(activeAssignment.assigned_at)
      const assignedDay = new Date(assignedDate.getFullYear(), assignedDate.getMonth(), assignedDate.getDate())
      const diffAssigned = today.getTime() - assignedDay.getTime()
      daysAssigned = Math.max(0, Math.floor(diffAssigned / (1000 * 60 * 60 * 24)))
    }
  }

  // Calcula score baseado em dias inativos (mesmo se estiver designado, o score de "atraso" é mantido)
  if (daysInactive >= 30) {
    score = 100
    priority = 'critical'
    reason = `Inativo há ${daysInactive} dias`
  } else if (daysInactive >= 10) {
    score = 50
    priority = 'medium'
    reason = `Parado há ${daysInactive} dias`
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

  // Penalidade: já está designado (reduz prioridade na lista de "A designar")
  if (territory.assigned_to) {
    score -= 50
  }

  return {
    territory,
    score: Math.max(0, score),
    daysInactive,
    daysAssigned,
    isReturned,
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

const FilterPill = ({ label, count, active, onClick, emoji }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-tight transition-all flex items-center gap-2 border shadow-sm",
      active
        ? "bg-[#C65D3B] text-white border-[#C65D3B] shadow-md"
        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
    )}
  >
    {emoji && <span>{emoji}</span>}
    {label}
    <span className={cn(
      "text-[9px] px-1.5 py-0.5 rounded-full font-black min-w-[18px]",
      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
    )}>
      {count}
    </span>
  </button>
)

const supabase = getSupabaseBrowserClient()

export function AdminTerritoriesView() {
  const router = useRouter()
  const [priorityTerritories, setPriorityTerritories] = useState<PriorityScore[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [errorMsg, setErrorMsg] = useState("")

  // Assignment modal
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedTerritory, setSelectedTerritory] = useState<TerritoryWithDetails | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const [groups, setGroups] = useState<any[]>([])
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

  // Memorização de filtros e contagens para performance
  const activeResults = useMemo(() => priorityTerritories.filter(p => p.territory.status !== 'inactive'), [priorityTerritories])
  const inactiveTerritories = useMemo(() => priorityTerritories.filter(p => p.territory.status === 'inactive'), [priorityTerritories])

  const counts = useMemo(() => ({
    all: activeResults.length,
    urgentes: activeResults.filter(p => !p.territory.assigned_to && p.daysInactive > 30).length,
    parados: activeResults.filter(p => !p.territory.assigned_to && p.daysInactive > 10 && p.daysInactive <= 30).length,
    livres: activeResults.filter(p => !p.territory.assigned_to).length,
    inactive: inactiveTerritories.length
  }), [activeResults, inactiveTerritories])

  const filteredList = useMemo(() => {
    let list: PriorityScore[] = []
    if (activeFilter === "all") list = activeResults
    else if (activeFilter === "urgentes") list = activeResults.filter(p => !p.territory.assigned_to && p.daysInactive > 30)
    else if (activeFilter === "parados") list = activeResults.filter(p => !p.territory.assigned_to && p.daysInactive > 10 && p.daysInactive <= 30)
    else if (activeFilter === "livres") list = activeResults.filter(p => !p.territory.assigned_to)
    else if (activeFilter === "inactive") list = inactiveTerritories

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase()
      list = list.filter(p =>
        p.territory.name.toLowerCase().includes(lowerSearch) ||
        p.territory.number.toLowerCase().includes(lowerSearch)
      )
    }
    return list
  }, [activeResults, inactiveTerritories, activeFilter, searchTerm])

  // Edit Territory Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTerritory, setEditingTerritory] = useState<TerritoryWithDetails | null>(null)
  const [editName, setEditName] = useState("")
  const [editNumber, setEditNumber] = useState("")
  const [editColor, setEditColor] = useState("")
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [editInactive, setEditInactive] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMsg("")
    const { signal, clear } = createTimeoutSignal(15000)

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const [terrRes, usersRes, campRes, groupsRes] = await Promise.all([
        supabase
          .from("territories")
          .select(`
            *,
            group:groups(id, name, color),
            assigned_to_user:profiles!territories_assigned_to_fkey(id, name, email),
            campaign:campaigns(id, name),
            subdivisions(id, territory_id, completed, status, name),
            assignments(id, assigned_at, status)
          `)
          .abortSignal(signal)
          .order("number"),
        supabase
          .from("profiles")
          .select("*")
          .in("role", ["admin", "dirigente", "publicador"])
          .abortSignal(signal)
          .order("name"),
        supabase
          .from("campaigns")
          .select("*")
          .eq("active", true)
          .abortSignal(signal)
          .order("name"),
        supabase
          .from("groups")
          .select("*")
          .abortSignal(signal)
          .order("name")
      ])

      if (usersRes.error) throw usersRes.error
      if (campRes.error) throw campRes.error
      if (groupsRes.error) throw groupsRes.error

      if (usersRes.data) setUsers(usersRes.data)
      if (campRes.data) setCampaigns(campRes.data)
      if (groupsRes.data) setGroups(groupsRes.data)

      if (terrRes.data) {
        const territoriesData = terrRes.data as unknown as TerritoryWithDetails[]
        const priorities = territoriesData
          .map(t => calculatePriorityScore(t))
        setPriorityTerritories(priorities)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setErrorMsg("Tempo esgotado ao carregar dados. Verifique sua conexão.")
      } else {
        console.error("Erro ao carregar dados:", err.message)
        setErrorMsg("Falha ao carregar territórios.")
      }
    } finally {
      clear()
      setLoading(false)
    }
  }, [])

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

      // Inserir notificação para o publicador (Novo território designado)
      if (!isCompleted) {
        await supabase.from("notifications").insert({
          type: "assigned",
          title: "Novo território designado",
          message: `O território ${selectedTerritory.number} foi designado para você.`,
          user_id: selectedUserId,
          territory_id: selectedTerritory.id,
          created_by: (await supabase.auth.getUser()).data.user?.id
        }).catch((err: unknown) => console.error("Erro ao inserir notificação:", err))
      }

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
    setEditGroupId(territory.group?.id || null)
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
          color: editGroupId ? groups.find(g => g.id === editGroupId)?.color || editColor : editColor,
          group_id: editGroupId,
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


  const TerritoryCard = ({ p }: { p: PriorityScore }) => {
    const territory = p.territory
    const isLivre = !territory.assigned_to

    // Borda lateral e cor do texto baseadas na prioridade
    let borderColor = "border-slate-100"
    let daysColor = "text-slate-400"
    if (isLivre) {
      if (p.daysInactive >= 30) {
        borderColor = "border-l-4 border-red-500"
        daysColor = "text-red-500"
      } else if (p.daysInactive >= 10) {
        borderColor = "border-l-4 border-yellow-400"
        daysColor = "text-yellow-600"
      } else {
        borderColor = "border-l-4 border-slate-200"
      }
    }

    return (
      <div
        onClick={() => router.push(`/dashboard/territories/${territory.id}/map`)}
        className={cn(
          "bg-white p-4 rounded-xl border-y border-r shadow-sm transition-all active:scale-[0.98] cursor-pointer hover:shadow-md h-full flex items-center justify-between gap-4",
          borderColor
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-semibold text-slate-500">
              [#{territory.number}]
            </span>
            <h3 className="font-bold text-slate-900 truncate text-sm">
              {territory.name || "Sem nome"}
            </h3>
            {territory.group && (
              <span 
                className="w-2 h-2 rounded-full shrink-0 shadow-sm" 
                style={{ backgroundColor: territory.group.color }}
                title={`Grupo: ${territory.group.name}`}
              />
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            {isLivre ? (
              <div className="flex items-center gap-2">
                {p.isReturned ? (
                  <span className="bg-orange-50 text-orange-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tight border border-orange-100">
                    DEVOLVIDO
                  </span>
                ) : (
                  <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tight border border-emerald-100">
                    LIVRE
                  </span>
                )}
                <span className={cn("font-bold flex items-center gap-1", daysColor)}>
                  ⌛ {p.daysInactive}d
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-extrabold text-[#C65D3B] truncate max-w-[90px]">
                  {territory.assigned_to_user?.name?.split(' ')[0]}
                </span>
                <span className="font-bold text-slate-400 shrink-0">
                  ⌛ {p.daysAssigned}d
                </span>
              </div>
            )}
            {territory.group && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                <Map className="h-3 w-3" />
                {territory.group.name}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(territory);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          {isLivre && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenAssignDialog(territory);
              }}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
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
          </div>
          <Button asChild className="shrink-0 shadow-sm">
            <Link href="/dashboard/territories/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Pills Filters */}
        <div className="flex gap-2 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          <FilterPill
            active={activeFilter === "all"}
            onClick={() => setActiveFilter("all")}
            label="Todos"
            count={counts.all}
          />
          <FilterPill
            emoji="🔥"
            active={activeFilter === "urgentes"}
            onClick={() => setActiveFilter("urgentes")}
            label="Urgentes"
            count={counts.urgentes}
          />
          <FilterPill
            emoji="⏳"
            active={activeFilter === "parados"}
            onClick={() => setActiveFilter("parados")}
            label="Parados"
            count={counts.parados}
          />
          <FilterPill
            emoji="🆕"
            active={activeFilter === "livres"}
            onClick={() => setActiveFilter("livres")}
            label="Livres"
            count={counts.livres}
          />
          {counts.inactive > 0 && (
            <FilterPill
              active={activeFilter === "inactive"}
              onClick={() => setActiveFilter("inactive")}
              label="Inativos"
              count={counts.inactive}
            />
          )}
        </div>

        {/* Territory Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-h-[200px]">
          {filteredList.length === 0 ? (
            <div className="py-20 text-center col-span-full bg-white rounded-2xl border border-dashed border-slate-200">
              <MapPin className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">Nenhum território encontrado neste filtro.</p>
            </div>
          ) : (
            filteredList.map((p) => <TerritoryCard key={p.territory.id} p={p} />)
          )}
        </div>
      </div>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          {/* Assignment Modal Content */}
          <DialogHeader>
            <DialogTitle>Designar Território</DialogTitle>
          </DialogHeader>
          {/* Logic remains same as original */}
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Publicador Responsável</Label>
              <Input
                placeholder="Buscar..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
              />
              <div className="border rounded-md max-h-32 overflow-y-auto mt-1">
                {filteredUsers.map(u => (
                  <button
                    key={u.id}
                    className={cn("w-full text-left p-2 hover:bg-slate-50", selectedUserId === u.id && "bg-slate-100")}
                    onClick={() => { setSelectedUserId(u.id); setSearchUser(u.name) }}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Início</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>Fim (Retroativo)</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAssign} disabled={assigning}>Designar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Edição de Território */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Editar Território {editNumber}</DialogTitle>
            <DialogDescription>
              Ajuste as informações básicas e o grupo responsável.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Número</Label>
                <Input value={editNumber} onChange={e => setEditNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Cor Padrão</Label>
                <div className="flex gap-2 items-center">
                  <Input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="w-12 p-1 h-9" />
                  <span className="text-xs text-slate-400 font-mono uppercase">{editColor}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Nome/Referência</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Ex: Quadra do Mercado" />
            </div>

            <div className="space-y-1">
              <Label className="text-[#C65D3B] font-bold">Grupo Responsável (Dom.)</Label>
              <div className="p-3 border rounded-lg bg-orange-50/50 border-orange-100 space-y-3">
                <p className="text-[11px] text-orange-800 leading-tight">
                  No domingo, o território será atribuído automaticamente a este grupo.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditGroupId(null)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                      !editGroupId 
                        ? "bg-white border-slate-400 text-slate-900 shadow-sm" 
                        : "bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100"
                    )}
                  >
                    Nenhum
                  </button>
                  {groups.map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setEditGroupId(g.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5",
                        editGroupId === g.id
                          ? "bg-white shadow-sm ring-1 ring-offset-1"
                          : "opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                      )}
                      style={{ 
                        borderColor: editGroupId === g.id ? g.color : "transparent",
                        color: editGroupId === g.id ? g.color : "inherit",
                        backgroundColor: editGroupId === g.id ? `${g.color}10` : ""
                      }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 border rounded-md bg-slate-50">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Território Ativo</Label>
                <p className="text-xs text-muted-foreground">Desative para ocultar das listas de designação.</p>
              </div>
              <Switch checked={!editInactive} onCheckedChange={(val: boolean) => setEditInactive(!val)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
