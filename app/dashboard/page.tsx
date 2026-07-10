"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { cn, fmtTerritoryNumber } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Clock, Activity, AlertTriangle, Star, TrendingUp
} from "lucide-react"
import { useRouter } from "next/navigation"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | undefined | null) {
  if (!name) return "?"
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-card rounded-2xl border border-border overflow-hidden shadow-sm", className)}>
      {children}
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  sub,
  badge,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  badge?: React.ReactNode
}) {
  return (
    <div className="px-4 pt-3 pb-2">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-[0.8125rem] font-semibold text-foreground">{title}</h2>
        {badge}
      </div>
      <p className="text-[0.6875rem] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-border/40" />
}

function StatCard({
  icon,
  label,
  value,
  hint,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  value: number
  hint: string
  danger?: boolean
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-3.5 flex flex-col gap-1.5 shadow-sm transition-transform active:scale-[0.98]">
      <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className={cn(danger && value > 0 ? "text-red-500" : "text-muted-foreground")}>
          {icon}
        </span>
        {label}
      </div>
      <p className={cn(
        "text-[1.875rem] font-medium leading-none tracking-tight",
        danger && value > 0 ? "text-red-500" : "text-foreground"
      )}>
        {value}
      </p>
      <p className="text-[0.625rem] text-muted-foreground font-medium uppercase">{hint}</p>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string
  status: string
  assigned_at: string
  completed_at: string | null
  returned_at: string | null
  territory_id: string
  user_id: string
  group_id?: string | null
  territories?: { name: string; number: string }
}

interface TerritoryWithStats {
  id: string
  name: string
  number: string
  color: string
  status: string
  assignmentCount: number
  isActive: boolean
  daysInField?: number
  subdivisions?: any[]
  activeAssignee?: string
}

interface RecentActivity {
  id: string
  type: 'assigned' | 'completed' | 'returned'
  territory: string
  publisher: string
  date: string
}

interface CampaignProgress {
  id: string
  name: string
  startDate: string
  endDate: string | null
  totalTerritories: number
  totalSubdivisions: number
  completedSubdivisions: number
  completed: { territoryId: string; number: string; name: string; color: string; completedAt: string }[]
  inProgress: { territoryId: string; number: string; name: string; color: string; assignee: string; daysInField: number; progress: number }[]
  notStarted: { territoryId: string; number: string; name: string; color: string }[]
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { profile, user, isReady } = useAuth()
  const [stats, setStats] = useState<{
    activeAssignments: number
    overdueAssignments: number
  } | null>(null)
  const [territories, setTerritories] = useState<TerritoryWithStats[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [namesLookup, setNamesLookup] = useState<Map<string, string>>(new Map())
  const [campaignProgress, setCampaignProgress] = useState<CampaignProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = getSupabaseBrowserClient()
  const router = useRouter()

  const fetchDashboardData = async () => {
    try {
      setLoading(true)

      // 1. Nomes Lookup
      const { data: pList } = await supabase.from("profiles").select("id, name")
      const { data: gList } = await supabase.from("groups").select("id, name")
      const lookup = new Map<string, string>()
      pList?.forEach((p: any) => lookup.set(p.id, p.name))
      gList?.forEach((g: any) => lookup.set(g.id, g.name))
      setNamesLookup(lookup)

      // 2. Busca territórios e Subdivisions
      const { data: tData } = await supabase
        .from("territories")
        .select(`
          id, name, number, color, status,
          subdivisions ( id, completed, status )
        `)
        .order("number", { ascending: true })

      // 3. Busca designações
      const { data: aData } = await supabase
        .from("assignments")
        .select(`
          id, status, assigned_at, completed_at, returned_at,
          territory_id, user_id, group_id,
          territories ( name, number )
        `)
        .order("assigned_at", { ascending: false })
        .limit(500)

      if (!tData || !aData) return

      const activeAssignments = aData.filter((a: any) => a.status === 'active')
      const overdueCount = activeAssignments.filter((a: any) => {
        const days = Math.ceil((new Date().getTime() - new Date(a.assigned_at).getTime()) / (1000 * 60 * 60 * 24))
        return days > 90
      }).length

      setStats({
        activeAssignments: activeAssignments.length,
        overdueAssignments: overdueCount
      })

      const tStats: TerritoryWithStats[] = tData
        .filter((t: any) => t.status !== 'inactive')
        .map((t: any) => {
          const tA = aData.filter((a: any) => a.territory_id === t.id)
          const active = tA.find((a: any) => a.status === 'active')
          return {
            ...t,
            assignmentCount: tA.filter((a: any) => a.status === 'completed').length,
            isActive: !!active,
            daysInField: active ? Math.ceil((new Date().getTime() - new Date(active.assigned_at).getTime()) / (1000 * 60 * 60 * 24)) : undefined,
            activeAssignee: active ? (lookup.get(active.user_id) || lookup.get(active.group_id) || '?') : undefined
          }
        })
      setTerritories(tStats)

      const acts: RecentActivity[] = aData.slice(0, 10).map((a: any) => ({
        id: a.id,
        type: a.status === 'completed' ? 'completed' : a.status === 'returned' ? 'returned' : 'assigned',
        territory: a.territories?.name || '?',
        publisher: lookup.get(a.user_id) || lookup.get(a.group_id) || '?',
        date: a.completed_at || a.returned_at || a.assigned_at
      }))
      setRecentActivity(acts)

      // 4. Campanha ativa
      setCampaignProgress(null)
      const today = new Date().toISOString().slice(0, 10)
      const { data: campaignsData } = await supabase
        .from("campaigns")
        .select("id, name, start_date, end_date")
        .eq("active", true)

      const activeCamp = (campaignsData ?? []).find((c: any) => {
        if (!c.start_date || today < c.start_date) return false
        if (c.end_date && today > c.end_date) return false
        return true
      })

      if (activeCamp) {
        const { data: campAssignments } = await supabase
          .from("assignments")
          .select("territory_id, status, completed_at, assigned_at, user_id, group_id, territories(number, name, color)")
          .eq("campaign_id", activeCamp.id)
          .in("status", ["completed", "active"])

        const activeTData = tData.filter((t: any) => t.status !== "inactive")
        const totalTerritories = activeTData.length
        const subsLookup = new Map<string, any[]>(tData.map((t: any) => [t.id, t.subdivisions ?? []]))

        // Progresso por quadra dentro da campanha — mais preciso que por território,
        // pois reflete trabalho parcial em vez de exigir 100% pra contar.
        const activeSubdivisionIds = new Set(
          activeTData.flatMap((t: any) => (t.subdivisions ?? []).map((s: any) => s.id))
        )
        const totalSubdivisions = activeSubdivisionIds.size
        const { data: campSubProgress } = await supabase
          .from("subdivision_campaign_progress")
          .select("subdivision_id, completed")
          .eq("campaign_id", activeCamp.id)
          .eq("completed", true)
        const completedSubdivisions = (campSubProgress ?? []).filter((p: any) =>
          activeSubdivisionIds.has(p.subdivision_id)
        ).length

        const completedCampIds = new Set(
          (campAssignments ?? []).filter((a: any) => a.status === "completed").map((a: any) => a.territory_id)
        )

        const completedMap = new Map<string, any>()
        ;(campAssignments ?? [])
          .filter((a: any) => a.status === "completed")
          .sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
          .forEach((a: any) => {
            if (!completedMap.has(a.territory_id)) {
              completedMap.set(a.territory_id, {
                territoryId: a.territory_id,
                number: a.territories?.number || "",
                name: a.territories?.name || "",
                color: a.territories?.color || "",
                completedAt: a.completed_at,
              })
            }
          })
        const completed = Array.from(completedMap.values())

        // Em andamento: qualquer território com status 'assigned' que ainda não foi concluído
        // na campanha — independentemente de ter campaign_id na assignment ativa
        const activeTerritoryIds = new Set(
          tData.filter((t: any) => t.status === "assigned").map((t: any) => t.id)
        )
        const inProgress = tData
          .filter((t: any) => t.status === "assigned" && !completedCampIds.has(t.id))
          .map((t: any) => {
            const subs = subsLookup.get(t.id) ?? []
            const progress = subs.length > 0
              ? Math.round(subs.filter((s: any) => s.completed || s.status === "completed").length / subs.length * 100)
              : 0
            const activeA = aData.find((a: any) => a.territory_id === t.id && a.status === "active")
            return {
              territoryId: t.id,
              number: t.number || "",
              name: t.name || "",
              color: t.color || "",
              assignee: activeA ? (lookup.get(activeA.user_id) || lookup.get(activeA.group_id) || "?") : "?",
              daysInField: activeA ? Math.ceil((new Date().getTime() - new Date(activeA.assigned_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
              progress,
            }
          })

        const notStarted = tData
          .filter((t: any) => t.status !== "inactive" && !completedCampIds.has(t.id) && !activeTerritoryIds.has(t.id))
          .map((t: any) => ({ territoryId: t.id, number: t.number, name: t.name, color: t.color }))
          .sort((a: any, b: any) => (a.number || "").localeCompare(b.number || "", undefined, { numeric: true }))

        setCampaignProgress({
          id: activeCamp.id,
          name: activeCamp.name,
          startDate: activeCamp.start_date,
          endDate: activeCamp.end_date ?? null,
          totalTerritories,
          totalSubdivisions,
          completedSubdivisions,
          completed,
          inProgress,
          notStarted,
        })
      }

    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (isReady && profile) {
      if (["publicador", "dirigente"].includes(profile.role)) {
        router.replace("/dashboard/my-assignments")
      } else {
        fetchDashboardData()
      }
    }
  }, [isReady, profile, router])

  if (loading || !isReady || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm font-medium">
        Carregando dashboard...
      </div>
    )
  }

  const firstName = profile?.name?.split(" ")[0] || "Admin"
  const todayLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const todayFormatted = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)

  return (
    <div className="space-y-4 pb-10">
      {/* ── Greeting ── */}
      <div className="pt-2 pb-1">
        <h1 className="text-[1.25rem] font-black text-foreground tracking-tight">
          Olá, {firstName} 👋
        </h1>
        <p className="text-[0.75rem] text-muted-foreground font-medium">{todayFormatted}</p>
      </div>

      {/* ── Hero Stat Cards ── */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Clock className="w-3.5 h-3.5" />}
            label="Em campo"
            value={stats.activeAssignments}
            hint="territórios ativos"
          />
          <StatCard
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Atrasados"
            value={stats.overdueAssignments}
            hint="mais de 90 dias"
            danger={stats.overdueAssignments > 0}
          />
        </div>
      )}

      {/* ── Section: Campanha ── */}
      {campaignProgress && (
        <SectionCard>
          <div className="px-4 pt-3 pb-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <h2 className="text-[0.8125rem] font-semibold text-foreground">{campaignProgress.name}</h2>
              <span className="ml-auto flex items-center gap-1 text-[0.875rem] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                {campaignProgress.completedSubdivisions}/{campaignProgress.totalSubdivisions}
                <span className="text-[0.5625rem] font-bold uppercase tracking-wide opacity-70">quadras</span>
              </span>
            </div>
            <p className="text-[0.6875rem] text-muted-foreground mt-0.5">
              {(() => {
                const fmt = (d: string) => {
                  const parts = d.slice(0, 10).split("-")
                  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d
                }
                return campaignProgress.endDate
                  ? `${fmt(campaignProgress.startDate)} a ${fmt(campaignProgress.endDate)}`
                  : `Desde ${fmt(campaignProgress.startDate)}`
              })()}
              {" · "}
              {Math.round((campaignProgress.completedSubdivisions / (campaignProgress.totalSubdivisions || 1)) * 100)}% concluído
              {" · "}
              {campaignProgress.completed.length}/{campaignProgress.totalTerritories} territórios
            </p>
            <div className="mt-2.5 h-[3px] w-full bg-muted/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-700 rounded-full"
                style={{ width: `${Math.round((campaignProgress.completedSubdivisions / (campaignProgress.totalSubdivisions || 1)) * 100)}%` }}
              />
            </div>
          </div>

          {(campaignProgress.inProgress.length > 0 || campaignProgress.notStarted.length > 0) && (
            <>
              <Divider />
              <div className="px-4 py-1.5 bg-muted/30 flex items-center gap-3">
                <span className="text-[0.625rem] font-black uppercase tracking-wider text-muted-foreground">
                  Em andamento · {campaignProgress.inProgress.length}
                </span>
                {campaignProgress.notStarted.length > 0 && (
                  <span className="text-[0.625rem] font-black uppercase tracking-wider text-muted-foreground/50">
                    Não iniciado · {campaignProgress.notStarted.length}
                  </span>
                )}
              </div>
              <div className="divide-y divide-border/30">
                {campaignProgress.inProgress.map((t) => (
                  <div key={t.territoryId} className="flex items-stretch hover:bg-muted/5 transition-colors overflow-hidden">
                    <div className="w-1 shrink-0 my-3 ml-4 rounded-full" style={{ backgroundColor: t.color || "hsl(var(--primary))" }} />
                    <div className="flex-1 px-3 py-3 flex flex-col gap-2 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[0.625rem] font-mono font-semibold text-muted-foreground shrink-0">{fmtTerritoryNumber(t.number)}</span>
                            <h4 className="text-[0.8125rem] font-bold text-foreground truncate">{t.name}</h4>
                          </div>
                          <span className="text-[0.6875rem] text-muted-foreground/80 uppercase tracking-wide truncate">{t.assignee}</span>
                        </div>
                        <span className="text-[0.6875rem] font-bold text-muted-foreground/60 shrink-0 whitespace-nowrap">
                          {t.daysInField}d · {t.progress}%
                        </span>
                      </div>
                      <div className="h-[2px] w-full bg-muted/60 rounded-full overflow-hidden">
                        <div className="h-full bg-primary/60 transition-all duration-700" style={{ width: `${t.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                {campaignProgress.notStarted.map((t) => (
                  <div key={t.territoryId} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/5 transition-colors opacity-60">
                    <div className="w-1 h-7 rounded-full shrink-0" style={{ backgroundColor: t.color || "hsl(var(--primary))" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[0.625rem] font-mono font-semibold text-muted-foreground shrink-0">{fmtTerritoryNumber(t.number)}</span>
                        <h4 className="text-[0.8125rem] font-bold text-foreground truncate">{t.name}</h4>
                      </div>
                    </div>
                    <span className="text-[0.5625rem] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60 shrink-0">
                      Não iniciado
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {campaignProgress.completed.length > 0 && (
            <>
              <Divider />
              <div className="px-4 py-1.5 bg-emerald-500/5">
                <span className="text-[0.625rem] font-black uppercase tracking-wider text-emerald-600">
                  Concluídos · {campaignProgress.completed.length}
                </span>
              </div>
              <div className="divide-y divide-border/30">
                {campaignProgress.completed.map((t) => (
                  <div key={t.territoryId} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/5 transition-colors">
                    <div className="w-1 h-7 rounded-full shrink-0 bg-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[0.625rem] font-mono font-semibold text-muted-foreground shrink-0">{fmtTerritoryNumber(t.number)}</span>
                        <h4 className="text-[0.8125rem] font-bold text-foreground truncate">{t.name}</h4>
                      </div>
                    </div>
                    <span className="text-[0.625rem] font-bold text-muted-foreground/40 uppercase whitespace-nowrap">
                      {new Date(t.completedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* ── Section: Em campo ── */}
      <SectionCard>
        <SectionHeader
          icon={<Clock className="w-3.5 h-3.5 text-primary" />}
          title="Em campo"
          sub="Progresso das designações ativas"
          badge={
            <span className="ml-auto text-[0.875rem] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {territories.filter(t => t.isActive).length}
            </span>
          }
        />
        <Divider />
        <div className="divide-y divide-border/30">
          {territories.filter(t => t.isActive).length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-[0.6875rem] font-medium italic">
              Nenhum território em campo
            </div>
          ) : (
            territories.filter(t => t.isActive).sort((a, b) => {
              const subsA = a.subdivisions || []
              const subsB = b.subdivisions || []
              const progressA = subsA.length > 0 ? subsA.filter((s: any) => s.completed || s.status === 'completed').length / subsA.length : 0
              const progressB = subsB.length > 0 ? subsB.filter((s: any) => s.completed || s.status === 'completed').length / subsB.length : 0
              return progressB - progressA
            }).map((territory) => {
              const subs = territory.subdivisions || []
              const progress = subs.length > 0 ? Math.round((subs.filter((s: any) => s.completed || s.status === 'completed').length / subs.length) * 100) : 0
              return (
                <div key={territory.id} className="flex items-stretch hover:bg-muted/5 transition-colors overflow-hidden">
                  <div className="w-1 shrink-0 my-3 ml-4 rounded-full" style={{ backgroundColor: territory.color || 'hsl(var(--primary))' }} />
                  <div className="flex-1 px-3 py-3.5 flex flex-col gap-2.5 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[0.625rem] font-mono font-semibold text-muted-foreground shrink-0">
                            {fmtTerritoryNumber(territory.number)}
                          </span>
                          <h4 className="text-[0.8125rem] font-bold text-foreground leading-tight truncate">{territory.name}</h4>
                        </div>
                        <span className="text-[0.6875rem] font-medium text-muted-foreground/80 uppercase tracking-wide truncate">
                          {territory.activeAssignee || "Ativo"}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[0.6875rem] font-bold text-muted-foreground/60 whitespace-nowrap">
                          {territory.daysInField}d · {progress}%
                        </span>
                      </div>
                    </div>
                    <div className="h-[2px] w-full bg-muted/60 rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 transition-all duration-700" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </SectionCard>

      {/* ── Section: Ranking ── */}
      <SectionCard>
        <SectionHeader
          icon={<Star className="w-3.5 h-3.5 text-amber-500" />}
          title="Mais trabalhados"
          sub="Territórios com mais conclusões recentes"
          badge={
            <span className="ml-auto text-[0.625rem] font-black px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60 uppercase">
              6 meses
            </span>
          }
        />
        <Divider />
        <div className="divide-y divide-border/30 text-xs">
          {territories
            .sort((a, b) => b.assignmentCount - a.assignmentCount)
            .slice(0, 5)
            .map((t, i) => {
              const rankColors = ["#E24B4A", "#378ADD", "#378ADD", "#378ADD", "#A1A1AA"]
              return (
                <div key={t.id} className="flex items-center px-4 py-3 hover:bg-muted/5 transition-colors gap-3">
                  <span className="w-4 text-center text-[0.6875rem] font-black text-muted-foreground/30">{i + 1}</span>
                  <div className="w-[3px] h-7 rounded-full shrink-0" style={{ backgroundColor: rankColors[i] || "#A1A1AA" }} />
                  <div className="flex-1 min-w-0 ml-1">
                    <h4 className="text-[0.8125rem] font-bold text-foreground leading-tight truncate">{t.name}</h4>
                    <span className="text-[0.625rem] font-black text-muted-foreground/60 uppercase tracking-widest leading-none">Nº {t.number}</span>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <span className="text-[1.375rem] font-medium text-foreground leading-none">{t.assignmentCount}</span>
                    <span className="text-[0.5625rem] font-black text-muted-foreground/60 uppercase tracking-widest mt-0.5">vezes</span>
                  </div>
                </div>
              )
            })}
        </div>
      </SectionCard>

      {/* ── Section: Atividades ── */}
      <SectionCard>
        <SectionHeader
          icon={<Activity className="w-3.5 h-3.5 text-blue-500" />}
          title="Atividades"
          sub="Últimas movimentações do sistema"
        />
        <Divider />
        <div className="divide-y divide-border/30">
          {recentActivity.map((activity) => (
            <div key={activity.id} className="flex items-start px-4 py-3 hover:bg-muted/5 transition-colors gap-3">
              <div className={cn(
                "w-2 h-2 rounded-full mt-3.5 shrink-0",
                activity.type === 'completed' ? 'bg-emerald-500' : activity.type === 'returned' ? 'bg-red-400' : 'bg-amber-400'
              )} />
              <div className="flex-1 min-w-0">
                <span className={cn(
                  "inline-flex text-[0.5625rem] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-[4px] mb-1.5 outline outline-1 outline-offset-0",
                  activity.type === 'completed' ? 'bg-emerald-500/10 text-emerald-600 outline-emerald-500/20' :
                    activity.type === 'returned' ? 'bg-red-400/10 text-red-600 outline-red-400/20' :
                      'bg-amber-400/10 text-amber-600 outline-amber-400/20'
                )}>
                  {activity.type === 'completed' ? 'Concluído' : activity.type === 'returned' ? 'Devolvido' : 'Designado'}
                </span>
                <h4 className="text-[0.8125rem] font-bold text-foreground truncate leading-tight">{activity.territory}</h4>
                <p className="text-[0.6875rem] font-medium text-muted-foreground/80 truncate">{activity.publisher}</p>
              </div>
              <span className="text-[0.625rem] font-bold text-muted-foreground/40 mt-1 uppercase whitespace-nowrap">
                {new Date(activity.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}