"use client"

import React, { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { PushSubscriptionManager } from "@/components/dashboard/push-subscription-manager"
import { useUnreadNotifications } from "@/hooks/use-unread-notifications"
import { BottomNav } from "@/components/layout/bottom-nav"

const BOTTOM_NAV_ROLES = ["dirigente", "publicador"]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { loading, user, profile, isReady } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [shouldRender, setShouldRender] = useState(false)
  const unreadCount = useUnreadNotifications()

  useEffect(() => {
    // Aguarda até que a autenticação esteja pronta
    if (!isReady) return

    // Se não há usuário e já está pronto, redireciona
    if (!user) {
      router.replace("/login")
      return
    }

    // REDIRECIONAMENTO PARA TROCA DE SENHA OBRIGATÓRIA
    // Se o perfil carregou e deve trocar a senha, mas não está na página de setup
    if (profile?.must_change_password && pathname !== "/dashboard/setup-password") {
      router.replace("/dashboard/setup-password")
      return
    }

    // Se NÃO precisa trocar a senha mas está na página de setup, sai de lá
    if (profile && !profile.must_change_password && pathname === "/dashboard/setup-password") {
      router.replace("/dashboard/my-assignments")
      return
    }

    // Se há usuário, pode renderizar
    setShouldRender(true)

    // Atualiza o last_seen_at uma vez por sessão/dia
    const updateLastSeen = async () => {
      if (!user?.id) return
      
      const lastSeenUpdate = sessionStorage.getItem(`last_seen_${user.id}`)
      const today = new Date().toDateString()
      
      if (lastSeenUpdate === today) return
      
      const supabase = getSupabaseBrowserClient()
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", user.id)
      
      sessionStorage.setItem(`last_seen_${user.id}`, today)
    }
    
    updateLastSeen()
  }, [isReady, user, profile, pathname, router])

  // Estado de carregamento inicial
  if (!isReady || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  // Não renderiza até confirmar que tem usuário
  if (!shouldRender || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const isSetupPage = pathname === "/dashboard/setup-password"
  const isMapPage = pathname.includes("/map")
  const showBottomNav = !isSetupPage && !isMapPage && profile?.role && BOTTOM_NAV_ROLES.includes(profile.role)

  return (
    <div className="min-h-screen bg-slate-50">
      {!isSetupPage && <Sidebar />}
      <main className={cn(
        !isSetupPage && "md:ml-64",
        showBottomNav && "pb-16 md:pb-0"
      )}>
        <div className={cn(
          "container mx-auto p-2 pt-20 md:pt-6",
          isSetupPage && "pt-6",
          isMapPage && "p-0 pt-0" // Removendo padding do container no mapa para ser edge-to-edge
        )}>
          <PushSubscriptionManager />
          {children}
        </div>
      </main>

      {/* Bottom Nav visível apenas para Dirigentes e Publicadores no mobile, e se não for página de setup/mapa */}
      {showBottomNav && (
        <BottomNav unreadCount={unreadCount} />
      )}
    </div>
  )
}