"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Users, Clock, CalendarDays, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const supabase = getSupabaseBrowserClient()

const WEEKDAYS = [
  "Domingo", "Segunda", "Terça", "Quarta",
  "Quinta", "Sexta", "Sábado",
]

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleConfig() {
  const [arrangements, setArrangements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Add dialog
  const [isAdding, setIsAdding] = useState(false)
  const [newArr, setNewArr] = useState({
    weekday: "1", start_time: "09:00", label: "Saída de Campo",
  })

  // Leaders dialog
  const [isAssigning, setIsAssigning] = useState(false)
  const [selectedArr, setSelectedArr] = useState<any>(null)
  const [leaders, setLeaders] = useState<any[]>([])
  const [assignedLeaders, setAssignedLeaders] = useState<any[]>([])
  const [newLeader, setNewLeader] = useState({
    profile_id: "", frequency: "2", limitFrequency: false,
  })

  useEffect(() => { fetchData() }, [])

  // ── Data ──────────────────────────────────────────────────────────────────

  async function fetchData() {
    setLoading(true)
    const { data, error } = await supabase
      .from("schedule_arrangements").select("*")
      .order("weekday", { ascending: true }).order("start_time", { ascending: true })
    if (error) toast.error("Erro ao carregar arranjos")
    else setArrangements(data || [])
    setLoading(false)
  }

  async function fetchLeadersForArr(arr: any) {
    setSelectedArr(arr)
    setIsAssigning(true)
    const { data: allLeaders } = await supabase
      .from("profiles").select("id, name").in("role", ["admin", "dirigente"]).order("name")
    setLeaders(allLeaders || [])
    const { data: assigned } = await supabase
      .from("leader_arrangements").select("*, profile:profiles(name)").eq("arrangement_id", arr.id)
    setAssignedLeaders(assigned || [])
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleAdd() {
    const { error } = await supabase.from("schedule_arrangements").insert({
      weekday: parseInt(newArr.weekday),
      start_time: newArr.start_time,
      label: newArr.label,
      is_group_mode: parseInt(newArr.weekday) === 0,
    })
    if (error) toast.error("Erro ao criar arranjo")
    else { toast.success("Arranjo criado"); setIsAdding(false); fetchData() }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este arranjo?")) return
    const { error } = await supabase.from("schedule_arrangements").delete().eq("id", id)
    if (error) toast.error("Erro ao excluir")
    else fetchData()
  }

  async function handleAssignLeader() {
    if (!newLeader.profile_id) return
    const { error } = await supabase.from("leader_arrangements").insert({
      profile_id: newLeader.profile_id,
      arrangement_id: selectedArr.id,
      frequency: newLeader.limitFrequency ? parseInt(newLeader.frequency) : null,
    })
    if (error) {
      if (error.code === "23505") toast.error("Dirigente já está neste arranjo")
      else toast.error("Erro ao atribuir")
    } else {
      toast.success("Dirigente adicionado")
      setNewLeader({ profile_id: "", frequency: "2", limitFrequency: false })
      fetchLeadersForArr(selectedArr)
    }
  }

  async function handleRemoveLeader(id: string) {
    const { error } = await supabase.from("leader_arrangements").delete().eq("id", id)
    if (error) toast.error("Erro ao remover")
    else fetchLeadersForArr(selectedArr)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-2xl mx-auto lg:max-w-full">

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <h1 className="text-[0.9375rem] font-semibold text-foreground leading-tight">Arranjos</h1>
          <p className="text-[0.75rem] text-muted-foreground">Horários fixos de saída de campo</p>
        </div>
        <Button
          onClick={() => setIsAdding(true)}
          className="h-9 px-4 text-sm font-medium gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo arranjo
        </Button>
      </div>

      {/* Arrangement list */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : arrangements.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-xl text-sm text-muted-foreground">
          Nenhum arranjo cadastrado. Clique em "Novo arranjo" para começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {arrangements.map((arr) => (
            <ArrangementCard
              key={arr.id}
              arr={arr}
              onDelete={() => handleDelete(arr.id)}
              onManageLeaders={() => fetchLeadersForArr(arr)}
            />
          ))}
        </div>
      )}

      {/* ── Add dialog ── */}
      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Novo arranjo</DialogTitle>
            <DialogDescription className="text-[0.8125rem]">
              Defina o dia e horário para as saídas de campo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Dia da semana
              </Label>
              <Select
                value={newArr.weekday}
                onValueChange={(val) => setNewArr({ ...newArr, weekday: val })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((day, idx) => (
                    <SelectItem key={idx} value={idx.toString()} className="text-sm">{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Horário
              </Label>
              <Input
                type="time"
                value={newArr.start_time}
                onChange={(e) => setNewArr({ ...newArr, start_time: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Descrição
              </Label>
              <Input
                placeholder="Ex: Saída de Campo, Meio de Semana"
                value={newArr.label}
                onChange={(e) => setNewArr({ ...newArr, label: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsAdding(false)} className="h-9 text-sm">
              Cancelar
            </Button>
            <Button onClick={handleAdd} className="h-9 text-sm">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Leaders dialog ── */}
      <Dialog open={isAssigning} onOpenChange={setIsAssigning}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-border">
            <DialogTitle className="text-base font-semibold">Dirigentes do arranjo</DialogTitle>
            {selectedArr && (
              <p className="text-[0.75rem] text-muted-foreground mt-0.5">
                {WEEKDAYS[selectedArr.weekday]} · {selectedArr.start_time.substring(0, 5)}h · {selectedArr.label}
              </p>
            )}
          </div>

          <div className="overflow-y-auto max-h-[70vh]">
            {/* Add form */}
            <div className="px-5 py-4 space-y-3 border-b border-border bg-muted/30">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Adicionar dirigente
              </p>

              <Select
                value={newLeader.profile_id}
                onValueChange={(val) => setNewLeader({ ...newLeader, profile_id: val })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecionar dirigente..." />
                </SelectTrigger>
                <SelectContent>
                  {leaders.map((l) => (
                    <SelectItem key={l.id} value={l.id} className="text-sm">{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.75rem] font-medium text-foreground">Limitar frequência</p>
                  <p className="text-[0.625rem] text-muted-foreground mt-0.5">Máximo de vezes por mês</p>
                </div>
                <Switch
                  checked={newLeader.limitFrequency}
                  onCheckedChange={(val) => setNewLeader({ ...newLeader, limitFrequency: val })}
                />
              </div>

              {newLeader.limitFrequency && (
                <Select
                  value={newLeader.frequency}
                  onValueChange={(val) => setNewLeader({ ...newLeader, frequency: val })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-sm">
                        {n}× por mês
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                className="w-full h-9 text-sm gap-1.5"
                onClick={handleAssignLeader}
                disabled={!newLeader.profile_id}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>

            {/* Assigned list */}
            <div className="divide-y divide-border">
              {assignedLeaders.length === 0 ? (
                <p className="py-8 text-center text-[0.8125rem] text-muted-foreground">
                  Nenhum dirigente atribuído ainda.
                </p>
              ) : (
                assignedLeaders.map((al) => (
                  <div
                    key={al.id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-[0.625rem] font-medium text-muted-foreground shrink-0">
                      {al.profile.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.8125rem] font-medium text-foreground truncate">{al.profile.name}</p>
                      <p className="text-[0.625rem] text-muted-foreground">
                        {al.frequency ? `${al.frequency}× por mês` : "Frequência ilimitada"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveLeader(al.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="px-5 py-3 border-t border-border">
            <Button
              variant="ghost"
              className="w-full h-9 text-sm"
              onClick={() => setIsAssigning(false)}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── ArrangementCard ──────────────────────────────────────────────────────────

function ArrangementCard({
  arr, onDelete, onManageLeaders,
}: {
  arr: any
  onDelete: () => void
  onManageLeaders: () => void
}) {
  const isGroup = arr.is_group_mode
  const time = arr.start_time.substring(0, 5) + "h"

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden group">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
        <span className={cn(
          "text-[0.625rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border",
          arr.weekday === 0
            ? "bg-primary/10 text-primary border-primary/20"
            : "bg-muted text-muted-foreground border-border"
        )}>
          {WEEKDAYS[arr.weekday]}
        </span>
        {isGroup && (
          <span className="text-[0.5625rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 ml-auto">
            Grupo
          </span>
        )}
        <button
          onClick={onDelete}
          className={cn(
            "w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors shrink-0",
            isGroup ? "" : "ml-auto"
          )}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-[0.8125rem] font-medium text-foreground">{arr.label}</p>
        <div className="flex items-center gap-1 mt-1">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[0.75rem] text-muted-foreground font-mono">{time}</span>
        </div>
      </div>

      {/* Footer — only for non-group */}
      {!isGroup && (
        <div className="px-4 pb-3">
          <button
            onClick={onManageLeaders}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-muted/60 hover:bg-muted border border-border text-[0.75rem] font-medium text-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              Dirigentes
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  )
}