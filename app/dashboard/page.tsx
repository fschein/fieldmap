"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { StatsCard } from "@/components/dashboard/stats-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Map, MapPin, Users, CheckCircle, Clock, Loader2, LayoutGrid } from "lucide-react"

interface Block {
  id: string
  name: string
  completed: boolean
  territory_id: string
}

interface Territory {
  id: string
  name: string
  color: string
  campaign_id: string
  blocks: Block[]
}

interface Campaign {
  id: string
  name: string
  is_active: boolean
}

interface DashboardStats {
  total_territories: number
  total_blocks: number
  completed_blocks: number
  active_campaigns: number
}

export default function DashboardPage() {
  const { profile, isAdmin, isDirigente, loading: authLoading, user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [territories, setTerritories] = useState<Territory[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    async function fetchData() {
      if (authLoading) return
      if (!user || !profile) {
        setLoading(false)
        return
      }

      try {
        // Fetch campaigns
        const { data: campaignsData } = await supabase
          .from("campaigns")
          .select("*")
          .eq("is_active", true)
          .order("name")

        if (campaignsData) {
          setCampaigns(campaignsData as Campaign[])
        }

        // Fetch territories with blocks
        const { data: territoriesData } = await supabase
          .from("territories")
          .select(`
            id,
            name,
            color,
            campaign_id,
            blocks(id, name, completed, territory_id)
          `)
          .order("name")

        if (territoriesData) {
          setTerritories(territoriesData as unknown as Territory[])

          // Calculate stats from real data
          const totalTerritories = territoriesData.length
          let totalBlocks = 0
          let completedBlocks = 0

          territoriesData.forEach((t) => {
            const blocks = t.blocks || []
            totalBlocks += blocks.length
            completedBlocks += blocks.filter((b: { completed: boolean }) => b.completed === true).length
          })

          setStats({
            total_territories: totalTerritories,
            total_blocks: totalBlocks,
            completed_blocks: completedBlocks,
            active_campaigns: campaignsData?.length || 0,
          })
        }
      } catch (error) {
        console.error("Dashboard - Error fetching data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [profile, supabase, authLoading, user])

  // Group territories by campaign
  function getTerritoriesByCampaign(campaignId: string) {
    return territories.filter((t) => t.campaign_id === campaignId)
  }

  function getBlockStats(blocks: Block[]) {
    const total = blocks.length
    const completed = blocks.filter((b) => b.completed).length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, percentage }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Bem-vindo, {profile?.full_name || "Usuário"}!</p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard title="Campanhas Ativas" value={stats.active_campaigns} icon={Users} />
          <StatsCard title="Territórios" value={stats.total_territories} icon={Map} />
          <StatsCard
            title="Total de Quadras"
            value={stats.total_blocks}
            icon={LayoutGrid}
          />
          <StatsCard
            title="Quadras Trabalhadas"
            value={stats.completed_blocks}
            description={
              stats.total_blocks > 0
                ? `${Math.round((stats.completed_blocks / stats.total_blocks) * 100)}% concluído`
                : "0%"
            }
            icon={CheckCircle}
          />
        </div>
      )}

      {/* Territories Accordion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Territórios e Quadras
          </CardTitle>
          <CardDescription>
            Visualize o progresso de cada território e suas quadras
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma campanha ativa encontrada
            </p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {campaigns.map((campaign) => {
                const campaignTerritories = getTerritoriesByCampaign(campaign.id)
                const totalBlocks = campaignTerritories.reduce(
                  (acc, t) => acc + (t.blocks?.length || 0),
                  0
                )
                const completedBlocks = campaignTerritories.reduce(
                  (acc, t) => acc + (t.blocks?.filter((b) => b.completed).length || 0),
                  0
                )

                return (
                  <AccordionItem key={campaign.id} value={campaign.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{campaign.name}</span>
                          <Badge variant="secondary">
                            {campaignTerritories.length} territórios
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>
                            {completedBlocks}/{totalBlocks} quadras
                          </span>
                          {totalBlocks > 0 && (
                            <span className="text-xs">
                              ({Math.round((completedBlocks / totalBlocks) * 100)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {campaignTerritories.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 pl-4">
                          Nenhum território cadastrado nesta campanha
                        </p>
                      ) : (
                        <Accordion type="multiple" className="pl-4">
                          {campaignTerritories.map((territory) => {
                            const blockStats = getBlockStats(territory.blocks || [])

                            return (
                              <AccordionItem key={territory.id} value={territory.id}>
                                <AccordionTrigger className="hover:no-underline py-3">
                                  <div className="flex items-center justify-between w-full pr-4">
                                    <div className="flex items-center gap-3">
                                      <div
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: territory.color }}
                                      />
                                      <span className="font-medium">{territory.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-primary transition-all"
                                          style={{ width: `${blockStats.percentage}%` }}
                                        />
                                      </div>
                                      <span className="text-sm text-muted-foreground min-w-[80px] text-right">
                                        {blockStats.completed}/{blockStats.total} (
                                        {blockStats.percentage}%)
                                      </span>
                                    </div>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  {territory.blocks?.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-2 pl-6">
                                      Nenhuma quadra cadastrada
                                    </p>
                                  ) : (
                                    <div className="grid gap-2 pl-6 py-2 sm:grid-cols-2 lg:grid-cols-3">
                                      {territory.blocks?.map((block) => (
                                        <div
                                          key={block.id}
                                          className={`flex items-center justify-between rounded-lg border p-3 ${
                                            block.completed
                                              ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900"
                                              : "bg-background"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-medium">
                                              {block.name}
                                            </span>
                                          </div>
                                          {block.completed ? (
                                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                          ) : (
                                            <Clock className="h-4 w-4 text-muted-foreground" />
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </AccordionContent>
                              </AccordionItem>
                            )
                          })}
                        </Accordion>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
