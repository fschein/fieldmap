"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { createTimeoutSignal } from "@/lib/utils/api-utils"
import { useAuth } from "@/hooks/use-auth"
import { useOfflineManager } from "@/hooks/use-offline-manager"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { IconArrowLeft } from "@tabler/icons-react"
import { Loader2, CheckCircle2, MapPin, MapPinOff, Navigation, Home } from "lucide-react"
import { SubdivisionDrawer } from "@/components/my-assignments/subdivision-drawer"
import { CompleteAssignmentDialog } from "@/components/my-assignments/complete-assignment-dialog"
import { AddDoNotVisitDialog } from "@/components/my-assignments/add-do-not-visit-dialog"
import { type HouseGroup, type UnitStatus } from "@/components/dashboard/house-by-house"
import { QuadraHouseByHouse, type MarkableQuadra } from "@/components/dashboard/quadra-house-by-house"
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
  const { user, isReady, isSupervisor } = useAuth()
  const { isOnline, addPendingAction } = useOfflineManager()
  const [territory, setTerritory] = useState<TerritoryWithSubdivisions | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedSubdivision, setSelectedSubdivision] = useState<Subdivision | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pinMode, setPinMode] = useState(false)
  const [pinModeCenter, setPinModeCenter] = useState<{ lat: number, lng: number } | null>(null)
  const [dnvDialogOpen, setDnvDialogOpen] = useState(false)
  const [dnvCoords, setDnvCoords] = useState<{ lat: number, lng: number } | null>(null)
  const [animatingSubdivisionId, setAnimatingSubdivisionId] = useState<string | null>(null)
  const [showHouses, setShowHouses] = useState(false)
  const territoryId = params.id as string

  const fetchTerritory = useCallback(async (silent = false) => {
    if (!territoryId || !user?.id) return

    if (!silent) setLoading(true)
    const { signal, clear } = createTimeoutSignal(15000)
    try {
      const { data, error } = await supabase
        .from("territories")
        .select(`
          *,
          campaign:campaigns(*),
          subdivisions(*, streets(*, units(id, number, floor, status, marked_at, marked_by))),
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
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      
      const isOwner = data.assigned_to === user.id
      const isAdmin = profile?.role === 'admin'
      
      const canAccess = isOwner || isAdmin
      const canEdit = isOwner || isAdmin
      
      if (!canAccess) {
        toast.error("Você não tem acesso a este território.")
        router.push("/dashboard/my-assignments")
        return
      }

      if ((data as any).type === "condominium") {
        router.replace(`/dashboard/territories/${territoryId}/condominium`)
        return
      }

      const activeAssignment = data.assignments?.find((a: any) => a.status === 'active')
      const campaignId = activeAssignment?.campaign_id
      let subdivisions = data.subdivisions || []

      if (campaignId && subdivisions.length > 0) {
        const { data: progressData, error: progressError } = await supabase
          .from("subdivision_campaign_progress")
          .select("*")
          .eq("campaign_id", campaignId)
          .in("subdivision_id", subdivisions.map((s: any) => s.id))
        
        if (!progressError && progressData) {
          subdivisions = subdivisions.map((s: any) => {
            const prog = progressData.find((p: any) => p.subdivision_id === s.id)
            return {
              ...s,
              completed: prog ? prog.completed : false,
              status: prog ? prog.status : "available",
              notes: prog ? prog.notes : (s.notes || null),
              completed_at: prog ? prog.updated_at : null
            }
          })
        }
      }

      const mergedTerritory = { ...data, subdivisions, canEdit }
      localStorage.setItem(`territory_cache_${territoryId}`, JSON.stringify(mergedTerritory))
      setTerritory(mergedTerritory as any)
    } catch (error: any) {
      if (error.name === 'AbortError' && !silent) {
        toast.error("Tempo esgotado ao carregar mapa.")
      }
      console.error("Erro ao carregar território:", error?.message || error)

      // Silencioso (refresh automático em segundo plano): nunca redireciona
      // nem mexe no cache por causa de uma falha passageira de rede — só
      // desiste dessa rodada e tenta de novo no próximo intervalo.
      if (silent) return

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

  // Auto-refresh silencioso — pra ver as casas sendo marcadas por quem
  // recebeu o link de campo sem precisar recarregar a página manualmente.
  // Não precisa ser instantâneo, só automático.
  useEffect(() => {
    if (!isReady || !isOnline) return
    const interval = setInterval(() => fetchTerritory(true), 10000)
    return () => clearInterval(interval)
  }, [isReady, isOnline, fetchTerritory])

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
      const activeAssignment = territory?.assignments?.find((a: any) => a.status === 'active')
      const campaignId = activeAssignment?.campaign_id

      const updateData: any = {
        status: nextStatus,
        completed: nextCompleted,
        updated_at: new Date().toISOString(),
      }
      
      if (isNowCompleting) {
        // Save exact completion timestamp (use chosen date at current time)
        const base = completionDate ? new Date(completionDate) : new Date()
        // Keep today's time but use selected date
        const now = new Date()
        base.setHours(now.getHours(), now.getMinutes(), now.getSeconds())
        updateData.completed_at = base.toISOString()
        updateData.notes = null
      } else {
        // Reopen: clear completion timestamp
        updateData.completed_at = null
      }

      if (campaignId) {
        const campaignUpdateData: any = {
          subdivision_id: selectedSubdivision.id,
          campaign_id: campaignId,
          status: nextStatus,
          completed: nextCompleted,
          updated_at: new Date().toISOString(),
        }
        
        // Clear notes on completion; preserve on reopen
        campaignUpdateData.notes = isNowCompleting ? null : (selectedSubdivision.notes ?? null)

        const { error } = await supabase
          .from("subdivision_campaign_progress")
          .upsert(campaignUpdateData, { onConflict: "subdivision_id,campaign_id" })

        if (error) throw error
      } else {
        const { error } = await supabase
          .from("subdivisions")
          .update(updateData)
          .eq("id", selectedSubdivision.id)

        if (error) throw error
      }

      if (isNowCompleting) {
        toast.success(`Quadra ${selectedSubdivision.name} concluída!`)
        setAnimatingSubdivisionId(selectedSubdivision.id)
        setTimeout(() => setAnimatingSubdivisionId(null), 1000)
      }

      // Recarregar o território
      await fetchTerritory()
      setDrawerOpen(false)

      // Fluxo UX: Selecionar próxima quadra disponível ou sugerir conclusão
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
        } else {
          // Nenhuma quadra pendente, sugerir conclusão do território
          setTimeout(() => {
            setShowCompleteDialog(true)
          }, 800)
        }
      }
    } catch (error: any) {
      console.error("Erro ao atualizar quadra:", error?.message || error)
      toast.error("Erro ao atualizar quadra")
    }
  }

  const handleAddDnvClick = () => {
    // Sempre entra em Pin Mode: o GPS só serve para centralizar o mapa como
    // ponto de partida, o publicador ainda precisa arrastar até o local exato
    // e confirmar antes de salvar.
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setPinModeCenter({ lat: position.coords.latitude, lng: position.coords.longitude })
          setPinMode(true)
        },
        (error) => {
          console.warn("Geolocalização indisponível", error)
          setPinModeCenter(null)
          setPinMode(true)
        },
        { enableHighAccuracy: true, timeout: 5000 }
      )
    } else {
      setPinModeCenter(null)
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

  // Casa-a-casa — funciona independente de a quadra ter geometria desenhada
  // no mapa ou não. Aninhado: quadra colapsável, dentro dela as ruas.
  const markableQuadras: MarkableQuadra[] = (territory.subdivisions || [])
    .map((s: any) => ({
      id: s.id,
      label: s.name,
      streets: (s.streets || []).map((st: any) => ({
        id: st.id,
        label: st.name,
        units: st.units || [],
        completed: st.completed,
      })) as HouseGroup[],
    }))
    .sort((a: MarkableQuadra, b: MarkableQuadra) =>
      a.label.localeCompare(b.label, "pt-BR", { numeric: true, sensitivity: "base" })
    )

  const handleMarkUnit = async (unitId: string, status: UnitStatus) => {
    const { error } = await supabase
      .from("units")
      .update({ status, marked_by: user?.id ?? null, marked_at: new Date().toISOString() })
      .eq("id", unitId)
    if (error) {
      toast.error("Erro ao marcar unidade: " + error.message)
      return
    }
    fetchTerritory()
  }

  const handleSaveNotes = async (notes: string) => {
    if (!selectedSubdivision || !user?.id || saving) return
    
    try {
      const activeAssignment = territory?.assignments?.find((a: any) => a.status === 'active')
      const campaignId = activeAssignment?.campaign_id

      if (campaignId) {
        const { error } = await supabase
          .from("subdivision_campaign_progress")
          .upsert({
            subdivision_id: selectedSubdivision.id,
            campaign_id: campaignId,
            notes,
            completed: selectedSubdivision.completed || false,
            status: selectedSubdivision.status || "available",
            updated_at: new Date().toISOString()
          }, { onConflict: "subdivision_id,campaign_id" })

        if (error) throw error
      } else {
        const { error } = await supabase
          .from("subdivisions")
          .update({ notes })
          .eq("id", selectedSubdivision.id)

        if (error) throw error
      }
      
      // Atualizar estado local sem re-fetch total para ser mais rápido
      setTerritory(prev => {
        if (!prev) return prev
        const updatedSubdivisions = prev.subdivisions?.map(s => 
          s.id === selectedSubdivision.id ? { ...s, notes } : s
        ) || []
        
        // Also update local cache
        localStorage.setItem(`territory_cache_${territoryId}`, JSON.stringify({ ...prev, subdivisions: updatedSubdivisions }))
        
        return {
          ...prev,
          subdivisions: updatedSubdivisions
        }
      })
    } catch (error: any) {
      console.error("Erro ao salvar notas:", error)
      toast.error("Erro ao salvar notas")
    }
  }

  return (
    <div className="flex flex-col bg-background overflow-hidden h-dvh">

      {/* ── Barra do território ── */}
      <div className="relative shrink-0 flex items-center gap-3 px-4 h-11 bg-card border-b border-border">
        <button onClick={() => router.push("/dashboard/my-assignments")} className="shrink-0 text-foreground">
          <IconArrowLeft size={20} />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: territory.color }}
          />
          <span className="text-[15px] font-medium text-foreground truncate">
            {territory.name}
          </span>
        </div>

        <span className="shrink-0 tabular-nums text-xs font-medium bg-primary/10 text-primary rounded-full px-2.5 py-1">
          {completedCount} / {totalCount}
        </span>

        {isSupervisor && (
          <button
            onClick={() => setShowHouses((v) => !v)}
            className={`shrink-0 h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${showHouses ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            title="Casa-a-casa"
          >
            <Home className="h-4 w-4" />
          </button>
        )}

        {/* Barra de progresso — borda inferior */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-border">
          <div className="h-full bg-primary rounded-r-sm transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {showHouses && isSupervisor && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <QuadraHouseByHouse
            quadras={markableQuadras}
            currentMarkerId={user?.id ?? null}
            onMark={handleMarkUnit}
            emptyHint="Nenhuma quadra cadastrada ainda neste território."
          />
        </div>
      )}

      {/* ── Mapa ── */}
      <div className={`flex-1 min-h-0 overflow-hidden relative z-0${pinMode ? ' cursor-crosshair' : ''}${showHouses ? ' hidden' : ''}`}>
        <TerritoryMapViewer
          territory={territory}
          onSubdivisionClick={handleSubdivisionClick}
          pinMode={pinMode}
          pinModeCenter={pinModeCenter}
          onPinConfirm={handlePinConfirm}
          onPinCancel={handlePinCancel}
        />
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

      {/* ── Botões inferiores ── */}
      <div className="flex gap-2 p-4 pb-6 md:pb-4 bg-card shadow-[0_-10px_30px_rgba(0,0,0,0.1)] z-[40] shrink-0">
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
          disabled={!(territory as any).canEdit && !isFullyCompleted}
        >
          {isFullyCompleted ? 'Concluir' : 'Devolver'}
        </Button>
      </div>

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
          territoryId={territory.id}
          isSupervisor={isSupervisor}
        />
      )}

      <CompleteAssignmentDialog
        open={showCompleteDialog}
        onOpenChange={setShowCompleteDialog}
        territory={territory}
        activeAssignmentDate={(territory as any).assignments?.find((a: any) => a.status === 'active')?.assigned_at}
        onConfirm={handleConfirmCompletion}
      />

      <AddDoNotVisitDialog
        open={dnvDialogOpen}
        onOpenChange={setDnvDialogOpen}
        territoryId={territory.id}
        latitude={dnvCoords?.lat || null}
        longitude={dnvCoords?.lng || null}
        onSuccess={() => fetchTerritory()}
      />
    </div>
  )
}
