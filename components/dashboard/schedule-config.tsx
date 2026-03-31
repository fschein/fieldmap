"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Users, Clock, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

const supabase = getSupabaseBrowserClient()

const weekdays = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", 
  "Quinta-feira", "Sexta-feira", "Sábado"
]

export function ScheduleConfig() {
  const [arrangements, setArrangements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [newArr, setNewArr] = useState({ weekday: "1", start_time: "09:00", label: "Saída de Campo", is_group_mode: false })
  
  // Leader Assignment State
  const [isAssigning, setIsAssigning] = useState(false)
  const [selectedArr, setSelectedArr] = useState<any>(null)
  const [leaders, setLeaders] = useState<any[]>([])
  const [assignedLeaders, setAssignedLeaders] = useState<any[]>([])
  const [newLeader, setNewLeader] = useState({ profile_id: "", frequency: "2", limitFrequency: false })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('schedule_arrangements')
      .select('*')
      .order('weekday', { ascending: true })
      .order('start_time', { ascending: true })
    
    if (error) {
      toast.error("Erro ao carregar arranjos")
    } else {
      setArrangements(data || [])
    }
    setLoading(false)
  }

  async function fetchLeadersForArr(arr: any) {
    setSelectedArr(arr)
    setIsAssigning(true)
    
    // Fetch all available leaders
    const { data: allLeaders } = await supabase
      .from('profiles')
      .select('id, name')
      .in('role', ['admin', 'dirigente'])
      .order('name')
    setLeaders(allLeaders || [])

    // Fetch leaders already assigned to this slot
    const { data: assigned } = await supabase
      .from('leader_arrangements')
      .select(`
        *,
        profile:profiles(name)
      `)
      .eq('arrangement_id', arr.id)
    setAssignedLeaders(assigned || [])
  }

  async function handleAdd() {
    const { error } = await supabase
      .from('schedule_arrangements')
      .insert({
        weekday: parseInt(newArr.weekday),
        start_time: newArr.start_time,
        label: newArr.label,
        is_group_mode: parseInt(newArr.weekday) === 0 // Sunday is group mode
      })
    
    if (error) {
      toast.error("Erro ao criar arranjo")
    } else {
      toast.success("Arranjo criado com sucesso")
      setIsAdding(false)
      fetchData()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este arranjo?")) return

    const { error } = await supabase
      .from('schedule_arrangements')
      .delete()
      .eq('id', id)
    
    if (error) {
      toast.error("Erro ao excluir")
    } else {
      fetchData()
    }
  }

  async function handleAssignLeader() {
    if (!newLeader.profile_id) return

    const frequencyVal = newLeader.limitFrequency ? parseInt(newLeader.frequency) : null

    const { error } = await supabase
      .from('leader_arrangements')
      .insert({
        profile_id: newLeader.profile_id,
        arrangement_id: selectedArr.id,
        frequency: frequencyVal
      })
    
    if (error) {
      if (error.code === '23505') toast.error("Este dirigente já está neste arranjo")
      else toast.error("Erro ao atribuir dirigente")
    } else {
      toast.success("Dirigente atribuído")
      setNewLeader({ profile_id: "", frequency: "2", limitFrequency: false })
      fetchLeadersForArr(selectedArr)
    }
  }

  async function handleRemoveLeader(id: string) {
    const { error } = await supabase
      .from('leader_arrangements')
      .delete()
      .eq('id', id)
    
    if (error) toast.error("Erro ao remover")
    else fetchLeadersForArr(selectedArr)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Arranjos (Horários Fixos)
        </h2>
        <Button onClick={() => setIsAdding(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Arranjo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <p>Carregando...</p>
        ) : arrangements.length === 0 ? (
          <Card className="col-span-full p-8 text-center border-dashed">
            <p className="text-muted-foreground italic">Nenhum arranjo cadastrado.</p>
          </Card>
        ) : (
          arrangements.map((arr) => (
            <Card key={arr.id} className="overflow-hidden border-2 hover:border-primary/20 transition-colors">
              <CardHeader className="bg-muted/50 pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant={arr.weekday === 0 ? "default" : "outline"} className="font-bold">
                    {weekdays[arr.weekday]}
                  </Badge>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(arr.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardTitle className="text-lg mt-2">{arr.label}</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-lg">{arr.start_time.substring(0, 5)}h</span>
                </div>
                {arr.is_group_mode && (
                  <Badge variant="secondary" className="bg-acid text-acid-foreground font-black uppercase text-[10px]">Modo Grupo</Badge>
                )}
                {!arr.is_group_mode && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 font-bold"
                    onClick={() => fetchLeadersForArr(arr)}
                  >
                    <Users className="h-4 w-4" />
                    Dirigentes
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Arranjo</DialogTitle>
            <DialogDescription>
              Defina um dia da semana e horário para as saídas de campo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="weekday">Dia da Semana</Label>
              <Select value={newArr.weekday} onValueChange={(val) => setNewArr({...newArr, weekday: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o dia" />
                </SelectTrigger>
                <SelectContent>
                  {weekdays.map((day, idx) => (
                    <SelectItem key={idx} value={idx.toString()}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="start_time">Horário</Label>
              <Input 
                id="start_time" 
                type="time" 
                value={newArr.start_time} 
                onChange={(e) => setNewArr({...newArr, start_time: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="label">Descrição (Opcional)</Label>
              <Input 
                id="label" 
                placeholder="Ex: Saída de Campo, Meio de Semana" 
                value={newArr.label} 
                onChange={(e) => setNewArr({...newArr, label: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAdding(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Salvar Arranjo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAssigning} onOpenChange={setIsAssigning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dirigentes do Arranjo</DialogTitle>
            <DialogDescription>
              {selectedArr && `${weekdays[selectedArr.weekday]} às ${selectedArr.start_time.substring(0, 5)}h`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <div className="grid gap-2">
                <Label>Dirigente</Label>
                <Select value={newLeader.profile_id} onValueChange={(val) => setNewLeader({...newLeader, profile_id: val})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar dirigente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leaders.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Limitar Frequência</Label>
                  <p className="text-[10px] text-muted-foreground italic">Se desativado, será ilimitado.</p>
                </div>
                <Switch 
                  checked={newLeader.limitFrequency} 
                  onCheckedChange={(val) => setNewLeader({...newLeader, limitFrequency: val})} 
                />
              </div>

              {newLeader.limitFrequency && (
                <div className="grid gap-2">
                  <Label>Máximo por mês</Label>
                  <Select value={newLeader.frequency} onValueChange={(val) => setNewLeader({...newLeader, frequency: val})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Freq." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1x por mês</SelectItem>
                      <SelectItem value="2">2x por mês</SelectItem>
                      <SelectItem value="3">3x por mês</SelectItem>
                      <SelectItem value="4">4x por mês</SelectItem>
                      <SelectItem value="5">5x por mês</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button className="w-full gap-2" onClick={handleAssignLeader}>
                <Plus className="h-4 w-4" />
                Adicionar ao Arranjo
              </Button>
            </div>

            <div className="border rounded-lg divide-y">
              {assignedLeaders.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground italic">Nenhum dirigente atribuído.</p>
              ) : (
                assignedLeaders.map(al => (
                  <div key={al.id} className="flex items-center justify-between p-3 bg-card">
                    <div>
                      <p className="text-sm font-bold">{al.profile.name}</p>
                      <Badge variant="outline" className="text-[10px] h-4">
                        {al.frequency ? `Freq: ${al.frequency}x/mês` : "Freq: Ilimitada"}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveLeader(al.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssigning(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

