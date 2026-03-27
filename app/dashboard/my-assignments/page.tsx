"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, MapPin, CheckCircle2, Calendar, TrendingUp, AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { CompleteAssignmentDialog } from "@/components/my-assignments/complete-assignment-dialog"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"

interface TerritoryAssignment extends TerritoryWithSubdivisions {
  assignments: { assigned_at: string; status: string }[]
  status: string
}

export default function MyAssignmentsPage() {
  const { user, profile, isReady } = useAuth()
  const [territories, setTerritories] = useState<TerritoryAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTerritory, setSelectedTerritory] = useState<TerritoryAssignment | null>(null)
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const fetchMyAssignments = useCallback(async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      // Buscar territórios atribuídos ao usuário com status 'assigned'
      const { data: territoriesData, error: territoriesError } = await supabase
        .from("territories")
        .select(`
          *,
          campaign:campaigns(*),
          subdivisions(*),
          assignments(*)
        `)
        .eq("assigned_to", user.id)
        .eq("status", "assigned")
        .order("number", { ascending: true })

      if (territoriesError) {
        console.error("Erro ao buscar territórios:", territoriesError)
        throw territoriesError
      }

      setTerritories(territoriesData || [])
    } catch (error: any) {
      console.error("Erro ao carregar designações:", error?.message || error)
    } finally {
      setLoading(false)
    }
  }, [user?.id, supabase])

  useEffect(() => {
    if (isReady) {
      fetchMyAssignments()
    }
  }, [isReady, fetchMyAssignments])

  const calculateDaysWithTerritory = (territory: TerritoryAssignment) => {
    const activeAssignment = territory.assignments?.find(a => a.status === 'active')
    const assignedAt = activeAssignment?.assigned_at
    
    if (!assignedAt) return 0
    const diffTime = Math.abs(new Date().getTime() - new Date(assignedAt).getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const calculateProgress = (subdivisions?: Subdivision[]): number => {
    if (!subdivisions || subdivisions.length === 0) return 0
    const completed = subdivisions.filter(s => s.status === "completed" || s.completed).length
    return Math.round((completed / subdivisions.length) * 100)
  }

  const getProgressColor = (progress: number): string => {
    if (progress === 0) return "bg-slate-200"
    if (progress < 30) return "bg-red-500"
    if (progress < 70) return "bg-yellow-500"
    return "bg-green-500"
  }

  const handleOpenMap = (territory: TerritoryAssignment) => {
    router.push(`/dashboard/my-assignments/${territory.id}/map`)
  }

  const handleCompleteTerritory = (territory: TerritoryAssignment) => {
    setSelectedTerritory(territory)
    setShowCompleteDialog(true)
  }

  const handleConfirmComplete = async (reason?: string) => {
    if (!selectedTerritory) return

    // Verificar se todas as quadras estão concluídas para decidir o status final
    const completedSubdivisions = selectedTerritory.subdivisions?.filter(
      s => s.completed || s.status === 'completed'
    ).length || 0
    const totalSubdivisions = selectedTerritory.subdivisions?.length || 0
    const isFullyCompleted = completedSubdivisions === totalSubdivisions
    const finalStatus = isFullyCompleted ? "completed" : "returned"

    try {
      // 1. Atualizar o território
      const { error: territoryError } = await supabase
        .from("territories")
        .update({
          status: finalStatus,
          last_completed_at: isFullyCompleted ? new Date().toISOString() : selectedTerritory.last_completed_at,
        })
        .eq("id", selectedTerritory.id)

      if (territoryError) throw territoryError

      // 2. Atualizar o assignment correspondente
      const { error: assignmentError } = await supabase
        .from("assignments")
        .update({
          status: finalStatus,
          completed_at: isFullyCompleted ? new Date().toISOString() : null,
          returned_at: !isFullyCompleted ? new Date().toISOString() : null,
          notes: reason ? (selectedTerritory.notes ? `${selectedTerritory.notes}\n\nMotivo da devolução: ${reason}` : `Motivo da devolução: ${reason}`) : selectedTerritory.notes
        })
        .eq("territory_id", selectedTerritory.id)
        .eq("user_id", user?.id)
        .eq("status", "active")

      if (assignmentError) throw assignmentError

      // Recarregar a lista
      await fetchMyAssignments()
      setShowCompleteDialog(false)
      setSelectedTerritory(null)
    } catch (error: any) {
      console.error("Erro ao processar devolução:", error?.message || error)
      alert("Erro ao processar devolução. Tente novamente.")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (territories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="rounded-full bg-slate-100 p-6">
          <MapPin className="h-12 w-12 text-slate-400" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">Nenhum território designado</h3>
          <p className="text-sm text-slate-500 max-w-md">
            Você não possui territórios atribuídos no momento. Entre em contato com um administrador ou dirigente para receber uma designação.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Minhas Designações</h1>
        <p className="text-muted-foreground">
          Gerencie seus territórios e acompanhe o progresso de cada quadra
        </p>
      </div>

      {/* Estatísticas Rápidas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Territórios Ativos</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{territories.length}</div>
            <p className="text-xs text-muted-foreground">
              {territories.length === 1 ? 'território designado' : 'territórios designados'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Progresso Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(
                territories.reduce((acc, t) => acc + calculateProgress(t.subdivisions), 0) /
                  territories.length
              )}%
            </div>
            <p className="text-xs text-muted-foreground">de conclusão geral</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quadras Totais</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {territories.reduce((acc, t) => acc + (t.subdivisions?.length || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {territories.reduce(
                (acc, t) => acc + (t.subdivisions?.filter(s => s.completed || s.status === 'completed').length || 0),
                0
              )}{' '}
              concluídas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Territórios */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {territories.map((territory) => {
          const progress = calculateProgress(territory.subdivisions)
          const days = calculateDaysWithTerritory(territory)
          const isOverdue = days > 90
          const completedSubdivisions = territory.subdivisions?.filter(
            s => s.completed || s.status === 'completed'
          ).length || 0
          const totalSubdivisions = territory.subdivisions?.length || 0

          return (
            <Card key={territory.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full ring-2 ring-slate-200"
                      style={{ backgroundColor: territory.color }}
                    />
                    <div>
                      <CardTitle className="text-lg">
                        Território {territory.number}
                      </CardTitle>
                      <CardDescription>{territory.name}</CardDescription>
                    </div>
                  </div>
                  {isOverdue && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Atrasado
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Informações de Tempo */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {days} {days === 1 ? 'dia' : 'dias'} com o território
                  </span>
                </div>

                {/* Barra de Progresso */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-semibold">{progress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden bg-slate-200">
                    <div className="h-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {completedSubdivisions} de {totalSubdivisions} quadras concluídas
                  </p>
                </div>

                {/* Campanha (se houver) */}
                {territory.campaign && (
                  <Badge variant="outline" className="w-fit">
                    {territory.campaign.name}
                  </Badge>
                )}
              </CardContent>

              <CardFooter className="flex gap-2">
                <Button
                  onClick={() => handleOpenMap(territory)}
                  className="flex-1"
                  variant="default"
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  Abrir Mapa
                </Button>
                <Button
                  onClick={() => handleCompleteTerritory(territory)}
                  variant="outline"
                  className="flex-1"
                  disabled={progress < 100}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Concluir
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {/* Dialog de Confirmação */}
      {selectedTerritory && (
        <CompleteAssignmentDialog
          open={showCompleteDialog}
          onOpenChange={setShowCompleteDialog}
          territory={selectedTerritory}
          activeAssignmentDate={selectedTerritory.assignments?.find(a => a.status === 'active')?.assigned_at}
          onConfirm={handleConfirmComplete}
        />
      )}
    </div>
  )
}
