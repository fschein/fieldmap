"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { StatsCard } from "@/components/dashboard/stats-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Map, MapPin, Users, CheckCircle, Clock, Loader2, 
  TrendingUp, AlertCircle, Activity
} from "lucide-react"

interface Assignment {
  id: string
  status: string
  assigned_at: string
  completed_at: string | null
  territory_id: string
  user_id: string
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
}

export default function DashboardPage() {
  const { profile, user, isReady } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [territories, setTerritories] = useState<TerritoryWithStats[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = getSupabaseBrowserClient()

  // Function to fetch all dashboard data
  const fetchDashboardData = async () => {
    let mounted = true
    try {
      setLoading(true)

      // Busca campanhas
      const { data: campaignsData } = await supabase
        .from("campaigns")
        .select("id, name, active")
        .eq("active", true)

      // Busca territórios
      const { data: territoriesData } = await supabase
        .from("territories")
        .select("id, name, number, color, campaign_id")
        .order("number", { ascending: true })

      // Busca assignments
      const { data: assignmentsData } = await supabase
        .from("assignments")
        .select(`
          id, status, assigned_at, completed_at, returned_at,
          territory_id, user_id,
          territories ( name, number ),
          profiles!assignments_user_id_fkey ( name )
        `)
        .order("assigned_at", { ascending: false })
        .limit(100)

      // Busca publicadores
      const { data: publishersData } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("role", "publicador")

      if (!mounted || !territoriesData || !assignmentsData) {
        return
      }

      // Calcula estatísticas
      const activeAssignments = assignmentsData.filter((a: { status: string }) => a.status === 'active')
      const completedAssignments = assignmentsData.filter((a: { status: string }) => a.status === 'completed')

      // Calcula dias médios em campo
      const completedWithDays = completedAssignments
        .filter((a: { completed_at: any }) => a.completed_at)
        .map((a: { assigned_at: string | number | Date; completed_at: string | number | Date }) => {
          const start = new Date(a.assigned_at)
          const end = new Date(a.completed_at!)
          return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        })
      
      const avgDays = completedWithDays.length > 0
        ? Math.round(completedWithDays.reduce((a: any, b: any) => a + b, 0) / completedWithDays.length)
        : 0

      // Calcula atrasados (>90 dias)
      const overdueCount = activeAssignments.filter((a: { assigned_at: string | number | Date }) => {
        const days = Math.ceil((new Date().getTime() - new Date(a.assigned_at).getTime()) / (1000 * 60 * 60 * 24))
        return days > 90
      }).length

      // Taxa de conclusão
      const totalAssignments = assignmentsData.length
      const completionRate = totalAssignments > 0
        ? Math.round((completedAssignments.length / totalAssignments) * 100)
        : 0

      // Mapeia territórios com suas estatísticas
      const territoriesWithStats: TerritoryWithStats[] = territoriesData.map((t: { id: any }) => {
        const territoryAssignments = assignmentsData.filter((a: { territory_id: any }) => a.territory_id === t.id)
        const activeAssignment = territoryAssignments.find((a: { status: string }) => a.status === 'active')
        const daysInField = activeAssignment 
          ? Math.ceil((new Date().getTime() - new Date(activeAssignment.assigned_at).getTime()) / (1000 * 60 * 60 * 24))
          : undefined

        return {
          ...t,
          assignmentCount: territoryAssignments.filter((a: { status: string }) => a.status === 'completed').length,
          lastAssignment: territoryAssignments[0],
          isActive: !!activeAssignment,
          daysInField
        }
      })

      // Atividades recentes (últimas 5)
      const activities: RecentActivity[] = assignmentsData.slice(0, 5).map((a: { id: any; status: string; territories: any; profiles: any; completed_at: any; returned_at: any; assigned_at: any }) => ({
        id: a.id,
        type: a.status === 'completed' ? 'completed' : a.status === 'returned' ? 'returned' : 'assigned',
        territory: (a.territories as any)?.name || 'Território',
        publisher: (a.profiles as any)?.name || 'Publicador',
        date: a.completed_at || a.returned_at || a.assigned_at
      }))

      if (mounted) {
        setStats({
          totalTerritories: territoriesData.length,
          activeTerritories: activeAssignments.length,
          completedAssignments: completedAssignments.length,
          activeAssignments: activeAssignments.length,
          returnedAssignments: assignmentsData.filter((a: { status: string }) => a.status === 'returned').length,
          activeCampaigns: campaignsData?.length || 0,
          totalPublishers: publishersData?.length || 0,
          averageDaysInField: avgDays,
          overdueAssignments: overdueCount,
          completionRate
        })

        setTerritories(territoriesWithStats)
        setRecentActivity(activities)
      }

    } catch (error) {
      console.error("Dashboard - Error fetching data:", error)
    } finally {
      if (mounted) {
        setLoading(false)
      }
    }
    return () => { mounted = false }
  }

  useEffect(() => {
    // Redirecionamento RBAC: Dirigentes e Publicadores pulam o Dashboard geral
    if (isReady && profile && profile.role !== "admin") {
      window.location.href = "/dashboard/my-assignments"
    } else if (isReady && profile?.role === "admin") {
      fetchDashboardData()
    }
    
    // Cleanup simple when component unmounts is handled by the data fetcher states
  }, [isReady, profile, supabase]) // Added supabase to dependencies for fetchDashboardData

  if (loading || !isReady || (profile && profile.role !== "admin")) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando dashboard...</p>
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
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Bem-vindo, {profile?.name || "Usuário"}!</p>
      </div>

      {/* Stats Consolidado (Mobile-First 2x2 Grid) */}
      {stats && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className={stats.overdueAssignments > 0 ? "border-orange-200 bg-orange-50/30" : ""}>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-blue-600" />
                  <span className="hidden sm:inline">Em Campo</span>
                  <span className="sm:hidden">Ativos</span>
                </span>
                {stats.overdueAssignments > 0 && (
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{stats.activeAssignments}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                {stats.overdueAssignments > 0 ? (
                  <span className="text-orange-600 font-medium">{stats.overdueAssignments} atrasados</span>
                ) : (
                  <span>de {stats.totalTerritories} territórios</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Eficiência
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{stats.completionRate}%</div>
              <div className="mt-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${stats.completionRate}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-500" />
                Ritmo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{stats.averageDaysInField}d</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                média em campo
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                <Users className="h-4 w-4 text-slate-500" />
                Equipe
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{stats.totalPublishers}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                publicadores
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Atividades Recentes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Atividades Recentes
            </CardTitle>
            <CardDescription>
              Últimas movimentações nos territórios
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma atividade recente
              </p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div 
                    key={activity.id} 
                    className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50/50"
                  >
                    <div className={`
                      w-2 h-2 rounded-full flex-shrink-0
                      ${activity.type === 'completed' ? 'bg-green-500' : 
                        activity.type === 'returned' ? 'bg-orange-500' : 
                        'bg-blue-500'}
                    `} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {activity.territory}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity.publisher} • {
                          activity.type === 'completed' ? 'Concluiu' :
                          activity.type === 'returned' ? 'Devolveu' :
                          'Recebeu'
                        }
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(activity.date).toLocaleDateString('pt-BR', { 
                        day: '2-digit', 
                        month: 'short' 
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Territórios */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Territórios Mais Trabalhados
            </CardTitle>
            <CardDescription>
              Territórios com mais conclusões
            </CardDescription>
          </CardHeader>
          <CardContent>
            {territories.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum território cadastrado
              </p>
            ) : (
              <div className="space-y-3">
                {territories
                  .sort((a, b) => b.assignmentCount - a.assignmentCount)
                  .slice(0, 5)
                  .map((territory) => (
                    <div 
                      key={territory.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: territory.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {territory.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Nº {territory.number}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {territory.isActive && (
                          <Badge variant="outline" className="text-[10px] bg-blue-50 border-blue-200">
                            Ativo
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {territory.assignmentCount}x
                        </Badge>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lista de Territórios Ativos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Territórios em Campo
          </CardTitle>
          <CardDescription>
            Territórios atualmente designados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {territories.filter(t => t.isActive).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum território em campo no momento
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {territories
                .filter(t => t.isActive)
                .map((territory) => {
                  const isOverdue = territory.daysInField && territory.daysInField > 90

                  return (
                    <div
                      key={territory.id}
                      className={`
                        p-3 rounded-lg border
                        ${isOverdue ? 'border-red-300 bg-red-50/50' : 'bg-slate-50/50'}
                      `}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: territory.color }}
                          />
                          <div>
                            <p className="text-sm font-medium">{territory.name}</p>
                            <p className="text-xs text-muted-foreground">Nº {territory.number}</p>
                          </div>
                        </div>
                        {isOverdue && (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {territory.daysInField} dia{territory.daysInField !== 1 ? 's' : ''} em campo
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}