"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { StatsCard } from "@/components/dashboard/stats-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Map, MapPin, Users, CheckCircle, Clock, Calendar } from "lucide-react"
import type { DashboardStats, AssignmentWithDetails } from "@/lib/types"

export default function DashboardPage() {
  const { profile, isAdmin, isDirigente } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentAssignments, setRecentAssignments] = useState<AssignmentWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    async function fetchData() {
      if (!profile) return

      // Fetch stats
      const [
        { count: totalTerritories },
        { count: totalBlocks },
        { count: assignedBlocks },
        { count: completedBlocks },
        { count: availableBlocks },
        { count: activeCampaigns },
      ] = await Promise.all([
        supabase.from("territories").select("*", { count: "exact", head: true }),
        supabase.from("blocks").select("*", { count: "exact", head: true }),
        supabase.from("blocks").select("*", { count: "exact", head: true }).eq("status", "assigned"),
        supabase.from("blocks").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("blocks").select("*", { count: "exact", head: true }).eq("status", "available"),
        supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("is_active", true),
      ])

      setStats({
        total_territories: totalTerritories || 0,
        total_blocks: totalBlocks || 0,
        assigned_blocks: assignedBlocks || 0,
        completed_blocks: completedBlocks || 0,
        available_blocks: availableBlocks || 0,
        active_campaigns: activeCampaigns || 0,
      })

      // Fetch recent assignments
      let query = supabase
        .from("assignments")
        .select(`
          *,
          block:blocks(
            *,
            territory:territories(
              *,
              campaign:campaigns(*)
            )
          ),
          user:profiles!assignments_user_id_fkey(*),
          assigned_by_user:profiles!assignments_assigned_by_fkey(*)
        `)
        .order("assigned_at", { ascending: false })
        .limit(5)

      // If publicador, only show their assignments
      if (profile.role === "publicador") {
        query = query.eq("user_id", profile.id)
      }

      const { data: assignments } = await query

      if (assignments) {
        setRecentAssignments(assignments as unknown as AssignmentWithDetails[])
      }

      setLoading(false)
    }

    fetchData()
  }, [profile, supabase])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pendente</Badge>
      case "in_progress":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Em andamento</Badge>
      case "completed":
        return <Badge className="bg-green-500 hover:bg-green-600">Concluído</Badge>
      case "returned":
        return <Badge variant="outline">Devolvido</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Bem-vindo, {profile?.full_name || "Usuário"}!
        </p>
      </div>

      {/* Stats Grid */}
      {(isAdmin || isDirigente) && stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Territórios"
            value={stats.total_territories}
            icon={Map}
          />
          <StatsCard
            title="Quadras"
            value={stats.total_blocks}
            description={`${stats.available_blocks} disponíveis`}
            icon={MapPin}
          />
          <StatsCard
            title="Em trabalho"
            value={stats.assigned_blocks}
            icon={Clock}
          />
          <StatsCard
            title="Concluídos"
            value={stats.completed_blocks}
            icon={CheckCircle}
          />
        </div>
      )}

      {/* Quick Actions for Publicador */}
      {profile?.role === "publicador" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatsCard
            title="Minhas Designações"
            value={recentAssignments.length}
            description="Territórios designados para você"
            icon={MapPin}
          />
          <StatsCard
            title="Em Andamento"
            value={recentAssignments.filter(a => a.status === "in_progress").length}
            description="Trabalhos em andamento"
            icon={Clock}
          />
        </div>
      )}

      {/* Recent Assignments */}
      <Card>
        <CardHeader>
          <CardTitle>
            {profile?.role === "publicador" ? "Minhas Designações" : "Designações Recentes"}
          </CardTitle>
          <CardDescription>
            {profile?.role === "publicador"
              ? "Territórios designados para você"
              : "Últimas designações realizadas"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentAssignments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma designação encontrada
            </p>
          ) : (
            <div className="space-y-4">
              {recentAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {assignment.block?.territory?.name} - {assignment.block?.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {profile?.role !== "publicador" && (
                        <>Designado para: {assignment.user?.full_name || "N/A"} | </>
                      )}
                      {new Date(assignment.assigned_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {getStatusBadge(assignment.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
