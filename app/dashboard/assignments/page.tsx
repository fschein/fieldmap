"use client"

import { useEffect, useState, useMemo } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { AssignmentHistorySheet } from "@/components/dashboard/assignment-history-sheet"
import { AssignmentCreateModal } from "@/components/dashboard/assignment-create-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TerritoryPrintReport } from "@/components/dashboard/territory-print-report"
import {
  Loader2, Search, SlidersHorizontal, ArrowUpDown,
  Download, History, AlertTriangle, Plus, User, Calendar, Clock,
  CheckSquare, Filter
} from "lucide-react"
import { Progress } from "@/components/ui/progress"

type SortOption = "number" | "days_desc" | "days_asc" | "assigned_desc" | "assigned_asc" | "last_completed_asc" | "last_completed_desc"
type StatusFilter = "all" | "active" | "available" | "overdue" | "completed"
type PeriodFilter = "all" | "6m" | "12m"

interface AggregatedTerritory {
  id: string
  number: string
  name: string
  color: string
  status: 'available' | 'active' | 'overdue' | 'inactive' | 'completed' | 'assigned'
  activePublisher: string | null
  assignedAt: string | null
  daysInField: number | null
  totalCompletions: number
  completionsInPeriod: number
  lastCompletedAt: string | null
  campaignId: string | null
  groupColor: string | null
}

const STATUS_LABELS: Record<string, string> = {
  available: "DEVOLVIDO",
  completed: "LIVRE",
  assigned: "EM CAMPO",
  active: "EM CAMPO",
  overdue: "ATRASADO",
}

const STATUS_CLASS: Record<string, string> = {
  available: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-500 dark:border-amber-500/20",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200 font-bold dark:bg-emerald-500/10 dark:text-emerald-500 dark:border-emerald-500/20",
  assigned: "bg-primary/10 text-primary border-primary/20",
  active: "bg-primary/10 text-primary border-primary/20",
  overdue: "bg-red-50 text-red-700 border-red-200 font-bold dark:bg-red-500/10 dark:text-red-500 dark:border-red-500/20",
}

