"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { createTimeoutSignal } from "@/lib/utils/api-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn, fmtTerritoryNumber } from "@/lib/utils"
import { AssignmentCreateModal } from "@/components/dashboard/assignment-create-modal"
import { TerritoryFormModal } from "@/components/dashboard/territory-form-modal"
import {
  Plus,
  Map,
  Loader2,
  MapPin,
  AlertTriangle,
  Search,
  Pencil,
  ArrowRight
} from "lucide-react"
import { toast } from "sonner"
import type { Subdivision } from "@/lib/types"

// ============================================================================
// INTERFACES
// ============================================================================

interface TerritoryWithDetails {
  id: string
  number: string
  name: string
  type: string
  subtype?: string | null
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
  // DEBUG temporary (remover após validar)
  if (!territory.assigned_to) {
    console.log(`[${territory.number}]`, {
      last_completed_at: territory.last_completed_at,
      assignments: territory.assignments?.map((a: any) => ({
        status: a.status,
        returned_at: a.returned_at,
        completed_at: a.completed_at,
        assigned_at: a.assigned_at,
        updated_at: a.updated_at
      }))
    })
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  let score = 0
  let daysInactive = 0
  let daysAssigned = 0
  let priority: 'critical' | 'high' | 'medium' | 'low' = 'low'
  let reason = ''

  // 1. Encontrar a última designação encerrada (returned ou completed)
  const latestFinishedAssignment = [...(territory.assignments || [])]
    .filter(a => a.status !== 'active')
    .sort((a, b) => {
      const dateA = new Date(a.completed_at || a.returned_at || a.updated_at || a.assigned_at).getTime()
      const dateB = new Date(b.completed_at || b.returned_at || b.updated_at || b.assigned_at).getTime()
      if (dateA !== dateB) return dateB - dateA
      return b.id.localeCompare(a.id)
    })[0]

  const isReturned = !territory.assigned_to && latestFinishedAssignment?.status === 'returned'

  // 2. Dias Inativo (LIVRE): hoje - (data real da liberação)
  // Isso define a URGÊNCIA do território ser trabalhado.
  let lastActivityDate: string | Date = territory.created_at || new Date().toISOString()
  
  if (isReturned) {
    lastActivityDate = latestFinishedAssignment?.returned_at || latestFinishedAssignment?.updated_at || lastActivityDate
  } else if (!territory.assigned_to) {
    if (latestFinishedAssignment) {
      lastActivityDate = latestFinishedAssignment.completed_at || latestFinishedAssignment.updated_at || lastActivityDate
    } else if (territory.last_completed_at) {
      lastActivityDate = territory.last_completed_at
    }
  }

  const lastActivity = new Date(lastActivityDate)
  // Fallback seguro: se a data for inválida (ex: string malformada ou undefined), assume a data atual para evitar NaN
  const activityDay = isNaN(lastActivity.getTime()) 
    ? new Date(today) 
    : new Date(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate())

  const diffInactive = today.getTime() - activityDay.getTime()
  daysInactive = Math.max(0, Math.floor(diffInactive / (1000 * 60 * 60 * 24)))

  // 3. Dias Designado: hoje - (assigned_at da designação ativa)
  if (territory.assigned_to) {
    const activeAssignment = territory.assignments?.find((a: any) => a.status === 'active')
    if (activeAssignment && activeAssignment.assigned_at) {
      const assignedDate = new Date(activeAssignment.assigned_at)
      if (!isNaN(assignedDate.getTime())) {
        const assignedDay = new Date(assignedDate.getFullYear(), assignedDate.getMonth(), assignedDate.getDate())
        const diffAssigned = today.getTime() - assignedDay.getTime()
        daysAssigned = Math.max(0, Math.floor(diffAssigned / (1000 * 60 * 60 * 24)))
      }
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


const supabase = getSupabaseBrowserClient()

export function AdminTerritoriesView() {
  const router = useRouter()
  const [priorityTerritories, setPriorityTerritories] = useState<PriorityScore[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [errorMsg, setErrorMsg] = useState("")

  // Assignment modal — usa o AssignmentCreateModal completo
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignPreselectedId, setAssignPreselectedId] = useState<string | null>(null)
  const [groups, setGroups] = useState<any[]>([])

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

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMsg("")
    const { signal, clear } = createTimeoutSignal(15000)

    try {
      const [terrRes, groupsRes] = await Promise.all([
        supabase
          .from("territories")
          .select(`
            *,
            group:groups(id, name, color),
            assigned_to_user:profiles!territories_assigned_to_fkey(id, name, email),
            campaign:campaigns(id, name),
            subdivisions(id, territory_id, completed, status, name),
            assignments(id, assigned_at, status, completed_at, returned_at, updated_at)
          `)
          .abortSignal(signal)
          .order("number"),
        supabase
          .from("groups")
          .select("*")
          .abortSignal(signal)
          .order("name")
      ])

      if (groupsRes.error) throw groupsRes.error
      if (groupsRes.data) setGroups(groupsRes.data)

      if (terrRes.data) {
        const territoriesData = terrRes.data as unknown as TerritoryWithDetails[]
        const priorities = territoriesData.map(t => calculatePriorityScore(t))
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

  const handleOpenAssignModal = (territory: TerritoryWithDetails) => {
    // Verifica se há designação de grupo ativa
    const activeGroupAssignment = (territory as any).assignments?.find((a: any) => a.status === 'active' && !!a.group_id)
    
    if (activeGroupAssignment) {
      const groupName = territory.group?.name || "um grupo"
      toast.error(`Este território está em uso pelo grupo ${groupName}`, {
        description: "Finalize a missão do grupo antes de designar individualmente."
      })
      return
    }

    setAssignPreselectedId(territory.id)
    setAssignModalOpen(true)
  }

  const handleOpenEdit = (territory: TerritoryWithDetails) => {
    setEditingTerritory(territory)
    setEditDialogOpen(true)
  }

  const handleOpenCreate = () => {
    setEditingTerritory(null)
    setEditDialogOpen(true)
  }


  const TerritoryCard = ({ p }: { p: PriorityScore }) => {
    const territory = p.territory
    const isLivre = !territory.assigned_to

    const barColor = territory.group?.color ||
      (isLivre && p.daysInactive >= 30 ? '#ef4444' :
       isLivre && p.daysInactive >= 10 ? '#eab308' :
       'hsl(var(--border))')

    return (
      <div
        onClick={() => router.push(`/dashboard/territories/${territory.id}/${territory.type === 'condominium' ? 'condominium' : 'map'}`)}
        className="bg-card p-4 rounded-xl border shadow-sm transition-all active:scale-[0.98] cursor-pointer hover:shadow-md flex items-center gap-3 overflow-hidden"
      >
        <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: barColor }} />

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1 w-full min-w-0">
            <span className="text-xs font-mono font-semibold text-muted-foreground shrink-0">
              {fmtTerritoryNumber(territory.number)}
            </span>
            <h3 className="font-bold text-foreground truncate text-sm flex-1 min-w-0">
              {territory.name || "Sem nome"}
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {isLivre ? (
              <div className="flex items-center gap-2">
                {p.isReturned ? (
                  <span className="bg-warning/10 text-warning text-[0.625rem] font-black px-2 py-0.5 rounded-full uppercase tracking-tight border border-warning/20">
                    DEVOLVIDO
                  </span>
                ) : (
                  <span className="bg-success/10 text-success text-[0.625rem] font-black px-2 py-0.5 rounded-full uppercase tracking-tight border border-success/20">
                    LIVRE
                  </span>
                )}
                <span className="text-muted-foreground text-xs font-medium">
                  há {p.daysInactive}d
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="bg-primary/10 text-primary text-[0.625rem] font-black px-2 py-0.5 rounded-full uppercase tracking-tight border border-primary/20 truncate max-w-[90px]">
                  {territory.assigned_to_user?.name?.split(' ')[0]}
                </span>
                <span className="text-muted-foreground text-xs font-medium">
                  há {p.daysAssigned}d
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isLivre && (
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-full hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenAssignModal(territory);
              }}
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          )}

          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(territory);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  if (loading && priorityTerritories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p>Carregando territórios...</p>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-destructive/10 rounded-xl border border-destructive/20 text-destructive max-w-lg mx-auto p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">Ops! Ocorreu um erro.</h2>
        <p className="text-sm">{errorMsg}</p>
        <Button onClick={() => loadData()} variant="outline" className="mt-6 border-destructive/20 hover:bg-destructive/10">
          Tentar Novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10 w-full max-w-full overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">Territórios</h1>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Status de todos os territórios.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="shrink-0 shadow-sm h-10 w-10 sm:w-auto p-0 sm:px-4 rounded-full sm:rounded-xl">
          <Plus className="h-5 w-5 sm:mr-2" />
          <span className="hidden sm:inline font-bold">Novo</span>
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar território por nome ou número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-14 sm:h-11 bg-card border-border shadow-sm w-full rounded-xl text-base"
          />
        </div>

        {/* Filtros (Pills Horizontalmente Roláveis) */}
        <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
          <button
            onClick={() => setActiveFilter('all')}
            className={cn(
              "shrink-0 h-10 px-4 rounded-full text-sm font-bold border transition-colors shadow-sm",
              activeFilter === 'all'
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-muted-foreground border-border hover:bg-muted/50"
            )}
          >
            Todos ({counts.all})
          </button>
          
          <button
            onClick={() => setActiveFilter('livres')}
            className={cn(
              "shrink-0 h-10 px-4 rounded-full text-sm font-bold border transition-colors shadow-sm",
              activeFilter === 'livres'
                ? "bg-green-100 text-green-800 border-green-200"
                : "bg-card text-muted-foreground border-border hover:bg-muted/50"
            )}
          >
            Livres ({counts.livres})
          </button>
          
          <button
            onClick={() => setActiveFilter('urgentes')}
            className={cn(
              "shrink-0 h-10 px-4 rounded-full text-sm font-bold border transition-colors shadow-sm",
              activeFilter === 'urgentes'
                ? "bg-red-100 text-red-800 border-red-200"
                : "bg-card text-muted-foreground border-border hover:bg-muted/50"
            )}
          >
            Urgentes ({counts.urgentes})
          </button>
        </div>

        {/* Territory Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-h-[200px] content-start items-start">
          {filteredList.length === 0 ? (
            <div className="py-20 text-center col-span-full bg-card rounded-2xl border border-dashed border-border">
              <MapPin className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum território encontrado neste filtro.</p>
            </div>
          ) : (
            filteredList.map((p) => <TerritoryCard key={p.territory.id} p={p} />)
          )}
        </div>
      </div>

      {/* Modal de designação completo (com território pré-selecionado) */}
      <AssignmentCreateModal
        open={assignModalOpen}
        onOpenChange={setAssignModalOpen}
        preselectedTerritoryId={assignPreselectedId}
        onSuccess={loadData}
      />

      <TerritoryFormModal
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        territory={editingTerritory}
        groups={groups}
        onSuccess={loadData}
      />
    </div>
  )
}
