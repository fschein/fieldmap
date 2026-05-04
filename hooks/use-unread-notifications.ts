"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"

/**
 * Retorna o número de notificações não lidas em tempo real.
 * Admin/supervisor: conta notificações sem target_user_id (globais)
 * Dirigente/publicador: conta apenas as suas (target_user_id = user.id)
 */
export function useUnreadNotifications(): number {
  const { user, profile, isReady } = useAuth()
  const supabase = getSupabaseBrowserClient()
  const [count, setCount] = useState(0)

  const isAdminOrSupervisor =
    profile?.role === "admin" || profile?.role === "supervisor"

  useEffect(() => {
    if (!isReady || !user?.id) return

    const fetchCount = async () => {
      let query = supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("read", false)

      if (isAdminOrSupervisor) {
        query = query.is("target_user_id", null)
      } else {
        query = query.eq("target_user_id", user.id)
      }

      const { count: total } = await query
      setCount(total ?? 0)
    }

    fetchCount()

    const channel = supabase
      .channel(`unread-count-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload: any) => {
          const notif = payload.new as { read: boolean; target_user_id: string | null }
          if (notif.read) return

          const isForMe = isAdminOrSupervisor
            ? notif.target_user_id === null
            : notif.target_user_id === user.id

          if (isForMe) setCount((prev) => prev + 1)
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        () => fetchCount()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isReady, user?.id, isAdminOrSupervisor, supabase])

  return count
}
