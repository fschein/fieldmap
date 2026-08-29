"use client"

import { useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Territory, Group } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"

const supabase = getSupabaseBrowserClient()

const MIN_REST_DAYS = 15
const URGENT_THRESHOLD_DAYS = 60

export interface FetchAvailableResult {
  territory: Territory | null
  blockedByRecency: boolean
  crossGroup?: boolean
}

export interface UrgentGroupSuggestion {
  groupId: string
  groupName: string
  days: number
}

export function useRequestTerritory() {
  const { user } = useAuth()

  const fetchGroups = useCallback(async (): Promise<Group[]> => {
    const { data } = await supabase.from("groups").select("*").eq("is_active", true).order("name")
    return (data as Group[]) ?? []
  }, [])

  const fetchAvailableTerritory = useCallback(async (
    selector:
      | { groupId: string; territoryType?: never; general?: never }
      | { territoryType: string; groupId?: never; general?: never }
      | { general: true; groupId?: never; territoryType?: never },
    campaign?: { id: string; startDate: string } | null
  ): Promise<FetchAvailableResult> => {
    // IDs já cobertos na campanha ativa — usado tanto no override de urgência quanto no pool normal
    let coveredIds: Set<string> | null = null
    if (campaign) {
      const { data: covered } = await supabase
        .from("assignments")
        .select("territory_id")
        .eq("campaign_id", campaign.id)
        .in("status", ["completed", "active"])
      coveredIds = new Set((covered ?? []).map((a: { territory_id: string }) => a.territory_id))
    }

    // ── Override: território urgente (60+ dias, ou nunca trabalhado) na mesma família
    // de tipo (residencial+condominial vs. comercial), cruzando grupos/regiões. ──
    let urgentQuery = supabase
      .from("territories")
      .select("*, assignments(id, completed_at)")
      .in("status", ["available", "completed"])
      .is("assigned_to", null)
      .order("last_completed_at", { ascending: true, nullsFirst: true })
      .limit(20)

    urgentQuery = selector.territoryType
      ? urgentQuery.eq("type", selector.territoryType)
      : urgentQuery.neq("type", "comercial")

    const { data: urgentPool } = await urgentQuery
    const urgentCandidate = (urgentPool as any[] ?? []).find(
      (t) => !coveredIds || !coveredIds.has(t.id)
    )

    const urgentCutoffOverride = new Date(Date.now() - URGENT_THRESHOLD_DAYS * 86400000).toISOString()
    const isTrulyUrgent =
      urgentCandidate && (!urgentCandidate.last_completed_at || urgentCandidate.last_completed_at < urgentCutoffOverride)

    if (isTrulyUrgent) {
      const { assignments: _a, ...territory } = urgentCandidate
      const crossGroup = !!selector.groupId && territory.group_id !== selector.groupId
      return { territory: territory as Territory, blockedByRecency: false, crossGroup }
    }

    // ── Fluxo normal, escopado no grupo/tipo/geral pedido ──
    let query = supabase
      .from("territories")
      .select("*, assignments(id, completed_at)")
      .in("status", ["available", "completed"])
      .is("assigned_to", null)

    if (selector.groupId) query = query.eq("group_id", selector.groupId)
    else if (selector.territoryType) query = query.eq("type", selector.territoryType)
    else if (selector.general) query = query.is("group_id", null).neq("type", "comercial")

    const { data, error } = await query

    if (error || !data?.length) return { territory: null, blockedByRecency: false }

    let candidates = data as any[]

    if (coveredIds) {
      candidates = candidates.filter((t) => !coveredIds!.has(t.id))
    }

    if (!candidates.length) return { territory: null, blockedByRecency: false }

    // Verificar se existe algum território urgente (> URGENT_THRESHOLD_DAYS) em qualquer lugar
    const urgentCutoff = new Date(Date.now() - URGENT_THRESHOLD_DAYS * 86400000).toISOString()
    const { data: urgentCheck } = await supabase
      .from("territories")
      .select("id")
      .in("status", ["available", "completed"])
      .is("assigned_to", null)
      .or(`last_completed_at.is.null,last_completed_at.lt.${urgentCutoff}`)
      .limit(1)

    const hasUrgent = (urgentCheck?.length ?? 0) > 0

    // Se há territórios urgentes, filtrar candidatos muito recentes
    if (hasUrgent) {
      const restCutoff = new Date(Date.now() - MIN_REST_DAYS * 86400000).toISOString()
      const rested = candidates.filter(
        (t) => !t.last_completed_at || t.last_completed_at < restCutoff
      )
      if (rested.length === 0) return { territory: null, blockedByRecency: true }
      candidates = rested
    }

    if (!candidates.length) return { territory: null, blockedByRecency: false }

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const sixMonthsAgoStr = sixMonthsAgo.toISOString()

    const withCounts = candidates.map((t) => ({
      ...t,
      recentCompletions: ((t.assignments ?? []) as { completed_at: string | null }[]).filter(
        (a) => a.completed_at && a.completed_at >= sixMonthsAgoStr
      ).length,
    }))

    withCounts.sort((a, b) => {
      if (a.last_completed_at === null && b.last_completed_at !== null) return -1
      if (a.last_completed_at !== null && b.last_completed_at === null) return 1
      if (a.last_completed_at && b.last_completed_at) {
        const diff = new Date(a.last_completed_at).getTime() - new Date(b.last_completed_at).getTime()
        if (diff !== 0) return diff
      }
      return a.recentCompletions - b.recentCompletions
    })

    const { assignments: _a, recentCompletions: _r, ...territory } = withCounts[0]
    return { territory: territory as Territory, blockedByRecency: false }
  }, [])

  const findMostUrgentGroup = useCallback(async (): Promise<UrgentGroupSuggestion | null> => {
    const { data } = await supabase
      .from("territories")
      .select("id, group_id, last_completed_at, groups(name)")
      .in("status", ["available", "completed"])
      .is("assigned_to", null)
      .not("group_id", "is", null)
      .order("last_completed_at", { ascending: true, nullsFirst: true })
      .limit(1)

    if (!data?.length) return null
    const t = data[0] as any
    if (!t.group_id) return null

    const days = t.last_completed_at
      ? Math.floor((Date.now() - new Date(t.last_completed_at).getTime()) / 86400000)
      : 9999

    return { groupId: t.group_id, groupName: t.groups?.name ?? "?", days }
  }, [])

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

      const { data: inserted, error: assignError } = await supabase
        .from("assignments")
        .insert({
          territory_id: territoryId,
          user_id: user.id,
          status: "active",
          assigned_at: new Date().toISOString(),
          campaign_id: campaignId,
        })
        .select("id")
        .single()
      if (assignError) throw assignError

      const { data: updatedTerr, error: updateError } = await supabase
        .from("territories")
        .update({ assigned_to: user.id, status: "assigned", campaign_id: campaignId })
        .eq("id", territoryId)
        .select("id")

      if (updateError || !updatedTerr || updatedTerr.length === 0) {
        // Desfaz a designação criada acima para não deixar estado inconsistente
        // (assignment ativo sem o território realmente marcado como designado).
        await supabase.from("assignments").delete().eq("id", inserted.id)
        throw updateError ?? new Error("Não foi possível atualizar o território (0 linhas afetadas).")
      }
    },
    [user?.id]
  )

  return { fetchGroups, fetchAvailableTerritory, findMostUrgentGroup, requestTerritory }
}
