"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Loader2, Plus, Calendar } from "lucide-react"

export function AssignmentDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  const [publishers, setPublishers] = useState<any[]>([])
  const [territories, setTerritories] = useState<any[]>([])
  
  // Estados do formulário
  const [selectedUser, setSelectedUser] = useState("")
  const [selectedTerritory, setSelectedTerritory] = useState("")
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState("")

  const { profile: currentUser } = useAuth()
  const supabase = getSupabaseBrowserClient()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Busca todos os perfis (ajuste o filtro se quiser apenas dirigentes)
      const { data: userData } = await supabase
        .from("profiles")
        .select("id, name")
        .order("name")
      
      // Busca todos os territórios para permitir registros históricos
      const { data: terrData } = await supabase
        .from("territories")
        .select("id, name, number")
        .order("number")

      setPublishers(userData || [])
      setTerritories(terrData || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (open) fetchData()
  }, [open, fetchData])

  const handleDesignate = async () => {
    if (!selectedUser || !selectedTerritory || !currentUser) return
    setSubmitting(true)
    
    try {
      // Lógica automática: se tem data fim, o status é 'completed'
      const status = endDate ? "completed" : "active"

      const { error } = await supabase.from("assignments").insert({
        territory_id: selectedTerritory,
        user_id: selectedUser,
        assigned_by: currentUser.id,
        status: status,
        assigned_at: new Date(startDate).toISOString(),
        completed_at: endDate ? new Date(endDate).toISOString() : null,
      })

      if (error) throw error
      
      setOpen(false)
      resetForm()
      onSuccess()
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setSelectedUser("")
    setSelectedTerritory("")
    setStartDate(new Date().toISOString().split('T')[0])
    setEndDate("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" /> Designar / Registrar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Designação de Território</DialogTitle>
          <DialogDescription>
            Use para novas designações ou para registrar histórico passado.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs">Território</Label>
            <Select onValueChange={setSelectedTerritory} value={selectedTerritory}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {territories.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.number} - {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Dirigente / Publicador</Label>
            <Select onValueChange={setSelectedUser} value={selectedUser}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {publishers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Data de Início</Label>
              <Input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Data de Fim (Opcional)</Label>
              <Input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className={endDate ? "border-green-500 bg-green-50/30" : ""}
              />
            </div>
          </div>
          
          {endDate && (
            <p className="text-[10px] text-green-600 font-bold uppercase text-center">
              Registro será salvo como Concluído (Histórico)
            </p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleDesignate} disabled={submitting || !selectedUser || !selectedTerritory} className="w-full">
            {submitting ? <Loader2 className="animate-spin h-4 w-4" /> : "Confirmar Registro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}