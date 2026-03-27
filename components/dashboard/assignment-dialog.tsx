"use client"

import { useState, useEffect } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Loader2, MapPin, Search, Calendar, CheckCircle2, X } from "lucide-react"
import { toast } from "sonner"

interface AssignmentDialogProps {
  assignment?: any // Se vier, estamos no modo EDIÇÃO
  onSuccess: () => void
  trigger?: React.ReactNode
}

export function AssignmentDialog({ assignment, onSuccess, trigger }: AssignmentDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [territories, setTerritories] = useState<any[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])

  // Custom Search for Users
  const [searchUser, setSearchUser] = useState("")

  // Estados do formulário
  const [selectedTerritory, setSelectedTerritory] = useState("")
  const [selectedProfile, setSelectedProfile] = useState("")
  const [selectedCampaign, setSelectedCampaign] = useState("")

  const formatToday = () => new Date().toISOString().split('T')[0]
  const [assignedAt, setAssignedAt] = useState(formatToday())
  const [endDate, setEndDate] = useState("")

  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    async function loadData() {
      const [tRes, pRes, cRes] = await Promise.all([
        supabase.from("territories").select("id, number, name, campaign_id").order("number"),
        supabase.from("profiles").select("id, name, email").in("role", ["admin", "dirigente", "publicador"]).order("name"),
        supabase.from("campaigns").select("id, name").eq("active", true).order("name")
      ])
      setTerritories(tRes.data || [])

      const loadedProfiles = pRes.data || []
      setProfiles(loadedProfiles)
      setCampaigns(cRes.data || [])

      if (assignment) {
        setSelectedTerritory(assignment.territory_id)
        setSelectedProfile(assignment.user_id)
        setAssignedAt(new Date(assignment.assigned_at).toISOString().split('T')[0])
        setEndDate(assignment.completed_at ? new Date(assignment.completed_at).toISOString().split('T')[0] : "")
        // Pre-fill campaign se encontrar o territorio 
        const t = (tRes.data || []).find((x: any) => x.id === assignment.territory_id)
        if (t && t.campaign_id) setSelectedCampaign(t.campaign_id)

        // Find user name for the search bar
        const user = loadedProfiles.find((p: { id: any }) => p.id === assignment.user_id)
        if (user) setSearchUser(user.name)
      }
    }

    if (open) {
      loadData()
      if (!assignment) {
        setSelectedTerritory("")
        setSelectedProfile("")
        setSelectedCampaign("")
        setSearchUser("")
        setAssignedAt(formatToday())
        setEndDate("")
      }
    }
  }, [open, assignment, supabase])

  const filteredUsers = profiles.filter(u =>
    u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.email.toLowerCase().includes(searchUser.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!selectedTerritory || !selectedProfile || !assignedAt) {
      return toast.error("Preencha todos os campos obrigatórios")
    }

    setLoading(true)

    try {
      const startDateTime = new Date(`${assignedAt}T12:00:00Z`).toISOString()
      const endDateTime = endDate ? new Date(`${endDate}T12:00:00Z`).toISOString() : null
      const isCompleted = !!endDateTime || assignment?.status === 'completed'

      const payload = {
        territory_id: selectedTerritory,
        user_id: selectedProfile,
        assigned_at: startDateTime,
        completed_at: endDateTime,
        status: isCompleted ? 'completed' : 'active'
      }

      if (assignment?.id) {
        // MODO EDIÇÃO
        const { error: err } = await supabase
          .from("assignments")
          .update(payload)
          .eq("id", assignment.id)
        if (err) throw err

        // Atualiza território se necessário
        const tUpdates: any = {}
        if (isCompleted) {
          tUpdates.assigned_to = null
          tUpdates.last_completed_at = endDateTime
        } else {
          tUpdates.assigned_to = selectedProfile
        }
        if (selectedCampaign) {
          tUpdates.campaign_id = selectedCampaign
        } else {
          tUpdates.campaign_id = null
        }
        await supabase.from("territories").update(tUpdates).eq("id", selectedTerritory)
      } else {
        // MODO CRIAÇÃO
        // Fecha previamente qualquer designação antiga que tenha ficado aberta para evitar duplicidade
        if (!isCompleted) {
          await supabase
            .from("assignments")
            .update({ status: 'returned', returned_at: new Date().toISOString() })
            .eq("territory_id", selectedTerritory)
            .eq("status", "active")
        }

        const { error: err } = await supabase
          .from("assignments")
          .insert([payload])
        if (err) throw err

        // Atualiza território
        const tUpdates: any = {}
        if (isCompleted) {
          tUpdates.assigned_to = null
          tUpdates.last_completed_at = endDateTime
        } else {
          tUpdates.assigned_to = selectedProfile
        }
        if (selectedCampaign) {
          tUpdates.campaign_id = selectedCampaign
        } else {
          tUpdates.campaign_id = null
        }
        await supabase.from("territories").update(tUpdates).eq("id", selectedTerritory)
      }

      toast.success(assignment ? "Designação atualizada!" : "Designação salva com sucesso!")
      setOpen(false)
      onSuccess()
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" /> Nova Designação
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden shadow-2xl border-0 rounded-2xl z-[9999]">
        <div className="bg-primary px-6 py-6 pb-8 rounded-t-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <MapPin className="w-24 h-24" />
          </div>
          <DialogHeader className="relative z-10">
            <DialogTitle className="text-2xl text-white font-bold tracking-tight">
              {assignment ? "Editar Designação" : "Designar Território"}
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/80 pt-1 font-medium">
              Registre a retirada ou gere um histórico finalizado.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-6 space-y-5 bg-white -mt-4 rounded-t-2xl relative border-t z-20">
          <div className="space-y-2">
            <Label className="text-slate-700 font-semibold">Território *</Label>
            <select
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:ring-primary focus:border-primary outline-none"
              value={selectedTerritory}
              onChange={(e) => setSelectedTerritory(e.target.value)}
            >
              <option value="">Selecione um território...</option>
              {territories.map(t => (
                <option key={t.id} value={t.id}>[{t.number}] {t.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-700 font-semibold">Publicador Responsável *</Label>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar pelo nome..."
                value={searchUser}
                onChange={(e) => {
                  setSearchUser(e.target.value)
                  if (!e.target.value) setSelectedProfile("") // Limpa se apagar a busca
                }}
                className="pl-9 shadow-sm border-slate-200"
              />
              {searchUser && (
                <button onClick={() => { setSearchUser(""); setSelectedProfile("") }} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>

            {searchUser && !selectedProfile && (
              <div className="border border-slate-200 rounded-lg max-h-[160px] overflow-y-auto shadow-sm mt-1">
                {filteredUsers.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500 text-center">Nenhum usuário encontrado</p>
                ) : (
                  filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setSelectedProfile(user.id)
                        setSearchUser(user.name)
                      }}
                      className="w-full text-left p-3 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                    >
                      <p className="font-semibold text-sm text-slate-800">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-slate-700 font-semibold">Campanha (Opcional)</Label>
            <select
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:ring-primary focus:border-primary outline-none"
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
            >
              <option value="">Nenhuma campanha...</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-700 font-semibold flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-slate-400" /> Início *
              </Label>
              <Input
                type="date"
                value={assignedAt}
                onChange={(e) => setAssignedAt(e.target.value)}
                className="shadow-sm border-slate-200 text-sm"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-slate-400" /> Fim (Opcional)
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="shadow-sm border-slate-200 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="bg-slate-50 px-6 py-4 border-t border-slate-100">
          <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-600">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedTerritory || !selectedProfile || !assignedAt || loading}
            className="px-6 shadow-sm"
          >
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
            ) : endDate ? "Finalizar e Salvar" : "Salvar Designação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}