// app/dashboard/reports/page.tsx
"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, FileText, TrendingUp, CheckCircle, LayoutGrid, MapIcon } from "lucide-react"
import type { Campaign, TerritoryWithAssignment, ReportStats, TerritoryReportStats } from "@/lib/types"

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
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error

      if (data && data.length > 0) {
        setCampaigns(data as Campaign[])
        setSelectedCampaign(data[0].id)
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    setStatsLoading(true)

    try {
      // Buscar territórios com assignments usando a VIEW
      const { data: territories, error: terrError } = await supabase
        .from("territories_with_assignment")
        .select("*")
        .eq("campaign_id", selectedCampaign)

      if (terrError) throw terrError

      if (!territories || territories.length === 0) {
        setStats(null)
        setStatsLoading(false)
        return
      }

      // Buscar blocks para cada território
      const territoryIds = territories.map((t: TerritoryWithAssignment) => t.id)
      const { data: blocks, error: blocksError } = await supabase
        .from("blocks")
        .select("id, territory_id, completed")
        .in("territory_id", territoryIds)

      if (blocksError) throw blocksError

      // Buscar assignments
      const blockIds = (blocks || []).map((b: { id: any }) => b.id)
      const { data: assignments, error: assignError } = await supabase
        .from("assignments")
        .select("*")
        .in("block_id", blockIds)

      if (assignError) throw assignError

      // Calcular estatísticas gerais
      const totalAssignments = assignments?.length || 0
      const completedAssignments = assignments?.filter((a: { status: string }) => a.status === "completed").length || 0
      const returnedAssignments = assignments?.filter((a: { status: string }) => a.status === "returned").length || 0
      const inProgressAssignments = assignments?.filter(
        (        a: { status: string }) => a.status === "in_progress" || a.status === "pending" || a.status === "active"
      ).length || 0

      // Calcular média de conclusão (apenas assignments completed)
      const completedWithDates = assignments?.filter(
        (        a: { status: string; completed_at: any; assigned_at: any }) => a.status === "completed" && a.completed_at && a.assigned_at
      ) || []
      
      const avgDays = completedWithDates.length > 0
        ? completedWithDates.reduce((acc: number, a: { assigned_at: string | number | Date; completed_at: string | number | Date }) => {
            const assigned = new Date(a.assigned_at)
            const completed = new Date(a.completed_at!)
            const days = Math.ceil((completed.getTime() - assigned.getTime()) / (1000 * 60 * 60 * 24))
            return acc + days
          }, 0) / completedWithDates.length
        : 0

      // Calcular stats por território
      const territoryStatsMap = new Map<string, TerritoryReportStats>()

      territories.forEach((territory: TerritoryWithAssignment) => {
        const territoryBlocks = blocks?.filter((b: { territory_id: string }) => b.territory_id === territory.id) || []
        const totalBlocks = territoryBlocks.length
        const completedBlocks = territoryBlocks.filter((b: { completed: boolean }) => b.completed === true).length
        const completionPercentage = totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0

        // Calcular dias retidos (se estiver designado)
        let daysRetained: number | null = null
        let isOverdue = false

        if (territory.assigned_at) {
          const assignedDate = new Date(territory.assigned_at)
          const today = new Date()
          daysRetained = Math.floor((today.getTime() - assignedDate.getTime()) / (1000 * 60 * 60 * 24))
          isOverdue = daysRetained > 90
        }

        territoryStatsMap.set(territory.id, {
          territory_id: territory.id,
          territory_number: territory.number || "—",
          territory_name: territory.name,
          assigned_to_name: territory.assigned_to_name || null,
          assigned_at: territory.assigned_at || null,
          total_blocks: totalBlocks,
          completed_blocks: completedBlocks,
          completion_percentage: completionPercentage,
          days_retained: daysRetained,
          is_overdue: isOverdue,
        })
      })

      // Ordenar por equilíbrio: territórios menos trabalhados primeiro
      // Critério: assigned_at mais antigo ou null (nunca trabalhados) no topo
      const territoryStatsArray = Array.from(territoryStatsMap.values()).sort((a, b) => {
        // Territórios nunca designados vêm primeiro
        if (!a.assigned_at && b.assigned_at) return -1
        if (a.assigned_at && !b.assigned_at) return 1
        if (!a.assigned_at && !b.assigned_at) return 0

        // Ambos designados: mais antigo primeiro
        return new Date(a.assigned_at!).getTime() - new Date(b.assigned_at!).getTime()
      })

      const totalBlocks = blocks?.length || 0
      const completedBlocksCount = blocks?.filter((b: { completed: boolean }) => b.completed === true).length || 0

      setStats({
        totalAssignments,
        completedAssignments,
        returnedAssignments,
        inProgressAssignments,
        averageCompletionDays: Math.round(avgDays),
        totalBlocks,
        completedBlocks: completedBlocksCount,
        territoryStats: territoryStatsArray,
      })
    } catch (error) {
      console.error("Error fetching stats:", error)
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
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
          <p className="text-muted-foreground">Visualize estatísticas e progresso das campanhas</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma campanha encontrada</p>
            <p className="text-sm text-muted-foreground">Crie uma campanha para visualizar relatórios</p>
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
          <p className="text-muted-foreground">Visualize estatísticas e progresso das campanhas</p>
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
          {/* Cards de Overview */}
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
                      de {stats.totalBlocks} (
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
                    <MapIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
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

          {/* Tabela Densa - Estilo Planilha */}
          <Card className="col-span-full">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Relatório Geral de Territórios</CardTitle>
              <CardDescription>
                Análise de cobertura e tempo de retenção | Ordenado por equilíbrio de trabalho
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold">
                    <tr>
                      <th className="px-4 py-2 border">Nº</th>
                      <th className="px-4 py-2 border">Território</th>
                      <th className="px-4 py-2 border text-center">Status</th>
                      <th className="px-4 py-2 border">Período Atual</th>
                      <th className="px-4 py-2 border text-center">Dias Retidos</th>
                      <th className="px-4 py-2 border">Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.territoryStats.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhum território encontrado nesta campanha
                        </td>
                      </tr>
                    ) : (
                      stats.territoryStats.map((item) => (
                        <tr key={item.territory_id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2 border font-mono text-xs font-bold">
                            {item.territory_number}
                          </td>
                          <td className="px-4 py-2 border font-medium">{item.territory_name}</td>
                          <td className="px-4 py-2 border text-center">
                            <Badge
                              variant={item.completion_percentage === 100 ? "default" : "outline"}
                              className="text-[10px] h-5"
                            >
                              {item.completion_percentage}%
                            </Badge>
                          </td>
                          <td className="px-4 py-2 border text-xs">
                            {item.assigned_at ? (
                              <>
                                {new Date(item.assigned_at).toLocaleDateString("pt-BR")} - Atual
                              </>
                            ) : (
                              <span className="text-muted-foreground italic">Não iniciado</span>
                            )}
                          </td>
                          <td
                            className={`px-4 py-2 border text-center font-mono text-xs ${
                              item.is_overdue ? "text-red-600 font-bold" : ""
                            }`}
                          >
                            {item.days_retained !== null ? `${item.days_retained} dias` : "—"}
                          </td>
                          <td className="px-4 py-2 border text-xs">
                            {item.assigned_to_name ? (
                              <span className="font-medium">{item.assigned_to_name}</span>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Disponível
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
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