"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, User, Clock, MapPin, ChevronLeft, ChevronRight } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"

const supabase = getSupabaseBrowserClient()

export function ScheduleCalendar({ 
  currentMonth, 
  setCurrentMonth 
}: { 
  currentMonth: Date, 
  setCurrentMonth: (date: Date) => void 
}) {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSchedules = useCallback(async () => {
    setLoading(true)
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)

    const { data, error } = await supabase
      .from('schedules')
      .select(`
        *,
        arrangement:schedule_arrangements(*),
        leader:profiles(name),
        territory:territories(number, name)
      `)
      .eq('status', 'published')
      .gte('date', start.toISOString())
      .lte('date', end.toISOString())
      .order('date', { ascending: true })

    if (error) {
       console.error("Erro ao carregar escala:", error.message || error)
    } else {
      setSchedules(data || [])
    }
    setLoading(false)
  }, [currentMonth])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-card p-4 rounded-xl border-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2 min-w-[200px] justify-center">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        <div className="hidden md:block">
          <Badge variant="outline" className="px-3 py-1 font-black uppercase text-[10px] tracking-widest border-2">
            Escala Publicada
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 flex justify-center italic text-muted-foreground">Carregando escala mensal...</div>
        ) : schedules.length === 0 ? (
          <Card className="col-span-full p-20 text-center border-dashed border-2 bg-muted/5">
            <p className="text-muted-foreground text-lg italic">Nenhuma escala publicada para este mês.</p>
          </Card>
        ) : (
          schedules.map((item) => (
            <Card key={item.id} className="relative overflow-hidden group border-2 hover:border-primary/40 transition-all shadow-sm">
              <div className="absolute top-0 right-0 p-3">
                <Badge className="bg-primary text-white border-none text-[10px] uppercase font-black px-2 py-0.5 rounded-sm">
                  {format(parseISO(item.date), "EEEE", { locale: ptBR })}
                </Badge>
              </div>
              <CardHeader className="pb-2 pt-4">
                <div className="relative z-10">
                   <div className="text-3xl font-black tracking-tighter text-foreground mb-0">
                      {format(parseISO(item.date), "dd")}
                   </div>
                   <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mt-0">
                    {item.arrangement.label}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                <div className="flex items-center gap-3 bg-muted/30 p-2.5 rounded-lg border border-muted">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center border-2 border-background shrink-0">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-sm uppercase tracking-tight truncate">
                      {item.leader?.name || (item.arrangement.is_group_mode ? "Quem puder participa" : "Pendente")}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-bold flex items-center gap-1 uppercase">
                      <Clock className="h-3 w-3" />
                      {item.arrangement.start_time.substring(0, 5)}h
                    </p>
                  </div>
                </div>
                
                {item.arrangement.is_group_mode && (
                  <div className="pt-3 border-t-2 border-dashed space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-black text-acid-foreground bg-acid px-2 py-1 rounded-sm w-fit uppercase">
                      <MapPin className="h-3 w-3" />
                      Território do Grupo
                    </div>
                    {item.territory ? (
                      <div className="text-sm font-black flex items-center gap-2 p-2 bg-muted/50 rounded border border-muted transition-colors group-hover:bg-primary/5">
                        <span className="text-primary bg-primary/10 px-1.5 py-0.5 rounded">T{item.territory.number}</span>
                        <span className="truncate">{item.territory.name}</span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic px-2">Aguardando definição automática</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
