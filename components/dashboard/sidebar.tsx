"use client"

import { useRouter } from "next/navigation"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
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
} from "lucide-react"
import { useState, useCallback } from "react"

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "dirigente", "publicador"],
  },
  {
    title: "Territórios",
    href: "/dashboard/territories",
    icon: Map,
    roles: ["admin", "dirigente"],
  },
  {
    title: "Designações",
    href: "/dashboard/assignments",
    icon: ClipboardList,
    roles: ["admin", "dirigente", "publicador"],
  },
  {
    title: "Campanhas",
    href: "/dashboard/campaigns",
    icon: Calendar,
    roles: ["admin", "dirigente"],
  },
  {
    title: "Usuários",
    href: "/dashboard/users",
    icon: Users,
    roles: ["admin"],
  },
  {
    title: "Relatórios",
    href: "/dashboard/reports",
    icon: FileText,
    roles: ["admin", "dirigente"],
  },
  {
    title: "Configurações",
    href: "/dashboard/settings",
    icon: Settings,
    roles: ["admin"],
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
      // Force full page reload to clear all session data
      window.location.href = "/login"
    } catch {
      setIsSigningOut(false)
    }
  }, [signOut, isSigningOut])

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false)
  }, [])

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 md:hidden bg-card shadow-sm border"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 transform border-r bg-card transition-transform duration-200 ease-in-out md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        role="navigation"
        aria-label="Menu principal"
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 border-b px-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <MapPin className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Territórios</span>
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
                      ? "bg-primary text-primary-foreground"
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
              <Link href="/dashboard/profile" className="text-sm font-medium text-foreground truncate hover:underline">
                {profile?.name || "Usuário"}
              </Link>
              <p className="text-xs text-muted-foreground capitalize">
                {profile?.role === "admin" ? "Administrador" : 
                 profile?.role === "dirigente" ? "Dirigente" : 
                 "Publicador"}
              </p>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-muted"
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
