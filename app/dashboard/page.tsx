"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { StatsCard } from "@/components/dashboard/stats-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Map as MapIcon, MapPin, Users, CheckCircle, Clock, Loader2, 
  TrendingUp, AlertCircle, Activity, AlertTriangle
} from "lucide-react"
import { useRouter } from "next/navigation"

interface Assignment {
  id: string
  status: string
  assigned_at: string
  completed_at: string | null
  territory_id: string
  user_id: string
  profiles?: {
    name: string
  }
  groups?: {
    name: string
  }
}

interface Territory {
  id: string
  name: string
  number: string
  color: string
  campaign_id: string | null
}

interface DashboardStats {
  totalTerritories: number
  activeTerritories: number
  freeTerritories: number
  completedAssignments: number
  activeAssignments: number
  returnedAssignments: number
  activeCampaigns: number
  totalPublishers: number
  averageDaysInField: number
  overdueAssignments: number
  completionRate: number
}

interface TerritoryWithStats extends Territory {
  assignmentCount: number
  lastAssignment?: Assignment
  isActive: boolean
  daysInField?: number
}

interface RecentActivity {
  id: string
  type: 'assigned' | 'completed' | 'returned'
  territory: string
  publisher: string
  date: string
  group_id?: string | null
  isSunday?: boolean
}

