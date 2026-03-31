"use client"

import { useAuth } from "@/hooks/use-auth"
import { AdminTerritoriesView } from "@/components/dashboard/admin-territories-view"
import { MobileTerritoriesView } from "@/components/dashboard/mobile-territories-view"
import { Loader2 } from "lucide-react"

export default function TerritoriesPage() {
  const { profile, isReady } = useAuth()

  // Enquanto carrega o perfil, mostra loader
  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Admin vê o Dashboard Estratégico completo
  if (profile?.role === "admin") {
    return <AdminTerritoriesView />
  }

  // Dirigente e Publicador vêem a lista otimizada para mobile
  return <MobileTerritoriesView />
}