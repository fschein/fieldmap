"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, MapPin, ClipboardList, User, LayoutDashboard, ChevronUp, Map, Component, Calendar, Users, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export function BottomNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname()
  const { isSupervisor, isAdmin, signOut } = useAuth()
  const [sheetOpen, setSheetOpen] = useState(false)

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href))

  if (isAdmin) {
    const adminMainItems = [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Territórios", href: "/dashboard/territories", icon: Map },
      { label: "Designações", href: "/dashboard/assignments", icon: ClipboardList },
    ]

    const adminMoreItems = [
      { label: "Grupos", href: "/dashboard/groups", icon: Component },
      { label: "Campanhas", href: "/dashboard/campaigns", icon: Calendar },
      { label: "Gestão de Escalas", href: "/dashboard/schedule", icon: ClipboardList },
      { label: "Minhas Designações", href: "/dashboard/my-assignments", icon: MapPin },
      { label: "Minha Escala", href: "/dashboard/my-schedule", icon: ClipboardList },
      { label: "Usuários", href: "/dashboard/users", icon: Users },
      { label: "Perfil", href: "/dashboard/profile", icon: User },
    ]

    const handleSignOut = async () => {
      setSheetOpen(false)
      await signOut()
    }

    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-pb md:hidden shadow-[0_-1px_10px_rgba(0,0,0,0.1)] dark:shadow-[0_-1px_10px_rgba(0,0,0,0.5)]">
        <div className="flex h-16">
          {adminMainItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 transition-all active:scale-95",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="relative">
                  <Icon className={cn("h-6 w-6 transition-transform", active && "scale-110")} strokeWidth={active ? 2.5 : 2} />
                </div>
                <span className={cn("text-[0.625rem] font-bold leading-none transition-colors", active ? "text-primary" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </Link>
            )
          })}
          
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className="flex flex-1 flex-col items-center justify-center gap-1 transition-all active:scale-95 text-muted-foreground hover:text-foreground"
              >
                <div className="relative">
                  <ChevronUp className="h-6 w-6 transition-transform" strokeWidth={2} />
                </div>
                <span className="text-[0.625rem] font-bold leading-none transition-colors text-muted-foreground">
                  Mais
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl px-4 pt-6 pb-8 h-[85vh] max-h-[85vh] flex flex-col gap-0 border-t" showCloseButton={false}>
              <SheetHeader className="mb-4 flex-row items-center justify-between">
                <SheetTitle className="text-xl">Menu Geral</SheetTitle>
                <button onClick={() => setSheetOpen(false)} className="p-2 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground">
                   <ChevronUp className="h-5 w-5 rotate-180" />
                </button>
              </SheetHeader>
              <div className="overflow-y-auto flex-1 pb-4 -mx-2 px-2">
                <div className="grid grid-cols-1 gap-2">
                  {adminMoreItems.map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSheetOpen(false)}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-xl transition-colors",
                          active ? "bg-primary text-primary-foreground" : "bg-muted/30 hover:bg-muted/60 text-foreground"
                        )}
                      >
                        <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} />
                        <span className="font-semibold text-base">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
                
                <div className="mt-6 border-t pt-4">
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-4 p-4 rounded-xl transition-colors bg-destructive/10 text-destructive hover:bg-destructive/20"
                  >
                    <LogOut className="h-6 w-6" />
                    <span className="font-semibold text-base">Sair</span>
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    )
  }

  const navItems = [
    { label: "Início", href: "/dashboard/my-assignments", icon: Home },
    { label: "Territórios", href: "/dashboard/territories", icon: MapPin },
    { label: "Escala", href: "/dashboard/my-schedule", icon: ClipboardList },
  ]

  if (isSupervisor) {
    navItems.push({ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard })
  }

  navItems.push({ label: "Perfil", href: "/dashboard/profile", icon: User })

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
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className={cn("h-6 w-6 transition-transform", active && "scale-110")} strokeWidth={active ? 2.5 : 2} />
              </div>
              <span className={cn("text-[0.625rem] font-bold leading-none transition-colors", active ? "text-primary" : "text-muted-foreground")}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
