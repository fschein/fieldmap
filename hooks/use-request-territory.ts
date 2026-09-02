"use client"

import { useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Territory, Group } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { useAppSettings } from "@/hooks/use-app-settings"

const supabase = getSupabaseBrowserClient()

export type RegionPreviewReason = "ok" | "recent" | "covered" | "empty"

export interface RegionPreview {
  territory: Territory | null
  days: number // Infinity se nunca trabalhado ou se não há território (reason !== "ok")
  reason: RegionPreviewReason
}

// Data "efetiva" de última atividade: a mais recente entre last_completed_at
// (última conclusão de verdade) e o assigned_at de qualquer designação — pra
// não mostrar um território como "há 66 dias sem trabalho" quando na
// verdade alguém teve ele em mãos até a campanha pausar, só nunca chegou a
// concluir (o que só atualiza last_completed_at na conclusão, não na pausa).
function effectiveLastActivity(t: any): string | null {
  const dates = [
    t.last_completed_at,
    ...((t.assignments ?? []) as { assigned_at: string | null }[]).map((a) => a.assigned_at),
  ].filter(Boolean) as string[]
  if (!dates.length) return null
  return dates.reduce((max, d) => (d > max ? d : max))
}

function pickOldest(candidates: any[]): Territory & { effective_last_activity: string | null } {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMonthsAgoStr = sixMonthsAgo.toISOString()

  const withCounts = candidates.map((t) => ({
    ...t,
    effectiveLastActivity: effectiveLastActivity(t),
    recentCompletions: ((t.assignments ?? []) as { completed_at: string | null }[]).filter(
      (a) => a.completed_at && a.completed_at >= sixMonthsAgoStr
    ).length,
  }))

  withCounts.sort((a, b) => {
    if (a.effectiveLastActivity === null && b.effectiveLastActivity !== null) return -1
    if (a.effectiveLastActivity !== null && b.effectiveLastActivity === null) return 1
    if (a.effectiveLastActivity && b.effectiveLastActivity) {
      const diff = new Date(a.effectiveLastActivity).getTime() - new Date(b.effectiveLastActivity).getTime()
      if (diff !== 0) return diff
    }
    return a.recentCompletions - b.recentCompletions
  })

  const { assignments: _a, recentCompletions: _r, effectiveLastActivity: ela, ...territory } = withCounts[0]
  return { ...(territory as Territory), effective_last_activity: ela }
}

function buildPreview(scoped: any[], coveredIds: Set<string> | null, minRestDays: number): RegionPreview {
  if (!scoped.length) return { territory: null, days: Infinity, reason: "empty" }

  const notCovered = coveredIds ? scoped.filter((t) => !coveredIds.has(t.id)) : scoped
  if (!notCovered.length) return { territory: null, days: Infinity, reason: "covered" }

  const restCutoff = new Date(Date.now() - minRestDays * 86400000).toISOString()
  const rested = notCovered.filter((t) => {
    const activity = effectiveLastActivity(t)
    return !activity || activity < restCutoff
  })
  if (!rested.length) return { territory: null, days: Infinity, reason: "recent" }

  const territory = pickOldest(rested)
  const days = territory.effective_last_activity
    ? Math.floor((Date.now() - new Date(territory.effective_last_activity).getTime()) / 86400000)
    : Infinity
  return { territory, days, reason: "ok" }
}

export function useRequestTerritory() {
  const { user } = useAuth()
  const { settings } = useAppSettings()

  const fetchGroups = useCallback(async (): Promise<Group[]> => {
    const { data } = await supabase.from("groups").select("*").eq("is_active", true).order("name")
    return (data as Group[]) ?? []
  }, [])

  /**
   * Calcula, pra cada região (grupo + "geral" + "comercial"), qual seria o
   * território oferecido — o mais antigo elegível — sem escolher nenhum.
   * Usado pra já mostrar a "idade" de cada região na tela de seleção, em vez
   * de só descobrir depois que a pessoa escolhe.
   */
  const fetchRegionPreviews = useCallback(async (
    groups: Group[],
    campaign?: { id: string } | null
  ): Promise<Record<string, RegionPreview>> => {
    let coveredIds: Set<string> | null = null
    if (campaign) {
      const { data: covered } = await supabase
        .from("assignments")
        .select("territory_id")
        .eq("campaign_id", campaign.id)
        .in("status", ["completed", "active"])
      coveredIds = new Set((covered ?? []).map((a: { territory_id: string }) => a.territory_id))
    }

    const { data } = await supabase
      .from("territories")
      .select("*, assignments(id, completed_at, assigned_at)")
      .in("status", ["available", "completed"])
      .is("assigned_to", null)

    const all = (data as any[]) ?? []

    const previews: Record<string, RegionPreview> = {}
    for (const g of groups) {
      previews[g.id] = buildPreview(all.filter((t) => t.group_id === g.id), coveredIds, settings.recent_days)
    }
    previews.geral = buildPreview(all.filter((t) => !t.group_id && t.type !== "comercial"), coveredIds, settings.recent_days)
    previews.comercial = buildPreview(all.filter((t) => t.type === "comercial"), coveredIds, settings.recent_days)

    return previews
  }, [settings.recent_days])

  const requestTerritory = useCallback(
    async (territoryId: string): Promise<void> => {
      if (!user?.id) throw new Error("Usuário não autenticado")

      const today = new Date().toISOString().slice(0, 10)
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, start_date, end_date")
        .eq("active", true)

      const activeCampaign = (campaigns ?? []).find((c: { id: string; start_date: string | null; end_date: string | null }) => {
        if (!c.start_date) return false
        if (today < c.start_date) return false
        if (c.end_date && today > c.end_date) return false
        return true
      })
      const campaignId = activeCampaign?.id ?? null

      // Reserva o território primeiro, e só se ele ainda estiver livre
      // (.is("assigned_to", null)) — evita a corrida de duas pessoas
      // pedindo o mesmo território ao mesmo tempo: só uma das duas
      // atualizações bate nessa condição, a outra afeta 0 linhas.
      const { data: updatedTerr, error: updateError } = await supabase
        .from("territories")
        .update({ assigned_to: user.id, status: "assigned", campaign_id: campaignId })
        .eq("id", territoryId)
        .is("assigned_to", null)
        .select("id")

      if (updateError) throw updateError
      if (!updatedTerr || updatedTerr.length === 0) {
        throw new Error("Esse território acabou de ser designado para outra pessoa. Tenta pedir de novo.")
      }

      const { error: assignError } = await supabase
        .from("assignments")
        .insert({
          territory_id: territoryId,
          user_id: user.id,
          status: "active",
          assigned_at: new Date().toISOString(),
          campaign_id: campaignId,
        })

      if (assignError) {
        // Desfaz a reserva do território pra não deixar ele preso a
        // ninguém sem uma designação real por trás.
        await supabase.from("territories").update({ assigned_to: null, status: "available", campaign_id: null }).eq("id", territoryId)
        throw assignError
      }
    },
    [user?.id]
  )

  return { fetchGroups, fetchRegionPreviews, requestTerritory }
}
