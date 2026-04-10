"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
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
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        {badge}
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
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
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className={cn(danger && value > 0 ? "text-red-500" : "text-muted-foreground")}>
          {icon}
        </span>
        {label}
      </div>
      <p className={cn(
        "text-[30px] font-medium leading-none tracking-tight",
        danger && value > 0 ? "text-red-500" : "text-foreground"
      )}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground font-medium uppercase">{hint}</p>
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
}

interface RecentActivity {
  id: string
  type: 'assigned' | 'completed' | 'returned'
  territory: string
  publisher: string
  date: string
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
        .limit(100)

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
        <h1 className="text-[20px] font-black text-foreground tracking-tight">
          Olá, {firstName} 👋
        </h1>
        <p className="text-[12px] text-muted-foreground font-medium">{todayFormatted}</p>
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

      {/* ── Section: Em campo ── */}
      <SectionCard>
        <SectionHeader
          icon={<Clock className="w-3.5 h-3.5 text-primary" />}
          title="Em campo"
          sub="Progresso das designações ativas"
          badge={
            <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {territories.filter(t => t.isActive).length}
            </span>
          }
        />
        <Divider />
        <div className="divide-y divide-border/30">
          {territories.filter(t => t.isActive).length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-[11px] font-medium italic">
              Nenhum território em campo
            </div>
          ) : (
            territories.filter(t => t.isActive).map((territory) => {
              const subs = territory.subdivisions || []
              const progress = subs.length > 0 ? Math.round((subs.filter((s: any) => s.completed || s.status === 'completed').length / subs.length) * 100) : 0
              return (
                <div key={territory.id} className="flex flex-col gap-2.5 px-4 py-3.5 hover:bg-muted/5 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-black text-muted-foreground shrink-0">
                        {getInitials(territory.name)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <h4 className="text-[13px] font-bold text-foreground leading-tight truncate">{territory.name}</h4>
                        <span className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wide truncate">
                          {territory.activeAssignee || "Ativo"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-bold text-muted-foreground/60 whitespace-nowrap">
                        {territory.daysInField}d · {progress}%
                      </span>
                    </div>
                  </div>
                  <div className="h-[2px] w-full bg-muted/60 rounded-full overflow-hidden">
                    <div className="h-full bg-primary/60 transition-all duration-700" style={{ width: `${progress}%` }} />
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
            <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60 uppercase">
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
                  <span className="w-4 text-center text-[11px] font-black text-muted-foreground/30">{i + 1}</span>
                  <div className="w-[3px] h-7 rounded-full shrink-0" style={{ backgroundColor: rankColors[i] || "#A1A1AA" }} />
                  <div className="flex-1 min-w-0 ml-1">
                    <h4 className="text-[13px] font-bold text-foreground leading-tight truncate">{t.name}</h4>
                    <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest leading-none">Nº {t.number}</span>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <span className="text-[22px] font-medium text-foreground leading-none">{t.assignmentCount}</span>
                    <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest mt-0.5">vezes</span>
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
                  "inline-flex text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-[4px] mb-1.5 outline outline-1 outline-offset-0",
                  activity.type === 'completed' ? 'bg-emerald-500/10 text-emerald-600 outline-emerald-500/20' : 
                  activity.type === 'returned' ? 'bg-red-400/10 text-red-600 outline-red-400/20' : 
                  'bg-amber-400/10 text-amber-600 outline-amber-400/20'
                )}>
                  {activity.type === 'completed' ? 'Concluído' : activity.type === 'returned' ? 'Devolvido' : 'Designado'}
                </span>
                <h4 className="text-[13px] font-bold text-foreground truncate leading-tight">{activity.territory}</h4>
                <p className="text-[11px] font-medium text-muted-foreground/80 truncate">{activity.publisher}</p>
              </div>
              <span className="text-[10px] font-bold text-muted-foreground/40 mt-1 uppercase whitespace-nowrap">
                {new Date(activity.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}