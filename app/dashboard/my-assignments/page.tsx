"use client"

import { useEffect, useState, useCallback } from "react"
import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { createTimeoutSignal } from "@/lib/utils/api-utils"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Loader2, MapPin, Plus, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface TerritoryAssignment extends TerritoryWithSubdivisions {
  assignments: { assigned_at: string; status: string; campaign?: { name: string } }[]
}

const supabase = getSupabaseBrowserClient()

export default function MyAssignmentsPage() {
  const { user, profile, isReady } = useAuth()
  const [territories, setTerritories] = useState<TerritoryAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const router = useRouter()

  const fetchMyAssignments = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    const { signal, clear } = createTimeoutSignal(15000)
    try {
      const { data, error } = await supabase
        .from("territories")
        .select(`*, campaign:campaigns(*), subdivisions(*), assignments(*, campaign:campaigns(*))`)
        .eq("assigned_to", user.id)
        .abortSignal(signal)
        .order("number", { ascending: true })
      if (error) throw error
      setTerritories(data || [])
      localStorage.setItem("my_assignments_cache", JSON.stringify(data || []))
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast.error("Tempo esgotado ao carregar territórios.")
      }
      const cached = localStorage.getItem("my_assignments_cache")
      if (cached) setTerritories(JSON.parse(cached))
    } finally {
      clear()
      setLoading(false)
    }
  }, [user?.id, supabase])

  useEffect(() => {
    if (isReady) {
      fetchMyAssignments()
      const lastRequest = localStorage.getItem("last_territory_request")
      if (lastRequest) {
        const diff = Date.now() - parseInt(lastRequest)
        const fiveMin = 5 * 60 * 1000
        if (diff < fiveMin) setCooldown(Math.ceil((fiveMin - diff) / 1000))
      }
    }
  }, [isReady, fetchMyAssignments])

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  const calcProgress = (subdivisions?: Subdivision[]): number => {
    if (!subdivisions?.length) return 0
    const done = subdivisions.filter(s => s.status === "completed" || s.completed).length
    return Math.round((done / subdivisions.length) * 100)
  }

  const calcDays = (territory: TerritoryAssignment): number => {
    const assignedAt = territory.assignments?.find(a => a.status === "active")?.assigned_at
    if (!assignedAt) return 0
    return Math.ceil((Date.now() - new Date(assignedAt).getTime()) / (1000 * 60 * 60 * 24))
  }

  const handleRequestTerritory = async () => {
    if (!user?.id || !profile?.name || requesting || cooldown > 0) return
    setRequesting(true)
    try {
      const { error } = await supabase.from("notifications").insert({
        type: "request",
        title: "Pedido de Território",
        message: `${profile.name} está solicitando um novo território para trabalhar.`,
        created_by: user.id,
      })
      if (error) throw error
      localStorage.setItem("last_territory_request", Date.now().toString())
      setCooldown(300)
      toast.success("Pedido enviado!")
    } catch {
      toast.error("Erro ao enviar pedido.")
    } finally {
      setRequesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-between -mx-2.5 px-2.5">
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
      </div>
    )
  }

  const avgProgress = territories.length > 0
    ? Math.round(territories.reduce((acc, t) => acc + calcProgress(t.subdivisions), 0) / territories.length)
    : 0

  const totalDone = territories.reduce((acc, t) =>
    acc + (t.subdivisions?.filter(s => s.completed || s.status === "completed").length || 0), 0)
  const totalAll = territories.reduce((acc, t) => acc + (t.subdivisions?.length || 0), 0)

  const firstName =
    typeof profile?.name === "string" && profile.name.trim().length > 0
      ? profile.name.split(" ")[0]
      : "Irmão";

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="flex justify-center pt-0 pb-4 -mt-6">
        <FieldMapLogoBrand className="h-9 w-auto opacity-90" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between pt-2 gap-3 px-2.5 mb-5">
        <div className="flex flex-col">
          <span className="text-sm text-slate-500">Olá,</span>
          <span className="text-xl font-semibold text-slate-900">
            {firstName}
          </span>
        </div>

        {/* <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRequestTerritory}
          disabled={requesting || cooldown > 0}
          className="flex items-center gap-2 h-9 px-3 border-slate-200 bg-white text-slate-700 rounded-md"
        >
          {requesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 text-[#C65D3B]" />
          )}

          <span className="text-sm whitespace-nowrap">
            {cooldown > 0
              ? `Aguarde ${Math.floor(cooldown / 60)}:${String(
                cooldown % 60
              ).padStart(2, "0")}`
              : "Pedir território"}
          </span>
        </Button> */}
      </div>

      <div className="space-y-3 px-2.5 pb-24">

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[12px] font-medium text-slate-400 mb-1.5">Progresso médio</p>
            <p className="text-xl font-semibold text-slate-800">{avgProgress}%</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[12px] font-medium text-slate-400 mb-1.5">Quadras concluídas</p>
            <p className="text-xl font-semibold text-slate-800">
              {totalDone}{" "}
              <span className="text-sm font-normal text-slate-400">/ {totalAll}</span>
            </p>
          </div>
        </div>

        {/* Section label */}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {territories.length} {territories.length === 1 ? "território ativo" : "territórios ativos"}
        </p>

        {/* Territory cards */}
        {territories.length === 0 ? (
          <div className="py-14 flex flex-col items-center justify-center space-y-3 bg-white rounded-xl border border-dashed border-slate-200">
            <MapPin className="h-7 w-7 text-slate-300" />
            <p className="text-xs text-slate-400">Toque em "Pedir território" acima</p>
          </div>
        ) : (
          <div className="space-y-2">
            {territories.map((t) => {
              const progress = calcProgress(t.subdivisions)
              const days = calcDays(t)
              const isOverdue = days > 90
              const done = t.subdivisions?.filter(s => s.completed || s.status === "completed").length || 0
              const total = t.subdivisions?.length || 0
              const activeAssignment = t.assignments?.find(a => a.status === "active")
              const campaignName = activeAssignment?.campaign?.name || t.campaign?.name
              const progressColor =
                progress === 100 ? "bg-green-500"
                  : isOverdue ? "bg-red-400"
                    : progress >= 50 ? "bg-yellow-400"
                      : "bg-red-400"

              const badgeClass =
                progress === 100
                  ? "bg-green-50 text-green-800"
                  : isOverdue || progress < 50
                    ? "bg-red-50 text-red-800"
                    : "bg-yellow-50 text-yellow-800"

              return (
                <button
                  key={t.id}
                  onClick={() => router.push(`/dashboard/my-assignments/${t.id}/map`)}
                  className={cn(
                    "w-full text-left bg-white rounded-xl border px-3 py-2.5 transition-all active:scale-[0.98] space-y-1.5",
                    isOverdue ? "border-red-200" : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.color || "#C65D3B" }}
                    />
                    <span className="text-sm font-medium text-slate-800 flex-1 truncate">
                      Território {t.number}
                      {t.name && <span className="font-normal text-slate-400"> · {t.name}</span>}
                    </span>
                    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", badgeClass)}>
                      {progress}%
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                  </div>

                  <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", progressColor)}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{days} dias</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 inline-block" />
                    <span>{done} de {total} quadras</span>

                    {isOverdue && (
                      <span className="text-red-500 font-medium bg-red-50 px-1.5 py-0.5 rounded-full">
                        Em atraso
                      </span>
                    )}

                    {campaignName && (
                      <span className="ml-auto bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                        {campaignName}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