export default function AssignmentsPage() {
  const { isReady, isAdmin, isDirigente } = useAuth()
  const supabase = getSupabaseBrowserClient()
  const canManage = isAdmin || isDirigente

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AggregatedTerritory[]>([])
  
  // Raw assignments mapped by territory ID for recalculating based on period
  const [rawTerritories, setRawTerritories] = useState<any[]>([])
  const [rawAssignments, setRawAssignments] = useState<any[]>([])

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [campaignFilter, setCampaignFilter] = useState<string>("all")
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all")
  const [sortBy, setSortBy] = useState<SortOption>("number")
  const [campaigns, setCampaigns] = useState<{id: string, name: string}[]>([])

  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [showOnlyRemaining, setShowOnlyRemaining] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)

      const { data: territories, error: terrErr } = await supabase
        .from("territories")
        .select("id, name, number, color, status, campaign_id, assigned_to, subdivisions(completed), group:groups(color)")
        .order("number", { ascending: true })

      if (terrErr) throw new Error(`Territories: ${terrErr.message}`)

      const { data: profilesData } = await supabase.from("profiles").select("id, name")
      const { data: groupsData } = await supabase.from("groups").select("id, name")
      
      const namesMap = new Map()
      profilesData?.forEach((p: any) => namesMap.set(p.id, p.name))
      groupsData?.forEach((g: any) => namesMap.set(g.id, g.name))

      const { data: assignments, error: assErr } = await supabase
        .from("assignments")
        .select(`id, status, assigned_at, completed_at, returned_at, territory_id, user_id, group_id`)
        .order("assigned_at", { ascending: false })

      if (assErr) throw new Error(`Assignments: ${assErr.message}`)

      // Fetch active campaigns for filter
      const { data: campaignsData } = await supabase
        .from("campaigns")
        .select("id, name")
        .eq("active", true)
        .order("name")
      
      if (campaignsData) setCampaigns(campaignsData)

      const assignmentsWithProfiles = (assignments || []).map((a: any) => ({
        ...a,
        publisherName: namesMap.get(a.user_id) || namesMap.get(a.group_id) || "Desconhecido"
      }))

      setRawTerritories(territories || [])
      setRawAssignments(assignmentsWithProfiles)

    } catch (error: any) {
      console.error("Erro ao carregar designações:", error?.message || error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isReady) fetchData()
  }, [isReady])

  // Process data whenever filters/raw data changes
  useEffect(() => {
    if (!rawTerritories.length) return

    const now = new Date()
    let periodStart = new Date(0) // all time
    
    if (periodFilter === "6m") {
      periodStart = new Date()
      periodStart.setMonth(now.getMonth() - 6)
    } else if (periodFilter === "12m") {
      periodStart = new Date()
      periodStart.setFullYear(now.getFullYear() - 1)
    }

    const periodStartTime = periodStart.getTime()

    const processed: AggregatedTerritory[] = rawTerritories.map(t => {
      const terrAssignments = rawAssignments.filter(a => a.territory_id === t.id)
      const activeAssignments = terrAssignments.filter(a => a.status === 'active')
      const activeAssig = activeAssignments.sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())[0]

      const completed = terrAssignments
        .filter(a => a.completed_at || a.status === 'completed')
        .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())

      const lastCompletedAt = completed.length > 0 ? completed[0].completed_at : null

      const completionsInPeriod = completed.filter(a => 
        new Date(a.completed_at).getTime() >= periodStartTime
      ).length

      const totalSubdivisions = (t as any).subdivisions?.length || 0
      const completedSubdivisions = (t as any).subdivisions?.filter((s: any) => s.completed).length || 0
      
      let daysInField: number | null = null
      let status: 'available' | 'active' | 'overdue' | 'inactive' | 'completed' = t.status || 'available'

      if (status !== 'inactive') {
        const isAssignedToMe = activeAssig && activeAssig.user_id === t.assigned_to
        const isAssignedToMyGroup = activeAssig && activeAssig.group_id && !t.assigned_to
        
        if (isAssignedToMe || isAssignedToMyGroup) {
          const start = new Date(activeAssig.assigned_at).getTime()
          daysInField = Math.ceil((now.getTime() - start) / (1000 * 60 * 60 * 24))
          status = daysInField > 90 ? 'overdue' : 'active'
        } else {
          // Lógica DINÂMICA baseada no progresso real das quadras
          const isFull = totalSubdivisions > 0 && completedSubdivisions === totalSubdivisions
          const isEmpty = completedSubdivisions === 0
          
          if (isFull || isEmpty) {
            status = 'completed' // LIVRE
          } else {
            status = 'available' // DEVOLVIDO
          }
        }
      }

      return {
        id: t.id,
        number: t.number || "",
        name: t.name,
        color: t.color || "#C65D3B",
        status,
        activePublisher: activeAssig?.publisherName || null,
        assignedAt: activeAssig?.assigned_at || null,
        daysInField,
        totalCompletions: completed.length,
        completionsInPeriod,
        lastCompletedAt,
        campaignId: t.campaign_id,
        assignedTo: t.assigned_to,
        groupColor: (t as any).group?.color || null
      }
    }).filter(t => t.status !== 'inactive')

    setData(processed)
  }, [rawTerritories, rawAssignments, periodFilter])


  const filtered = useMemo(() => {
    let result = [...data]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.number.toLowerCase().includes(q) ||
        (t.activePublisher && t.activePublisher.toLowerCase().includes(q))
      )
    }

    if (statusFilter !== "all") {
      result = result.filter(t => t.status === statusFilter)
    }

    if (campaignFilter !== "all") {
      if (showOnlyRemaining) {
        // "Remaining" = not done for this campaign yet.
        // That means either it's not in the campaign yet, OR it is but it's active/overdue (not finished)
        result = result.filter(t => t.campaignId !== campaignFilter || (t.campaignId === campaignFilter && t.status !== 'available'))
      } else {
        result = result.filter(t => t.campaignId === campaignFilter)
      }
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "days_desc": return (b.daysInField || -1) - (a.daysInField || -1)
        case "days_asc":
          if (a.daysInField === null) return 1
          if (b.daysInField === null) return -1
          return a.daysInField - b.daysInField
        case "assigned_desc":
          if (!a.assignedAt) return 1
          if (!b.assignedAt) return -1
          return new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
        case "assigned_asc":
          if (!a.assignedAt) return 1
          if (!b.assignedAt) return -1
          return new Date(a.assignedAt).getTime() - new Date(b.assignedAt).getTime()
        case "last_completed_asc":
          if (!a.lastCompletedAt) return 1
          if (!b.lastCompletedAt) return -1
          return new Date(a.lastCompletedAt).getTime() - new Date(b.lastCompletedAt).getTime()
        case "last_completed_desc":
          if (!a.lastCompletedAt) return 1
          if (!b.lastCompletedAt) return -1
          return new Date(b.lastCompletedAt).getTime() - new Date(a.lastCompletedAt).getTime()
        default:
          return a.number.localeCompare(b.number, undefined, { numeric: true })
      }
    })

    return result
  }, [data, search, statusFilter, sortBy])

  const fmtDate = (d: string | null) => {
    if (!d) return "—"
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
  }

  const getPeriodLabel = () => {
    if (periodFilter === "6m") return "Últimos 6 meses"
    if (periodFilter === "12m") return "Último ano"
    return "Todo o período"
  }

  const openSheet = (id: string) => {
    setSelectedTerritoryId(id)
    setSheetOpen(true)
  }

  if (loading && !data.length) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const stats = {
    active: data.filter(t => t.status === 'active').length,
    overdue: data.filter(t => t.status === 'overdue').length,
    available: data.filter(t => t.status === 'available').length,
    completed: data.filter(t => t.status === 'completed').length,
  }

  return (
    <div className="space-y-4 pb-10">

      {/* ===== Screen Header ===== */}
      <div className="print:hidden space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Designações</h1>
            <p className="text-xs text-muted-foreground font-medium mt-1">
              {stats.active} em campo &bull; {stats.overdue} atrasados &bull; {stats.available} devolvidos &bull; {stats.completed} livres
            </p>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Designar</span>
              </Button>
            )}
            <Button variant="outline" className="gap-2 bg-card" onClick={() => window.print()}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir PDF</span>
            </Button>
          </div>
        </div>

        {/* Campaign Progress Banner */}
        {campaignFilter !== "all" && (
          <Card className="bg-primary/5 border-primary/20 shadow-none border-dashed">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex-1 w-full space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/10 p-1.5 rounded-lg">
                        <Calendar className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground leading-tight">
                          Campanha: {campaigns.find(c => c.id === campaignFilter)?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">Acompanhamento de progresso geral</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">
                        {Math.round((data.filter(t => t.campaignId === campaignFilter && t.status === 'available').length / (data.length || 1)) * 100)}%
                      </p>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Concluído</p>
                    </div>
                  </div>
                  <Progress 
                    value={(data.filter(t => t.campaignId === campaignFilter && t.status === 'available').length / (data.length || 1)) * 100} 
                    className="h-2 bg-muted"
                  />
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground font-medium">
                    <span>{data.filter(t => t.campaignId === campaignFilter && t.status === 'available').length} concluídos</span>
                    <span>{data.length - data.filter(t => t.campaignId === campaignFilter && t.status === 'available').length} faltantes</span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <Button 
                    variant={showOnlyRemaining ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowOnlyRemaining(!showOnlyRemaining)}
                    className={`gap-2 h-9 px-4 rounded-lg transition-all ${showOnlyRemaining ? 'shadow-md shadow-primary/20' : 'bg-card'}`}
                  >
                    {showOnlyRemaining ? <Filter className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
                    {showOnlyRemaining ? "Mostrando faltantes" : "Filtrar por faltantes"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter Bar */}
        <div className="bg-muted border rounded-xl p-3 flex flex-col md:flex-row items-center gap-3">
          <div className="relative w-full md:max-w-[300px] xl:max-w-sm flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar território ou publicador..."
              className="pl-9 bg-card border-border w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap flex-1 w-full justify-start md:justify-end gap-2.5">
            <Select value={periodFilter} onValueChange={(v: PeriodFilter) => setPeriodFilter(v)}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px] flex-1 sm:flex-none justify-start px-3 bg-card border-border">
                <Clock className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo Histórico</SelectItem>
                <SelectItem value="12m">Último Ano</SelectItem>
                <SelectItem value="6m">Últimos 6 meses</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[150px] flex-1 sm:flex-none justify-start px-3 bg-card border-border">
                <SlidersHorizontal className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="active">EM CAMPO</SelectItem>
                <SelectItem value="available">DEVOLVIDO</SelectItem>
                <SelectItem value="completed">LIVRE</SelectItem>
                <SelectItem value="overdue">ATRASADO</SelectItem>
              </SelectContent>
            </Select>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[150px] flex-1 sm:flex-none justify-start px-3 bg-card border-border">
                <Calendar className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Campanha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Campanhas</SelectItem>
                {campaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v: SortOption) => setSortBy(v)}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[200px] flex-[2] sm:flex-none justify-start px-3 bg-card border-border">
                <ArrowUpDown className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Número</SelectItem>
                <SelectItem value="days_desc">+ Dias em campo</SelectItem>
                <SelectItem value="days_asc">- Dias em campo</SelectItem>
                <SelectItem value="assigned_desc">Entregues recente</SelectItem>
                <SelectItem value="last_completed_asc">+ Tempo sem fazer</SelectItem>
                <SelectItem value="last_completed_desc">- Tempo sem fazer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted print:hidden">
          <p className="text-muted-foreground">Nenhum território confere com os filtros.</p>
        </div>
      ) : (
        <>
          {/* ===== DESKTOP & PRINT TABLE ===== */}
          <div className="hidden md:block border rounded-xl overflow-hidden print:block print:rounded-none print:border-slate-400 print:w-full print:border-all">
            <Table className="print:w-full">
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted border-b border-border">
                  <TableHead className="text-foreground font-black text-[10px] w-14 uppercase tracking-widest">Nº</TableHead>
                  <TableHead className="text-foreground font-black text-[10px] uppercase tracking-widest">Território</TableHead>
                  <TableHead className="text-foreground font-black text-[10px] uppercase tracking-widest">Dirigente</TableHead>
                  <TableHead className="text-foreground font-black text-[10px] text-center uppercase tracking-widest">Entrega</TableHead>
                  <TableHead className="text-foreground font-black text-[10px] text-center uppercase tracking-widest">Dias</TableHead>
                  <TableHead className="text-foreground font-black text-[10px] uppercase tracking-widest">Status</TableHead>
                  <TableHead className="text-foreground font-black text-[10px] text-center border-l border-border bg-muted/50 uppercase tracking-widest">
                    Trabalhado<br/>({periodFilter === 'all' ? 'total' : periodFilter})
                  </TableHead>
                  <TableHead className="text-foreground font-black text-[10px] text-center bg-muted/50 uppercase tracking-widest">
                    Última Conclusão
                  </TableHead>
                  <TableHead className="text-foreground font-black text-[10px] text-center w-16 print:hidden uppercase tracking-widest">
                    <History className="h-4 w-4 mx-auto text-muted-foreground" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t, idx) => (
                  <TableRow
                    key={t.id}
                    className={`
                      ${t.status === 'overdue'
                        ? 'bg-red-50/60 dark:bg-red-500/10 hover:bg-red-50 dark:hover:bg-red-500/20 border-l-4 border-l-red-500 print:bg-red-50 print:border-l-0'
                        : idx % 2 === 0
                        ? 'bg-card hover:bg-muted/50'
                        : 'bg-muted/30 hover:bg-muted/60'
                      }
                      print:border-b print:border-slate-300
                    `}
                  >
                    <TableCell className="py-2.5 text-xs font-bold text-foreground whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {t.groupColor ? (
                          <span className="w-2 h-2 rounded-full print:hidden" style={{ backgroundColor: t.groupColor }} />
                        ) : (
                          <span className="w-2 h-2 rounded-full border border-dashed border-border print:hidden" />
                        )}
                        {t.number}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-sm font-medium text-foreground whitespace-nowrap">
                      {t.name}
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {t.activePublisher ? (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400 print:hidden" />
                          <span className="truncate max-w-[120px] print:max-w-none">{t.activePublisher}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Disponível</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-center font-mono text-muted-foreground whitespace-nowrap">
                      {fmtDate(t.assignedAt)}
                    </TableCell>
                    <TableCell className="py-2.5 text-center whitespace-nowrap">
                      {t.daysInField !== null ? (
                        <span className={`text-xs font-bold ${t.daysInField > 90 ? 'text-red-500' : 'text-foreground'}`}>
                          {t.daysInField} d
                          {t.daysInField > 90 && (
                            <AlertTriangle className="inline-block w-3 h-3 ml-1 text-red-500 print:hidden" />
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 whitespace-nowrap">
                      <span className={`
                        text-[10px] px-2 py-0.5 rounded-full uppercase font-medium border
                        ${STATUS_CLASS[t.status] || 'bg-slate-100 text-slate-500'}
                      `}>
                        {STATUS_LABELS[t.status] || t.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-center font-bold text-foreground border-l border-border print:border-slate-300">
                      {t.completionsInPeriod} {t.completionsInPeriod === 1 ? 'vez' : 'vezes'}
                    </TableCell>
                    <TableCell className="py-2.5 text-center font-mono text-xs text-muted-foreground">
                      {t.lastCompletedAt ? (
                        <span className="bg-muted px-2 py-1 rounded print:bg-transparent print:p-0">
                          {fmtDate(t.lastCompletedAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 text-center print:hidden">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                        onClick={() => openSheet(t.id)}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ===== MOBILE CARDS (hidden on desktop & print) ===== */}
          <div className="md:hidden print:hidden space-y-2">
            {filtered.map((t) => (
              <Card
                key={t.id}
                className={`cursor-pointer transition-all border ${
                  t.status === 'overdue'
                    ? 'border-red-500/50 bg-red-500/5'
                    : 'border-border bg-card hover:border-primary/40 hover:shadow-sm'
                }`}
                onClick={() => openSheet(t.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 mb-2">
                    {t.groupColor ? (
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: t.groupColor }}
                      />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-dashed border-border" />
                    )}
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-foreground truncate">{t.name}</p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 uppercase flex-shrink-0 ${STATUS_CLASS[t.status]}`}
                      >
                        {STATUS_LABELS[t.status]}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground bg-muted p-2 rounded-md">
                    <div>
                      <span className="block text-[10px] text-muted-foreground/70 font-semibold uppercase mb-0.5">Dirigente</span>
                      <span className="font-medium text-foreground truncate block">
                        {t.activePublisher ? t.activePublisher : <span className="text-muted-foreground/50 italic">Disponível</span>}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-muted-foreground/70 font-semibold uppercase mb-0.5">Dias em Campo</span>
                      <span className={`font-medium ${t.daysInField && t.daysInField > 90 ? 'text-red-500' : 'text-foreground'}`}>
                        {t.daysInField !== null ? `${t.daysInField}d` : '—'}
                      </span>
                    </div>
                    <div className="border-t border-border pt-1 mt-0.5">
                      <span className="block text-[10px] text-muted-foreground/70 font-semibold uppercase mb-0.5">Trabalhado ({periodFilter})</span>
                      <span className="font-semibold text-primary">{t.completionsInPeriod} vezes</span>
                    </div>
                    <div className="border-t border-border pt-1 mt-0.5">
                      <span className="block text-[10px] text-muted-foreground/70 font-semibold uppercase mb-0.5">Última Conclusão</span>
                      <span className="font-mono">{fmtDate(t.lastCompletedAt)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Modals */}
      <AssignmentHistorySheet
        territoryId={selectedTerritoryId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdate={fetchData}
      />
      <AssignmentCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={fetchData}
      />

      {/* COMPONENTE DE IMPRESSÃO (Otimizado para PDF) */}
      <TerritoryPrintReport 
        data={[...filtered]
          .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
          .map(t => ({
            id: t.id,
            number: t.number,
            name: t.name,
            lastCompletedAt: t.lastCompletedAt,
            completionsInPeriod: t.completionsInPeriod
          }))}
        campaignName={campaignFilter !== 'all' ? campaigns.find(c => c.id === campaignFilter)?.name : undefined}
      />
    </div>
  )
}