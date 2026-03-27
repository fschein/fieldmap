"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, CheckCircle2, MapPin, MapPinOff, Navigation } from "lucide-react"
import { SubdivisionDrawer } from "@/components/my-assignments/subdivision-drawer"
import { CompleteAssignmentDialog } from "@/components/my-assignments/complete-assignment-dialog"
import { AddDoNotVisitDialog } from "@/components/my-assignments/add-do-not-visit-dialog"
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
  const [saving, setSaving] = useState(false)
  const [selectedSubdivision, setSelectedSubdivision] = useState<Subdivision | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pinMode, setPinMode] = useState(false)
  const [dnvDialogOpen, setDnvDialogOpen] = useState(false)
  const [dnvCoords, setDnvCoords] = useState<{lat: number, lng: number} | null>(null)
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
          subdivisions(*),
          assignments(*),
          do_not_visits(*)
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
    if (!territory || !user?.id || saving) return
    setSaving(true)

    const isFullyCompleted = (territory.subdivisions?.filter(
      s => s.completed || s.status === 'completed'
    ).length || 0) === (territory.subdivisions?.length || 0)

    try {
      const res = await fetch("/api/assignments/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          territoryId: territory.id,
          userId: user.id,
          action: isFullyCompleted ? "complete" : "return",
          reason: reason || null,
        }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Erro ao processar devolução")
      }

      router.push("/dashboard/my-assignments")
    } catch (error: any) {
      console.error("Erro ao processar devolução:", error?.message || error)
      alert("Erro ao processar devolução. Tente novamente.")
      setSaving(false)
    }
  }

  const handleSubdivisionClick = (subdivision: Subdivision) => {
    setSelectedSubdivision(subdivision)
    setDrawerOpen(true)
  }

  const handlePinConfirm = (latlng: any) => {
    setPinMode(false)
    setDnvCoords({ lat: latlng.lat, lng: latlng.lng })
    setDnvDialogOpen(true)
  }

  const handlePinCancel = () => {
    setPinMode(false)
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

  const handleAddDnvClick = () => {
    // Tenta pegar a localização atual primeiro
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDnvCoords({ lat: position.coords.latitude, lng: position.coords.longitude })
          setDnvDialogOpen(true)
        },
        (error) => {
          console.warn("Geolocalização indisponível, ativando Pin Mode", error)
          // Falha ou negado, ativa Pin Mode
          // Falha ou negado, ativa Pin Mode no mapa
          setPinMode(true)
        },
        { enableHighAccuracy: true, timeout: 5000 }
      )
    } else {
      setPinMode(true)
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
  const isFullyCompleted = progress === 100

  return (
    <div className="-mx-6 -mb-6 -mt-20 md:-mt-6 flex flex-col bg-slate-50 overflow-hidden relative" style={{ height: '100dvh' }}>
      {/* Header Fixo Sólido (Mobile) / Flutuante (Desktop) */}
      <div className="absolute top-0 left-0 right-0 h-16 z-[40] bg-white shadow-sm flex items-center justify-between pl-16 pr-4 md:relative md:h-auto md:bg-transparent md:shadow-none md:px-4 md:pt-4">
        
        {/* Lado Esquerdo (Voltar + Nome do Território) */}
        <div className="flex items-center gap-2 overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors"
            onClick={() => router.push("/dashboard/my-assignments")}
            title="Voltar"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div className="flex items-center gap-2 min-w-0 md:bg-white/95 md:backdrop-blur-sm md:px-3 md:py-1.5 md:rounded-full md:shadow-sm md:border md:border-slate-200">
            <div
              className="w-3 h-3 rounded-full ring-2 ring-slate-100 flex-shrink-0"
              style={{ backgroundColor: territory.color }}
            />
            <h1 className="text-sm sm:text-base font-bold leading-tight truncate text-slate-800">
              Território {territory.number}
            </h1>
          </div>
        </div>

        {/* Lado Direito (% de Conclusão) */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <div className="text-slate-700 font-bold md:bg-white/95 md:backdrop-blur-sm md:border md:border-slate-200 md:px-3 md:py-1.5 md:rounded-full text-sm md:shadow-sm">
            {progress}%
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 pt-16 md:pt-4 relative w-full">

      {/* Mapa (Edge-to-Edge no mobile) */}
      <div className={`flex-1 min-h-0 shrink-0 border-y-0 md:border md:rounded-xl overflow-hidden shadow-sm relative z-0 ${pinMode ? 'border-red-500 ring-inset ring-4 ring-red-500/30 cursor-crosshair' : 'border-slate-200'}`}>
        <TerritoryMapViewer 
          territory={territory} 
          onSubdivisionClick={handleSubdivisionClick}
          pinMode={pinMode}
          onPinConfirm={handlePinConfirm}
          onPinCancel={handlePinCancel}
        />
      </div>

      {/* Botões Bottom/Native Bar */}
      <div className="flex gap-2 p-4 pb-6 md:pb-4 bg-white shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-[40] relative shrink-0">
        <Button 
          variant="outline"
          className={`flex-1 min-h-[48px] border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold ${pinMode ? 'bg-red-50 animate-pulse' : 'bg-white'}`}
          onClick={handleAddDnvClick}
          disabled={pinMode}
        >
          <MapPinOff className="h-4 w-4 mr-2" />
          Não Visitar
        </Button>
        <Button 
          className={`flex-1 min-h-[48px] text-white font-bold shadow-sm ${
            isFullyCompleted 
            ? 'bg-green-600 hover:bg-green-700' 
            : 'bg-orange-600 hover:bg-orange-700'
          }`}
          onClick={() => setShowCompleteDialog(true)}
        >
          {isFullyCompleted ? 'Concluir' : 'Devolver'}
        </Button>
      </div>

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
        activeAssignmentDate={(territory as any).assignments?.find((a: any) => a.status === 'active')?.assigned_at}
        onConfirm={handleConfirmCompletion}
      />

      {/* Dialog para Adicionar Não Visitar */}
      <AddDoNotVisitDialog
        open={dnvDialogOpen}
        onOpenChange={setDnvDialogOpen}
        territoryId={territory.id}
        latitude={dnvCoords?.lat || null}
        longitude={dnvCoords?.lng || null}
        onSuccess={() => fetchTerritory()}
      />
      </div>
    </div>
  )
}
