"use client"

import { useRouter } from "next/navigation"
import { Bell, CheckCheck, MapPin, ArrowDownToLine, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useNotifications, AppNotification } from "@/hooks/use-notifications"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

function NotifIcon({ type }: { type: AppNotification["type"] }) {
  if (type === "request") return <MapPin className="h-4 w-4 text-blue-500" />
  if (type === "returned") return <ArrowDownToLine className="h-4 w-4 text-emerald-500" />
  if (type === "idle") return <UserX className="h-4 w-4 text-amber-500" />
  if (type === "assigned") return <MapPin className="h-4 w-4 text-primary" />
  return <Bell className="h-4 w-4 text-muted-foreground" />
}

export function NotificationBell() {
  const { profile } = useAuth()
  const { notifications, unreadCount, loading, markAllAsRead, markAsRead } = useNotifications()
  const router = useRouter()

  // Only show to admins and dirigentes
  if (!profile || !["admin", "dirigente"].includes(profile.role)) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[0.625rem] font-bold text-primary-foreground shadow-sm animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0 shadow-xl border-border rounded-xl overflow-hidden bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
          <h3 className="font-bold text-sm text-foreground">Notificações</h3>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas como lidas
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[22rem] overflow-y-auto divide-y divide-border">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="h-8 w-8 mx-auto text-muted mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma notificação ainda.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={async () => {
                  await markAsRead(notif.id)
                  if (notif.type === "request") {
                    router.push("/dashboard/assignments")
                  } else if (notif.type === "returned" && notif.territory_id) {
                    router.push(`/dashboard/territories/${notif.territory_id}`)
                  } else if (notif.type === "assigned") {
                    router.push("/dashboard/my-assignments")
                  }
                }}
                className={cn(
                  "w-full text-left flex items-start gap-3 p-3.5 transition-colors hover:bg-muted",
                  !notif.read && "bg-primary/5"
                )}
              >
                <span className={cn(
                  "mt-0.5 p-1.5 rounded-full shrink-0",
                  notif.type === "request" && "bg-primary/10",
                  notif.type === "returned" && "bg-emerald-500/10",
                  notif.type === "idle" && "bg-amber-500/10",
                  notif.type === "assigned" && "bg-primary/10",
                )}>
                  <NotifIcon type={notif.type} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs text-foreground line-clamp-1">{notif.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{notif.message}</p>
                  <p className="text-[0.625rem] text-muted-foreground mt-1">
                    {new Date(notif.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {!notif.read && (
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
