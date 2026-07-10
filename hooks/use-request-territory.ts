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
}

export interface UrgentGroupSuggestion {
  groupId: string
  groupName: string
  days: number
}

export function useRequestTerritory() {
  const { user } = useAuth()

  const fetchGroups = useCallback(async (): Promise<Group[]> => {
    const { data } = await supabase.from("groups").select("*").order("name")
    return (data as Group[]) ?? []
  }, [])

  const fetchAvailableTerritory = useCallback(async (
    selector: { groupId: string; territoryType?: never } | { territoryType: string; groupId?: never },
    campaign?: { id: string; startDate: string } | null
  ): Promise<FetchAvailableResult> => {
    let query = supabase
      .from("territories")
      .select("*, assignments(id, completed_at)")
      .in("status", ["available", "completed"])
      .is("assigned_to", null)

    if (selector.groupId) query = query.eq("group_id", selector.groupId)
    else if (selector.territoryType) query = query.eq("type", selector.territoryType)

    const { data, error } = await query

    if (error || !data?.length) return { territory: null, blockedByRecency: false }

    let candidates = data as any[]

    if (campaign) {
      const { data: covered } = await supabase
        .from("assignments")
        .select("territory_id")
        .eq("campaign_id", campaign.id)
        .in("status", ["completed", "active"])

      const coveredIds = new Set((covered ?? []).map((a: { territory_id: string }) => a.territory_id))
      candidates = candidates.filter((t) => !coveredIds.has(t.id))
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

      const { error: updateError } = await supabase
        .from("territories")
        .update({ assigned_to: user.id, status: "assigned", campaign_id: campaignId })
        .eq("id", territoryId)

      if (updateError) {
        // Desfaz a designação criada acima para não deixar estado inconsistente
        // (assignment ativo sem o território realmente marcado como designado).
        await supabase.from("assignments").delete().eq("id", inserted.id)
        throw updateError
      }
    },
    [user?.id]
  )

  return { fetchGroups, fetchAvailableTerritory, findMostUrgentGroup, requestTerritory }
}
