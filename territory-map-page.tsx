"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { TerritoryWithSubdivisions, Subdivision } from "@/types"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, CheckCircle2, MapPin } from "lucide-react"
import { SubdivisionDrawer } from "@/components/my-assignments/subdivision-drawer"
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

  const handleSubdivisionClick = (subdivision: Subdivision) => {
    setSelectedSubdivision(subdivision)
    setDrawerOpen(true)
  }

  const handleCompleteSubdivision = async (subdivisionId: string) => {
    try {
      const { error } = await supabase
        .from("subdivisions")
        .update({
          status: "completed",
          completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subdivisionId)

      if (error) throw error

      // Recarregar o território
      await fetchTerritory()
      setDrawerOpen(false)
    } catch (error: any) {
      console.error("Erro ao concluir quadra:", error?.message || error)
      alert("Erro ao concluir quadra. Tente novamente.")
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
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard/my-assignments")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full ring-2 ring-slate-200"
                style={{ backgroundColor: territory.color }}
              />
              <h1 className="text-2xl font-bold">
                Território {territory.number}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{territory.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Progresso</div>
            <div className="text-2xl font-bold">{progress}%</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Quadras</div>
            <div className="text-lg font-semibold">
              {completedCount}/{totalCount}
            </div>
          </div>
        </div>
      </div>

      {/* Instruções */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <MapPin className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900">
              Como usar o mapa
            </p>
            <p className="text-sm text-blue-700">
              Toque em uma quadra (polígono colorido) no mapa para ver os detalhes e marcá-la como concluída. 
              Quadras em verde já foram concluídas.
            </p>
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div className="rounded-lg border overflow-hidden">
        <TerritoryMapViewer
          territory={territory}
          onSubdivisionClick={handleSubdivisionClick}
        />
      </div>

      {/* Drawer para Subdivisão Selecionada */}
      {selectedSubdivision && (
        <SubdivisionDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          subdivision={selectedSubdivision}
          onComplete={handleCompleteSubdivision}
        />
      )}
    </div>
  )
}
