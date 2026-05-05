"use client"

import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"
import { A11yControls } from "@/components/dashboard/a11y-controls"
import { cn } from "@/lib/utils"
import { usePathname } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { NotificationBell } from "@/components/dashboard/notification-bell"

export function GlobalHeader() {
  const pathname = usePathname()
  const { profile } = useAuth()
  const isMapPage = pathname.includes("/map")

  // if (isMapPage) return null // Comentado para permitir que o header apareça no mapa conforme solicitado

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-background/80 backdrop-blur-lg border-b border-border/50 md:hidden flex items-center justify-between px-4">
      <div className={cn("flex items-center gap-2", profile?.role === "supervisor" ? "ml-12" : "")}>
        <FieldMapLogoBrand className="h-7 w-auto opacity-90" />
        <span className="font-bold text-foreground tracking-tight text-lg">
          Field<span className="text-primary">Map</span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <NotificationBell />
        <A11yControls />
      </div>
    </header>
  )
}
