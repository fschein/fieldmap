"use client"

import { useState, useEffect } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { getLocalTodayStr, toLocalISOString } from "@/lib/date-utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Search, AlertTriangle, Clock } from "lucide-react"
import { toast } from "sonner"

interface Territory {
  id: string
  name: string
  number: string
  color: string
  assigned_to: string | null
  assignedName?: string | null
  daysInField?: number | null
  last_completed_at: string | null
  urgencyDays: number
}

interface Publisher {
  id: string
  name: string
}

interface AssignmentCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedTerritoryId?: string | null
  onSuccess: () => void
}

export function AssignmentCreateModal({
  open,
  onOpenChange,
  preselectedTerritoryId = null,
  onSuccess,
}: AssignmentCreateModalProps) {
  const supabase = getSupabaseBrowserClient()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [territories, setTerritories] = useState<Territory[]>([])
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; start_date?: string | null; end_date?: string | null }[]>([])

  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>("")
  const [selectedPublisherId, setSelectedPublisherId] = useState<string>("")
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("")
  const [startDate, setStartDate] = useState(getLocalTodayStr())
  const [endDate, setEndDate] = useState("")
  const [searchTerritory, setSearchTerritory] = useState("")
  const [searchPublisher, setSearchPublisher] = useState("")

  useEffect(() => {
    if (open) {
      setSelectedTerritoryId(preselectedTerritoryId || "")
      setSelectedPublisherId("")
      setSelectedCampaignId("")
      setStartDate(getLocalTodayStr())
      setEndDate("")
      setSearchTerritory("")
      setSearchPublisher("")
      loadData()
    }
  }, [open, preselectedTerritoryId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [terrRes, pubRes, campRes, activeAssignmentsRes] = await Promise.all([
        supabase
          .from("territories")
          .select("id, name, number, color, assigned_to, last_completed_at")
          .order("number"),
        supabase
          .from("profiles")
          .select("id, name")
          .in("role", ["admin", "publicador", "dirigente"])
          .order("name"),
        supabase
          .from("campaigns")
          .select("id, name, start_date, end_date")
          .eq("active", true)
          .order("name"),
        supabase
          .from("assignments")
          .select("territory_id, assigned_at")
          .eq("status", "active")
      ])

      if (terrRes.data && activeAssignmentsRes.data) {
        const activeAssigs = activeAssignmentsRes.data || []
        const mapped: Territory[] = terrRes.data.map((t: any) => {
          const now = new Date().getTime()
          let urgencyDays = 0
          if (t.last_completed_at) {
            urgencyDays = Math.floor(
              (now - new Date(t.last_completed_at).getTime()) / (1000 * 60 * 60 * 24)
            )
          } else {
            urgencyDays = 9999 // Nunca concluído = máxima urgência
          }

          let assignedName = null
          if (t.assigned_to && pubRes.data) {
            const pub = pubRes.data.find((p: any) => p.id === t.assigned_to)
            assignedName = pub ? pub.name : "Alguém"
          }

          let daysInField = null
          if (t.assigned_to) {
            const activeA = activeAssigs.find((a: any) => a.territory_id === t.id)
            if (activeA?.assigned_at) {
              const start = new Date(activeA.assigned_at).getTime()
              daysInField = Math.floor((now - start) / (1000 * 60 * 60 * 24))
            }
          }

          return { ...t, urgencyDays, assignedName, daysInField }
        })

        // Ordenar: disponíveis primeiro, depois por urgência decrescente
        mapped.sort((a, b) => {
          if (!a.assigned_to && b.assigned_to) return -1
          if (a.assigned_to && !b.assigned_to) return 1
          return b.urgencyDays - a.urgencyDays
        })

        setTerritories(mapped)
      }

      if (pubRes.data) setPublishers(pubRes.data)
      if (campRes.data) {
        const campsData = campRes.data as any[]
        setCampaigns(campsData)

        // Auto-selecionar campanha atual baseada na data de HOJE
        const today = new Date()
        const currentCampaign = campsData.find(c => {
          if (!c.start_date) return false
          const start = new Date(c.start_date + "T00:00:00")
          const end = c.end_date ? new Date(c.end_date + "T23:59:59") : null
          return today >= start && (!end || today <= end)
        })

        if (currentCampaign) {
          setSelectedCampaignId(currentCampaign.id)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const filteredTerritories = territories.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerritory.toLowerCase()) ||
      t.number.includes(searchTerritory)
  )

  const filteredPublishers = publishers.filter((p) =>
    p.name.toLowerCase().includes(searchPublisher.toLowerCase())
  )

  const selectedTerr = territories.find((t) => t.id === selectedTerritoryId)
  const selectedPub = publishers.find((p) => p.id === selectedPublisherId)

  const handleSave = async () => {
    if (!selectedTerritoryId) {
      toast.error("Selecione um território")
      return
    }
    if (!selectedPublisherId) {
      toast.error("Selecione um publicador")
      return
    }
    if (!startDate) {
      toast.error("Data de início é obrigatória")
      return
    }

    setSaving(true)
    try {
      const startISO = toLocalISOString(startDate)
      const endISO = toLocalISOString(endDate)
      const isCompleted = !!endISO

      if (!isCompleted) {
        await supabase
          .from("assignments")
          .update({ status: 'returned', returned_at: new Date().toISOString() })
          .eq("territory_id", selectedTerritoryId)
          .eq("status", "active")
      }

      const { error: assignErr } = await supabase.from("assignments").insert({
        territory_id: selectedTerritoryId,
        user_id: selectedPublisherId,
        campaign_id: selectedCampaignId || null,
        status: isCompleted ? "completed" : "active",
        assigned_at: startISO,
        completed_at: endISO,
      })

      if (assignErr) throw assignErr

      // Atualiza o territory
      const terrUpdate: any = {}
      if (isCompleted) {
        terrUpdate.assigned_to = null
        terrUpdate.last_completed_at = endISO
      } else {
        terrUpdate.assigned_to = selectedPublisherId
      }
      if (selectedCampaignId) {
        terrUpdate.campaign_id = selectedCampaignId
      } else {
        terrUpdate.campaign_id = null
      }

      await supabase
        .from("territories")
        .update(terrUpdate)
        .eq("id", selectedTerritoryId)

      // Enviar notificação push se não for histórico
      if (!isCompleted) {
        fetch("/api/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: selectedPublisherId,
            title: "Novo Território!",
            message: `Você recebeu o território ${selectedTerr?.number} - ${selectedTerr?.name}.`,
            url: `/dashboard/my-assignments/${selectedTerritoryId}/map`
          })
        }).catch(err => console.error("Erro ao disparar push:", err))
      }

      toast.success(
        isCompleted
          ? "Designação histórica salva com sucesso!"
          : `${selectedTerr?.name} designado para ${selectedPub?.name}`
      )
      onOpenChange(false)
      onSuccess()
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || "Erro desconhecido"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Designação</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Resumo da Seleção */}
            {(selectedTerr || selectedPub) && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm space-y-1">
                {selectedTerr && (
                  <p>
                    <span className="text-slate-500">Território:</span>{" "}
                    <strong>{selectedTerr.name}</strong>{" "}
                    <span className="text-slate-400">#{selectedTerr.number}</span>
                    {selectedTerr.assigned_to && (
                      <span className="ml-2 text-xs text-orange-600 font-medium">
                        (já em campo)
                      </span>
                    )}
                  </p>
                )}
                {selectedPub && (
                  <p>
                    <span className="text-slate-500">Publicador:</span>{" "}
                    <strong>{selectedPub.name}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Território */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Território</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Buscar por nome ou número..."
                  className="pl-8 h-8 text-sm"
                  value={searchTerritory}
                  onChange={(e) => setSearchTerritory(e.target.value)}
                />
              </div>
              <div className="border rounded-lg max-h-[160px] overflow-y-auto divide-y">
                {filteredTerritories.length === 0 && (
                  <p className="text-center text-sm text-slate-400 py-4">
                    Nenhum território encontrado
                  </p>
                )}
                {filteredTerritories.map((t) => (
                  <button
                    key={t.id}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${
                      selectedTerritoryId === t.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}
                    onClick={() => setSelectedTerritoryId(t.id)}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.color || "#C65D3B" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {t.name}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        #{t.number}
                        {t.assigned_to && (
                          <span className="ml-2 text-orange-500 font-medium">
                            Com {t.assignedName} ({t.daysInField ?? 0} d)
                          </span>
                        )}
                      </p>
                    </div>
                    {t.urgencyDays > 180 && !t.assigned_to && (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    )}
                    {t.urgencyDays > 0 && t.urgencyDays < 9999 && !t.assigned_to && (
                      <span className="text-[10px] text-slate-400 flex-shrink-0 flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {t.urgencyDays}d
                      </span>
                    )}
                    {t.urgencyDays === 9999 && !t.assigned_to && (
                      <span className="text-[10px] text-primary font-bold flex-shrink-0">
                        Nunca
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Publicador */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Publicador</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Buscar publicador..."
                  className="pl-8 h-8 text-sm"
                  value={searchPublisher}
                  onChange={(e) => setSearchPublisher(e.target.value)}
                />
              </div>
              <div className="border rounded-lg max-h-[120px] overflow-y-auto divide-y">
                {filteredPublishers.map((p) => (
                  <button
                    key={p.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors ${
                      selectedPublisherId === p.id ? "bg-primary/5 border-l-2 border-l-primary font-medium" : ""
                    }`}
                    onClick={() => setSelectedPublisherId(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Campanha */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Campanha (Opcional)</Label>
              <select
                className="w-full h-9 rounded-md border border-slate-200 px-3 py-1 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
              >
                <option value="">Nenhuma campanha...</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">
                  Data de Entrega <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-600">
                  Data de Conclusão{" "}
                  <span className="font-normal text-slate-400">(opcional)</span>
                </Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="h-9"
                />
              </div>
            </div>
            {endDate && (
              <p className="text-xs text-slate-500 bg-slate-50 border rounded-md p-2">
                ℹ️ Data de conclusão preenchida — este registro será salvo como{" "}
                <strong>histórico concluído</strong>.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Salvando..." : "Confirmar Designação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
