"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"
import { Button } from "@/components/ui/button"
import {
  IconLayoutDashboard,
  IconMap2,
  IconStack2,
  IconSubtask,
  IconMapPinCheck,
  IconSpeakerphone,
  IconCalendarStats,
  IconCalendarUser,
  IconUsersGroup,
  IconUserCircle,
  IconLogout,
  IconMapPins,
} from "@tabler/icons-react"
import { Menu, X } from "lucide-react"
import { useState, useCallback } from "react"
import { NotificationBell } from "@/components/dashboard/notification-bell"
import { A11yControls } from "@/components/dashboard/a11y-controls"

type Role = "admin" | "supervisor" | "dirigente" | "publicador"

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
  roles: Role[]
}

interface NavSection {
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Geral",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: IconLayoutDashboard, roles: ["admin", "supervisor"] },
      { title: "Territórios", href: "/dashboard/territories", icon: IconMap2, roles: ["admin", "supervisor"] },
      { title: "Mapa Geral", href: "/dashboard/map", icon: IconMapPins, roles: ["admin", "supervisor"] },
    ],
  },
  {
    label: "Organização",
    items: [
      { title: "Grupos", href: "/dashboard/groups", icon: IconStack2, roles: ["admin"] },
      { title: "Designações", href: "/dashboard/assignments", icon: IconSubtask, roles: ["admin"] },
      { title: "Minhas Designações", href: "/dashboard/my-assignments", icon: IconMapPinCheck, roles: ["admin", "supervisor", "dirigente", "publicador"] },
      { title: "Campanhas", href: "/dashboard/campaigns", icon: IconSpeakerphone, roles: ["admin"] },
    ],
  },
  {
    label: "Escala",
    items: [
      { title: "Gestão de Escalas", href: "/dashboard/schedule", icon: IconCalendarStats, roles: ["admin"] },
      { title: "Minha Escala", href: "/dashboard/my-schedule", icon: IconCalendarUser, roles: ["admin", "supervisor", "dirigente", "publicador"] },
    ],
  },
]

const FOOTER_ITEMS: NavItem[] = [
  { title: "Usuários", href: "/dashboard/users", icon: IconUsersGroup, roles: ["admin"] },
  { title: "Perfil", href: "/dashboard/profile", icon: IconUserCircle, roles: ["admin", "supervisor", "dirigente", "publicador"] },
]

function NavLink({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-[10px] rounded-r-md border-l-[3px] py-2 pl-[9px] pr-3 text-sm transition-colors duration-150",
        isActive
          ? "border-l-primary bg-primary/[0.07] text-primary font-medium"
          : "border-l-transparent text-muted-foreground hover:bg-muted hover:text-foreground font-normal"
      )}
    >
      <item.icon size={16} className="shrink-0" aria-hidden />
      {item.title}
    </Link>
  )
}

function SectionGroup({
  section,
  visibleItems,
  pathname,
  onLinkClick,
}: {
  section: NavSection
  visibleItems: NavItem[]
  pathname: string
  onLinkClick: () => void
}) {
  return (
    <div className="space-y-0.5">
      <p className="px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground select-none">
        {section.label}
      </p>
      {visibleItems.map(item => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href))
        return (
          <NavLink key={item.href} item={item} isActive={isActive} onClick={onLinkClick} />
        )
      })}
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const userRole = profile?.role as Role | undefined

  const filterItems = (items: NavItem[]) =>
    userRole ? items.filter(item => item.roles.includes(userRole)) : []

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    setMobileOpen(false)
    try {
      await signOut()
    } catch (error) {
      console.error("Erro ao sair:", error)
    } finally {
      localStorage.clear()
      window.location.href = "/login"
    }
  }, [signOut, isSigningOut])

  const closeMobileMenu = useCallback(() => setMobileOpen(false), [])

  return (
    <>
      {/* Mobile toggle — supervisor only */}
      {profile?.role === "supervisor" && (
        <Button
          variant="ghost"
          size="icon"
          className="fixed left-4 top-4 z-[100] md:hidden bg-card shadow-sm border"
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      )}

      {/* Backdrop */}
      {profile?.role === "supervisor" && mobileOpen && (
        <div
          className="fixed inset-0 z-[90] bg-background/80 backdrop-blur-sm md:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-[100] h-screen w-56 border-r bg-card transition-transform duration-200 ease-in-out md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        role="navigation"
        aria-label="Menu principal"
      >
        <div className="flex h-full flex-col overflow-hidden">

          {/* Logo */}
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
            <div className="flex items-center gap-2 shrink-0">
              <FieldMapLogoBrand className="h-6 w-6 shrink-0" />
              <span className="font-bold text-foreground tracking-tight text-xl">
                Field<span className="text-primary">Map</span>
              </span>
            </div>
            <div className="shrink-0 hidden md:flex items-center gap-1">
              <NotificationBell />
              <A11yControls />
            </div>
          </div>

          {/* Main nav */}
          <nav className="flex-1 overflow-y-auto py-3 pr-2">
            <div className="space-y-0">
              {NAV_SECTIONS.map((section, idx) => {
                const visible = filterItems(section.items)
                if (visible.length === 0) return null
                return (
                  <div key={section.label}>
                    {idx > 0 && <div className="my-2 border-t border-border" />}
                    <SectionGroup
                      section={section}
                      visibleItems={visible}
                      pathname={pathname}
                      onLinkClick={closeMobileMenu}
                    />
                  </div>
                )
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="shrink-0 border-t border-border">
            <nav className="py-2 pr-2">
              {filterItems(FOOTER_ITEMS).map(item => {
                const isActive = pathname === item.href || pathname.startsWith(item.href)
                return (
                  <NavLink key={item.href} item={item} isActive={isActive} onClick={closeMobileMenu} />
                )
              })}
            </nav>

            <div className="border-t border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground leading-tight">
                {profile?.name || profile?.email}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                {profile?.role === "admin" ? "Administrador" :
                 profile?.role === "supervisor" ? "Supervisor" :
                 profile?.role === "dirigente" ? "Dirigente" : "Publicador"}
              </p>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="flex items-center gap-[10px] text-sm text-muted-foreground hover:text-destructive transition-colors duration-150 disabled:opacity-50"
              >
                <IconLogout size={16} className="shrink-0" aria-hidden />
                {isSigningOut ? "Saindo..." : "Sair"}
              </button>
            </div>
          </div>

        </div>
      </aside>
    </>
  )
}
