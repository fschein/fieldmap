"use client"

import { useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, MapPinOff } from "lucide-react"

interface AddDoNotVisitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  territoryId: string
  latitude: number | null
  longitude: number | null
  onSuccess: () => void
}

export function AddDoNotVisitDialog({
  open,
  onOpenChange,
  territoryId,
  latitude,
  longitude,
  onSuccess,
}: AddDoNotVisitDialogProps) {
  const { user } = useAuth()
  const [address, setAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const supabase = getSupabaseBrowserClient()

  const handleSave = async () => {
    if (!latitude || !longitude || !user?.id) return

    setSaving(true)
    try {
      const { error } = await supabase.from("do_not_visits").insert({
        territory_id: territoryId,
        latitude,
        longitude,
        address: address.trim() || null,
        notes: notes.trim() || null,
        created_by: user.id
      })

      if (error) {
        throw error
      }

      setAddress("")
      setNotes("")
      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error("Erro ao adicionar 'Não Visitar':", error)
      alert("Erro ao salvar: " + error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[9999] sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPinOff className="h-5 w-5 text-red-600" />
            Adicionar Não Visitar
          </DialogTitle>
          <DialogDescription>
            Informe os dados da residência que solicitou para não ser visitada.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="address">Endereço (opcional)</Label>
            <Input
              id="address"
              placeholder="Ex: Rua A, Casa 12"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Ex: Morador muito bravo, pediu para nunca bater palma lá."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <div className="text-xs text-muted-foreground bg-slate-50 p-2 rounded border">
            As coordenadas foram capturadas: <br />
            Lat: {latitude?.toFixed(5)} Lng: {longitude?.toFixed(5)}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !latitude || !longitude} className="bg-red-600 hover:bg-red-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
