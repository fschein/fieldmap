"use client"

import { useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Territory, Group } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"

const supabase = getSupabaseBrowserClient()

export function useRequestTerritory() {
  const { user } = useAuth()

  const fetchGroups = useCallback(async (): Promise<Group[]> => {
    const { data } = await supabase.from("groups").select("*").order("name")
    return (data as Group[]) ?? []
  }, [])

  const fetchAvailableTerritory = useCallback(async (groupId: string): Promise<Territory | null> => {
    const { data, error } = await supabase
      .from("territories")
      .select("*, assignments(id, completed_at)")
      .eq("group_id", groupId)
      .in("status", ["available", "completed"])
      .is("assigned_to", null)

    if (error || !data?.length) return null

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const sixMonthsAgoStr = sixMonthsAgo.toISOString()

    const withCounts = (data as any[]).map((t) => ({
      ...t,
      recentCompletions: ((t.assignments ?? []) as { completed_at: string | null }[]).filter(
        (a) => a.completed_at && a.completed_at >= sixMonthsAgoStr
      ).length,
    }))

    withCounts.sort((a, b) => {
      // 1. Nunca trabalhado primeiro
      if (a.last_completed_at === null && b.last_completed_at !== null) return -1
      if (a.last_completed_at !== null && b.last_completed_at === null) return 1
      // 2. Mais antigo primeiro
      if (a.last_completed_at && b.last_completed_at) {
        const diff =
          new Date(a.last_completed_at).getTime() - new Date(b.last_completed_at).getTime()
        if (diff !== 0) return diff
      }
      // 3. Menos repetições recentes primeiro
      return a.recentCompletions - b.recentCompletions
    })

    const { assignments: _a, recentCompletions: _r, ...territory } = withCounts[0]
    return territory as Territory
  }, [])

  const requestTerritory = useCallback(
    async (territoryId: string): Promise<void> => {
      if (!user?.id) throw new Error("Usuário não autenticado")

      const { error: assignError } = await supabase.from("assignments").insert({
        territory_id: territoryId,
        user_id: user.id,
        status: "active",
        assigned_at: new Date().toISOString(),
      })
      if (assignError) throw assignError

      const { error: updateError } = await supabase
        .from("territories")
        .update({ assigned_to: user.id, status: "assigned" })
        .eq("id", territoryId)
      if (updateError) throw updateError
    },
    [user?.id]
  )

  return { fetchGroups, fetchAvailableTerritory, requestTerritory }
}
