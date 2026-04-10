"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Loader2, MapPin, RotateCcw, Clock, BellOff, CheckCircle2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

interface Notification {
  id: string
  type: "request" | "returned" | "idle" | "assigned" | "overdue" | "completed"
  title: string
  message: string
  read: boolean
  user_id: string | null
  territory_id: string | null
  created_by: string | null
  created_at: string
}

const TYPE_CONFIG: Record<Notification["type"], { icon: React.ElementType; bg: string; color: string }> = {
  request: { icon: MapPin, bg: "bg-primary/10", color: "text-primary" },
  returned: { icon: RotateCcw, bg: "bg-muted", color: "text-muted-foreground" },
  idle: { icon: Clock, bg: "bg-yellow-500/10", color: "text-yellow-600" },
  assigned: { icon: CheckCircle2, bg: "bg-emerald-500/10", color: "text-emerald-500" },
  completed: { icon: CheckCircle2, bg: "bg-emerald-500/10", color: "text-emerald-500" },
  overdue: { icon: AlertTriangle, bg: "bg-red-500/10", color: "text-red-500" },
}

export default function NotificationsPage() {
  const { user, profile, isReady } = useAuth()
  const supabase = getSupabaseBrowserClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = profile?.role === "admin"

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      let query = supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50)

      // Admin vê todas as notificações. 
      // Dirigente e Publicador vêem apenas as suas (criadas por eles ou destinadas a eles).
      // Admin vê todas as notificações. 
      // Dirigente e Publicador vêem apenas as suas (criadas por eles ou destinadas a eles).
      if (!isAdmin) {
        query = query.or(`created_by.eq.${user.id},user_id.eq.${user.id}`)
      }

      const { data, error } = await query
      if (error) throw error
      setNotifications(data || [])
    } catch (err) {
      console.error("Erro ao carregar notificações:", err)
    } finally {
      setLoading(false)
    }
  }, [user?.id, supabase, isAdmin])

  // Marca todas como lidas ao abrir a tela
  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (!unreadIds.length) return
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [user?.id, supabase, notifications])

  useEffect(() => {
    if (isReady) fetchNotifications()
  }, [isReady, fetchNotifications])

  useEffect(() => {
    if (!loading && notifications.length > 0) markAllAsRead()
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime — nova notificação aparece instantaneamente
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload: { new: Notification }) => {
        const n = payload.new as Notification
        if (!isAdmin && n.created_by !== user.id && n.user_id !== user.id) return
        setNotifications(prev => [n, ...prev])
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, () => {
        fetchNotifications()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/30" />
      </div>
    )
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3 text-muted-foreground">
        <BellOff className="h-9 w-9 opacity-20" />
        <p className="text-sm">Nenhuma notificação por enquanto</p>
      </div>
    )
  }

  const unread = notifications.filter(n => !n.read)
  const read = notifications.filter(n => n.read)

  return (
    <div className="space-y-5 px-4 pt-4 pb-24 max-w-2xl mx-auto">
      <h1 className="text-xl font-extrabold text-foreground tracking-tight">Notificações</h1>

      {/* Não lidos */}
      {unread.length > 0 && (
        <section className="space-y-2">
          <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Não lidos · {unread.length}
          </p>
          <NotificationList items={unread} />
        </section>
      )}

      {/* Anteriores */}
      {read.length > 0 && (
        <section className="space-y-2">
          <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Anteriores
          </p>
          <NotificationList items={read} muted />
        </section>
      )}
    </div>
  )
}

function NotificationList({ items, muted = false }: { items: Notification[]; muted?: boolean }) {
  return (
    <div className="bg-card rounded-xl border border-border divide-y divide-border/50">
      {items.map((notif) => {
        const config = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.request
        const Icon = config.icon

        return (
          <div
            key={notif.id}
            className={cn(
              "flex items-start gap-3 px-3 py-3",
              muted && "opacity-60"
            )}
          >
            {/* Ícone */}
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", config.bg)}>
              <Icon className={cn("h-4 w-4", config.color)} />
            </div>

            {/* Texto */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-snug">{notif.title}</p>
              <p className="text-[0.75rem] text-muted-foreground mt-0.5 leading-snug">{notif.message}</p>
              <p className="text-[0.6875rem] text-muted-foreground/60 mt-1">
                {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: ptBR })}
              </p>
            </div>

            {/* Dot não lido */}
            {!notif.read && (
              <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
            )}
          </div>
        )
      })}
    </div>
  )
}