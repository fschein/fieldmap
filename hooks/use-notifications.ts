"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"

export type NotificationType =
  | "assigned"               // dirigente recebeu território
  | "returned"               // dirigente devolveu sem concluir
  | "completed"              // dirigente concluiu território
  | "overdue"                // território atrasado (sem devolver)
  | "idle_publisher"         // dirigente ficou sem território
  | "completed_subdivisions" // todas quadras concluídas, mas não devolveu
  | "progress_60"            // dirigente passou de 60% do território
  | "request"                // publicador solicitou território
  | "idle"                   // (legado)

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  created_at: string
  created_by?: string
  territory_id?: string
  target_user_id?: string | null
}

export function useNotifications() {
  const supabase = getSupabaseBrowserClient()
  const { user, profile } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const isAdminOrSupervisor =
    profile?.role === "admin" || profile?.role === "supervisor"

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(50)

    if (isAdminOrSupervisor) {
      // Admin vê notificações sem destinatário específico (para todos os admins)
      query = query.is("target_user_id", null)
    } else {
      // Dirigentes e publicadores veem apenas as suas
      query = query.eq("target_user_id", user.id)
    }

    const { data, error } = await query

    if (error) {
      console.error("Erro ao buscar notificações:", error)
    }

    if (!error && data) {
      setNotifications(data as AppNotification[])
      setUnreadCount((data as AppNotification[]).filter((n) => !n.read).length)
    }
    setLoading(false)
  }, [supabase, user?.id, isAdminOrSupervisor])

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
    if (!user?.id) return
    fetchNotifications()

    const channel = supabase
      .channel(`notifications-realtime-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload: { new: AppNotification }) => {
          const newNotif = payload.new as AppNotification
          const isForMe = isAdminOrSupervisor
            ? newNotif.target_user_id === null
            : newNotif.target_user_id === user.id

          if (isForMe) {
            setNotifications((prev) => [newNotif, ...prev])
            setUnreadCount((prev) => prev + 1)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchNotifications, supabase, user?.id, isAdminOrSupervisor])

  return { notifications, unreadCount, loading, fetchNotifications, markAllAsRead, markAsRead }
}
