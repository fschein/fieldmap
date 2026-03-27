"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, CheckCircle2, MapPin } from "lucide-react"
import { SubdivisionDrawer } from "@/components/my-assignments/subdivision-drawer"
import { CompleteAssignmentDialog } from "@/components/my-assignments/complete-assignment-dialog"
import dynamic from "next/dynamic"

// Importar o mapa dinamicamente para evitar problemas de SSR
const TerritoryMapViewer = dynamic(
  () => import("@/components/my-assignments/territory-map-viewer"),
  { ssr: false, loading: () => <MapLoadingSkeleton /> }
)

function MapLoadingSkeleton() {
  return (
    <div className="w-full h-[calc(100vh-12rem)] bg-slate-100 rounded-lg flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  )
}

export default function TerritoryMapPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isReady } = useAuth()
  const [territory, setTerritory] = useState<TerritoryWithSubdivisions | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSubdivision, setSelectedSubdivision] = useState<Subdivision | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const supabase = getSupabaseBrowserClient()

  const territoryId = params.id as string

  const fetchTerritory = useCallback(async () => {
    if (!territoryId || !user?.id) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("territories")
        .select(`
          *,
          campaign:campaigns(*),
          subdivisions(*)
        `)
        .eq("id", territoryId)
        .eq("assigned_to", user.id)
        .single()

      if (error) throw error

      if (!data) {
        router.push("/dashboard/my-assignments")
        return
      }

      setTerritory(data)
    } catch (error: any) {
      console.error("Erro ao carregar território:", error?.message || error)
      router.push("/dashboard/my-assignments")
    } finally {
      setLoading(false)
    }
  }, [territoryId, user?.id, supabase, router])

  useEffect(() => {
    if (isReady) {
      fetchTerritory()
    }
  }, [isReady, fetchTerritory])

  const [showCompleteDialog, setShowCompleteDialog] = useState(false)

  const handleConfirmCompletion = async (reason?: string) => {
    if (!territory) return

    const completedSubdivisions = territory.subdivisions?.filter(
      s => s.completed || s.status === 'completed'
    ).length || 0
    const totalSubdivisions = territory.subdivisions?.length || 0
    const isFullyCompleted = completedSubdivisions === totalSubdivisions
    const finalStatus = isFullyCompleted ? "completed" : "returned"

    try {
      const { error: territoryError } = await supabase
        .from("territories")
        .update({
          status: finalStatus,
          last_completed_at: isFullyCompleted ? new Date().toISOString() : territory.last_completed_at,
        })
        .eq("id", territory.id)

      if (territoryError) throw territoryError

      const { error: assignmentError } = await supabase
        .from("assignments")
        .update({
          status: finalStatus,
          completed_at: isFullyCompleted ? new Date().toISOString() : null,
          returned_at: !isFullyCompleted ? new Date().toISOString() : null,
          notes: reason ? (territory.notes ? `${territory.notes}\n\nMotivo da devolução: ${reason}` : `Motivo da devolução: ${reason}`) : territory.notes
        })
        .eq("territory_id", territory.id)
        .eq("user_id", user?.id)
        .eq("status", "active")

      if (assignmentError) throw assignmentError

      router.push("/dashboard/my-assignments")
    } catch (error: any) {
      console.error("Erro ao processar devolução:", error?.message || error)
      alert("Erro ao processar devolução. Tente novamente.")
    }
  }

  const handleSubdivisionClick = (subdivision: Subdivision) => {
    setSelectedSubdivision(subdivision)
    setDrawerOpen(true)
  }

  const handleToggleSubdivision = async (subdivision: Subdivision) => {
    const nextStatus = subdivision.completed || subdivision.status === 'completed' ? 'available' : 'completed'
    const nextCompleted = nextStatus === 'completed'

    try {
      const { error } = await supabase
        .from("subdivisions")
        .update({
          status: nextStatus,
          completed: nextCompleted,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subdivision.id)

      if (error) throw error

      // Recarregar o território para o mapa refletir o novo status
      await fetchTerritory()
      setDrawerOpen(false)
    } catch (error: any) {
      console.error("Erro ao atualizar quadra:", error?.message || error)
      alert("Erro ao atualizar quadra. Tente novamente.")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!territory) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <MapPin className="h-12 w-12 text-slate-400" />
        <p className="text-slate-500">Território não encontrado</p>
        <Button onClick={() => router.push("/dashboard/my-assignments")}>
          Voltar
        </Button>
      </div>
    )
  }

  const completedCount = territory.subdivisions?.filter(
    s => s.completed || s.status === 'completed'
  ).length || 0
  const totalCount = territory.subdivisions?.length || 0
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] p-2 sm:p-4 bg-slate-50 gap-2">
      {/* Header Compacto */}
      <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-200">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -ml-1 text-slate-500 hover:text-slate-900"
            onClick={() => router.push("/dashboard/my-assignments")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full ring-2 ring-slate-100 flex-shrink-0"
              style={{ backgroundColor: territory.color }}
            />
            <h1 className="text-base sm:text-lg font-bold leading-tight line-clamp-1 text-slate-800">
              Território {territory.number}
              <span className="hidden sm:inline font-normal text-slate-500 ml-2">
                {territory.name}
              </span>
            </h1>
          </div>
        </div>

        <div className="bg-slate-100 px-2.5 py-1 rounded text-sm font-bold text-slate-700">
          {progress}%
        </div>
      </div>

      {/* Mapa (Ocupa o resto do espaço - flex-1) */}
      <div className="flex-1 min-h-0 rounded-xl border border-slate-200 overflow-hidden shadow-sm relative">
        <TerritoryMapViewer
          territory={territory}
          onSubdivisionClick={handleSubdivisionClick}
        />
      </div>

      {/* Botão de Conclusão Colado Embaixo */}
      <Button 
        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold h-12 text-base shadow-sm mt-1 sm:mt-2"
        onClick={() => setShowCompleteDialog(true)}
      >
        Devolver Território
      </Button>

      {/* Drawer para Subdivisão Selecionada */}
      {selectedSubdivision && (
        <SubdivisionDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          subdivision={selectedSubdivision}
          onToggle={() => handleToggleSubdivision(selectedSubdivision)}
        />
      )}

      {/* Dialog para Devolução */}
      <CompleteAssignmentDialog
        open={showCompleteDialog}
        onOpenChange={setShowCompleteDialog}
        territory={territory}
        onConfirm={handleConfirmCompletion}
      />
    </div>
  )
}
