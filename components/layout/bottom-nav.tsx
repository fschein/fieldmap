"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, MapPin, Bell, User } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
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
  // {
  //   label: "Notificações",
  //   href: "/dashboard/notifications",
  //   icon: Bell,
  // },
  {
    label: "Perfil",
    href: "/dashboard/profile",
    icon: User,
  },
]

interface BottomNavProps {
  unreadCount?: number
}

export function BottomNav({ unreadCount = 0 }: BottomNavProps) {
  const pathname = usePathname()

  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 safe-area-pb md:hidden shadow-[0_-1px_10px_rgba(0,0,0,0.05)]">
      <div className="flex h-16">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href)
          const Icon = item.icon
          const isNotifications = item.href === "/dashboard/notifications"

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 transition-all active:scale-95",
                active
                  ? "text-[#C65D3B]"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn("h-6 w-6 transition-transform", active && "scale-110")}
                  strokeWidth={active ? 2.5 : 2}
                />
                {/* {isNotifications && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C65D3B] opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#C65D3B] border-2 border-white shadow-sm" />
                  </span>
                )} */}
              </div>
              <span
                className={cn(
                  "text-[12px] font-bold leading-none transition-colors",
                  active ? "text-[#C65D3B]" : "text-slate-400"
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
