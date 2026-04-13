"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { createTimeoutSignal } from "@/lib/utils/api-utils"
import { useAuth } from "@/hooks/use-auth"
import { useOfflineManager } from "@/hooks/use-offline-manager"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, CheckCircle2, MapPin, MapPinOff, Navigation } from "lucide-react"
import { SubdivisionDrawer } from "@/components/my-assignments/subdivision-drawer"
import { CompleteAssignmentDialog } from "@/components/my-assignments/complete-assignment-dialog"
import { AddDoNotVisitDialog } from "@/components/my-assignments/add-do-not-visit-dialog"
import dynamic from "next/dynamic"
import { toast } from "sonner"

// Importar o mapa dinamicamente para evitar problemas de SSR
const TerritoryMapViewer = dynamic(
  () => import("@/components/my-assignments/territory-map-viewer"),
  { ssr: false, loading: () => <MapLoadingSkeleton /> }
)

function MapLoadingSkeleton() {
  return (
    <div className="w-full h-[calc(100vh-12rem)] bg-muted rounded-lg flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/30" />
    </div>
  )
}

const supabase = getSupabaseBrowserClient()

export default function TerritoryMapPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isReady } = useAuth()
  const { isOnline, addPendingAction } = useOfflineManager()
  const [territory, setTerritory] = useState<TerritoryWithSubdivisions | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedSubdivision, setSelectedSubdivision] = useState<Subdivision | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pinMode, setPinMode] = useState(false)
  const [dnvDialogOpen, setDnvDialogOpen] = useState(false)
  const [dnvCoords, setDnvCoords] = useState<{ lat: number, lng: number } | null>(null)
  const [animatingSubdivisionId, setAnimatingSubdivisionId] = useState<string | null>(null)
  const territoryId = params.id as string

  const fetchTerritory = useCallback(async () => {
    if (!territoryId || !user?.id) return

    setLoading(true)
    const { signal, clear } = createTimeoutSignal(15000)
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
        .single()

      if (error) throw error

      if (!data) {
        router.push("/dashboard/my-assignments")
        return
      }

      // Access & Edit check
      const isSunday = new Date().getDay() === 0
      const { data: profile } = await supabase.from("profiles").select("group_id, role").eq("id", user.id).single()
      
      const isOwner = data.assigned_to === user.id
      const isGroupMember = !!(data.group_id && data.group_id === profile?.group_id)
      const isAdmin = profile?.role === 'admin'
      
      const canAccess = isOwner || (isSunday && isGroupMember) || (isGroupMember && !isSunday) || isAdmin
      const canEdit = isOwner || (isSunday && isGroupMember) || isAdmin
      
      if (!canAccess) {
        toast.error("Você não tem acesso a este território.")
        router.push("/dashboard/my-assignments")
        return
      }

      setTerritory({ ...data, canEdit } as any)
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast.error("Tempo esgotado ao carregar mapa.")
      }
      console.error("Erro ao carregar território:", error?.message || error)

      // Tentar carregar do cache se estiver offline ou der erro
      const cached = localStorage.getItem(`territory_cache_${territoryId}`)
      if (cached) {
        const parsed = JSON.parse(cached) as TerritoryWithSubdivisions

        // Aplicar alterações pendentes que ainda não foram sincronizadas
        const pending = JSON.parse(localStorage.getItem("pending_subdivision_updates") || "[]")
        if (pending.length > 0 && parsed.subdivisions) {
          parsed.subdivisions = parsed.subdivisions.map(s => {
            const update = pending.find((p: any) => p.subdivisionId === s.id)
            if (update) {
              return { ...s, status: update.status, completed: update.completed }
            }
            return s
          })
        }

        setTerritory(parsed)
      } else {
        router.push("/dashboard/my-assignments")
      }
    } finally {
      clear()
      setLoading(false)
    }
  }, [territoryId, user?.id, supabase, router])

  useEffect(() => {
    if (isReady) {
      fetchTerritory()
    }
  }, [isReady, fetchTerritory])

  const { syncPendingActions } = useOfflineManager()

  // Sincronizar ao entrar na página se estiver online
  useEffect(() => {
    if (isOnline) {
      syncPendingActions()
    }
  }, [isOnline, syncPendingActions])

  // Listener para sincronização concluída ou ação offline
  useEffect(() => {
    const handleSync = () => fetchTerritory()
    window.addEventListener("sync-complete", handleSync)
    window.addEventListener("offline-action-added", handleSync)
    return () => {
      window.removeEventListener("sync-complete", handleSync)
      window.removeEventListener("offline-action-added", handleSync)
    }
  }, [fetchTerritory])

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

      toast.success("Território processado com sucesso!")
      router.push("/dashboard/my-assignments")
    } catch (error: any) {
      console.error("Erro ao processar devolução:", error?.message || error)
      toast.error("Erro ao processar devolução: " + error.message)
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

  const handleToggleSubdivision = async (completionDate?: string) => {
    if (!selectedSubdivision) return
    
    const isNowCompleting = !(selectedSubdivision.completed || selectedSubdivision.status === 'completed')
    const nextStatus = isNowCompleting ? 'completed' : 'available'
    const nextCompleted = isNowCompleting

    if (!isOnline) {
      addPendingAction(selectedSubdivision.id, nextStatus, nextCompleted)
      setDrawerOpen(false)
      toast.info("Ação registrada offline")
      return
    }

    try {
      const updateData: any = {
        status: nextStatus,
        completed: nextCompleted,
      }
      
      if (isNowCompleting && completionDate) {
        // Garantir que a data de conclusão seja salva no updated_at para exibição
        updateData.updated_at = new Date(completionDate).toISOString()
      } else {
        updateData.updated_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from("subdivisions")
        .update(updateData)
        .eq("id", selectedSubdivision.id)

      if (error) throw error

      if (isNowCompleting) {
        toast.success(`Quadra ${selectedSubdivision.name} concluída!`)
        setAnimatingSubdivisionId(selectedSubdivision.id)
        setTimeout(() => setAnimatingSubdivisionId(null), 1000)
      }

      // Recarregar o território
      await fetchTerritory()
      setDrawerOpen(false)

      // Fluxo UX: Selecionar próxima quadra disponível
      if (isNowCompleting && territory?.subdivisions) {
        const next = territory.subdivisions.find(s => 
          s.id !== selectedSubdivision.id && 
          !(s.completed || s.status === 'completed')
        )
        if (next) {
          // Pequeno delay para a animação do mapa rolar
          setTimeout(() => {
            setSelectedSubdivision(next)
          }, 600)
        }
      }
    } catch (error: any) {
      console.error("Erro ao atualizar quadra:", error?.message || error)
      toast.error("Erro ao atualizar quadra")
    }
  }

  const handleAddDnvClick = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDnvCoords({ lat: position.coords.latitude, lng: position.coords.longitude })
          setDnvDialogOpen(true)
        },
        (error) => {
          console.warn("Geolocalização indisponível, ativando Pin Mode", error)
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!territory) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 text-center">
        <MapPin className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-muted-foreground">Território não encontrado</p>
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

  const handleSaveNotes = async (notes: string) => {
    if (!selectedSubdivision || !user?.id || saving) return
    
    try {
      const { error } = await supabase
        .from("subdivisions")
        .update({ notes })
        .eq("id", selectedSubdivision.id)

      if (error) throw error
      
      // Atualizar estado local sem re-fetch total para ser mais rápido
      setTerritory(prev => {
        if (!prev) return prev
        return {
          ...prev,
          subdivisions: prev.subdivisions?.map(s => 
            s.id === selectedSubdivision.id ? { ...s, notes } : s
          ) || []
        }
      })
    } catch (error: any) {
      console.error("Erro ao salvar notas:", error)
      toast.error("Erro ao salvar notas")
    }
  }

  return (
    <div className="flex flex-col bg-background overflow-hidden relative" style={{ height: '100dvh' }}>
      {/* Header Fixo Sólido (Mobile) / Flutuante (Desktop) */}
      <div className="absolute top-0 left-0 right-0 h-16 z-[40] bg-card/95 backdrop-blur-sm shadow-sm flex items-center justify-between px-2 md:relative md:h-auto md:bg-transparent md:shadow-none md:px-4 md:pt-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
            onClick={() => router.push("/dashboard/my-assignments")}
            title="Voltar"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div className="flex items-center gap-2 min-w-0 md:bg-card/95 md:backdrop-blur-sm md:px-3 md:py-1.5 md:rounded-full md:shadow-sm md:border md:border-border">
            <div
              className="w-3 h-3 rounded-full ring-2 ring-muted flex-shrink-0"
              style={{ backgroundColor: territory.color }}
            />
            <h1 className="text-sm sm:text-base font-bold leading-tight truncate text-foreground flex items-center gap-2">
              Território {territory.number}
              {(territory as any).group_id && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase tracking-tighter">Grupo</span>
              )}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <div className="text-foreground font-bold md:bg-card/95 md:backdrop-blur-sm md:border md:border-border md:px-3 md:py-1.5 md:rounded-full text-sm md:shadow-sm">
            {progress}%
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 pt-16 md:pt-4 relative w-full">
        {/* Mapa */}
        <div className={`flex-1 min-h-0 shrink-0 border-y-0 md:border md:rounded-xl overflow-hidden shadow-sm relative z-0 ${pinMode ? 'border-destructive ring-inset ring-4 ring-destructive/30 cursor-crosshair' : 'border-border'}`}>
          <TerritoryMapViewer
            territory={territory}
            onSubdivisionClick={handleSubdivisionClick}
            pinMode={pinMode}
            onPinConfirm={handlePinConfirm}
            onPinCancel={handlePinCancel}
          />
          
          {/* Animação de Conclusão Overlay */}
          <style jsx global>{`
            .subdivision-animating-${animatingSubdivisionId} {
              transform-origin: center;
              animation: completion-pop 0.8s ease-out;
            }
            @keyframes completion-pop {
              0% { transform: scale(1); opacity: 0.7; }
              40% { transform: scale(1.05); opacity: 1; filter: brightness(1.2); }
              100% { transform: scale(1); opacity: 0.8; }
            }
          `}</style>
        </div>

        {/* Botões Bottom/Native Bar */}
        <div className="flex gap-2 p-4 pb-6 md:pb-4 bg-card shadow-[0_-10px_30px_rgba(0,0,0,0.1)] z-[40] relative shrink-0">
          <Button
            variant="outline"
            className={`flex-1 min-h-[48px] border-destructive/20 text-destructive hover:bg-destructive/10 font-bold rounded-xl ${pinMode ? 'bg-destructive/10 animate-pulse outline-none ring-2 ring-destructive' : ''}`}
            onClick={handleAddDnvClick}
            disabled={pinMode || !(territory as any).canEdit}
          >
            <MapPinOff className="h-4 w-4 mr-2" />
            Não Visitar
          </Button>
          <Button
            className={`flex-1 min-h-[48px] text-white font-bold shadow-sm rounded-xl ${isFullyCompleted
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-primary hover:bg-primary/90 active:scale-[0.98]'
              }`}
            onClick={() => setShowCompleteDialog(true)}
            disabled={!(territory as any).canEdit && !isFullyCompleted} // Permite devolver mesmo em read-only? Não, user disse "NÃO pode: editar, adicionar nota, marcar concluído. Só o admin."
            // Mas devolver é "encerrar". Acho que deve ser bloqueado também.
          >
            {isFullyCompleted ? 'Concluir' : 'Devolver'}
          </Button>
        </div>

        {/* Drawer para Subdivisão Selecionada */}
        {selectedSubdivision && (
          <SubdivisionDrawer
            open={drawerOpen}
            onOpenChange={(val) => {
              setDrawerOpen(val)
              if (!val) setSelectedSubdivision(null)
            }}
            subdivision={selectedSubdivision}
            onToggle={handleToggleSubdivision}
            onSaveNotes={handleSaveNotes}
            canEdit={(territory as any).canEdit}
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
