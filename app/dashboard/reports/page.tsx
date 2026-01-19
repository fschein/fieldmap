"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, FileText, TrendingUp, Users, Map, CheckCircle, LayoutGrid } from "lucide-react"
import type { Campaign, Territory, Profile } from "@/lib/types"

interface ReportStats {
  totalAssignments: number
  completedAssignments: number
  returnedAssignments: number
  inProgressAssignments: number
  averageCompletionDays: number
  totalBlocks: number
  completedBlocks: number
  topPublishers: {
    user: Profile
    completed: number
  }[]
  territoryStats: {
    territory: Territory
    total: number
    completed: number
    percentage: number
  }[]
}

export default function ReportsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<string>("")
  const [stats, setStats] = useState<ReportStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    fetchCampaigns()
  }, [])

  useEffect(() => {
    if (selectedCampaign) {
      fetchStats()
    }
  }, [selectedCampaign])

  async function fetchCampaigns() {
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false })

    if (data && data.length > 0) {
      setCampaigns(data as Campaign[])
      setSelectedCampaign(data[0].id)
    }
    setLoading(false)
  }

  async function fetchStats() {
    setStatsLoading(true)

    // Get territories for this campaign with blocks
    const { data: territories } = await supabase
      .from("territories")
      .select(`
        *,
        blocks(id, completed)
      `)
      .eq("campaign_id", selectedCampaign)

    // Calculate total and completed blocks across all territories
    let totalBlocks = 0
    let completedBlocks = 0
    
    const territoryIds = territories?.map((t) => {
      const tBlocks = t.blocks || []
      totalBlocks += tBlocks.length
      completedBlocks += tBlocks.filter((b: { completed: boolean }) => b.completed === true).length
      return t.id
    }) || []

    const { data: blocks } = await supabase
      .from("blocks")
      .select("id")
      .in("territory_id", territoryIds)

    const blockIds = blocks?.map((b) => b.id) || []

    const { data: assignments } = await supabase
      .from("assignments")
      .select(`
        *,
        user:profiles!assignments_user_id_fkey(*)
      `)
      .in("block_id", blockIds)

    if (!assignments) {
      setStats(null)
      setStatsLoading(false)
      return
    }

    // Calculate stats
    const totalAssignments = assignments.length
    const completedAssignments = assignments.filter((a) => a.status === "completed").length
    const returnedAssignments = assignments.filter((a) => a.status === "returned").length
    const inProgressAssignments = assignments.filter(
      (a) => a.status === "in_progress" || a.status === "pending"
    ).length

    // Calculate average completion days
    const completedWithDates = assignments.filter(
      (a) => a.status === "completed" && a.completed_at
    )
    const avgDays =
      completedWithDates.length > 0
        ? completedWithDates.reduce((acc, a) => {
            const assigned = new Date(a.assigned_at)
            const completed = new Date(a.completed_at!)
            const days = Math.ceil((completed.getTime() - assigned.getTime()) / (1000 * 60 * 60 * 24))
            return acc + days
          }, 0) / completedWithDates.length
        : 0

    // Top publishers
    const publisherStats = new Map<string, { user: Profile; completed: number }>()
    assignments
      .filter((a) => a.status === "completed")
      .forEach((a) => {
        const userId = a.user_id
        const existing = publisherStats.get(userId)
        if (existing) {
          existing.completed++
        } else {
          publisherStats.set(userId, { user: a.user as Profile, completed: 1 })
        }
      })
    const topPublishers = Array.from(publisherStats.values())
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 5)

    // Territory stats - use the "completed" field from blocks
    const territoryStats = (territories || []).map((t) => {
      const tBlocks = t.blocks || []
      const total = tBlocks.length
      const completed = tBlocks.filter((b: { completed: boolean }) => b.completed === true).length
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
      return {
        territory: t as Territory,
        total,
        completed,
        percentage,
      }
    })

    setStats({
      totalAssignments,
      completedAssignments,
      returnedAssignments,
      inProgressAssignments,
      averageCompletionDays: Math.round(avgDays),
      totalBlocks,
      completedBlocks,
      topPublishers,
      territoryStats,
    })
    setStatsLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            Visualize estatísticas e progresso das campanhas
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma campanha encontrada</p>
            <p className="text-sm text-muted-foreground">
              Crie uma campanha para visualizar relatórios
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            Visualize estatísticas e progresso das campanhas
          </p>
        </div>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Selecione uma campanha" />
          </SelectTrigger>
          <SelectContent>
            {campaigns.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {statsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : stats ? (
        <>
          {/* Overview Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total de Designações</p>
                    <p className="text-2xl font-bold">{stats.totalAssignments}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
                    <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Concluídas</p>
                    <p className="text-2xl font-bold">{stats.completedAssignments}</p>
                    <p className="text-xs text-muted-foreground">
                      {stats.totalAssignments > 0
                        ? `${Math.round((stats.completedAssignments / stats.totalAssignments) * 100)}%`
                        : "0%"}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Quadras Trabalhadas</p>
                    <p className="text-2xl font-bold">{stats.completedBlocks}</p>
                    <p className="text-xs text-muted-foreground">
                      de {stats.totalBlocks} quadras (
                      {stats.totalBlocks > 0
                        ? `${Math.round((stats.completedBlocks / stats.totalBlocks) * 100)}%`
                        : "0%"}
                      )
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                    <LayoutGrid className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Em Andamento</p>
                    <p className="text-2xl font-bold">{stats.inProgressAssignments}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-950">
                    <Map className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Média de Conclusão</p>
                    <p className="text-2xl font-bold">{stats.averageCompletionDays} dias</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-950">
                    <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Top Publishers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Publicadores Destaque
                </CardTitle>
                <CardDescription>Publicadores com mais trabalhos concluídos</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.topPublishers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhum trabalho concluído ainda
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stats.topPublishers.map((item, index) => (
                      <div
                        key={item.user.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                            {index + 1}
                          </span>
                          <span className="font-medium">
                            {item.user.full_name || item.user.email}
                          </span>
                        </div>
                        <Badge variant="secondary">{item.completed} concluídos</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Territory Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Map className="h-5 w-5" />
                  Progresso por Território
                </CardTitle>
                <CardDescription>Percentual de quadras trabalhadas em cada território</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.territoryStats.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhum território cadastrado
                  </p>
                ) : (
                  <div className="space-y-4">
                    {stats.territoryStats.map((item) => (
                      <div key={item.territory.id} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: item.territory.color }}
                            />
                            <span className="font-medium">{item.territory.name}</span>
                          </div>
                          <span className="text-muted-foreground">
                            {item.completed}/{item.total} ({item.percentage}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary transition-all"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Sem dados para exibir</p>
            <p className="text-sm text-muted-foreground">
              Crie territórios e designações para visualizar relatórios
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
