"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Wand2, Check, Loader2, Trash2, CalendarDays, Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { selectBestLeader, ScheduleItem as EngineScheduleItem } from "@/lib/utils/scheduling-engine"
import { toast } from "sonner"
import {
  format, addMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, parseISO,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

const supabase = getSupabaseBrowserClient()

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleItem {
  id: string
  date: string
  arrangement_id: string
  leader_id: string | null
  territory_id: string | null
  status: "draft" | "published" | "manual"
  arrangement: {
    id: string
    label: string
    start_time: string
    is_group_mode: boolean
  }
  leader?: { name: string }
  territory?: { number: string; name: string }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleGenerator({
  currentMonth,
  setCurrentMonth,
}: {
  currentMonth: Date
  setCurrentMonth: (date: Date) => void
}) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [drafts, setDrafts] = useState<ScheduleItem[]>([])
  const [leaders, setLeaders] = useState<{ id: string; name: string }[]>([])
  const [leaderArrs, setLeaderArrs] = useState<{ profile_id: string; arrangement_id: string }[]>([])
  const [avoidSameWeek, setAvoidSameWeek] = useState(true)
  const [prioritizeInterval, setPrioritizeInterval] = useState(true)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchExistingDrafts = useCallback(async () => {
    setLoading(true)
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const { data, error } = await supabase
      .from("schedules")
      .select(`*, arrangement:schedule_arrangements(*), leader:profiles(name), territory:territories(number, name)`)
      .gte("date", format(start, "yyyy-MM-dd"))
      .lte("date", format(end, "yyyy-MM-dd"))
      .order("date", { ascending: true })
    if (error) console.error("fetchExistingDrafts:", error.message)
    else setDrafts(data || [])
    setLoading(false)
  }, [currentMonth])

  useEffect(() => {
    async function fetchLeaders() {
      const { data: profiles } = await supabase
        .from("profiles").select("id, name").in("role", ["admin", "dirigente"]).order("name")
      setLeaders(profiles || [])
      const { data: mappings } = await supabase.from("leader_arrangements").select("profile_id, arrangement_id")
      setLeaderArrs(mappings || [])
    }
    fetchLeaders()
    fetchExistingDrafts()
  }, [currentMonth, fetchExistingDrafts])

  const groupedDrafts = useMemo(() => {
    const groups: Record<string, ScheduleItem[]> = {}
    drafts.forEach((d) => {
      if (!groups[d.arrangement_id]) groups[d.arrangement_id] = []
      groups[d.arrangement_id].push(d)
    })
    return groups
  }, [drafts])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true)
    try {
      const { data: arrangements } = await supabase.from("schedule_arrangements").select("*")
      if (!arrangements?.length) { toast.error("Nenhum arranjo configurado"); return }

      const { data: leaderArrsData } = await supabase
        .from("leader_arrangements").select("profile_id, arrangement_id, frequency")

      const start = startOfMonth(currentMonth)
      const end = endOfMonth(currentMonth)
      const days = eachDayOfInterval({ start, end })
      const newSchedules: any[] = []
      let localSchedules: EngineScheduleItem[] = drafts.map((d) => ({
        date: d.date, arrangement_id: d.arrangement_id,
        leader_id: d.leader_id, territory_id: d.territory_id, status: d.status,
      }))
      const slotLastLeaders: Record<string, string | null> = {}

      const { data: availableTerritories } = await supabase
        .from("territories").select("id, number, name").eq("status", "available")
        .is("assigned_to", null).order("last_completed_at", { ascending: true, nullsFirst: true })
      let territoryIdx = 0

      for (const day of days) {
        const dateStr = format(day, "yyyy-MM-dd")
        const weekday = getDay(day)
        const dayArrangements = arrangements.filter((a: any) => a.weekday === weekday)

        for (const arr of dayArrangements) {
          const existing = drafts.find((d) => d.date === dateStr && d.arrangement_id === arr.id)
          if (existing) { if (existing.leader_id) slotLastLeaders[arr.id] = existing.leader_id; continue }

          let selectedLeaderId = null
          let selectedTerritoryId = null

          if (arr.is_group_mode) {
            if (availableTerritories && territoryIdx < availableTerritories.length) {
              selectedTerritoryId = availableTerritories[territoryIdx].id
              territoryIdx++
            }
          } else {
            const candidates = (leaderArrsData?.filter((la: any) => la.arrangement_id === arr.id) || []).map((c: any) => ({
              profile_id: c.profile_id, arrangement_id: c.arrangement_id, frequency: c.frequency,
            }))
            selectedLeaderId = selectBestLeader(
              dateStr, arr.id, candidates, localSchedules,
              { avoidSameWeek, prioritizeInterval }, slotLastLeaders[arr.id] || null,
            )
            if (selectedLeaderId) slotLastLeaders[arr.id] = selectedLeaderId
          }

          const newItem: any = {
            date: dateStr, arrangement_id: arr.id,
            leader_id: selectedLeaderId, territory_id: selectedTerritoryId, status: "draft",
          }
          newSchedules.push(newItem)
          localSchedules.push(newItem)
        }
      }

      if (newSchedules.length > 0) {
        const { error } = await supabase.from("schedules").insert(newSchedules)
        if (error) throw new Error(error.message)
        toast.success(`${newSchedules.length} rascunhos gerados`)
        fetchExistingDrafts()
      } else {
        toast.info("Nenhum novo dia disponível para gerar")
      }
    } catch (error: any) {
      toast.error(`Erro ao gerar: ${error.message}`)
    } finally {
      setGenerating(false)
    }
  }

  async function handleClearDrafts() {
    if (!confirm("Remove todos os rascunhos (não publicados) deste mês. Continuar?")) return
    setLoading(true)
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const { error } = await supabase.from("schedules").delete()
      .gte("date", format(start, "yyyy-MM-dd")).lte("date", format(end, "yyyy-MM-dd")).eq("status", "draft")
    if (error) toast.error("Erro ao limpar rascunhos")
    else { toast.success("Rascunhos removidos"); fetchExistingDrafts() }
    setLoading(false)
  }

  async function handlePublish() {
    if (!confirm("Publicar toda a escala deste mês?")) return
    setLoading(true)
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const { error } = await supabase.from("schedules")
      .update({ status: "published", published_at: new Date().toISOString() })
      .gte("date", format(start, "yyyy-MM-dd")).lte("date", format(end, "yyyy-MM-dd"))
      .in("status", ["draft", "manual"])
    if (error) toast.error("Erro ao publicar")
    else { toast.success("Escala publicada!"); fetchExistingDrafts() }
    setLoading(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-2xl mx-auto lg:max-w-full">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Title */}
        <div className="flex-1 min-w-[160px]">
          <h1 className="text-[0.9375rem] font-semibold text-foreground leading-tight">Motor de escala</h1>
          <p className="text-[0.75rem] text-muted-foreground">Rascunho mensal e designações</p>
        </div>

        {/* Month selector */}
        <Select
          value={format(currentMonth, "yyyy-MM")}
          onValueChange={(val) => setCurrentMonth(parseISO(val + "-01"))}
        >
          <SelectTrigger className="h-9 w-[148px] text-sm font-medium border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={format(new Date(), "yyyy-MM")}>
              {format(new Date(), "MMMM yyyy", { locale: ptBR })}
            </SelectItem>
            <SelectItem value={format(addMonths(new Date(), 1), "yyyy-MM")}>
              {format(addMonths(new Date(), 1), "MMMM yyyy", { locale: ptBR })}
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Generate */}
        <Button
          onClick={handleGenerate}
          disabled={generating || loading}
          className="h-9 px-4 text-sm font-medium gap-1.5 bg-primary text-primary-foreground"
        >
          {generating
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Wand2 className="h-3.5 w-3.5" />}
          Gerar
        </Button>

        {/* Clear */}
        <Button
          variant="ghost"
          onClick={handleClearDrafts}
          disabled={loading}
          className="h-9 px-3 text-sm font-medium gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/8"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Limpar
        </Button>
      </div>

      {/* ── Option chips ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <OptionChip
          title="Evitar repetir na semana"
          sub="Não escalona o mesmo dirigente duas vezes"
          checked={avoidSameWeek}
          onChange={setAvoidSameWeek}
        />
        <OptionChip
          title="Priorizar intervalo"
          sub="Mínimo de uma semana entre escalas"
          checked={prioritizeInterval}
          onChange={setPrioritizeInterval}
        />
      </div>

      {/* ── Section header ── */}
      <div className="flex items-center justify-between pt-1">
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          Rascunho por arranjo
        </span>
        <Button
          size="sm"
          onClick={handlePublish}
          disabled={loading || drafts.length === 0}
          className="h-8 px-3 text-xs font-medium gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Check className="h-3.5 w-3.5" />
          Publicar tudo
        </Button>
      </div>

      {/* ── Arrangement cards ── */}
      {loading && drafts.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-sm">Carregando...</span>
        </div>
      ) : Object.entries(groupedDrafts).length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-xl text-sm text-muted-foreground">
          Clique em "Gerar" para criar o rascunho de{" "}
          {format(currentMonth, "MMMM", { locale: ptBR })}.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(groupedDrafts).map(([arrId, items]) => {
            const arr = items[0].arrangement
            return (
              <ArrangementCard
                key={arrId}
                arr={arr}
                items={items}
                leaders={leaders}
                leaderArrs={leaderArrs}
                onUpdate={fetchExistingDrafts}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── OptionChip ───────────────────────────────────────────────────────────────

function OptionChip({
  title, sub, checked, onChange,
}: {
  title: string
  sub: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3 flex-1 px-3 py-2.5 rounded-xl border border-border bg-card">
      <div className="flex-1 min-w-0">
        <p className="text-[0.75rem] font-medium text-foreground leading-tight">{title}</p>
        <p className="text-[0.625rem] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </div>
  )
}

// ─── ArrangementCard ──────────────────────────────────────────────────────────

function ArrangementCard({
  arr, items, leaders, leaderArrs, onUpdate,
}: {
  arr: ScheduleItem["arrangement"]
  items: ScheduleItem[]
  leaders: { id: string; name: string }[]
  leaderArrs: { profile_id: string; arrangement_id: string }[]
  onUpdate: () => void
}) {
  const timeLabel = arr.start_time.substring(0, 5) + "h"

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/40">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Clock className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-[0.8125rem] font-medium text-foreground flex-1 truncate">{arr.label}</span>
        <span className="text-[0.6875rem] font-medium text-muted-foreground shrink-0">{timeLabel}</span>
      </div>

      {/* Slot rows */}
      <div className="divide-y divide-border">
        {items.map((item) => (
          <SlotRow
            key={item.id}
            item={item}
            leaders={leaders}
            leaderArrs={leaderArrs}
            isGroupMode={arr.is_group_mode}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  )
}

// ─── SlotRow ──────────────────────────────────────────────────────────────────

function SlotRow({
  item, leaders, leaderArrs, isGroupMode, onUpdate,
}: {
  item: ScheduleItem
  leaders: { id: string; name: string }[]
  leaderArrs: { profile_id: string; arrangement_id: string }[]
  isGroupMode: boolean
  onUpdate: () => void
}) {
  const dayNum = format(parseISO(item.date), "dd")
  const weekday = format(parseISO(item.date), "eee", { locale: ptBR })

  const statusLabel = item.status === "published" ? "Publicado"
    : item.status === "manual" ? "Manual"
      : "Rascunho"

  const statusClass = item.status === "published"
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : item.status === "manual"
      ? "bg-primary/8 text-primary border-primary/20"
      : "bg-muted text-muted-foreground border-border"

  return (
    <div className="grid items-center gap-3 px-4 py-2.5"
      style={{ gridTemplateColumns: "48px 1fr auto" }}
    >
      {/* Date */}
      <div className="text-center">
        <p className="text-[1.125rem] font-medium text-foreground leading-none">{dayNum}</p>
        <p className="text-[0.5625rem] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">{weekday}</p>
      </div>

      {/* Assignee */}
      {isGroupMode ? (
        <div className="min-w-0">
          <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-primary">Modo Grupo</span>
          {item.territory && (
            <p className="text-[0.75rem] font-medium text-foreground truncate mt-0.5">
              T{item.territory.number} · {item.territory.name}
            </p>
          )}
        </div>
      ) : (
        <Select
          value={item.leader_id || "none"}
          onValueChange={async (val) => {
            const { error } = await supabase
              .from("schedules")
              .update({ leader_id: val === "none" ? null : val, status: "manual" })
              .eq("id", item.id)
            if (!error) onUpdate()
          }}
        >
          <SelectTrigger className="h-8 w-full text-[0.75rem] font-medium border-border">
            <SelectValue placeholder="Pendente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-[0.75rem]">Pendente</SelectItem>
            {leaders
              .filter((l) => leaderArrs.some((la) => la.profile_id === l.id && la.arrangement_id === item.arrangement_id))
              .map((l) => (
                <SelectItem key={l.id} value={l.id} className="text-[0.75rem]">{l.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}

      {/* Status badge */}
      <span className={cn(
        "text-[0.5625rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border whitespace-nowrap",
        statusClass,
      )}>
        {statusLabel}
      </span>
    </div>
  )
}