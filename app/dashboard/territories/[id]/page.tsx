// app/dashboard/territories/[id]/page.tsx
"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import { ArrowLeft, Plus, Map, Loader2, MoreVertical, Pencil, Trash2, UserPlus, LayoutGrid, User, Home, Link2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Subdivision, Profile } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { type UnitStatus } from "@/components/dashboard/house-by-house"
import { fmtTerritoryNumber } from "@/lib/utils"
import { QuadraEditor, type EditableQuadra } from "@/components/dashboard/quadra-editor"
import { toast } from "sonner"

interface UnitRow {
  id: string
  number: string
  floor: number | null
  status: UnitStatus
  marked_at: string | null
  marked_by: string | null
  pending_action?: "add" | "remove" | null
  suggestion_batch_id?: string | null
}

interface Street {
  id: string
  name: string
  order_index: number
  completed: boolean
  units: UnitRow[]
}

interface Block {
  notes: string
  name: string
  id: string
  territory_id: string
  order_index: number
  completed: boolean
  status?: "available" | "assigned" | "completed"
  streets?: Street[]
}

interface TerritoryWithDetails {
  id: string
  number: string
  name: string
  group?: { id: string; name: string; color: string }
  subdivisions?: Block[]
  assigned_to_user?: Profile
}

export default function TerritoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user, isAdmin, isSupervisor } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [territory, setTerritory] = useState<TerritoryWithDetails | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [editingBlock, setEditingBlock] = useState<Block | null>(null)
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    notes: "",
  })
  const [assignData, setAssignData] = useState({
    user_id: "",
    due_date: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [focusGroupId, setFocusGroupId] = useState<string | null>(null)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    fetchData()
  }, [id])

  // Atalho "casas" no card da quadra (tela de mapa) — abre o editor já focado nela
  useEffect(() => {
    const editHouses = searchParams.get("editHouses")
    if (editHouses) {
      setFocusGroupId(editHouses)
      setEditorOpen(true)
      router.replace(`/dashboard/territories/${id}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function fetchData() {
    try {
      console.log("Fetching territory with id:", id)

      const [territoryRes, usersRes] = await Promise.all([
        supabase
          .from("territories")
          .select(`
      *,
      subdivisions(*, streets(*, units(id, number, floor, status, marked_at, marked_by, pending_action, suggestion_batch_id))),
      assignments(status, campaign_id),
      group:groups(id, name, color),
      assigned_to_user:profiles!territories_assigned_to_fkey(id, name, email)
    `)
          .eq("id", id)
          .single(),
        supabase
          .from("profiles")
          .select("*")
          .in("role", ["admin", "dirigente", "publicador"])
          .order("name"),
      ])

      console.log("Territory response:", territoryRes)
      console.log("Users response:", usersRes)

      if (territoryRes.error) {
        console.error("Error fetching territory:", territoryRes.error)
      }

      if (territoryRes.data) {
        const data = territoryRes.data as any
        let subdivisions = data.subdivisions || []

        // Mesmo critério dos mapas de designação: se há campanha ativa pra
        // esse território, o progresso/notas exibidos vêm de
        // subdivision_campaign_progress (por campanha), não da coluna crua
        // subdivisions.notes/completed — senão uma nota antiga de uma
        // designação passada "vaza" de volta numa campanha nova.
        const activeAssignment = (data.assignments || []).find((a: any) => a.status === "active")
        const campaignId = activeAssignment?.campaign_id

        if (campaignId && subdivisions.length > 0) {
          const { data: progressData } = await supabase
            .from("subdivision_campaign_progress")
            .select("*")
            .eq("campaign_id", campaignId)
            .in("subdivision_id", subdivisions.map((s: any) => s.id))

          if (progressData) {
            subdivisions = subdivisions.map((s: any) => {
              const prog = progressData.find((p: any) => p.subdivision_id === s.id)
              return {
                ...s,
                completed: prog ? prog.completed : false,
                status: prog ? prog.status : "available",
                notes: prog ? prog.notes : (s.notes || null),
              }
            })
          }
        }

        setTerritory({ ...data, subdivisions } as unknown as TerritoryWithDetails)
      }

      if (usersRes.data) {
        setUsers(usersRes.data as Profile[])
      }
    } catch (error) {
      console.error("Exception fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (subdivisions?: Block) => {
    if (subdivisions) {
      setEditingBlock(subdivisions)
      setFormData({
        name: subdivisions.name || "",
        notes: subdivisions.notes || "",
      })
    } else {
      setEditingBlock(null)
      const subdivisionCount = territory?.subdivisions?.length || 0
      const territoryNumber = territory?.number || "X"
      setFormData({
        name: `${territoryNumber}-${String.fromCharCode(65 + subdivisionCount)}`, // 01-A, 01-B, etc
        notes: "",
      })
    }
    setDialogOpen(true)
  }

  const handleOpenAssignDialog = (subdivisions: Block) => {
    setSelectedBlock(subdivisions)
    setAssignData({ user_id: "", due_date: "" })
    setAssignDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      if (editingBlock) {
        // Hoje este formulário não expõe nome (campo desabilitado) nem notas
        // pra edição real — não escrevemos completed/notes aqui pra não
        // reabrir sem querer uma quadra já concluída nem sobrescrever notas
        // que pertencem ao progresso da campanha ativa.
        const { error } = await supabase
          .from("subdivisions")
          .update({ name: formData.name })
          .eq("id", editingBlock.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from("subdivisions")
          .insert([{
            territory_id: id,
            name: formData.name,
            notes: "",
            order_index: territory?.subdivisions?.length || 0,
            completed: false,
          }])

        if (error) throw error
      }

      setDialogOpen(false)
      fetchData()
    } catch (error: any) {
      console.error("Error saving subdivisions:", error)
      alert("Erro ao salvar quadra: " + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBlock) return
    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Create assignment
      const { error: assignError } = await supabase.from("assignments").insert({
        territory_id: id, // Keep for tracking
        subdivision_id: selectedBlock.id,
        user_id: assignData.user_id,
        status: "active",
        assigned_at: new Date().toISOString(),
      })

      if (assignError) throw assignError

      setAssignDialogOpen(false)
      fetchData()
    } catch (error: any) {
      console.error("Error assigning subdivisions:", error)
      alert("Erro ao designar quadra: " + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (subdivisionId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta quadra?")) return

    try {
      const { error } = await supabase.from("subdivisions").delete().eq("id", subdivisionId)
      if (error) throw error
      fetchData()
    } catch (error: any) {
      alert("Erro ao excluir: " + error.message)
    }
  }

  // ─────────── Casa-a-casa (units) ───────────
  const handleGenerateFieldLink = async (subdivisionId: string) => {
    try {
      const { data, error } = await supabase
        .from("field_links")
        .insert({ territory_id: id, subdivision_id: subdivisionId, created_by: user?.id ?? null })
        .select("id")
        .single()
      if (error) throw error
      const url = `${window.location.origin}/campo/${data.id}`
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado! Válido por 2 horas.", { description: url, duration: 8000 })
    } catch (error: any) {
      toast.error("Erro ao gerar link: " + error.message)
    }
  }

  const handleAddUnits = async (streetId: string, numbers: string[]) => {
    const { error } = await supabase
      .from("units")
      .insert(numbers.map((number) => ({ street_id: streetId, number, status: "pending" })))
    if (error) {
      alert("Erro ao adicionar casas: " + error.message)
      return
    }
    fetchData()
  }

  const handleRemoveUnit = async (unitId: string) => {
    const { error } = await supabase.from("units").delete().eq("id", unitId)
    if (error) {
      alert("Erro ao remover casa: " + error.message)
      return
    }
    fetchData()
  }

  const handleResolveSuggestion = async (batchId: string, approve: boolean) => {
    const { error } = await supabase.rpc("resolve_unit_suggestion_batch", {
      p_batch_id: batchId,
      p_approve: approve,
    })
    if (error) {
      alert("Erro ao resolver sugestão: " + error.message)
      return
    }
    fetchData()
  }

  const handleAddStreet = async (quadraId: string, name: string) => {
    const quadra = territory?.subdivisions?.find((s) => s.id === quadraId)
    const { error } = await supabase.from("streets").insert({
      subdivision_id: quadraId,
      name,
      order_index: quadra?.streets?.length || 0,
      completed: false,
    })
    if (error) {
      alert("Erro ao criar rua: " + error.message)
      return
    }
    fetchData()
  }

  const handleRenameStreet = async (streetId: string, name: string) => {
    const { error } = await supabase.from("streets").update({ name }).eq("id", streetId)
    if (error) {
      alert("Erro ao renomear rua: " + error.message)
      return
    }
    fetchData()
  }

  const handleDeleteStreet = async (streetId: string) => {
    const { error } = await supabase.from("streets").delete().eq("id", streetId)
    if (error) {
      alert("Erro ao excluir rua: " + error.message)
      return
    }
    fetchData()
  }

  const getQuadraStatus = (subdivisions: Block) => {
    const status = subdivisions.status || (subdivisions.completed ? "completed" : "available")
    const percent = subdivisions.completed || status === "completed" ? 100 : 0

    if (status === "completed") {
      return { label: "Concluída", badgeClassName: "bg-muted text-muted-foreground border-transparent", percent }
    }
    if (status === "assigned") {
      return { label: "Em andamento", badgeClassName: "bg-primary/10 text-primary border-primary/20", percent }
    }
    return { label: "Disponível", badgeClassName: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20", percent }
  }

  // Contador "casas X/Y" do card — mesmo critério do QuadraHouseByHouse:
  // concluída = falou com morador, deixou carta ou não visitar (não conta pendente).
  const getHouseCounts = (subdivisions: Block) => {
    const allUnits = (subdivisions.streets || []).flatMap((s) => s.units || [])
    const total = allUnits.length
    const done = allUnits.filter((u) => u.status === "visited" || u.status === "visited_carta" || u.status === "do_not_visit").length
    return { done, total }
  }

  const quadras: EditableQuadra[] = (territory?.subdivisions || []).map((s) => ({
    id: s.id,
    label: s.name,
    streets: (s.streets || []).map((st) => ({
      id: st.id,
      label: st.name,
      units: st.units,
    })),
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!territory) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Território não encontrado</p>
        <p className="text-xs text-muted-foreground mt-2">ID: {id}</p>
        <Button asChild className="mt-4">
          <Link href="/dashboard/territories">Voltar</Link>
        </Button>
      </div>
    )
  }

  if (editorOpen && isSupervisor) {
    return (
      <QuadraEditor
        territoryName={territory.name}
        territoryNumber={fmtTerritoryNumber(territory.number)}
        quadras={quadras}
        initialExpandedQuadraId={focusGroupId}
        onBack={() => setEditorOpen(false)}
        onAddStreet={isAdmin ? handleAddStreet : undefined}
        onAddUnits={handleAddUnits}
        onRemoveUnit={handleRemoveUnit}
        onRenameStreet={isAdmin ? handleRenameStreet : undefined}
        onDeleteStreet={isAdmin ? handleDeleteStreet : undefined}
        onResolveSuggestion={handleResolveSuggestion}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Badge variant="outline" className="font-mono shrink-0">
            {territory.number}
          </Badge>
          <div className="flex-1" />
          <Button asChild variant="outline" size="sm" className="shrink-0 text-muted-foreground">
            <Link href={`/dashboard/territories/${id}/map`}>
              <Map className="mr-2 h-4 w-4" />
              Editar mapa
            </Link>
          </Button>
          {isSupervisor && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 text-muted-foreground"
              onClick={() => { setFocusGroupId(null); setEditorOpen(true) }}
            >
              <Home className="mr-2 h-4 w-4" />
              Editar casas
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-medium break-words">{territory.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
              {territory.group && (
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: territory.group.color }}
                />
              )}
              {territory.group?.name || "Sem grupo"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
              <LayoutGrid className="h-3.5 w-3.5" />
              {territory.subdivisions?.length || 0} quadras
            </span>
            {territory.assigned_to_user && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <User className="h-3.5 w-3.5" />
                {territory.assigned_to_user.name}
              </span>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Quadras</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingBlock ? "Editar Quadra" : "Nova Quadra"}
                </DialogTitle>
                <DialogDescription>
                  {editingBlock
                    ? "Atualize os dados da quadra"
                    : "Crie uma quadra. Use o editor de mapa para definir os limites."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Identificador sugerido</Label>
                  <Input
                    value={formData.name}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use o editor de mapa para criar e nomear quadras
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : editingBlock ? (
                    "Salvar"
                  ) : (
                    "Criar"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <form onSubmit={handleAssign}>
            <DialogHeader>
              <DialogTitle>Designar Quadra</DialogTitle>
              <DialogDescription>
                Selecione um usuário para designar a quadra
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="user">Usuário</Label>
                <Select
                  value={assignData.user_id}
                  onValueChange={(value) =>
                    setAssignData({ ...assignData, user_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssignDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !assignData.user_id}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Designar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        {(!territory.subdivisions || territory.subdivisions.length === 0) && (
          <div className="rounded-xl border p-8 text-center">
            <Map className="h-10 w-10 text-muted-foreground mb-3 mx-auto" />
            <p className="font-medium">Nenhuma quadra criada</p>
            <p className="text-sm text-muted-foreground mb-4">
              Use o editor de mapa para desenhar as quadras
            </p>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/territories/${id}/map`}>
                <Map className="mr-2 h-4 w-4" />
                Abrir Editor de Mapa
              </Link>
            </Button>
          </div>
        )}

        <div className="grid gap-3 md:[grid-template-columns:repeat(auto-fill,minmax(280px,340px))]">
          {territory.subdivisions?.map((subdivisions, index) => {
            const status = getQuadraStatus(subdivisions)
            const houses = getHouseCounts(subdivisions)
            return (
              <div key={subdivisions.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">
                    Quadra {territory.number}-{String.fromCharCode(65 + index)}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className={status.badgeClassName}>
                      {status.label}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!subdivisions.completed && (
                          <DropdownMenuItem onClick={() => handleOpenAssignDialog(subdivisions)}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Designar
                          </DropdownMenuItem>
                        )}
                        {isSupervisor && (
                          <DropdownMenuItem onClick={() => { setFocusGroupId(subdivisions.id); setEditorOpen(true) }}>
                            <Home className="mr-2 h-4 w-4" />
                            Editar casas desta quadra
                          </DropdownMenuItem>
                        )}
                        {isSupervisor && (
                          <DropdownMenuItem onClick={() => handleGenerateFieldLink(subdivisions.id)}>
                            <Link2 className="mr-2 h-4 w-4" />
                            Link de campo
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleOpenDialog(subdivisions)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(subdivisions.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${status.percent}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {status.percent}%
                  </span>
                </div>
                {isSupervisor && (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Home className="h-3.5 w-3.5" />
                      Casas
                    </span>
                    <span className="font-medium text-foreground tabular-nums">
                      {houses.done}/{houses.total}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <Button
          variant="outline"
          onClick={() => handleOpenDialog()}
          className="w-full rounded-xl border-dashed bg-transparent text-muted-foreground hover:text-foreground justify-center"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova quadra
        </Button>
      </div>
    </div>
  )
}