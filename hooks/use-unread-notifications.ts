"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"

/**
 * Retorna o número de notificações não lidas em tempo real.
 * Usar no DashboardLayout para passar como prop ao BottomNav.
 */
export function useUnreadNotifications(): number {
  const { user, profile, isReady } = useAuth()
  const supabase = getSupabaseBrowserClient()
  const [count, setCount] = useState(0)

  const isAdminOrDirigente =
    profile?.role === "admin" || profile?.role === "dirigente"

  useEffect(() => {
    if (!isReady || !user?.id) return

    // Busca inicial
    const fetchCount = async () => {
      let query = supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("read", false)

      // Se for Publicador, só conta as notificações dele (ex: confirmações de pedidos)
      // Nota: No banco, 'created_by' pode ser o ID do usuário que gerou a notificação.
      // Dependendo da lógica de negócio, pode ser necessário filtrar por outro campo.
      if (!isAdminOrDirigente) {
        query = query.eq("created_by", user.id)
      }

      const { count: total } = await query
      setCount(total ?? 0)
    }

    fetchCount()

    // Realtime — incrementa ao receber novo INSERT não lido
    const channel = supabase
      .channel("unread-count")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload: any) => {
          const notif = payload.new as { read: boolean; created_by: string }
          if (notif.read) return
          if (!isAdminOrDirigente && notif.created_by !== user.id) return
          setCount((prev) => prev + 1)
        }
      )
      // Sincroniza quando houver updates (ex: marcar como lido)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        () => {
          fetchCount()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isReady, user?.id, isAdminOrDirigente, supabase])

  return count
}
