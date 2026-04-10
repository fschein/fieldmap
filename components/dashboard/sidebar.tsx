"use client"

import { useRouter } from "next/navigation"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { FieldMapLogo, FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"
import { Button } from "@/components/ui/button"
import {
  MapPin,
  LayoutDashboard,
  Map,
  Users,
  Calendar,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  ClipboardList,
  Group,
  GroupIcon,
  Component,
  User,
} from "lucide-react"
import { useState, useCallback } from "react"
import { NotificationBell } from "@/components/dashboard/notification-bell"
import { A11yControls } from "@/components/dashboard/a11y-controls"

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "supervisor"],
  },
  {
    title: "Territórios",
    href: "/dashboard/territories",
    icon: Map,
    roles: ["admin", "supervisor"],
  },
  {
    title: "Grupos",
    href: "/dashboard/groups",
    icon: Component,
    roles: ["admin"],
  },
  {
    title: "Designações",
    href: "/dashboard/assignments",
    icon: ClipboardList,
    roles: ["admin"],
  },
  {
    title: "Minhas Designações",
    href: "/dashboard/my-assignments",
    icon: MapPin,
    roles: ["admin", "supervisor", "dirigente", "publicador"],
  },
  {
    title: "Campanhas",
    href: "/dashboard/campaigns",
    icon: Calendar,
    roles: ["admin"],
  },
  {
    title: "Gestão de Escalas",
    href: "/dashboard/schedule",
    icon: ClipboardList,
    roles: ["admin"],
  },
  {
    title: "Minha Escala",
    href: "/dashboard/my-schedule",
    icon: ClipboardList,
    roles: ["admin", "supervisor", "dirigente", "publicador"],
  },
  {
    title: "Usuários",
    href: "/dashboard/users",
    icon: Users,
    roles: ["admin"],
  },
  {
    title: "Perfil",
    href: "/dashboard/profile",
    icon: User,
    roles: ["admin", "supervisor", "dirigente", "publicador"],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const filteredNavItems = navItems.filter(
    (item) => profile && item.roles.includes(profile.role)
  )

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return

    setIsSigningOut(true)
    setMobileOpen(false)

    try {
      await signOut()
    } catch (error) {
      console.error("Erro ao invalidar sessão, mas forçando saída:", error)
    } finally {
      localStorage.clear()

      window.location.href = "/login"
    }
  }, [signOut, isSigningOut])

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false)
  }, [])

  const isAdmin = profile?.role === "admin"

  return (
    <>
      {/* Mobile menu button - Only for Admins or if on Map page */}
      {(isAdmin || profile?.role === "supervisor") && (
        <Button
          variant="ghost"
          size="icon"
          className="fixed left-4 top-4 z-[100] md:hidden bg-card shadow-sm border"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      )}

      {/* Overlay - Only for authorized users on mobile */}
      {(isAdmin || profile?.role === "supervisor") && mobileOpen && (
        <div
          className="fixed inset-0 z-[90] bg-background/80 backdrop-blur-sm md:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-[100] h-screen w-64 transform border-r bg-card transition-transform duration-200 ease-in-out md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        role="navigation"
        aria-label="Menu principal"
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between gap-2 border-b border-border px-6">
            <div className="flex items-center gap-2 min-w-0">
              <FieldMapLogoBrand className="h-6 w-6 shrink-0" />
              <span className="font-bold text-foreground tracking-tight text-xl truncate">
                Field<span className="text-primary">Map</span>
              </span>
            </div>
            <div className="shrink-0 flex items-center">
              <A11yControls />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {filteredNavItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobileMenu}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                  {item.title}
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className="border-t p-4">
            <div className="mb-3 px-3">
              <Link href="/dashboard/profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>{profile?.name || profile?.email}</span>
              </Link>
              <p className="text-xs text-muted-foreground capitalize">
                {profile?.role === "admin" ? "Administrador" :
                  profile?.role === "supervisor" ? "Supervisor" :
                    profile?.role === "dirigente" ? "Dirigente" :
                      "Publicador"}
              </p>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {isSigningOut ? "Saindo..." : "Sair"}
            </Button>
          </div>
        </div>
      </aside>
    </>
  )
}
