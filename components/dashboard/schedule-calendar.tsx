import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, User, Clock, MapPin, ChevronLeft, ChevronRight, PlusCircle, LayoutDashboard, BookmarkCheck, CheckCircle2 } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, isSameDay, addDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AssignmentCreateModal } from "@/components/dashboard/assignment-create-modal"

const supabase = getSupabaseBrowserClient()

export function ScheduleCalendar({ 
  currentMonth, 
  setCurrentMonth 
}: { 
  currentMonth: Date, 
  setCurrentMonth: (date: Date) => void 
}) {
  const [schedules, setSchedules] = useState<any[]>([])
  const [activeAssignments, setActiveAssignments] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [designationModalOpen, setDesignationModalOpen] = useState(false)
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null)

  const fetchSchedules = useCallback(async () => {
    setLoading(true)
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)

    const { data: scheduleData, error: scheduleError } = await supabase
      .from('schedules')
      .select(`
        *,
        arrangement:schedule_arrangements(*),
        leader:profiles(id, name),
        territory:territories(id, number, name)
      `)
      .eq('status', 'published')
      .gte('date', start.toISOString())
      .lte('date', end.toISOString())
      .order('date', { ascending: true })

    if (scheduleError) {
       console.error("Erro ao carregar escala:", scheduleError.message || scheduleError)
    } else {
      const result = scheduleData || []
      setSchedules(result)

      // Fetch active assignments for all leaders in this schedule
      const leaderIds = result
        .map((s: any) => s.leader?.id)
        .filter(Boolean) as string[]

      if (leaderIds.length > 0) {
        const { data: assignmentsData } = await supabase
          .from('territories')
          .select('assigned_to')
          .in('assigned_to', leaderIds)

        const assignmentMap: Record<string, boolean> = {}
        assignmentsData?.forEach((a: any) => {
          if (a.assigned_to) assignmentMap[a.assigned_to] = true
        })
        setActiveAssignments(assignmentMap)
      }
    }
    setLoading(false)
  }, [currentMonth])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  const tomorrow = useMemo(() => addDays(new Date(), 1), [])

  return (
    <div className="space-y-6">
      {/* Month Selector - Mobile Compact */}
      <div className="flex items-center justify-between bg-card p-2 sm:p-4 rounded-2xl border border-border shadow-sm">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 sm:h-10 sm:w-10 rounded-full hover:bg-muted"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <div className="text-center">
          <h2 className="text-sm sm:text-lg font-black uppercase tracking-tighter text-foreground flex items-center justify-center gap-2">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <div className="md:hidden">
            <span className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-widest">
              Escala Publicada
            </span>
          </div>
        </div>

        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 sm:h-10 sm:w-10 rounded-full hover:bg-muted"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Grid view on desktop, List view on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
        {loading ? (
          <div className="col-span-full py-20 flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sincronizando Escala...</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="col-span-full p-20 text-center border-dashed border-2 rounded-3xl bg-muted/5 flex flex-col items-center gap-4">
            <LayoutDashboard className="h-12 w-12 text-muted-foreground/20" />
            <p className="text-muted-foreground text-sm font-medium italic">Nenhuma escala publicada para este mês.</p>
          </div>
        ) : (
          schedules.map((item) => {
            const itemDate = parseISO(item.date)
            const isNext = isSameDay(itemDate, tomorrow)
            const hasAssignment = item.leader?.id ? activeAssignments[item.leader.id] : false
            const canAssign = item.leader?.id && !hasAssignment && !item.arrangement.is_group_mode

            return (
              <div 
                key={item.id} 
                className={cn(
                  "relative group border border-border rounded-2xl p-4 transition-all duration-200",
                  "flex flex-row md:flex-col items-center md:items-start gap-4 md:gap-3",
                  isNext ? "bg-primary/5 border-primary shadow-md ring-1 ring-primary/20 scale-[1.02] z-10" : "bg-card hover:border-primary/30",
                )}
              >
                {/* Date Circle/Block */}
                <div className={cn(
                  "flex flex-col items-center justify-center h-14 w-14 sm:h-16 sm:w-16 shrink-0 transition-all duration-300 shadow-inner",
                  isNext 
                    ? "bg-primary text-primary-foreground rounded-full ring-4 ring-primary/20 scale-110" 
                    : "bg-muted/30 text-foreground border border-border/50 rounded-2xl"
                )}>
                  <span className="text-xl sm:text-2xl font-black tracking-tighter leading-none">{format(itemDate, "dd")}</span>
                  <span className="text-[9px] uppercase font-black opacity-80">{format(itemDate, "EEE", { locale: ptBR })}</span>
                </div>

                {/* Content Area */}
                <div className="flex-1 min-w-0 flex flex-col gap-1 w-full">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate opacity-80">
                      {item.arrangement.label}
                    </h3>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground shrink-0 uppercase">
                      <Clock className="h-3 w-3" />
                      {item.arrangement.start_time.substring(0, 5)}h
                    </div>
                  </div>

                  <div className="flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                    <p className="font-bold text-sm sm:text-lg tracking-tight truncate leading-tight">
                      {item.leader?.name || (item.arrangement.is_group_mode ? "Grupo Master" : "Sem dirigente")}
                    </p>
                    {hasAssignment && !item.arrangement.is_group_mode && (
                      <BookmarkCheck className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>

                  {/* Smart Actions / Info */}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {item.arrangement.is_group_mode ? (
                      <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 rounded-lg border border-primary/20 text-[10px] font-black text-primary uppercase">
                        <MapPin className="h-3 w-3" />
                        {item.territory ? `Focar: T${item.territory.number}` : "Modo Domingo"}
                      </div>
                    ) : (
                      <>
                        {hasAssignment ? (
                          <div className="text-[10px] font-bold text-muted-foreground italic flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-primary" />
                            Com território
                          </div>
                        ) : canAssign ? (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2 text-[10px] font-black uppercase tracking-wider text-primary hover:text-primary hover:bg-primary/10 gap-1.5 rounded-lg border border-primary/20 transition-all active:scale-95"
                            onClick={() => {
                              setSelectedLeaderId(item.leader.id)
                              setDesignationModalOpen(true)
                            }}
                          >
                            <PlusCircle className="h-3.5 w-3.5" />
                            Designar Agora
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/40 italic">Sem dirigente definido</span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Visual Accent for Desk */}
                <div className={cn(
                  "hidden md:block absolute bottom-0 left-0 h-1 transition-all rounded-full mx-4 mb-0",
                  isNext ? "bg-primary w-[calc(100%-32px)]" : "bg-transparent group-hover:bg-primary/20 w-8"
                )} />
              </div>
            )
          })
        )}
      </div>

      <AssignmentCreateModal
        open={designationModalOpen}
        onOpenChange={setDesignationModalOpen}
        preselectedPublisherId={selectedLeaderId || undefined}
        onSuccess={() => {
          fetchSchedules()
          setDesignationModalOpen(false)
        }}
      />
    </div>
  )
}
