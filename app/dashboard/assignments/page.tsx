"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, User, ArrowRight, RotateCcw, CheckCircle } from "lucide-react"

interface AssignmentWithDetails {
  id: string
  block_id: string
  user_id: string
  assigned_by: string
  assigned_at: string
  completed_at: string | null
  returned_at: string | null
  notes: string | null
  return_reason: string | null
  status: "pending" | "in_progress" | "completed" | "returned"
  block: {
    id: string
    name: string
    territory: {
      id: string
      name: string
      color: string
    }
  }
  user: {
    id: string
    full_name: string
  }
}

interface Block {
  id: string
  name: string
  territory_id: string
  territory: {
    id: string
    name: string
  }
}

interface Profile {
  id: string
  full_name: string
}

const STATUS_COLUMNS = [
  { key: "pending", label: "Não Iniciada", color: "bg-muted" },
  { key: "in_progress", label: "Em Andamento", color: "bg-blue-50 dark:bg-blue-950/30" },
  { key: "completed", label: "Concluída", color: "bg-green-50 dark:bg-green-950/30" },
  { key: "returned", label: "Devolvida", color: "bg-amber-50 dark:bg-amber-950/30" },
] as const

export default function AssignmentsPage() {
  const { profile, isAdmin, isDirigente } = useAuth()
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [showActionDialog, setShowActionDialog] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentWithDetails | null>(null)
  const [actionType, setActionType] = useState<"start" | "complete" | "return" | null>(null)
  const [returnReason, setReturnReason] = useState("")
  const [newAssignment, setNewAssignment] = useState({ block_id: "", user_id: "" })
  const [submitting, setSubmitting] = useState(false)

  const supabase = getSupabaseBrowserClient()
  const canManage = isAdmin || isDirigente

  useEffect(() => {
    loadData()
  }, [profile])

  async function loadData() {
    if (!profile) return
    setLoading(true)

    let assignmentsQuery = supabase
      .from("assignments")
      .select(`
        *,
        block:blocks(id, name, territory:territories(id, name, color)),
        user:profiles!assignments_user_id_fkey(id, full_name)
      `)
      .order("assigned_at", { ascending: false })

    // Publicadores só veem suas próprias designações
    if (profile.role === "publicador") {
      assignmentsQuery = assignmentsQuery.eq("user_id", profile.id)
    }

    const [assignmentsRes, blocksRes, usersRes] = await Promise.all([
      assignmentsQuery,
      supabase
        .from("blocks")
        .select(`id, name, territory_id, territory:territories(id, name)`)
        .order("name"),
      supabase.from("profiles").select("id, full_name").order("full_name"),
    ])

    if (assignmentsRes.data) {
      setAssignments(assignmentsRes.data as unknown as AssignmentWithDetails[])
    }
    if (blocksRes.data) {
      setBlocks(blocksRes.data as unknown as Block[])
    }
    if (usersRes.data) {
      setUsers(usersRes.data)
    }

    setLoading(false)
  }

  // Quadras que não têm designações ativas
  const availableBlocks = blocks.filter(
    (block) =>
      !assignments.some(
        (a) => a.block_id === block.id && (a.status === "pending" || a.status === "in_progress")
      )
  )

  async function handleCreateAssignment() {
    if (!newAssignment.block_id || !newAssignment.user_id || !profile) return

    setSubmitting(true)

    const { error } = await supabase.from("assignments").insert({
      block_id: newAssignment.block_id,
      user_id: newAssignment.user_id,
      assigned_by: profile.id,
      status: "pending",
    })

    if (!error) {
      setShowNewDialog(false)
      setNewAssignment({ block_id: "", user_id: "" })
      loadData()
    }

    setSubmitting(false)
  }

  async function handleStatusChange() {
    if (!selectedAssignment || !actionType) return

    setSubmitting(true)

    const updates: Record<string, unknown> = {}

    if (actionType === "start") {
      updates.status = "in_progress"
    } else if (actionType === "complete") {
      updates.status = "completed"
      updates.completed_at = new Date().toISOString()

      // Marca a quadra como concluída
      await supabase.from("blocks").update({ completed: true }).eq("id", selectedAssignment.block_id)
    } else if (actionType === "return") {
      updates.status = "returned"
      updates.returned_at = new Date().toISOString()
      updates.return_reason = returnReason || null
    }

    const { error } = await supabase
      .from("assignments")
      .update(updates)
      .eq("id", selectedAssignment.id)

    if (!error) {
      setShowActionDialog(false)
      setSelectedAssignment(null)
      setActionType(null)
      setReturnReason("")
      loadData()
    }

    setSubmitting(false)
  }

  function openActionDialog(assignment: AssignmentWithDetails, action: "start" | "complete" | "return") {
    setSelectedAssignment(assignment)
    setActionType(action)
    setShowActionDialog(true)
  }

  function getAssignmentsByStatus(status: string) {
    return assignments.filter((a) => a.status === status)
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    })
  }

  function canUserAct(assignment: AssignmentWithDetails) {
    return canManage || assignment.user_id === profile?.id
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Designações</h1>
          <p className="text-muted-foreground">
            {canManage
              ? "Gerencie as designações de quadras aos publicadores"
              : "Acompanhe suas designações de território"}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowNewDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Designação
          </Button>
        )}
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STATUS_COLUMNS.map((column) => (
          <div key={column.key} className={`rounded-lg ${column.color} p-4 min-h-[400px]`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">{column.label}</h3>
              <Badge variant="secondary">{getAssignmentsByStatus(column.key).length}</Badge>
            </div>

            <div className="space-y-3">
              {getAssignmentsByStatus(column.key).map((assignment) => (
                <Card key={assignment.id} className="shadow-sm">
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: assignment.block?.territory?.color || "#666" }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(assignment.assigned_at)}
                      </span>
                    </div>

                    <h4 className="font-medium leading-tight">{assignment.block?.name}</h4>
                    <p className="text-sm text-muted-foreground">{assignment.block?.territory?.name}</p>

                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span className="truncate">{assignment.user?.full_name}</span>
                    </div>

                    {assignment.return_reason && (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        Motivo: {assignment.return_reason}
                      </p>
                    )}

                    {assignment.notes && (
                      <p className="mt-2 text-xs text-muted-foreground">Obs: {assignment.notes}</p>
                    )}

                    {/* Action Buttons */}
                    {canUserAct(assignment) && (
                      <div className="mt-3 flex gap-2">
                        {column.key === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 bg-transparent"
                            onClick={() => openActionDialog(assignment, "start")}
                          >
                            <ArrowRight className="mr-1 h-3 w-3" />
                            Iniciar
                          </Button>
                        )}
                        {column.key === "in_progress" && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="flex-1"
                              onClick={() => openActionDialog(assignment, "complete")}
                            >
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Concluir
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openActionDialog(assignment, "return")}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {getAssignmentsByStatus(column.key).length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma designação</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* New Assignment Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Designação</DialogTitle>
            <DialogDescription>Atribua uma quadra a um publicador</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Quadra</Label>
              <Select
                value={newAssignment.block_id}
                onValueChange={(value) => setNewAssignment((prev) => ({ ...prev, block_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma quadra" />
                </SelectTrigger>
                <SelectContent>
                  {availableBlocks.map((block) => (
                    <SelectItem key={block.id} value={block.id}>
                      {block.name} - {block.territory?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableBlocks.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Todas as quadras já estão designadas
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Publicador</Label>
              <Select
                value={newAssignment.user_id}
                onValueChange={(value) => setNewAssignment((prev) => ({ ...prev, user_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um publicador" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateAssignment}
              disabled={!newAssignment.block_id || !newAssignment.user_id || submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Designação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "start" && "Iniciar Trabalho"}
              {actionType === "complete" && "Concluir Designação"}
              {actionType === "return" && "Devolver Designação"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "start" && "Confirma que deseja iniciar o trabalho nesta quadra?"}
              {actionType === "complete" && "Confirma que a quadra foi totalmente trabalhada?"}
              {actionType === "return" && "Informe o motivo da devolução (opcional)"}
            </DialogDescription>
          </DialogHeader>

          {actionType === "return" && (
            <div className="py-4">
              <Label>Motivo da Devolução</Label>
              <Textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Ex: Área perigosa, muitos prédios fechados..."
                className="mt-2"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleStatusChange}
              disabled={submitting}
              variant={actionType === "return" ? "destructive" : "default"}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
