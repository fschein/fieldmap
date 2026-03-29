"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Loader2, User, Calendar, CheckCircle,
  PlusCircle, RotateCcw, PlayCircle, Pencil, Save, X, Trash2
} from "lucide-react"
import { toast } from "sonner"
import type { AssignmentStatus } from "@/lib/types"

interface Profile { id: string; name: string }

interface Assignment {
  id: string
  status: AssignmentStatus
  assigned_at: string
  completed_at: string | null
  returned_at: string | null
  user_id: string
  territory_id: string
  profiles: { name: string } | null
  notes: string | null
  return_reason: string | null
}

interface TerritoryDetails {
  id: string
  name: string
  number: string
  color: string
}

interface AssignmentHistorySheetProps {
  territoryId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

export function AssignmentHistorySheet({
  territoryId,
  open,
  onOpenChange,
  onUpdate
}: AssignmentHistorySheetProps) {
  const { isReady, isAdmin, isDirigente } = useAuth()
  const supabase = getSupabaseBrowserClient()

  const [loading, setLoading] = useState(false)
  const [territory, setTerritory] = useState<TerritoryDetails | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [publishers, setPublishers] = useState<Profile[]>([])

  // Quick-add state
  const [isAddingMode, setIsAddingMode] = useState(false)
  const [selectedPublisher, setSelectedPublisher] = useState("")
  const [customStartDate, setCustomStartDate] = useState("")

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState("")
  const [editEnd, setEditEnd] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  const canEdit = isAdmin || isDirigente

  useEffect(() => {
    if (open && territoryId && isReady) {
      loadHistory()
      if (canEdit && publishers.length === 0) loadPublishers()
    } else if (!open) {
      setIsAddingMode(false)
      setSelectedPublisher("")
      setCustomStartDate("")
      setEditingId(null)
    }
  }, [open, territoryId, isReady])

  const loadHistory = async () => {
    if (!territoryId) return
    setLoading(true)
    try {
      const { data: tData } = await supabase
        .from("territories")
        .select("id, name, number, color")
        .eq("id", territoryId)
        .single()
      if (tData) setTerritory(tData)

      const { data: aData, error } = await supabase
        .from("assignments")
        .select(`
          id, status, assigned_at, completed_at, returned_at, user_id, territory_id,
          notes, return_reason,
          profiles!assignments_user_id_fkey(name)
        `)
        .eq("territory_id", territoryId)
        .order("assigned_at", { ascending: false })

      if (error) throw error
      setAssignments(aData || [])
    } catch (error: any) {
      toast.error("Falha ao carregar o histórico.")
    } finally {
      setLoading(false)
    }
  }

  const loadPublishers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "publicador")
      .order("name")
    if (data) setPublishers(data)
  }

  const handleUpdateStatus = async (assignmentId: string, newStatus: AssignmentStatus) => {
    try {
      setLoading(true)
      const now = new Date().toISOString()
      const updateData: any = { status: newStatus }
      if (newStatus === 'completed') updateData.completed_at = now
      if (newStatus === 'returned') updateData.returned_at = now

      const { error } = await supabase.from("assignments").update(updateData).eq("id", assignmentId)
      if (error) throw error
      toast.success(`Designação ${newStatus === 'completed' ? 'concluída' : 'devolvida'}`)
      await loadHistory()
      onUpdate()
    } catch {
      toast.error("Erro ao atualizar status.")
      setLoading(false)
    }
  }

  const handleCreateAssignment = async () => {
    if (!selectedPublisher) { toast.error("Selecione um publicador"); return }
    try {
      setLoading(true)
      const activeCurrent = assignments.find(a => a.status === 'active')
      if (activeCurrent) {
        toast.error("Este território já está em campo.")
        setLoading(false)
        return
      }

      let dateToUse = new Date().toISOString()
      if (customStartDate) {
        dateToUse = new Date(`${customStartDate}T12:00:00Z`).toISOString()
      }

      const { error } = await supabase.from("assignments").insert({
        territory_id: territoryId,
        user_id: selectedPublisher,
        status: 'active',
        assigned_at: dateToUse,
      })
      if (error) throw error

      // Inserir notificação (Novo território designado)
      if (territory) {
        await supabase.from("notifications").insert({
          type: "assigned",
          title: "Novo território designado",
          message: `O território ${territory.number} foi designado para você.`,
          user_id: selectedPublisher,
          territory_id: territoryId,
          created_by: (await supabase.auth.getUser()).data.user?.id
        }).catch((err: unknown) => console.error("Erro ao inserir notificação:", err))
      }

      toast.success("Nova designação criada!")
      setIsAddingMode(false)
      setSelectedPublisher("")
      setCustomStartDate("")
      await loadHistory()
      onUpdate()
    } catch {
      toast.error("Erro ao criar designação.")
      setLoading(false)
    }
  }

  const startEditing = (a: Assignment) => {
    setEditingId(a.id)
    setEditStart(toDateInput(a.assigned_at))
    setEditEnd(toDateInput(a.completed_at || a.returned_at || ""))
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditStart("")
    setEditEnd("")
  }

  const handleSaveEdit = async (assignment: Assignment) => {
    if (!editStart) { toast.error("Data de início é obrigatória"); return }
    setSavingEdit(true)
    try {
      const startISO = new Date(`${editStart}T12:00:00Z`).toISOString()
      const endISO = editEnd ? new Date(`${editEnd}T12:00:00Z`).toISOString() : null

      const update: any = { assigned_at: startISO }
      if (assignment.status === 'completed') update.completed_at = endISO
      if (assignment.status === 'returned') update.returned_at = endISO

      const { error } = await supabase.from("assignments").update(update).eq("id", assignment.id)
      if (error) throw error

      if (territory) await syncTerritoryOwner(territory.id)

      toast.success("Datas atualizadas!")
      setEditingId(null)
      await loadHistory()
      onUpdate()
    } catch (err: any) {
      console.error(err)
      toast.error(`Erro ao salvar datas: ${err?.message || 'Desconhecido'}`)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!window.confirm("Atenção! Pressione OK para EXCLUIR DEFINITIVAMENTE esta designação. Isso não pode ser desfeito.")) return

    try {
      setLoading(true)
      const { error } = await supabase.from("assignments").delete().eq("id", assignmentId)
      if (error) throw error

      if (territory) await syncTerritoryOwner(territory.id)

      toast.success("Designação excluída com sucesso!")
      setEditingId(null)
      await loadHistory()
      onUpdate()
    } catch (err: any) {
      console.error(err)
      toast.error(`Erro ao excluir designação: ${err?.message || 'Falha de banco'}`)
    } finally {
      setLoading(false)
    }
  }

  const syncTerritoryOwner = async (territoryId: string) => {
    try {
      // Find the most recent active assignment
      const { data: activeAssignments } = await supabase
        .from("assignments")
        .select("user_id, status")
        .eq("territory_id", territoryId)
        .eq("status", "active")
        .order("assigned_at", { ascending: false })
        .limit(1)

      if (activeAssignments && activeAssignments.length > 0) {
        await supabase.from("territories").update({ assigned_to: activeAssignments[0].user_id, status: "assigned" }).eq("id", territoryId)
      } else {
        await supabase.from("territories").update({ assigned_to: null, status: "available" }).eq("id", territoryId)
      }
    } catch (e) {
      console.error("Erro ao sincronizar dono do território", e)
    }
  }

  function toDateInput(isoStr: string | null | undefined): string {
    if (!isoStr) return ""
    return new Date(isoStr).toISOString().split("T")[0]
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—"
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto pb-20">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            {territory && (
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: territory.color }} />
            )}
            {territory?.name || 'Carregando...'}
          </SheetTitle>
          <SheetDescription>
            Nº {territory?.number} • Linha do tempo de designações
          </SheetDescription>
        </SheetHeader>

        {loading && !territory ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !territory ? null : (
          <div className="space-y-6">

            {/* Nova Designação Rápida */}
            {canEdit && (
              <div className="bg-slate-50 border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 text-slate-700">
                    <PlayCircle className="w-4 h-4 text-primary" /> Nova Designação
                  </h3>
                  {!isAddingMode && (
                    <Button variant="outline" size="sm" onClick={() => setIsAddingMode(true)} className="h-7 text-xs">
                      <PlusCircle className="mr-1 h-3 w-3" /> Adicionar
                    </Button>
                  )}
                </div>

                {isAddingMode && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Publicador</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={selectedPublisher}
                        onChange={(e) => setSelectedPublisher(e.target.value)}
                      >
                        <option value="">Selecione...</option>
                        {publishers.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Data de Início (opcional — padrão: hoje)</Label>
                      <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="h-9" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={handleCreateAssignment} disabled={loading} className="flex-1">
                        Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsAddingMode(false)} disabled={loading}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Linha do Tempo */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 border-b pb-1">Linha do Tempo</h3>

              {assignments.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-400 border-2 border-dashed rounded-lg">
                  Nenhum registro encontrado.
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-3 space-y-5">
                  {assignments.map((assignment) => {
                    const isActive = assignment.status === 'active'
                    const isCompleted = assignment.status === 'completed'
                    const isEditing = editingId === assignment.id

                    return (
                      <div key={assignment.id} className="relative pl-5">
                        <div className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 bg-white ${isActive ? 'border-primary ring-4 ring-primary/20' :
                            isCompleted ? 'border-green-500' : 'border-slate-400'
                          }`} />

                        <div className={`p-3 rounded-lg border ${isActive ? 'bg-primary/5 border-primary/20 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
                          {/* Header */}
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-slate-500" />
                              {assignment.profiles?.name}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-primary/10 text-primary' :
                                  isCompleted ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'
                                }`}>
                                {isActive ? 'Em Campo' : isCompleted ? 'Concluído' : 'Devolvido'}
                              </span>
                              {canEdit && !isEditing && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => startEditing(assignment)}
                                    className="p-1 rounded hover:bg-slate-200 transition-colors"
                                    title="Editar datas"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAssignment(assignment.id)}
                                    className="p-1 rounded hover:bg-slate-200 transition-colors"
                                    title="Excluir designação"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-600" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {!isEditing ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="space-y-0.5 bg-white p-1.5 rounded border border-slate-100">
                                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Início</span>
                                  <div className="flex items-center gap-1 text-slate-700 font-mono">
                                    <Calendar className="w-3 h-3 text-slate-400" /> {formatDate(assignment.assigned_at)}
                                  </div>
                                </div>
                                <div className="space-y-0.5 bg-white p-1.5 rounded border border-slate-100">
                                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Fim</span>
                                  <div className="flex items-center gap-1 text-slate-700 font-mono">
                                    {isActive ? (
                                      <span className="text-primary italic">— ativo —</span>
                                    ) : (
                                      <>
                                        <Calendar className="w-3 h-3 text-slate-400" />
                                        {formatDate(assignment.completed_at || assignment.returned_at)}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {(assignment.notes || assignment.return_reason) && (
                                <div className="bg-amber-50/50 border border-amber-100 p-2 rounded text-[11px] text-amber-900 italic">
                                  <span className="font-semibold not-italic text-[10px] text-amber-700 block mb-0.5 uppercase">Motivo:</span>
                                  "{assignment.notes || assignment.return_reason}"
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Datas — modo edição */
                            <div className="space-y-2 pt-2 border-t border-slate-200">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-slate-500 uppercase font-semibold">Início</Label>
                                  <Input
                                    type="date"
                                    value={editStart}
                                    onChange={(e) => setEditStart(e.target.value)}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-slate-500 uppercase font-semibold">
                                    Fim {isActive && <span className="text-slate-400">(opcional)</span>}
                                  </Label>
                                  <Input
                                    type="date"
                                    value={editEnd}
                                    onChange={(e) => setEditEnd(e.target.value)}
                                    className="h-8 text-xs"
                                    min={editStart}
                                  />
                                </div>
                              </div>
                              <div className="flex gap-1.5">
                                <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => handleSaveEdit(assignment)} disabled={savingEdit}>
                                  {savingEdit ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                                  Salvar
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={cancelEditing} disabled={savingEdit}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Ações para designação ativa */}
                          {isActive && canEdit && !isEditing && (
                            <div className="mt-3 flex gap-2 pt-3 border-t border-primary/10">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] flex-1 border-green-200 text-green-700 hover:bg-green-50"
                                onClick={() => handleUpdateStatus(assignment.id, 'completed')}
                                disabled={loading}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" /> Concluir
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] flex-1 border-orange-200 text-orange-700 hover:bg-orange-50"
                                onClick={() => handleUpdateStatus(assignment.id, 'returned')}
                                disabled={loading}
                              >
                                <RotateCcw className="w-3 h-3 mr-1" /> Devolver
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
