"use client"

import { useEffect, useState, useCallback } from "react"
import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { createTimeoutSignal } from "@/lib/utils/api-utils"
import { useAuth } from "@/hooks/use-auth"
import { Badge } from "@/components/ui/badge"
import { Loader2, MapPin, ChevronRight, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface AssignmentRecord {
  id: string
  assigned_at: string
  status: string
  group_id: string | null        // FIX: incluído explicitamente no select
  campaign_id: string | null
  campaign?: { id: string; name: string; active: boolean } | null
}

interface TerritoryAssignment extends TerritoryWithSubdivisions {
  assignments: AssignmentRecord[]
}

// FIX: select reutilizável que inclui group_id e active na campanha
const ASSIGNMENTS_SELECT = `
  id,
  assigned_at,
  status,
  group_id,
  campaign_id,
  campaign:campaigns(id, name, active)
`

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
    const isSunday = new Date().getDay() === 0

    try {
      const { data: personal, error } = await supabase
        .from("territories")
        .select(`*, campaign:campaigns(*), subdivisions(*), assignments(${ASSIGNMENTS_SELECT})`)
        .eq("assigned_to", user.id)
        .abortSignal(signal)
        .order("number", { ascending: true })

      if (error) throw error

      let allTerritories: TerritoryAssignment[] = [...((personal as TerritoryAssignment[]) || [])]

      if (isSunday && profile?.group_id) {
        // Campanha ativa vigente
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("id, name")
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        // Busca TODAS as designações de grupo ativas (detecta fantasmas/duplicatas)
        const { data: groupAssignments } = await supabase
          .from("assignments")
          .select(`id, territory_id, status, campaign_id, territories!inner(assigned_to)`)
          .eq("group_id", profile.group_id)
          .eq("status", "active")

        let activeGroupId = groupAssignments?.[0]?.territory_id
        
        // RECONCILIAÇÃO GLOBAL: Limpa fantasmas e atualiza campanhas
        if (groupAssignments && groupAssignments.length > 0) {
          // 1. Dedup: Mantém apenas a primeira, cancela o resto (fantasmas)
          if (groupAssignments.length > 1) {
            const extraIds = groupAssignments.slice(1).map((a: any) => a.id)
            await supabase
              .from("assignments")
              .update({ status: "returned", notes: "Sistema: Duplicata automática removida." })
              .in("id", extraIds)
          }

          const mainAssignment = groupAssignments[0]
          const currentAssignmentId = mainAssignment.id
          const currentCampaignId = mainAssignment.campaign_id

          // 2. Isolamento: Se alguém pegou o território individualmente, cancela o grupo
          if (mainAssignment.territories?.assigned_to) {
            await supabase
              .from("assignments")
              .update({ status: "returned", notes: "Cancelado: Território designado individualmente." })
              .eq("id", currentAssignmentId)
            activeGroupId = undefined
          } 
          // 3. Campanha: Sincroniza com a única campanha verdadeiramente "Vigente"
          else {
            // Regra de ouro: Se existe uma campanha ativa, a missão DEVE ser dela (salvo se já concluída nela)
            if (campaign) {
              if (currentCampaignId !== campaign.id) {
                const { data: alreadyDone } = await supabase
                  .from("assignments")
                  .select("id")
                  .eq("territory_id", mainAssignment.territory_id)
                  .eq("campaign_id", campaign.id)
                  .eq("status", "completed")
                  .limit(1)
                  .maybeSingle()

                await supabase
                  .from("assignments")
                  .update({ campaign_id: alreadyDone ? null : campaign.id })
                  .eq("id", currentAssignmentId)
              }
            } else if (currentCampaignId) {
              // Nenhuma campanha vigente no sistema, limpa a tag
              await supabase
                .from("assignments")
                .update({ campaign_id: null })
                .eq("id", currentAssignmentId)
            }
          }
        }

        // Se não há designação de grupo ativa, cria uma
        if (!activeGroupId) {
          let territoryToAssign: { id: string; number: string } | null = null
          let finalCampaignId: string | null = null

          const { data: allGroupTerrs } = await supabase
            .from("territories")
            .select("id, number")
            .eq("group_id", profile.group_id)
            .is("assigned_to", null)
            .neq("status", "inactive")
            .order("last_completed_at", { ascending: true, nullsFirst: true })

          if (allGroupTerrs?.length) {
            if (campaign) {
              for (const terr of allGroupTerrs) {
                const { data: alreadyDone } = await supabase
                  .from("assignments")
                  .select("id")
                  .eq("territory_id", terr.id)
                  .eq("campaign_id", campaign.id)
                  .eq("status", "completed")
                  .limit(1)
                  .maybeSingle()

                if (!alreadyDone) {
                  territoryToAssign = terr
                  finalCampaignId = campaign.id
                  break
                }
              }
            }

            if (!territoryToAssign) {
              territoryToAssign = allGroupTerrs[0]
              finalCampaignId = null
            }
          }

          if (!territoryToAssign) {
            const { data: anyFree } = await supabase
              .from("territories")
              .select("id, number")
              .eq("group_id", profile.group_id)
              .is("assigned_to", null)
              .neq("status", "inactive")
              .order("last_completed_at", { ascending: true, nullsFirst: true })
              .limit(1)

            if (anyFree?.[0]) {
              territoryToAssign = anyFree[0]
              finalCampaignId = null
            }
          }

          if (territoryToAssign) {
            const { error: assignErr } = await supabase.from("assignments").insert({
              territory_id: territoryToAssign.id,
              group_id: profile.group_id,
              campaign_id: finalCampaignId,
              status: "active",
              assigned_at: new Date().toISOString(),
            })

            if (!assignErr) activeGroupId = territoryToAssign.id
          }
        }

        // Busca os dados completos do território de grupo após reconciliação
        if (activeGroupId) {
          const { data: groupTerritory } = await supabase
            .from("territories")
            .select(`*, campaign:campaigns(*), subdivisions(*), assignments(${ASSIGNMENTS_SELECT})`)
            .eq("id", activeGroupId)
            .single()

          if (groupTerritory) {
            const index = allTerritories.findIndex(t => t.id === groupTerritory.id)
            if (index !== -1) {
              // Substitui a versão "suja" pela versão reconciliada
              allTerritories[index] = groupTerritory as TerritoryAssignment
            } else {
              allTerritories.push(groupTerritory as TerritoryAssignment)
            }
          }
        }
      }

      setTerritories(allTerritories)
      localStorage.setItem("my_assignments_cache", JSON.stringify(allTerritories))
    } catch (err: any) {
      if (err.name === "AbortError") toast.error("Tempo esgotado ao carregar territórios.")
      const cached = localStorage.getItem("my_assignments_cache")
      if (cached) {
        try { setTerritories(JSON.parse(cached)) } catch { }
      }
    } finally {
      clear()
      setLoading(false)
    }
  }, [user?.id, profile?.group_id])

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
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
      </div>
    )
  }

  const avgProgress =
    territories.length > 0
      ? Math.round(territories.reduce((acc, t) => acc + calcProgress(t.subdivisions), 0) / territories.length)
      : 0

  const totalDone = territories.reduce(
    (acc, t) => acc + (t.subdivisions?.filter(s => s.completed || s.status === "completed").length || 0), 0
  )
  const totalAll = territories.reduce((acc, t) => acc + (t.subdivisions?.length || 0), 0)

  const firstName =
    typeof profile?.name === "string" && profile.name.trim().length > 0
      ? profile.name.split(" ")[0]
      : "Irmão"

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="flex justify-center pt-0 pb-4 -mt-6">
        <FieldMapLogoBrand className="h-9 w-auto opacity-90" />
      </div>

      <div className="flex items-center justify-between pt-2 gap-3 px-2.5 mb-5">
        <div className="flex flex-col">
          <span className="text-sm text-slate-500">Olá,</span>
          <span className="text-xl font-semibold text-slate-900">{firstName}</span>
        </div>
        {new Date().getDay() === 0 && profile?.group_id && (
          <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-none py-1 px-3 rounded-full flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            Modo Grupo
          </Badge>
        )}
      </div>

      <div className="px-2.5 mb-2">
        {cooldown > 0 && (
          <div className="bg-orange-50 border border-orange-100 p-2 rounded-lg text-[11px] text-orange-700 font-medium text-center">
            Aguarde {Math.floor(cooldown / 60)}:{String(cooldown % 60).padStart(2, "0")} para um novo pedido.
          </div>
        )}
      </div>

      <div className="space-y-3 px-2.5 pb-24">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[12px] font-medium text-slate-400 mb-1.5">Progresso médio</p>
            <p className="text-xl font-semibold text-slate-800">{avgProgress}%</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[12px] font-medium text-slate-400 mb-1.5">Quadras concluídas</p>
            <p className="text-xl font-semibold text-slate-800">
              {totalDone} <span className="text-sm font-normal text-slate-400">/ {totalAll}</span>
            </p>
          </div>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {territories.length} {territories.length === 1 ? "território ativo" : "territórios ativos"}
        </p>

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
              const isGroupWork = !!(t.group_id && profile?.group_id && t.group_id === profile.group_id)

              // FIX: group_id agora está no select — find funciona corretamente
              const activeAssignment = isGroupWork
                ? t.assignments?.find(a => a.status === "active" && a.group_id === profile?.group_id)
                : t.assignments?.find(a => a.status === "active" && !a.group_id)

              // FIX: só exibe campanha se active === true na designação ativa
              const campaignName =
                activeAssignment?.campaign?.active === true
                  ? activeAssignment.campaign.name
                  : null

              const progressColor =
                progress === 100 ? "bg-green-500"
                  : isOverdue ? "bg-red-400"
                    : progress >= 50 ? "bg-yellow-400"
                      : "bg-red-400"

              const badgeClass =
                progress === 100 ? "bg-green-50 text-green-800"
                  : isOverdue || progress < 50 ? "bg-red-50 text-red-800"
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
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || "#C65D3B" }} />
                    <span className="text-sm font-medium text-slate-800 flex-1 truncate">
                      Território {t.number}
                      {t.name && <span className="font-normal text-slate-400"> · {t.name}</span>}
                    </span>
                    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", badgeClass)}>
                      {progress}%
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                  </div>

                  {isGroupWork && (
                    <div className="flex items-center gap-1.5 bg-orange-50 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-md w-fit border border-orange-100">
                      <Users className="h-3 w-3" /> TRABALHO DE GRUPO
                    </div>
                  )}

                  <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", progressColor)} style={{ width: `${progress}%` }} />
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{days} dias</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 inline-block" />
                    <span>{done} de {total} quadras</span>
                    {isOverdue && (
                      <span className="text-red-500 font-medium bg-red-50 px-1.5 py-0.5 rounded-full">Em atraso</span>
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