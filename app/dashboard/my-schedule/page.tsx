"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, CalendarDays, ExternalLink, ChevronLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const supabase = getSupabaseBrowserClient()

export default function MySchedulePage() {
  const { user, isReady } = useAuth()
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchMySchedules = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)

    const now = new Date()
    const start = startOfMonth(now)
    const end = endOfMonth(now)

    const { data, error } = await supabase
      .from('schedules')
      .select(`
        id,
        date,
        arrangement:schedule_arrangements(id, label, start_time)
      `)
      .eq('leader_id', user.id)
      .eq('status', 'published')
      .gte('date', start.toISOString())
      .lte('date', end.toISOString())
      .order('date', { ascending: true })

    if (error) {
      console.error("Error fetching schedules:", error)
    } else {
      setSchedules(data || [])
    }
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    if (isReady) fetchMySchedules()
  }, [isReady, fetchMySchedules])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent pb-24 px-1">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2 h-10 w-10 rounded-full bg-muted/50">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-foreground leading-none">Minhas Escalas</h1>
          <p className="text-[10px] font-black text-primary uppercase tracking-widest mt-1">
            {format(new Date(), "MMMM yyyy", { locale: ptBR })}
          </p>
        </div>
      </div>

      {schedules.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-4 bg-card rounded-2xl border border-dashed border-border px-6 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <div className="space-y-1">
            <p className="text-foreground font-bold">Você não possui escalas este mês</p>
            <p className="text-xs text-muted-foreground">Suas designações aparecerão aqui assim que forem publicadas pelo administrador.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((item) => (
            <div
              key={item.id}
              className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 transition-all hover:border-primary/30 shadow-sm"
            >
              <div className="text-center w-12 shrink-0 border-r border-border pr-4 mr-0">
                <div className="text-2xl font-black text-primary leading-none">
                  {format(parseISO(item.date), "dd")}
                </div>
                <div className="text-[10px] uppercase font-black text-muted-foreground">
                  {format(parseISO(item.date), "eee", { locale: ptBR })}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-0.5">
                  Designação
                </p>
                <p className="text-sm font-bold text-foreground truncate uppercase tracking-tight">
                  {item.arrangement?.label}
                </p>
                <p className="text-xs font-bold text-muted-foreground mt-0.5">
                  {item.arrangement?.start_time.substring(0, 5)}h
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-12 space-y-4">
        <div className="p-4 bg-muted/50 rounded-2xl border border-border text-center">
          <p className="text-xs text-muted-foreground font-medium mb-3">
            Precisa ver a escala de todos os irmãos?
          </p>
          <Button
            variant="outline"
            className="w-full gap-2 font-black text-[11px] uppercase tracking-wider text-foreground border-2 border-border rounded-xl h-11 bg-card hover:bg-muted"
            onClick={() => window.open('https://drive.google.com/drive/folders/13CKIT-W69ZlHwVKV2GJ-Z-EjAcd77zjs?usp=sharing', '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
            Escala Completa (Drive)
          </Button>
        </div>
      </div>
    </div>
  )
}
