"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Loader2, ClipboardList, CheckCircle, RotateCcw, Play, MapPin } from "lucide-react"
import type { AssignmentWithDetails } from "@/lib/types"

export default function AssignmentsPage() {
  const { profile, isAdmin, isDirigente } = useAuth()
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentWithDetails | null>(null)
  const [actionType, setActionType] = useState<"complete" | "return" | "start" | null>(null)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    fetchAssignments()
  }, [profile, filter])

  async function fetchAssignments() {
    if (!profile) return

    let query = supabase
      .from("assignments")
      .select(`
        *,
        block:blocks(
          *,
          territory:territories(
            *,
            campaign:campaigns(*)
          )
        ),
        user:profiles!assignments_user_id_fkey(*),
        assigned_by_user:profiles!assignments_assigned_by_fkey(*)
      `)
      .order("assigned_at", { ascending: false })

    // Filter by user if publicador
    if (profile.role === "publicador") {
      query = query.eq("user_id", profile.id)
    }

    // Filter by status
    if (filter !== "all") {
      query = query.eq("status", filter)
    }

    const { data } = await query

    if (data) {
      setAssignments(data as unknown as AssignmentWithDetails[])
    }
    setLoading(false)
  }

  const handleOpenActionDialog = (
    assignment: AssignmentWithDetails,
    type: "complete" | "return" | "start"
  ) => {
    setSelectedAssignment(assignment)
    setActionType(type)
    setNotes("")
    setActionDialogOpen(true)
  }

  const handleAction = async () => {
    if (!selectedAssignment || !actionType) return
    setSubmitting(true)

    const now = new Date().toISOString()
    let updateData: Record<string, string | null> = {}
    let blockStatus = ""

    switch (actionType) {
      case "start":
        updateData = { status: "in_progress" }
        blockStatus = "assigned"
        break
      case "complete":
        updateData = { status: "completed", completed_at: now, notes: notes || null }
        blockStatus = "completed"
        break
      case "return":
        updateData = { status: "returned", returned_at: now, notes: notes || null }
        blockStatus = "available"
        break
    }

    await supabase
      .from("assignments")
      .update(updateData)
      .eq("id", selectedAssignment.id)

    await supabase
      .from("blocks")
      .update({ status: blockStatus })
      .eq("id", selectedAssignment.block_id)

    setActionDialogOpen(false)
    setSubmitting(false)
    fetchAssignments()
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pendente</Badge>
      case "in_progress":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Em andamento</Badge>
      case "completed":
        return <Badge className="bg-green-500 hover:bg-green-600">Concluído</Badge>
      case "returned":
        return <Badge variant="outline">Devolvido</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getActionButtons = (assignment: AssignmentWithDetails) => {
    const isOwner = assignment.user_id === profile?.id
    const canManage = isAdmin || isDirigente || isOwner

    if (!canManage) return null

    switch (assignment.status) {
      case "pending":
        return (
          <Button
            size="sm"
            onClick={() => handleOpenActionDialog(assignment, "start")}
          >
            <Play className="mr-2 h-3 w-3" />
            Iniciar
          </Button>
        )
      case "in_progress":
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleOpenActionDialog(assignment, "complete")}
            >
              <CheckCircle className="mr-2 h-3 w-3" />
              Concluir
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenActionDialog(assignment, "return")}
            >
              <RotateCcw className="mr-2 h-3 w-3" />
              Devolver
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Designações</h1>
        <p className="text-muted-foreground">
          {profile?.role === "publicador"
            ? "Gerencie suas designações de território"
            : "Gerencie todas as designações de território"}
        </p>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="in_progress">Em andamento</TabsTrigger>
          <TabsTrigger value="completed">Concluídas</TabsTrigger>
          <TabsTrigger value="returned">Devolvidas</TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="mt-6">
          {assignments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Nenhuma designação encontrada</p>
                <p className="text-sm text-muted-foreground">
                  {filter === "all"
                    ? "Não há designações no momento"
                    : `Não há designações com status "${filter}"`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {assignments.map((assignment) => (
                <Card key={assignment.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">
                            {assignment.block?.territory?.name} - {assignment.block?.name}
                          </CardTitle>
                          {getStatusBadge(assignment.status)}
                        </div>
                        <CardDescription>
                          {assignment.block?.territory?.campaign?.name}
                        </CardDescription>
                      </div>
                      {getActionButtons(assignment)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      {(isAdmin || isDirigente) && (
                        <div>
                          <p className="text-muted-foreground">Publicador</p>
                          <p className="font-medium">{assignment.user?.full_name || "N/A"}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-muted-foreground">Designado em</p>
                        <p className="font-medium">
                          {new Date(assignment.assigned_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      {assignment.due_date && (
                        <div>
                          <p className="text-muted-foreground">Data limite</p>
                          <p className="font-medium">
                            {new Date(assignment.due_date).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      )}
                      {assignment.completed_at && (
                        <div>
                          <p className="text-muted-foreground">Concluído em</p>
                          <p className="font-medium">
                            {new Date(assignment.completed_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      )}
                      {assignment.returned_at && (
                        <div>
                          <p className="text-muted-foreground">Devolvido em</p>
                          <p className="font-medium">
                            {new Date(assignment.returned_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      )}
                    </div>
                    {assignment.notes && (
                      <div className="mt-4 rounded-lg bg-muted p-3">
                        <p className="text-sm text-muted-foreground">Observações:</p>
                        <p className="text-sm">{assignment.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "start" && "Iniciar Trabalho"}
              {actionType === "complete" && "Concluir Trabalho"}
              {actionType === "return" && "Devolver Território"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "start" &&
                "Confirme para iniciar o trabalho neste território."}
              {actionType === "complete" &&
                "Confirme para marcar este território como concluído."}
              {actionType === "return" &&
                "Informe o motivo da devolução (opcional)."}
            </DialogDescription>
          </DialogHeader>
          {(actionType === "complete" || actionType === "return") && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Observações {actionType === "return" ? "(motivo da devolução)" : "(opcional)"}
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    actionType === "return"
                      ? "Ex: Não consegui cobrir toda a área..."
                      : "Ex: Trabalho realizado com sucesso..."
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleAction} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirmar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
