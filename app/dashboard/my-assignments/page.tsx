"use client"

import { useEffect, useState, useCallback } from "react"
import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { createTimeoutSignal } from "@/lib/utils/api-utils"
import { useAuth } from "@/hooks/use-auth"
import { Badge } from "@/components/ui/badge"
import { Loader2, MapPin, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { format, parseISO, isToday, isTomorrow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ClipboardList, CalendarDays, Calendar } from "lucide-react"

interface AssignmentRecord {
  id: string
  assigned_at: string
  status: string
  group_id: string | null        // FIX: incluído explicitamente no select
  campaign_id: string | null
  campaign?: { id: string; name: string; active: boolean } | null
}

interface TerritoryAssignment extends TerritoryWithSubdivisions {
  assignments: AssignmentRecord[]
}

// FIX: select reutilizável que inclui group_id e active na campanha
const ASSIGNMENTS_SELECT = `
  id,
  assigned_at,
  status,
  group_id,
  campaign_id,
  campaign:campaigns(id, name, active)
`

const supabase = getSupabaseBrowserClient()

export default function MyAssignmentsPage() {
  const { user, profile, isReady } = useAuth()
  const [territories, setTerritories] = useState<TerritoryAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [nextSchedule, setNextSchedule] = useState<any>(null)
  const [fetchingSchedule, setFetchingSchedule] = useState(true)
  const router = useRouter()

  const fetchMyAssignments = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    const { signal, clear } = createTimeoutSignal(15000)

    try {
      const { data: personal, error } = await supabase
        .from("territories")
        .select(`*, campaign:campaigns(*), subdivisions(*), assignments(${ASSIGNMENTS_SELECT})`)
        .eq("assigned_to", user.id)
        .abortSignal(signal)
        .order("number", { ascending: true })

      if (error) throw error

      const allTerritories: TerritoryAssignment[] = (personal as TerritoryAssignment[]) || []

      setTerritories(allTerritories)
      localStorage.setItem("my_assignments_cache", JSON.stringify(allTerritories))

      // Busca a próxima escala
      setFetchingSchedule(true)
      const todayStr = format(new Date(), "yyyy-MM-dd")
      const { data: scheduleData } = await supabase
        .from('schedules')
        .select(`
          id,
          date,
          arrangement:schedule_arrangements(id, label, start_time)
        `)
        .eq('leader_id', user.id)
        .eq('status', 'published')
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle()

      setNextSchedule(scheduleData)
      setFetchingSchedule(false)
    } catch (err: any) {
      if (err.name === "AbortError") toast.error("Tempo esgotado ao carregar territórios.")
      const cached = localStorage.getItem("my_assignments_cache")
      if (cached) {
        try { setTerritories(JSON.parse(cached)) } catch { }
      }
    } finally {
      clear()
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (isReady) {
      fetchMyAssignments()
      const lastRequest = localStorage.getItem("last_territory_request")
      if (lastRequest) {
        const diff = Date.now() - parseInt(lastRequest)
        const fiveMin = 5 * 60 * 1000
        if (diff < fiveMin) setCooldown(Math.ceil((fiveMin - diff) / 1000))
      }
    }
  }, [isReady, fetchMyAssignments])

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  const calcProgress = (subdivisions?: Subdivision[]): number => {
    if (!subdivisions?.length) return 0
    const done = subdivisions.filter(s => s.status === "completed" || s.completed).length
    return Math.round((done / subdivisions.length) * 100)
  }

  const calcDays = (territory: TerritoryAssignment): number => {
    const assignedAt = territory.assignments?.find(a => a.status === "active")?.assigned_at
    if (!assignedAt) return 0
    return Math.ceil((Date.now() - new Date(assignedAt).getTime()) / (1000 * 60 * 60 * 24))
  }

  const handleRequestTerritory = async () => {
    if (!user?.id || !profile?.name || requesting || cooldown > 0) return
    setRequesting(true)
    try {
      const { error } = await supabase.from("notifications").insert({
        type: "request",
        title: "Pedido de Território",
        message: `${profile.name} está solicitando um novo território para trabalhar.`,
        created_by: user.id,
      })
      if (error) throw error
      localStorage.setItem("last_territory_request", Date.now().toString())
      setCooldown(300)
      toast.success("Pedido enviado!")
    } catch {
      toast.error("Erro ao enviar pedido.")
    } finally {
      setRequesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/30" />
      </div>
    )
  }

  const avgProgress =
    territories.length > 0
      ? Math.round(territories.reduce((acc, t) => acc + calcProgress(t.subdivisions), 0) / territories.length)
      : 0

  const totalDone = territories.reduce(
    (acc, t) => acc + (t.subdivisions?.filter(s => s.completed || s.status === "completed").length || 0), 0
  )
  const totalAll = territories.reduce((acc, t) => acc + (t.subdivisions?.length || 0), 0)

  const firstName =
    typeof profile?.name === "string" && profile.name.trim().length > 0
      ? profile.name.split(" ")[0]
      : "Irmão"

  return (
    <div className="min-h-screen bg-background">

      <div className="px-2.5 mb-6">
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">Meus territórios</h1>
        <p className="text-xs text-muted-foreground font-medium">Olá, {firstName}!</p>
      </div>



      <div className="px-2.5 mb-2">
        {cooldown > 0 && (
          <div className="bg-warning/10 border border-warning/20 p-2 rounded-lg text-[0.6875rem] text-warning font-medium text-center">
            Aguarde {Math.floor(cooldown / 60)}:{String(cooldown % 60).padStart(2, "0")} para um novo pedido.
          </div>
        )}
      </div>

      <div className="px-2.5 mb-5">
        <button
          onClick={() => router.push('/dashboard/my-schedule')}
          className="w-full bg-card rounded-xl border border-border p-3 flex items-center gap-3 transition-all active:scale-[0.98] hover:border-primary/30"
        >
          <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success shrink-0">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">
              {nextSchedule ? (
                isToday(parseISO(nextSchedule.date)) ? "Você dirige hoje!" :
                  isTomorrow(parseISO(nextSchedule.date)) ? "Próxima escala: amanhã" :
                    "Próxima escala"
              ) : "Escala"}
            </p>
            {fetchingSchedule ? (
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            ) : nextSchedule ? (
              <p className="text-sm font-bold text-foreground">
                {format(parseISO(nextSchedule.date), "eeee, dd/MM", { locale: ptBR })} — {nextSchedule.arrangement?.start_time.substring(0, 5)}h
                <span className="block text-[0.6875rem] font-medium text-muted-foreground uppercase">{nextSchedule.arrangement?.label}</span>
              </p>
            ) : (
              <p className="text-sm font-bold text-muted-foreground">Nenhuma designação próxima</p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
        </button>
      </div>

      <div className="space-y-3 px-2.5 pb-24">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border border-border p-3 shadow-sm">
            <p className="text-[0.75rem] font-medium text-muted-foreground mb-1.5">Progresso médio</p>
            <p className="text-xl font-semibold text-foreground">{avgProgress}%</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 shadow-sm">
            <p className="text-[0.75rem] font-medium text-muted-foreground mb-1.5">Quadras concluídas</p>
            <p className="text-xl font-semibold text-foreground">
              {totalDone} <span className="text-sm font-normal text-muted-foreground">/ {totalAll}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground">
            {territories.length} {territories.length === 1 ? "território ativo" : "territórios ativos"}
          </p>
          <div className="h-px flex-1 bg-border/50 ml-4" />
        </div>

        {territories.length === 0 ? (
          <div className="py-14 flex flex-col items-center justify-center space-y-3 bg-card rounded-xl border border-dashed border-border">
            <MapPin className="h-7 w-7 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">Nenhum território designado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {territories.map((t) => {
              const progress = calcProgress(t.subdivisions)
              const days = calcDays(t)
              const isOverdue = days > 90
              const done = t.subdivisions?.filter(s => s.completed || s.status === "completed").length || 0
              const total = t.subdivisions?.length || 0
              const activeAssignment = t.assignments?.find(a => a.status === "active")

              // FIX: só exibe campanha se active === true na designação ativa
              const campaignName =
                activeAssignment?.campaign?.active === true
                  ? activeAssignment.campaign.name
                  : null

              const progressColor =
                progress === 100 ? "bg-success"
                  : isOverdue ? "bg-destructive/60"
                    : progress >= 50 ? "bg-warning"
                      : "bg-destructive/60"

              const badgeClass =
                progress === 100 ? "bg-success/10 text-success"
                  : isOverdue || progress < 50 ? "bg-destructive/10 text-destructive"
                    : "bg-warning/10 text-warning"

              return (
                <button
                  key={t.id}
                  onClick={() => router.push(`/dashboard/my-assignments/${t.id}/map`)}
                  className={cn(
                    "w-full text-left bg-card rounded-xl border px-3 py-2.5 transition-all active:scale-[0.98] space-y-1.5",
                    isOverdue ? "border-destructive/50" : "border-border hover:border-primary/30"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || "var(--primary)" }} />
                    <span className="text-sm font-medium text-foreground flex-1 truncate">
                      Território {t.number}
                      {t.name && <span className="font-normal text-muted-foreground"> · {t.name}</span>}
                    </span>
                    <span className={cn("text-[0.6875rem] font-medium px-2 py-0.5 rounded-full", badgeClass)}>
                      {progress}%
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
                  </div>



                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", progressColor)} style={{ width: `${progress}%` }} />
                  </div>

                  <div className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
                    <span>{days} dias</span>
                    <span className="w-1 h-1 rounded-full bg-border inline-block" />
                    <span>{done} de {total} quadras</span>
                    {isOverdue && (
                      <span className="text-red-500 font-medium bg-red-500/10 px-1.5 py-0.5 rounded-full">Em atraso</span>
                    )}
                    {campaignName && (
                      <span className="ml-auto bg-muted border border-border px-1.5 py-0.5 rounded text-[0.625rem]">
                        {campaignName}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}