// app/dashboard/territories/[id]/page.tsx
"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { ArrowLeft, Plus, Map, Loader2, MoreVertical, Pencil, Trash2, UserPlus } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Subdivision, Profile } from "@/lib/types"

interface Block {
  notes: string
  name: string
  id: string
  territory_id: string
  geometry: unknown
  order_index: number
  completed: boolean
}

interface DoNotVisit {
  id: string
  territory_id: string
  latitude?: number
  longitude?: number
  address?: string
  notes?: string
  created_at: string
}

interface TerritoryWithDetails {
  id: string
  number: string
  name: string
  group?: { id: string; name: string; color: string }
  subdivisions?: Block[]
  do_not_visits?: DoNotVisit[]
  assigned_to_user?: Profile
}

export default function TerritoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
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
  const [dnvDialogOpen, setDnvDialogOpen] = useState(false)
  const [editingDnv, setEditingDnv] = useState<DoNotVisit | null>(null)
  const [dnvFormData, setDnvFormData] = useState({
    address: "",
    notes: "",
  })
  const [assignData, setAssignData] = useState({
    user_id: "",
    due_date: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    try {
      console.log("Fetching territory with id:", id)

      const [territoryRes, usersRes] = await Promise.all([
        supabase
          .from("territories")
          .select(`
      *,
      subdivisions(*),
      do_not_visits(*),
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
        setTerritory(territoryRes.data as unknown as TerritoryWithDetails)
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
      const payload = {
        territory_id: id,
        geometry: null, // Will be set via map editor
        order_index: territory?.subdivisions?.length || 0,
        completed: false,
      }

      if (editingBlock) {
        // Block table doesn't have 'name' and 'notes' in your schema
        // Only has: geometry, order_index, completed
        // You may need to add these columns or handle differently
        console.warn("Block schema doesn't support name/notes. Update schema first.")
        
        const { error } = await supabase
          .from("subdivisions")
          .update(payload)
          .eq("id", editingBlock.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("subdivisions")
          .insert([payload])
        
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

  const handleDeleteDnv = async (dnvId: string) => {
    if (!confirm("Tem certeza que deseja excluir este registro de 'Não Visitar'?")) return

    try {
      const { error } = await supabase.from("do_not_visits").delete().eq("id", dnvId)
      if (error) throw error
      fetchData()
    } catch (error: any) {
      alert("Erro ao excluir Não Visitar: " + error.message)
    }
  }

  const handleEditDnv = (dnv: DoNotVisit) => {
    setEditingDnv(dnv)
    setDnvFormData({ address: dnv.address || "", notes: dnv.notes || "" })
    setDnvDialogOpen(true)
  }

  const handleDnvSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingDnv) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from("do_not_visits").update({
        address: dnvFormData.address,
        notes: dnvFormData.notes,
      }).eq("id", editingDnv.id)
      if (error) throw error
      setDnvDialogOpen(false)
      fetchData()
    } catch (error: any) {
      alert("Erro ao atualizar Não Visitar: " + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (completed: boolean) => {
    return completed ? (
      <Badge variant="secondary">Concluída</Badge>
    ) : (
      <Badge className="bg-green-500 hover:bg-green-600">Disponível</Badge>
    )
  }

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/territories">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {territory.group && (
              <div
                className="h-4 w-4 rounded-sm"
                style={{ backgroundColor: territory.group.color }}
              />
            )}
            <Badge variant="outline" className="font-mono">
              {territory.number}
            </Badge>
            <h1 className="text-3xl font-bold">{territory.name}</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            {territory.group?.name || "Sem grupo"} | {territory.subdivisions?.length || 0} quadras
            {territory.assigned_to_user && (
              <> | Designado para: {territory.assigned_to_user.name}</>
            )}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/dashboard/territories/${id}/map`}>
            <Map className="mr-2 h-4 w-4" />
            Editar Mapa
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Quadras</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Quadra
            </Button>
          </DialogTrigger>
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

      {!territory.subdivisions || territory.subdivisions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Map className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma quadra criada</p>
            <p className="text-sm text-muted-foreground mb-4">
              Use o editor de mapa para desenhar as quadras
            </p>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/territories/${id}/map`}>
                <Map className="mr-2 h-4 w-4" />
                Abrir Editor de Mapa
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {territory.subdivisions.map((subdivisions, index) => (
            <Card key={subdivisions.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      Quadra {territory.number}-{String.fromCharCode(65 + index)}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Ordem: {subdivisions.order_index + 1}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
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
              </CardHeader>
              <CardContent>
                {getStatusBadge(subdivisions.completed)}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Seção Não Visitar */}
      <div className="flex items-center justify-between mt-10 pt-6 border-t">
        <h2 className="text-xl font-semibold">Casas &quot;Não Visitar&quot;</h2>
      </div>

      {!territory.do_not_visits || territory.do_not_visits.length === 0 ? (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-muted-foreground">Nenhum registro de &quot;Não Visitar&quot; neste território.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {territory.do_not_visits.map((dnv) => {
            const date = new Date(dnv.created_at)
            const isExpired = new Date().getTime() - date.getTime() > 365 * 24 * 60 * 60 * 1000
            
            return (
              <Card key={dnv.id} className={isExpired ? "border-orange-300 bg-orange-50/50" : "border-red-200"}>
                <CardHeader className="pb-3 px-4 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base text-slate-800 break-words">
                        {dnv.address || "Endereço não informado"}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1 font-medium text-slate-500">
                        Criado em: {date.toLocaleDateString("pt-BR")}
                      </CardDescription>
                    </div>
                    <div className="flex gap-1 -mt-2 -mr-2 shrink-0">
                      <Button variant="ghost" size="icon" className="text-slate-400 hover:text-primary hover:bg-primary/5" onClick={() => handleEditDnv(dnv)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteDnv(dnv.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {isExpired && (
                    <Badge variant="outline" className="mb-2 bg-orange-100 text-orange-800 border-orange-200">
                      Expirado (Acima de 1 ano)
                    </Badge>
                  )}
                  {dnv.notes ? (
                    <p className="text-sm text-slate-600 line-clamp-3">{dnv.notes}</p>
                  ) : (
                    <p className="text-sm text-slate-400 italic">Sem observações adicionais.</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* DNV Edit Dialog */}
      <Dialog open={dnvDialogOpen} onOpenChange={setDnvDialogOpen}>
        <DialogContent>
          <form onSubmit={handleDnvSubmit}>
            <DialogHeader>
              <DialogTitle>Editar Não Visitar</DialogTitle>
              <DialogDescription>
                Atualize o endereço ou as observações desta casa bloqueada.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="address">Endereço (opcional)</Label>
                <Input
                  id="address"
                  value={dnvFormData.address}
                  onChange={(e) => setDnvFormData({ ...dnvFormData, address: e.target.value })}
                  placeholder="Ex: Rua das Flores, 123"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={dnvFormData.notes}
                  onChange={(e) => setDnvFormData({ ...dnvFormData, notes: e.target.value })}
                  placeholder="Ex: Morador pediu para não bater no portão."
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDnvDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}