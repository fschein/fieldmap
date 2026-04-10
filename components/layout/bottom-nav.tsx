"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, MapPin, ClipboardList, User, LayoutDashboard } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"

export function BottomNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname()
  const { isSupervisor } = useAuth()

  const navItems = [
    {
      label: "Início",
      href: "/dashboard/my-assignments",
      icon: Home,
    },
    {
      label: "Territórios",
      href: "/dashboard/territories",
      icon: MapPin,
    },
    {
      label: "Escala",
      href: "/dashboard/my-schedule",
      icon: ClipboardList,
    },
  ]

  if (isSupervisor) {
    navItems.push({
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    })
  }

  navItems.push({
    label: "Perfil",
    href: "/dashboard/profile",
    icon: User,
  })

  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-pb md:hidden shadow-[0_-1px_10px_rgba(0,0,0,0.1)] dark:shadow-[0_-1px_10px_rgba(0,0,0,0.5)]">
      <div className="flex h-16">
        {navItems.map((item) => {
          const active = isActive(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 transition-all active:scale-95",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn("h-6 w-6 transition-transform", active && "scale-110")}
                  strokeWidth={active ? 2.5 : 2}
                />
              </div>
              <span
                className={cn(
                  "text-[0.625rem] font-bold leading-none transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
