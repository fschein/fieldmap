"use client"

import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"
import { A11yControls } from "@/components/dashboard/a11y-controls"
import { cn } from "@/lib/utils"
import { usePathname } from "next/navigation"

export function GlobalHeader() {
  const pathname = usePathname()
  const isMapPage = pathname.includes("/map")

  // if (isMapPage) return null // Comentado para permitir que o header apareça no mapa conforme solicitado

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-card/80 backdrop-blur-md border-b md:hidden flex items-center justify-between px-4">
      <div className="w-10" /> {/* Spacer for symmetry if menu button is detached */}

      <div className="flex items-center gap-2">
        <FieldMapLogoBrand className="h-7 w-auto opacity-90" />
        <span className="font-bold text-foreground tracking-tight text-lg">
          Field<span className="text-primary">Map</span>
        </span>
      </div>

      <div className="flex items-center">
        <A11yControls />
      </div>
    </header>
  )
}