export default function DashboardPage() {
  const { profile, user, isReady } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [territories, setTerritories] = useState<TerritoryWithStats[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [namesLookup, setNamesLookup] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [nextSchedule, setNextSchedule] = useState<any>(null)
  const supabase = getSupabaseBrowserClient()
  const router = useRouter()
 
  // Function to fetch all dashboard data
  const fetchDashboardData = async () => {
    let mounted = true
    try {
      setLoading(true)

      // 1. Próxima escala
      if (user) {
        const { data: nextSched } = await supabase
          .from('schedules')
          .select(`
            *,
            arrangement:schedule_arrangements(*)
          `)
          .eq('leader_id', user.id)
          .eq('status', 'published')
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true })
          .limit(1)

        if (nextSched && nextSched.length > 0) setNextSchedule(nextSched[0])
      }

      // 2. Campanhas
      const { data: campaignsData } = await supabase
        .from("campaigns")
        .select("id, name, active")
        .eq("active", true)

      // 3. Nomes Lookup
      const { data: profilesList } = await supabase.from("profiles").select("id, name, role")
      const { data: groupsList } = await supabase.from("groups").select("id, name")
      
      const lookup = new Map<string, string>()
      profilesList?.forEach((p: any) => lookup.set(p.id, p.name))
      groupsList?.forEach((g: any) => lookup.set(g.id, g.name))

      // 4. Busca territórios e Subdivisions
      const { data: territoriesData } = await supabase
        .from("territories")
        .select(`
          id, name, number, color, campaign_id, status,
          subdivisions ( id, completed, status )
        `)
        .order("number", { ascending: true })

      // 5. Busca designações
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from("assignments")
        .select(`
          id, status, assigned_at, completed_at, returned_at,
          territory_id, user_id, group_id,
          territories ( name, number )
        `)
        .order("assigned_at", { ascending: false })
        .limit(100)

      if (assignmentsError) throw assignmentsError

      if (!mounted || !territoriesData || !assignmentsData) return

      // Calcula estatísticas
      const activeAssignments = assignmentsData.filter((a: any) => a.status === 'active')
      const completedAssignments = assignmentsData.filter((a: any) => a.status === 'completed')

      const overdueCount = activeAssignments.filter((a: any) => {
        const days = Math.ceil((new Date().getTime() - new Date(a.assigned_at).getTime()) / (1000 * 60 * 60 * 24))
        return days > 90
      }).length

      const completedDates = completedAssignments
        .filter((a: any) => a.completed_at)
        .map((a: any) => {
          const start = new Date(a.assigned_at)
          const end = new Date(a.completed_at)
          return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        })
      
      const avgDays = completedDates.length > 0
        ? Math.round(completedDates.reduce((a: number, b: number) => a + b, 0) / completedDates.length)
        : 0

      const completionRate = assignmentsData.length > 0
        ? Math.round((completedAssignments.length / assignmentsData.length) * 100)
        : 0

      if (mounted) {
        setNamesLookup(lookup)
        setStats({
          totalTerritories: territoriesData.filter((t: any) => t.status !== 'inactive').length,
          activeTerritories: activeAssignments.length,
          freeTerritories: territoriesData.filter((t: any) => t.status !== 'inactive' && !activeAssignments.some((a: any) => a.territory_id === t.id)).length,
          completedAssignments: completedAssignments.length,
          activeAssignments: activeAssignments.length,
          returnedAssignments: assignmentsData.filter((a: any) => a.status === 'returned').length,
          activeCampaigns: campaignsData?.length || 0,
          totalPublishers: profilesList?.filter((p: any) => p.role === 'publicador').length || 0,
          averageDaysInField: avgDays,
          overdueAssignments: overdueCount,
          completionRate
        })

        const activeTerritoriesData = territoriesData.filter((t: any) => t.status !== 'inactive')
        const territoriesWithStats: TerritoryWithStats[] = activeTerritoriesData.map((t: any) => {
          const tAssignments = assignmentsData.filter((a: any) => a.territory_id === t.id)
          const activeAss = tAssignments.find((a: any) => a.status === 'active')
          const days = activeAss
            ? Math.ceil((new Date().getTime() - new Date(activeAss.assigned_at).getTime()) / (1000 * 60 * 60 * 24))
            : undefined

          return {
            ...t,
            assignmentCount: tAssignments.filter((a: any) => a.status === 'completed').length,
            lastAssignment: tAssignments[0],
            isActive: !!activeAss,
            daysInField: days
          }
        })
        setTerritories(territoriesWithStats)

        const activities: RecentActivity[] = assignmentsData.slice(0, 8).map((a: any) => {
          const dateOn = a.completed_at || a.returned_at || a.assigned_at
          return {
            id: a.id,
            type: a.status === 'completed' ? 'completed' : a.status === 'returned' ? 'returned' : 'assigned',
            territory: a.territories?.name || 'Território',
            publisher: lookup.get(a.user_id) || lookup.get(a.group_id) || 'Publicador',
            date: dateOn,
            group_id: a.group_id,
            isSunday: dateOn ? new Date(dateOn).getDay() === 0 : false
          }
        })
        setRecentActivity(activities)
      }
    } catch (e) { console.error(e) } finally { if(mounted) setLoading(false) }
  }

  useEffect(() => {
    if (isReady && profile) {
      if (profile.role === "publicador" || profile.role === "dirigente") {
        router.replace("/dashboard/my-assignments")
      } else if (profile.role === "supervisor" || profile.role === "admin") {
        fetchDashboardData()
      }
    }
  }, [isReady, profile, router])

  if (loading || !isReady || (profile && !["admin", "supervisor"].includes(profile.role))) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground font-medium">Carregando dados...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Perfil não encontrado</CardTitle>
            <CardDescription>
              Não foi possível carregar seu perfil. Tente fazer logout e login novamente.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Dashboard</h1>
        <p className="text-xs text-muted-foreground font-medium">Bem-vindo, {profile?.name || "Usuário"}!</p>
      </div>

      {/* Stats Consolidado (Option A: Primary Focus Hero) */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Ativos */}
          <div className="bg-card rounded-2xl border border-border p-3.5 flex flex-col gap-1.5 shadow-sm transition-transform active:scale-[0.98]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Em campo
            </span>
            <span className="text-4xl font-black leading-none tracking-tighter text-foreground">{stats.activeAssignments}</span>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">territórios ativos</span>
          </div>

          {/* Atrasados */}
          <div className="bg-card rounded-2xl border border-border p-3.5 flex flex-col gap-1.5 shadow-sm transition-transform active:scale-[0.98]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className={cn("w-3.5 h-3.5", stats.overdueAssignments > 0 ? "text-red-500" : "text-muted-foreground")} /> Atrasados
            </span>
            <span className={cn(
              "text-4xl font-black leading-none tracking-tighter",
              stats.overdueAssignments > 0 ? "text-red-500" : "text-foreground"
            )}>
              {stats.overdueAssignments}
            </span>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">há mais de 90 dias</span>
          </div>
        </div>
      )}

      {/* Main Sections Grid (3 Columns on Desktop) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Column 1: Em Campo (Who has it, Days, Progress) */}
        <Card className="flex flex-col h-full bg-card border-border shadow-sm overflow-hidden">
          <CardHeader className="p-4 pb-3 border-b border-border bg-muted/5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-black uppercase tracking-[0.1em] text-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  Em Campo
                </CardTitle>
                <CardDescription className="text-[10px] text-muted-foreground font-black uppercase mt-0.5 tracking-wider">
                  Progresso das designações
                </CardDescription>
              </div>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-black border-primary/20 text-primary uppercase">
                {territories.filter(t => t.isActive).length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {territories.filter(t => t.isActive).length === 0 ? (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                <MapPin className="h-8 w-8 opacity-20" />
                <p className="text-xs font-medium italic">Nenhum território em campo</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {territories
                  .filter(t => t.isActive)
                  .map((territory) => {
                    const isOverdue = territory.daysInField && territory.daysInField > 90
                    const subs = (territory as any).subdivisions || []
                    const completedSubs = subs.filter((s: any) => s.completed || s.status === 'completed').length
                    const totalSubs = subs.length
                    const progress = totalSubs > 0 ? Math.round((completedSubs / totalSubs) * 100) : 0

                    return (
                      <div
                        key={territory.id}
                        className={cn(
                          "p-4 transition-all hover:bg-muted/50 group",
                          isOverdue && "bg-red-500/5 hover:bg-red-500/10"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                              {territory.name}
                            </h4>
                            <div className="flex items-center gap-1.5 mt-1">
                              {(() => {
                                const assignment = territory.lastAssignment as any
                                const name = namesLookup.get(assignment?.user_id) || namesLookup.get(assignment?.group_id) || "Disponível"
                                const isGroup = !!assignment?.group_id
                                
                                return (
                                  <>
                                    {isGroup && (
                                      <Badge variant="outline" className="h-3.5 px-1 text-[8px] border-primary text-primary font-black leading-none uppercase">
                                        Grupo
                                      </Badge>
                                    )}
                                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest truncate">
                                      {name}
                                    </span>
                                  </>
                                )
                              })()}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn(
                              "text-[10px] font-black whitespace-nowrap uppercase",
                              isOverdue ? "text-red-500 animate-pulse" : "text-muted-foreground"
                            )}>
                              {territory.daysInField} dias
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full transition-all duration-700 rounded-full",
                                progress === 100 ? "bg-emerald-500" : "bg-primary"
                              )}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-black text-foreground tabular-nums w-8 text-right">
                             {progress}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 2: Mais Trabalhados */}
        <Card className="flex flex-col h-full bg-card border-border shadow-sm overflow-hidden">
          <CardHeader className="p-4 pb-3 border-b border-border bg-muted/5">
            <CardTitle className="flex items-center gap-2 text-base font-black uppercase tracking-[0.1em] text-foreground">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Ranking
            </CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground font-black uppercase mt-0.5 tracking-wider">
              Territórios mais rotativos
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {territories.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <p className="text-xs font-medium italic">Nenhum território cadastrado</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {territories
                  .sort((a, b) => b.assignmentCount - a.assignmentCount)
                  .slice(0, 6)
                  .map((territory) => (
                    <div 
                      key={territory.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div 
                          className="w-1.5 h-8 rounded-full flex-shrink-0"
                          style={{ backgroundColor: territory.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate text-foreground">
                            {territory.name}
                          </p>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">
                            Nº {territory.number}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end ml-2">
                        <span className="text-lg font-black text-foreground leading-none">{territory.assignmentCount}</span>
                        <span className="text-[8px] font-black text-muted-foreground uppercase tracking-tighter mt-1">vezes</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 3: Atividades Recentes */}
        <Card className="flex flex-col h-full bg-card border-border shadow-sm overflow-hidden">
          <CardHeader className="p-4 pb-3 border-b border-border bg-muted/5">
            <CardTitle className="flex items-center gap-2 text-base font-black uppercase tracking-[0.1em] text-foreground">
              <Activity className="h-4 w-4 text-primary" />
              Atividades
            </CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground font-black uppercase mt-0.5 tracking-wider">
              Últimas movimentações
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {recentActivity.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                 <p className="text-xs font-medium italic">Nenhuma atividade recente</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentActivity.map((activity) => (
                  <div 
                    key={activity.id} 
                    className="flex items-start gap-4 p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className={cn(
                      "mt-1.5 h-2 w-2 rounded-full flex-shrink-0",
                      activity.type === 'completed' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 
                      activity.type === 'returned' ? 'bg-orange-500' : 
                      'bg-primary'
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md",
                          activity.type === 'completed' ? 'bg-emerald-500/10 text-emerald-600' : 
                          activity.type === 'returned' ? 'bg-orange-500/10 text-orange-600' : 
                          'bg-primary/10 text-primary'
                        )}>
                          {activity.type === 'completed' ? 'CONCLUÍDO' : 
                           activity.type === 'returned' ? 'DEVOLVIDO' : 
                           'DESIGNADO'}
                        </span>
                        <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                          {new Date(activity.date).toLocaleDateString('pt-BR', { 
                            day: '2-digit', 
                            month: 'short' 
                          })}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold truncate text-foreground mb-1">
                        {activity.territory}
                      </h4>
                      <div className="flex items-center gap-1.5">
                        {activity.group_id && (
                          <Badge variant="outline" className="h-3.5 px-1 text-[8px] font-black border-primary text-primary leading-none uppercase">Grupo</Badge>
                        )}
                        <span className="text-[10px] font-black text-muted-foreground/80 uppercase tracking-wide truncate">
                          {activity.publisher}
                        </span>
                        {activity.isSunday && <span className="text-[10px]" title="Domingo">☀️</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}