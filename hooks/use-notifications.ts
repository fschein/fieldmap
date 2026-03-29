"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export interface AppNotification {
  id: string
  type: "request" | "returned" | "idle" | "assigned"
  title: string
  message: string
  read: boolean
  created_at: string
  created_by?: string
  user_id?: string
  territory_id?: string
}

export function useNotifications() {
  const supabase = getSupabaseBrowserClient()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("Erro ao buscar notificações:", error)
    }

    if (!error && data) {
      setNotifications(data as AppNotification[])
      setUnreadCount((data as AppNotification[]).filter((n: AppNotification) => !n.read).length)
    }
    setLoading(false)
  }, [supabase])

  const markAllAsRead = async () => {
    const unread = notifications.map((n) => n.id)
    if (unread.length === 0) return

    await supabase.from("notifications").update({ read: true }).in("id", unread)
    setNotifications([])
    setUnreadCount(0)
  }

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  useEffect(() => {
    fetchNotifications()

    // Realtime updates
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload: { new: AppNotification }) => {
          const newNotif = payload.new as AppNotification
          
          // Check if notification is for current user or everyone
          const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user && (!newNotif.user_id || newNotif.user_id === user.id)) {
              setNotifications((prev) => [newNotif, ...prev])
              setUnreadCount((prev) => prev + 1)
            }
          }
          checkUser()
        }
      )
      .subscribe((status: string) => {
        console.log("Status da inscrição Realtime:", status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchNotifications, supabase])

  return { notifications, unreadCount, loading, fetchNotifications, markAllAsRead, markAsRead }
}
