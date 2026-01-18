"use client"

import React from "react"

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
import type { TerritoryWithBlocks, Block, Profile } from "@/lib/types"

export default function TerritoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [territory, setTerritory] = useState<TerritoryWithBlocks | null>(null)
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
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    const [territoryRes, usersRes] = await Promise.all([
      supabase
        .from("territories")
        .select(`
          *,
          blocks(*),
          campaign:campaigns(*)
        `)
        .eq("id", id)
        .single(),
      supabase.from("profiles").select("*").order("full_name"),
    ])

    if (territoryRes.data) {
      setTerritory(territoryRes.data as TerritoryWithBlocks)
    }
    if (usersRes.data) {
      setUsers(usersRes.data as Profile[])
    }
    setLoading(false)
  }

  const handleOpenDialog = (block?: Block) => {
    if (block) {
      setEditingBlock(block)
      setFormData({
        name: block.name,
        notes: block.notes || "",
      })
    } else {
      setEditingBlock(null)
      const blockCount = territory?.blocks?.length || 0
      setFormData({
        name: `Quadra ${blockCount + 1}`,
        notes: "",
      })
    }
    setDialogOpen(true)
  }

  const handleOpenAssignDialog = (block: Block) => {
    setSelectedBlock(block)
    setAssignData({ user_id: "", due_date: "" })
    setAssignDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const payload = {
      name: formData.name,
      notes: formData.notes || null,
      territory_id: id,
    }

    if (editingBlock) {
      await supabase.from("blocks").update(payload).eq("id", editingBlock.id)
    } else {
      await supabase.from("blocks").insert(payload)
    }

    setDialogOpen(false)
    setSubmitting(false)
    fetchData()
  }

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBlock) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()

    // Create assignment
    await supabase.from("assignments").insert({
      block_id: selectedBlock.id,
      user_id: assignData.user_id,
      assigned_by: user?.id,
      due_date: assignData.due_date || null,
      status: "pending",
    })

    // Update block status
    await supabase
      .from("blocks")
      .update({ status: "assigned" })
      .eq("id", selectedBlock.id)

    setAssignDialogOpen(false)
    setSubmitting(false)
    fetchData()
  }

  const handleDelete = async (blockId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta quadra?")) return

    await supabase.from("blocks").delete().eq("id", blockId)
    fetchData()
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-500 hover:bg-green-600">Disponível</Badge>
      case "assigned":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Designada</Badge>
      case "completed":
        return <Badge variant="secondary">Concluída</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
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
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: territory.color }}
            />
            <h1 className="text-3xl font-bold">{territory.name}</h1>
          </div>
          <p className="text-muted-foreground">
            {territory.campaign?.name || "Sem campanha"} |{" "}
            {territory.blocks?.length || 0} quadras
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
                    : "Adicione uma nova quadra ao território"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da quadra</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Ex: Quadra 1, Rua Principal"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="Informações adicionais..."
                  />
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
                Selecione um publicador para designar a quadra {selectedBlock?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="user">Publicador</Label>
                <Select
                  value={assignData.user_id}
                  onValueChange={(value) =>
                    setAssignData({ ...assignData, user_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um publicador" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">Data limite (opcional)</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={assignData.due_date}
                  onChange={(e) =>
                    setAssignData({ ...assignData, due_date: e.target.value })
                  }
                />
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

      {territory.blocks?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Map className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma quadra criada</p>
            <p className="text-sm text-muted-foreground mb-4">
              Adicione quadras manualmente ou use o editor de mapa
            </p>
            <div className="flex gap-2">
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Quadra
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/dashboard/territories/${id}/map`}>
                  <Map className="mr-2 h-4 w-4" />
                  Editar Mapa
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {territory.blocks?.map((block) => (
            <Card key={block.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{block.name}</CardTitle>
                    {block.notes && (
                      <CardDescription>{block.notes}</CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {block.status === "available" && (
                        <DropdownMenuItem onClick={() => handleOpenAssignDialog(block)}>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Designar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleOpenDialog(block)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(block.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {getStatusBadge(block.status)}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
