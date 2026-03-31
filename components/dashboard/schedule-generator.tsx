"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Wand2, RefreshCw, Check, MapPin, Loader2, Info, Trash2, CalendarDays, UserCheck, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { selectBestLeader, ScheduleItem as EngineScheduleItem } from "@/lib/utils/scheduling-engine"
import { toast } from "sonner"
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

const supabase = getSupabaseBrowserClient()

interface ScheduleItem {
  id: string
  date: string
  arrangement_id: string
  leader_id: string | null
  territory_id: string | null
  status: 'draft' | 'published' | 'manual'
  arrangement: {
    id: string
    label: string
    start_time: string
    is_group_mode: boolean
  }
  leader?: { name: string }
  territory?: { number: string, name: string }
}

export function ScheduleGenerator() {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [drafts, setDrafts] = useState<ScheduleItem[]>([])
  const [month, setMonth] = useState(format(addMonths(new Date(), 1), "yyyy-MM"))
  const [leaders, setLeaders] = useState<{id: string, name: string}[]>([])
  const [leaderArrs, setLeaderArrs] = useState<{profile_id: string, arrangement_id: string}[]>([])
  
  // Engine Options
  const [avoidSameWeek, setAvoidSameWeek] = useState(true)
  const [prioritizeInterval, setPrioritizeInterval] = useState(true)

  const fetchExistingDrafts = useCallback(async () => {
// ... existing fetchExistingDrafts ...
    setLoading(true)
    const [year, monthNum] = month.split('-')
    const start = startOfMonth(new Date(parseInt(year), parseInt(monthNum) - 1))
    const end = endOfMonth(start)

    const { data, error } = await supabase
      .from('schedules')
      .select(`
        *,
        arrangement:schedule_arrangements(*),
        leader:profiles(name),
        territory:territories(number, name)
      `)
      .gte('date', start.toISOString())
      .lte('date', end.toISOString())
      .order('date', { ascending: true })

    if (error) {
      console.error("fetchExistingDrafts:", error.message)
    } else {
      setDrafts(data || [])
    }
    setLoading(false)
  }, [month])

  useEffect(() => {
    async function fetchLeaders() {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('role', ['admin', 'dirigente'])
        .order('name')
      setLeaders(profiles || [])

      const { data: mappings } = await supabase
        .from('leader_arrangements')
        .select('profile_id, arrangement_id')
      setLeaderArrs(mappings || [])
    }

    fetchLeaders()
    fetchExistingDrafts()
  }, [month, fetchExistingDrafts])

  // Grouping logic (by arrangement)
  const groupedDrafts = useMemo(() => {
    const groups: Record<string, ScheduleItem[]> = {}
    drafts.forEach(d => {
      const gKey = d.arrangement_id
      if (!groups[gKey]) groups[gKey] = []
      groups[gKey].push(d)
    })
    return groups
  }, [drafts])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const { data: arrangements } = await supabase.from('schedule_arrangements').select('*')
      if (!arrangements?.length) {
        toast.error("Nenhum arranjo configurado")
        return
      }

      const { data: leaderArrs } = await supabase
        .from('leader_arrangements')
        .select('profile_id, arrangement_id, frequency')

      const [year, monthNum] = month.split('-')
      const start = startOfMonth(new Date(parseInt(year), parseInt(monthNum) - 1))
      const end = endOfMonth(start)
      const days = eachDayOfInterval({ start, end })

      const newSchedules: any[] = []
      
      // Temporary local store of assignments for the engine
      let localSchedules: EngineScheduleItem[] = drafts.map(d => ({
        date: d.date,
        arrangement_id: d.arrangement_id,
        leader_id: d.leader_id,
        territory_id: d.territory_id,
        status: d.status
      }))

      // Track the last leader selected for each specific slot (arrangement_id)
      const slotLastLeaders: Record<string, string | null> = {}
      
      // Seed with existing drafts if needed, but usually we want to alternate from the NEW generation
      // For now, only tracking during the loop is enough to avoid A,A,A

      const { data: availableTerritories } = await supabase
        .from('territories')
        .select('id, number, name')
        .eq('status', 'available')
        .is('assigned_to', null)
        .order('last_completed_at', { ascending: true, nullsFirst: true })
      
      let territoryIdx = 0

      for (const day of days) {
        const dateStr = format(day, "yyyy-MM-dd")
        const weekday = getDay(day)
        const dayArrangements = arrangements.filter((a: any) => a.weekday === weekday)

        for (const arr of dayArrangements) {
          const existing = drafts.find((d: ScheduleItem) => d.date === dateStr && d.arrangement_id === arr.id)
          if (existing) {
            if (existing.leader_id) slotLastLeaders[arr.id] = existing.leader_id
            continue
          }

          let selectedLeaderId = null
          let selectedTerritoryId = null

          if (arr.is_group_mode) {
            if (availableTerritories && territoryIdx < availableTerritories.length) {
              selectedTerritoryId = availableTerritories[territoryIdx].id
              territoryIdx++
            }
          } else {
            const candidates = (leaderArrs?.filter((la: any) => la.arrangement_id === arr.id) || []).map((c: any) => ({
              profile_id: c.profile_id,
              arrangement_id: c.arrangement_id,
              frequency: c.frequency
            }))

            selectedLeaderId = selectBestLeader(
              dateStr,
              arr.id,
              candidates,
              localSchedules,
              { avoidSameWeek, prioritizeInterval },
              slotLastLeaders[arr.id] || null
            )

            // Update history for this slot
            if (selectedLeaderId) {
              slotLastLeaders[arr.id] = selectedLeaderId
            }
          }

          const newItem: any = {
            date: dateStr,
            arrangement_id: arr.id,
            leader_id: selectedLeaderId,
            territory_id: selectedTerritoryId,
            status: 'draft'
          }
          newSchedules.push(newItem)
          localSchedules.push(newItem)
        }
      }

      if (newSchedules.length > 0) {
        const { error } = await supabase.from('schedules').insert(newSchedules)
        if (error) throw new Error(error.message)
        toast.success(`${newSchedules.length} novos rascunhos gerados`)
        fetchExistingDrafts()
      } else {
        toast.info("Nenhum novo dia disponível para gerar")
      }
    } catch (error: any) {
      console.error("Gerador:", error.message || error)
      toast.error(`Erro ao gerar: ${error.message}`)
    } finally {
      setGenerating(false)
    }
  }

  async function handleClearDrafts() {
    if (!confirm("Isso removerá todos os rascunhos (não publicados) deste mês. Continuar?")) return
    
    setLoading(true)
    const [year, monthNum] = month.split('-')
    const start = startOfMonth(new Date(parseInt(year), parseInt(monthNum) - 1))
    const end = endOfMonth(start)

    const { error } = await supabase
      .from('schedules')
      .delete()
      .gte('date', start.toISOString())
      .lte('date', end.toISOString())
      .eq('status', 'draft')

    if (error) {
      toast.error("Erro ao limpar rascunhos")
    } else {
      toast.success("Rascunhos removidos")
      fetchExistingDrafts()
    }
    setLoading(false)
  }

  async function handlePublish() {
    if (!confirm("Deseja publicar toda a escala deste mês?")) return
    setLoading(true)
    const [year, monthNum] = month.split('-')
    const start = startOfMonth(new Date(parseInt(year), parseInt(monthNum) - 1))
    const end = endOfMonth(start)

    const { error } = await supabase
      .from('schedules')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .gte('date', start.toISOString())
      .lte('date', end.toISOString())
      .in('status', ['draft', 'manual'])

    if (error) {
      toast.error("Erro ao publicar")
    } else {
      toast.success("Escala publicada!")
      fetchExistingDrafts()
    }
    setLoading(false)
  }

  return (
    <div className="space-y-8">
      <Card className="border-2 border-primary/20 bg-muted/30">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-black uppercase tracking-tighter">Motor de Escala</CardTitle>
            <CardDescription>Gerencie o rascunho mensal e as designações.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[180px] font-bold">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={format(new Date(), "yyyy-MM")}>{format(new Date(), "MMMM yyyy", { locale: ptBR })}</SelectItem>
                <SelectItem value={format(addMonths(new Date(), 1), "yyyy-MM")}>{format(addMonths(new Date(), 1), "MMMM yyyy", { locale: ptBR })}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleGenerate} disabled={generating || loading} className="gap-2 bg-primary font-black uppercase text-xs">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Gerar
            </Button>
            <Button variant="destructive" onClick={handleClearDrafts} disabled={loading} className="gap-2 font-black uppercase text-xs">
              <Trash2 className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="border-t bg-background/50 py-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-xs font-black uppercase tracking-widest">Evitar repetir na semana</Label>
              <p className="text-[10px] text-muted-foreground italic">Evita escalar o mesmo dirigente duas vezes na mesma semana.</p>
            </div>
            <Switch checked={avoidSameWeek} onCheckedChange={setAvoidSameWeek} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-xs font-black uppercase tracking-widest">Priorizar intervalo</Label>
              <p className="text-[10px] text-muted-foreground italic">Prefere dar intervalo de pelo menos uma semana entre escalas.</p>
            </div>
            <Switch checked={prioritizeInterval} onCheckedChange={setPrioritizeInterval} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Rascunho por Arranjo
        </h3>
        <Button size="sm" onClick={handlePublish} disabled={loading || drafts.length === 0} className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700">
          <Check className="h-4 w-4" />
          Publicar Tudo
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {Object.entries(groupedDrafts).length === 0 && !loading ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl italic text-muted-foreground">
            Clique em "Gerar" para criar o rascunho de {format(parseISO(month + "-01"), "MMMM", { locale: ptBR })}.
          </div>
        ) : (
          Object.entries(groupedDrafts).map(([arrId, items]) => {
            const arr = items[0].arrangement
            return (
              <Card key={arrId} className="border-2 shadow-none overflow-hidden bg-card/50">
                <div className="bg-muted px-4 py-3 flex items-center justify-between border-b-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="font-black uppercase text-[12px] tracking-widest">{arr.label}</span>
                  </div>
                  <Badge variant="outline" className="font-black text-[10px] border-2 bg-background">
                    {arr.start_time.substring(0, 5)}h
                  </Badge>
                </div>
                <CardContent className="p-0">
                  <div className="divide-y divide-muted/50 text-sm">
                    {items.map((item) => (
                      <div key={item.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="text-center w-12 shrink-0">
                            <div className="text-2xl font-black leading-none">{format(parseISO(item.date), "dd")}</div>
                            <div className="text-[10px] uppercase font-black text-muted-foreground">{format(parseISO(item.date), "eee", { locale: ptBR })}</div>
                          </div>
                          <div className="h-8 w-px bg-muted" />
                          <div className="min-w-0">
                            {arr.is_group_mode ? (
                              <div className="space-y-1">
                                <span className="text-[10px] font-black uppercase text-acid-foreground bg-acid px-1.5 py-0.5 rounded leading-none">Modo Grupo</span>
                                {item.territory && (
                                  <div className="font-bold flex items-center gap-1 text-[12px]">
                                    <span className="text-primary italic">T{item.territory.number}</span>
                                    <span className="truncate">{item.territory.name}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Select 
                                value={item.leader_id || "none"} 
                                onValueChange={async (val) => {
                                  const { error } = await supabase
                                    .from('schedules')
                                    .update({ leader_id: val === "none" ? null : val, status: 'manual' })
                                    .eq('id', item.id)
                                  if (!error) fetchExistingDrafts()
                                }}
                              >
                                <SelectTrigger className="h-8 w-[200px] font-bold border-2 text-[12px]">
                                  <SelectValue placeholder="Pendente" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="font-bold">Pendente</SelectItem>
                                  {leaders
                                    .filter(l => leaderArrs.some(la => la.profile_id === l.id && la.arrangement_id === item.arrangement_id))
                                    .map(l => (
                                      <SelectItem key={l.id} value={l.id} className="font-bold">{l.name}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-end md:self-auto">
                           {item.status === 'manual' && (
                             <Badge className="text-[8px] font-black tracking-widest bg-primary/10 text-primary border-none h-4 px-1 uppercase">Manual</Badge>
                           )}
                           <Badge variant={item.status === 'published' ? 'default' : 'outline'} className="text-[9px] font-black h-5 border-2">
                             {item.status === 'published' ? 'PUBLICADO' : 'RASCUNHO'}
                           </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
