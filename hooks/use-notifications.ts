"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export interface AppNotification {
  id: string
  type: "request" | "returned" | "idle"
  title: string
  message: string
  read: boolean
  created_at: string
  created_by?: string
  territory_id?: string
}

export function useNotifications() {
  const supabase = getSupabaseBrowserClient()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("Erro ao buscar notificações:", error)
    }

    if (!error && data) {
      console.log("Notificações carregadas:", data.length)
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
          console.log("Nova notificação recebida via Realtime:", payload.new)
          const newNotif = payload.new as AppNotification
          setNotifications((prev) => [newNotif, ...prev])
          setUnreadCount((prev) => prev + 1)
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
