"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { createTimeoutSignal } from "@/lib/utils/api-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { AssignmentCreateModal } from "@/components/dashboard/assignment-create-modal"
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
import type { Subdivision } from "@/lib/types"

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
    setAssignPreselectedId(territory.id)
    setAssignModalOpen(true)
  }

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
    setEditSaving(true)
    const newStatus = editInactive ? 'inactive' : 'available'

    try {
      if (editingTerritory) {
        // UPDATE
        const { error } = await supabase
          .from("territories")
          .update({
            name: editName,
            number: editNumber,
            group_id: editGroupId,
            status: newStatus,
            assigned_to: editInactive ? null : editingTerritory.assigned_to,
          })
          .eq("id", editingTerritory.id)
        if (error) throw error
      } else {
        // INSERT
        const { error } = await supabase
          .from("territories")
          .insert({
            name: editName,
            number: editNumber,
            group_id: editGroupId,
            status: 'available',
            color: '#C65D3B'
          })
        if (error) throw error
      }
      setEditDialogOpen(false)
      loadData()
    } catch (e: any) {
      alert("Erro ao salvar: " + e.message)
    } finally {
      setEditSaving(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingTerritory(null)
    setEditName("")
    setEditNumber("")
    setEditColor("#C65D3B")
    setEditGroupId(null)
    setEditInactive(false)
    setEditDialogOpen(true)
  }


  const TerritoryCard = ({ p }: { p: PriorityScore }) => {
    const territory = p.territory
    const isLivre = !territory.assigned_to

    // Borda lateral e cor do texto baseadas na prioridade
    let borderColor = "border-border"
    let daysColor = "text-muted-foreground"
    if (isLivre) {
      if (p.daysInactive >= 30) {
        borderColor = "border-l-4 border-red-500"
        daysColor = "text-red-500"
      } else if (p.daysInactive >= 10) {
        borderColor = "border-l-4 border-yellow-400"
        daysColor = "text-yellow-600"
      } else {
        borderColor = "border-l-4 border-border"
      }
    }

    return (
      <div
        onClick={() => router.push(`/dashboard/territories/${territory.id}/map`)}
        className={cn(
          "bg-card p-4 rounded-xl border shadow-sm transition-all active:scale-[0.98] cursor-pointer hover:shadow-md flex items-center justify-between gap-4 overflow-hidden",
          borderColor
        )}
      >
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1 w-full min-w-0">
            {territory.group ? (
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-inner"
                style={{ backgroundColor: territory.group.color }}
                title={`Grupo: ${territory.group.name}`}
              />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-dashed border-border" />
            )}
            <span className="text-xs font-mono font-semibold text-muted-foreground mr-1 shrink-0">
              [#{territory.number}]
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
                <span className={cn("font-bold text-xs flex items-center gap-1", daysColor)}>
                  há {p.daysInactive}d
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="bg-primary/10 text-primary text-[0.625rem] font-black px-2 py-0.5 rounded-full uppercase tracking-tight border border-primary/20 truncate max-w-[90px]">
                  {territory.assigned_to_user?.name?.split(' ')[0]}
                </span>
                <span className="font-bold text-muted-foreground text-xs flex items-center gap-1">
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

      {/* Modal de Edição de Território */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{editingTerritory ? `Editar Território ${editNumber}` : "Novo Território"}</DialogTitle>
            <DialogDescription>
              {editingTerritory
                ? "Ajuste as informações básicas e o grupo responsável."
                : "Cadastre um novo território para começar a mapear."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label>Número</Label>
              <Input value={editNumber} onChange={e => setEditNumber(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Nome/Referência</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Ex: Quadra do Mercado" />
            </div>

            <div className="space-y-1">
              <Label className="text-primary font-bold">Grupo Responsável (Dom.)</Label>
              <div className="p-3 border rounded-lg bg-primary/5 border-primary/20 space-y-3">
                <p className="text-[0.6875rem] text-primary leading-tight font-medium">
                  No domingo, o território será atribuído automaticamente a este grupo.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditGroupId(null)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                      !editGroupId
                        ? "bg-card border-border text-foreground shadow-sm"
                        : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
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
                          ? "bg-background shadow-sm ring-1 ring-offset-1"
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

            <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
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
