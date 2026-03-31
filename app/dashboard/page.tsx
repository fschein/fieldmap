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
  TrendingUp, AlertCircle, Activity
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

      {/* Stats Consolidado (Mobile-First 2x2 Grid) */}
      {stats && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className={cn("bg-card border-border", stats.overdueAssignments > 0 && "border-orange-500/20 bg-orange-500/5")}>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground uppercase font-black tracking-widest text-[9px]">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <span className="hidden sm:inline">Em Campo</span>
                  <span className="sm:hidden">Ativos</span>
                </span>
                {stats.overdueAssignments > 0 && (
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl sm:text-2xl font-black text-foreground">{stats.activeAssignments}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                {stats.overdueAssignments > 0 ? (
                  <span className="text-orange-500 font-bold uppercase tracking-tight">{stats.overdueAssignments} atrasados</span>
                ) : (
                  <span>trabalhando agora</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                <MapIcon className="h-4 w-4 text-emerald-600" />
                Prontos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-emerald-700">{stats.freeTerritories}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                esperando designação
              </p>
            </CardContent>
          </Card>

          <Card className={stats.overdueAssignments > 0 ? "border-red-500/20 bg-red-500/5" : ""}>
            <CardHeader className="p-3 pb-2">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" /> Atrasados
              </h2>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-red-700">{stats.overdueAssignments}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                há mais de 90 dias
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                Eficiência
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{stats.completionRate}%</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                territórios concluídos
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Sections Grid (3 Columns on Desktop) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Column 1: Em Campo (Who has it, Days, Progress) */}
        <Card className="flex flex-col h-full bg-card border-border shadow-sm">
          <CardHeader className="pb-3 border-b mb-3 border-border">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              Em Campo
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Quem está trabalhando e o progresso
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {territories.filter(t => t.isActive).length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Nenhum território em campo
              </p>
            ) : (
              <div className="space-y-4">
                {territories
                  .filter(t => t.isActive)
                  .map((territory) => {
                    const isOverdue = territory.daysInField && territory.daysInField > 90
                    
                    // Calcula progresso das subdivisions
                    const subs = (territory as any).subdivisions || []
                    const completedSubs = subs.filter((s: any) => s.completed || s.status === 'completed').length
                    const totalSubs = subs.length
                    const progress = totalSubs > 0 ? Math.round((completedSubs / totalSubs) * 100) : 0

                    return (
                      <div
                        key={territory.id}
                        className={cn(
                          "p-4 rounded-2xl border transition-all hover:border-primary/30 bg-card shadow-sm",
                          isOverdue ? "border-red-500/30 bg-red-500/5 shadow-red-500/5" : "border-border"
                        )}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">
                              {territory.name}
                            </p>
                            <p className="text-[10px] font-black text-primary truncate uppercase tracking-widest flex items-center gap-1.5">
                              {(() => {
                                const assignment = territory.lastAssignment as any
                                const name = namesLookup.get(assignment?.user_id) || namesLookup.get(assignment?.group_id) || "Disponível"
                                const isGroup = !!assignment?.group_id
                                const isSunday = assignment?.assigned_at ? new Date(assignment.assigned_at).getDay() === 0 : false
                                
                                return (
                                  <>
                                    {isGroup && <Badge variant="outline" className="h-3.5 px-0.5 text-[7.5px] border-primary text-primary font-black leading-none">GRUPO</Badge>}
                                    {name}
                                    {isSunday && <span className="text-[9px] opacity-70" title="Designado no Domingo">☀️</span>}
                                  </>
                                )
                              })()}
                            </p>
                          </div>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-[8px] h-4 px-1 leading-none font-black uppercase">
                              Atrasado
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between mb-1.5 px-0.5">
                          <span className={cn("text-[10px] font-bold", isOverdue ? "text-red-700" : "text-muted-foreground")}>
                            ⌛ {territory.daysInField} dias
                          </span>
                          <span className="text-[10px] font-black text-foreground">
                             {progress}%
                          </span>
                        </div>
                        
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all duration-700 rounded-full",
                              progress === 100 ? "bg-emerald-500" : "bg-[#C65D3B]"
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 2: Mais Trabalhados */}
        <Card className="flex flex-col h-full bg-card border-border shadow-sm">
          <CardHeader className="pb-3 border-b mb-3 border-border">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-foreground">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Mais Trabalhados
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Territórios com maior rotatividade
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {territories.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Nenhum território cadastrado
              </p>
            ) : (
              <div className="space-y-3">
                {territories
                  .sort((a, b) => b.assignmentCount - a.assignmentCount)
                  .slice(0, 6)
                  .map((territory) => (
                    <div 
                      key={territory.id}
                      className="flex items-center justify-between p-3 rounded-2xl border border-border bg-muted/20"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div 
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: territory.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate text-foreground">
                            {territory.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            Nº {territory.number}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-black h-5 px-1.5 ml-2">
                        {territory.assignmentCount}x
                      </Badge>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 3: Atividades Recentes */}
        <Card className="flex flex-col h-full bg-card border-border shadow-sm">
          <CardHeader className="pb-3 border-b mb-3 border-border">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-foreground">
              <Activity className="h-4 w-4 text-primary" />
              Atividades Recentes
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Últimas movimentações em campo
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {recentActivity.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Nenhuma atividade recente
              </p>
            ) : (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div 
                    key={activity.id} 
                    className="flex items-start gap-3"
                  >
                    <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                      activity.type === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 
                      activity.type === 'returned' ? 'bg-orange-500' : 
                      'bg-[#C65D3B]'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-muted-foreground leading-none mb-1.5 uppercase tracking-widest">
                        {activity.type === 'completed' ? 'Concluiu' : 
                         activity.type === 'returned' ? 'Devolveu' : 
                         'Recebeu'}
                      </p>
                      <p className="text-sm font-bold truncate text-foreground">
                        {activity.territory}
                      </p>
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="text-[10px] text-muted-foreground font-bold flex items-center gap-1.5">
                            {activity.group_id && (
                              <Badge variant="outline" className="h-3.5 px-1 text-[8px] font-black border-primary text-primary leading-none">GRUPO</Badge>
                            )}
                            {activity.publisher}
                          </div>
                          {activity.isSunday && <span className="text-[10px]" title="Domingo">☀️</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(activity.date).toLocaleDateString('pt-BR', { 
                            day: '2-digit', 
                            month: 'short' 
                          })}
                        </span>
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