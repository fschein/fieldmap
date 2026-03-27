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
import {
  Loader2, Search, SlidersHorizontal, ArrowUpDown,
  Download, History, AlertTriangle, Plus, User, Calendar, Clock
} from "lucide-react"

type SortOption = "number" | "days_desc" | "days_asc" | "assigned_desc" | "assigned_asc" | "last_completed_asc" | "last_completed_desc"
type StatusFilter = "all" | "active" | "available" | "overdue"
type PeriodFilter = "all" | "6m" | "12m"

interface AggregatedTerritory {
  id: string
  number: string
  name: string
  color: string
  status: 'available' | 'active' | 'overdue' | 'inactive'
  activePublisher: string | null
  assignedAt: string | null
  daysInField: number | null
  totalCompletions: number
  completionsInPeriod: number
  lastCompletedAt: string | null
  campaignId: string | null
}

const STATUS_LABELS: Record<string, string> = {
  available: "Livre",
  active: "Em Campo",
  overdue: "Atrasado",
}

const STATUS_CLASS: Record<string, string> = {
  available: "bg-slate-100 text-slate-500 border-slate-200",
  active: "bg-blue-50 text-blue-700 border-blue-200",
  overdue: "bg-red-100 text-red-700 border-red-300 font-bold",
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

  const fetchData = async () => {
    try {
      setLoading(true)

      const { data: territories, error: terrErr } = await supabase
        .from("territories")
        .select("id, name, number, color, status, campaign_id")
        .order("number", { ascending: true })

      if (terrErr) throw new Error(`Territories: ${terrErr.message}`)

      // Fetch profiles manually to avoid fkey errors
      const { data: profilesData } = await supabase.from("profiles").select("id, name")
      const profilesMap = new Map(profilesData?.map((p: any) => [p.id, p.name]) || [])

      const { data: assignments, error: assErr } = await supabase
        .from("assignments")
        .select(`id, status, assigned_at, completed_at, returned_at, territory_id, user_id`)
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
        publisherName: profilesMap.get(a.user_id) || "Desconhecido"
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

      let daysInField: number | null = null
      let status: 'available' | 'active' | 'overdue' = 'available'

      if (activeAssig) {
        const start = new Date(activeAssig.assigned_at).getTime()
        daysInField = Math.ceil((now.getTime() - start) / (1000 * 60 * 60 * 24))
        status = daysInField > 90 ? 'overdue' : 'active'
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
        campaignId: t.campaign_id
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
      result = result.filter(t => t.campaignId === campaignFilter)
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
          if (a.status === 'active' && b.status !== 'active') return -1
          if (b.status === 'active' && a.status !== 'active') return 1
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
  }

  return (
    <div className="space-y-4 pb-10">

      {/* ===== Print Header (hidden on screen) ===== */}
      <div className="hidden print:block mb-6 print-header">
        <h1 className="text-2xl font-bold border-b-2 border-slate-900 pb-2 flex justify-between items-end">
          <span>Relatório de Designações</span>
          <span className="text-base font-normal text-slate-500">FieldMap</span>
        </h1>
        <div className="flex justify-between mt-2 font-medium">
          <p className="text-sm text-slate-700">
            Gerado em: {new Date().toLocaleString("pt-BR")}
          </p>
          <p className="text-sm text-slate-700">
            Período analisado: {getPeriodLabel()}
          </p>
        </div>
        <div className="flex gap-4 mt-2 text-sm text-slate-600">
          <span>Total: <b>{filtered.length}</b> territórios</span>
          <span>Em campo: <b>{stats.active}</b></span>
          <span>Atrasados: <b>{stats.overdue}</b></span>
          <span>Disponíveis: <b>{stats.available}</b></span>
        </div>
      </div>

      {/* ===== Screen Header ===== */}
      <div className="print:hidden space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Designações</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {stats.active} em campo &bull; {stats.overdue} atrasados &bull; {stats.available} disponíveis
            </p>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Designar</span>
              </Button>
            )}
            <Button variant="outline" className="gap-2 bg-white" onClick={() => window.print()}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir PDF</span>
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-slate-50 border rounded-xl p-3 flex flex-col md:flex-row items-center gap-3">
          <div className="relative w-full md:max-w-[300px] xl:max-w-sm flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar território ou publicador..."
              className="pl-9 bg-white border-slate-200 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap flex-1 w-full justify-start md:justify-end gap-2.5">
            <Select value={periodFilter} onValueChange={(v: PeriodFilter) => setPeriodFilter(v)}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[160px] flex-1 sm:flex-none justify-start px-3 bg-white border-slate-200">
                <Clock className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-slate-400" />
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo Histórico</SelectItem>
                <SelectItem value="12m">Último Ano</SelectItem>
                <SelectItem value="6m">Últimos 6 meses</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[150px] flex-1 sm:flex-none justify-start px-3 bg-white border-slate-200">
                <SlidersHorizontal className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-slate-400" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="active">Em Campo</SelectItem>
                <SelectItem value="available">Disponíveis</SelectItem>
                <SelectItem value="overdue">Atrasados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[150px] flex-1 sm:flex-none justify-start px-3 bg-white border-slate-200">
                <Calendar className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-slate-400" />
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
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[200px] flex-[2] sm:flex-none justify-start px-3 bg-white border-slate-200">
                <ArrowUpDown className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-slate-400" />
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
        <div className="text-center py-20 border-2 border-dashed rounded-xl bg-slate-50 print:hidden">
          <p className="text-slate-400">Nenhum território confere com os filtros.</p>
        </div>
      ) : (
        <>
          {/* ===== DESKTOP & PRINT TABLE ===== */}
          <div className="hidden md:block border rounded-xl overflow-hidden print:block print:rounded-none print:border-slate-400 print:w-full print:border-all">
            <Table className="print:w-full">
              <TableHeader>
                <TableRow className="bg-slate-900 hover:bg-slate-900 print:bg-slate-800">
                  <TableHead className="text-white font-bold text-xs w-14">Nº</TableHead>
                  <TableHead className="text-white font-bold text-xs">Território</TableHead>
                  <TableHead className="text-white font-bold text-xs">Resp. Atual</TableHead>
                  <TableHead className="text-white font-bold text-xs text-center">Entrega</TableHead>
                  <TableHead className="text-white font-bold text-xs text-center">Dias</TableHead>
                  <TableHead className="text-white font-bold text-xs">Status</TableHead>
                  <TableHead className="text-white font-bold text-xs text-center border-l border-slate-700 bg-slate-800/50 print:bg-slate-700">
                    Trabalhado em<br/>({periodFilter === 'all' ? 'total' : periodFilter})
                  </TableHead>
                  <TableHead className="text-white font-bold text-xs text-center bg-slate-800/50 print:bg-slate-700">
                    Última Conclusão
                  </TableHead>
                  <TableHead className="text-white font-bold text-xs text-center w-16 print:hidden">
                    <History className="h-4 w-4 mx-auto text-slate-400" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t, idx) => (
                  <TableRow
                    key={t.id}
                    className={`
                      ${t.status === 'overdue'
                        ? 'bg-red-50/60 hover:bg-red-50 border-l-4 border-l-red-500 print:bg-red-50 print:border-l-0'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-slate-50'
                        : 'bg-slate-50/50 hover:bg-slate-100/50'
                      }
                      print:border-b print:border-slate-300
                    `}
                  >
                    <TableCell className="py-2.5 text-xs font-bold text-slate-700 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full print:hidden" style={{ backgroundColor: t.color }} />
                        {t.number}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-sm font-medium text-slate-800 whitespace-nowrap">
                      {t.name}
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-slate-600 whitespace-nowrap">
                      {t.activePublisher ? (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400 print:hidden" />
                          <span className="truncate max-w-[120px] print:max-w-none">{t.activePublisher}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Disponível</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-center font-mono text-slate-600 whitespace-nowrap">
                      {fmtDate(t.assignedAt)}
                    </TableCell>
                    <TableCell className="py-2.5 text-center whitespace-nowrap">
                      {t.daysInField !== null ? (
                        <span className={`text-xs font-bold ${t.daysInField > 90 ? 'text-red-600' : 'text-slate-700'}`}>
                          {t.daysInField} d
                          {t.daysInField > 90 && (
                            <AlertTriangle className="inline-block w-3 h-3 ml-1 text-red-500 print:hidden" />
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 whitespace-nowrap">
                      <span className={`
                        text-[10px] px-2 py-0.5 rounded-full uppercase font-medium border
                        ${t.status === 'active' ? 'bg-blue-50 text-blue-700 border-blue-200 print:border-transparent' : 
                          t.status === 'overdue' ? 'bg-red-100 text-red-700 border-red-300 print:border-transparent' : 
                          'bg-slate-100 text-slate-600 border-slate-200 print:border-transparent'}
                      `}>
                        {STATUS_LABELS[t.status]}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-center font-bold text-slate-700 border-l border-slate-100 print:border-slate-300">
                      {t.completionsInPeriod} {t.completionsInPeriod === 1 ? 'vez' : 'vezes'}
                    </TableCell>
                    <TableCell className="py-2.5 text-center font-mono text-xs text-slate-600">
                      {t.lastCompletedAt ? (
                        <span className="bg-slate-100 px-2 py-1 rounded print:bg-transparent print:p-0">
                          {fmtDate(t.lastCompletedAt)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
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
                    ? 'border-red-200 bg-red-50/30'
                    : 'border-slate-200 bg-white hover:border-primary/40 hover:shadow-sm'
                }`}
                onClick={() => openSheet(t.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-slate-900 truncate">{t.name}</p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 uppercase flex-shrink-0 ${STATUS_CLASS[t.status]}`}
                      >
                        {STATUS_LABELS[t.status]}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2 rounded-md">
                    <div>
                      <span className="block text-[10px] text-slate-400 font-semibold uppercase mb-0.5">Resp. Atual</span>
                      <span className="font-medium text-slate-900 truncate block">
                        {t.activePublisher ? t.activePublisher : <span className="text-slate-400 italic">Disponível</span>}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 font-semibold uppercase mb-0.5">Dias em Campo</span>
                      <span className={`font-medium ${t.daysInField && t.daysInField > 90 ? 'text-red-600' : 'text-slate-900'}`}>
                        {t.daysInField !== null ? `${t.daysInField}d` : '—'}
                      </span>
                    </div>
                    <div className="border-t border-slate-200 pt-1 mt-0.5">
                      <span className="block text-[10px] text-slate-400 font-semibold uppercase mb-0.5">Trabalhado ({periodFilter})</span>
                      <span className="font-semibold text-primary">{t.completionsInPeriod} vezes</span>
                    </div>
                    <div className="border-t border-slate-200 pt-1 mt-0.5">
                      <span className="block text-[10px] text-slate-400 font-semibold uppercase mb-0.5">Última Conclusão</span>
                      <span className="font-mono">{fmtDate(t.lastCompletedAt)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Print footer */}
      <div className="hidden print:block mt-6 pt-2 border-t border-slate-300 text-[10px] text-slate-500 text-center">
        Página 1 • FieldMap
      </div>

      {/* Print styles for full layout */}
      <style jsx global>{`
        @media print {
          /* Setup Full Page & Removing Browser Margins */
          @page { size: A4 portrait; margin: 10mm; }
          
          /* Hide everything outside of our layout */
          body * { visibility: hidden; }
          
          /* Show only the Assignments page wrapper and its children */
          .pb-10, .pb-10 * { visibility: visible; }
          
          /* Absolute positioning trick to stretch the content to fill the page, overwriting layouts */
          .pb-10 {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            margin: 0;
            padding: 0;
            background: white !important;
          }

          /* General styling */
          * { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
          
          /* Table fine-tuning to prevent awkward breaks */
          table { width: 100% !important; border-collapse: collapse !important; font-size: 10px !important; }
          th { background-color: #f1f5f9 !important; color: #0f172a !important; padding: 6px 8px !important; text-align: left; }
          td { padding: 4px 8px !important; border-bottom: 1px solid #e2e8f0 !important; }
          tr { page-break-inside: avoid; }
          
          /* Colors for status */
          .bg-blue-50 { background-color: transparent !important; color: #1e40af !important; border: 1px solid #bfdbfe !important; }
          .bg-red-100 { background-color: #fee2e2 !important; color: #b91c1c !important; }
          .bg-red-50\\/60, .print\\:bg-red-50 { background-color: #fef2f2 !important; }
          
          /* Adjust elements that shouldn't display */
          nav, aside, header, .print\\:hidden, button { display: none !important; }
        }
      `}</style>

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
    </div>
  )
}