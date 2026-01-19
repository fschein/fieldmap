"use client"

import React, { useEffect, useState } from "react"
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
import { Plus, Palette, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Group } from "@/lib/types"

const PRESET_COLORS = [
  { name: "Azul", value: "#3b82f6" },
  { name: "Verde", value: "#22c55e" },
  { name: "Amarelo", value: "#eab308" },
  { name: "Laranja", value: "#f97316" },
  { name: "Vermelho", value: "#ef4444" },
  { name: "Roxo", value: "#8b5cf6" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Ciano", value: "#06b6d4" },
  { name: "Índigo", value: "#6366f1" },
  { name: "Verde Lima", value: "#84cc16" },
  { name: "Âmbar", value: "#f59e0b" },
  { name: "Esmeralda", value: "#10b981" },
]

// Validar cor hex
const isValidHexColor = (color: string): boolean => {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: PRESET_COLORS[0].value,
  })
  const [customColor, setCustomColor] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    fetchGroups()
  }, [])

  async function fetchGroups() {
    console.log("Fetching groups...")
    try {
      const { data, error } = await supabase
        .from("groups")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching groups:", error)
      } else {
        console.log("Groups fetched:", data?.length || 0)
        if (data) {
          setGroups(data as Group[])
        }
      }
    } catch (err) {
      console.error("Exception fetching groups:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (group?: Group) => {
    if (group) {
      setEditingGroup(group)
      setFormData({
        name: group.name,
        description: group.description || "",
        color: group.color,
      })
      setCustomColor("")
    } else {
      setEditingGroup(null)
      setFormData({
        name: "",
        description: "",
        color: PRESET_COLORS[0].value,
      })
      setCustomColor("")
    }
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validar cor customizada se fornecida
    if (customColor.trim() && !isValidHexColor(customColor)) {
      alert("Cor inválida! Use o formato #RRGGBB (ex: #FF5733)")
      return
    }

    setSubmitting(true)

    const finalColor = customColor.trim() || formData.color

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      color: finalColor,
    }

    console.log("Submitting group:", payload)

    try {
      if (editingGroup) {
        const { error } = await supabase
          .from("groups")
          .update(payload)
          .eq("id", editingGroup.id)

        if (error) {
          console.error("Error updating group:", error)
          alert("Erro ao atualizar grupo: " + (error.message || "Erro desconhecido"))
        } else {
          setDialogOpen(false)
          fetchGroups()
        }
      } else {
        const { error } = await supabase
          .from("groups")
          .insert([payload])

        if (error) {
          console.error("Error creating group:", error)
          alert("Erro ao criar grupo: " + (error.message || "Erro desconhecido"))
        } else {
          setDialogOpen(false)
          fetchGroups()
        }
      }
    } catch (error: any) {
      console.error("Exception submitting group:", error)
      alert("Erro ao salvar grupo: " + (error?.message || "Erro desconhecido"))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este grupo? Territórios associados ficarão sem grupo.")) {
      return
    }

    const { error } = await supabase
      .from("groups")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Error deleting group:", error)
      alert("Erro ao excluir grupo: " + (error.message || "Erro desconhecido"))
    } else {
      fetchGroups()
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Grupos</h1>
          <p className="text-muted-foreground">
            Organize territórios em grupos com cores
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Grupo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingGroup ? "Editar Grupo" : "Novo Grupo"}
                </DialogTitle>
                <DialogDescription>
                  {editingGroup
                    ? "Atualize os dados do grupo"
                    : "Crie um grupo para organizar territórios"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do grupo *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e: { currentTarget: { value: any } }) =>
                      setFormData({ ...formData, name: e.currentTarget.value })
                    }
                    placeholder="Ex: Zona Norte, Centro, Região Sul"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e: { currentTarget: { value: any } }) =>
                      setFormData({ ...formData, description: e.currentTarget.value })
                    }
                    placeholder="Descrição opcional do grupo..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cor do grupo</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        title={color.name}
                        className={`h-10 w-10 rounded-lg border-2 transition-all hover:scale-110 ${
                          formData.color === color.value && !customColor
                            ? "scale-110 border-foreground ring-2 ring-foreground ring-offset-2"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: color.value }}
                        onClick={() => {
                          setFormData({ ...formData, color: color.value })
                          setCustomColor("")
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customColor">Ou escolha uma cor customizada (hex)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="customColor"
                      type="text"
                      value={customColor}
                      onChange={(e: { currentTarget: { value: any } }) => setCustomColor(e.currentTarget.value)}
                      placeholder="#FF5733"
                      maxLength={7}
                    />
                    {customColor && isValidHexColor(customColor) && (
                      <div
                        className="h-10 w-10 rounded border-2 border-border flex-shrink-0"
                        style={{ backgroundColor: customColor }}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Formato: #RRGGBB (ex: #FF5733)
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
                <Button type="submit" disabled={submitting || formData.name.trim() === ""}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : editingGroup ? (
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

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Palette className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum grupo criado</p>
            <p className="text-sm text-muted-foreground mb-4">
              Crie grupos para organizar seus territórios
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Grupo
            </Button>
          </CardContent>
        </Card>
      ) : (
        // ...existing code...

<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  {groups.map((group) => (
    <Card key={group.id}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="h-10 w-10 rounded-lg flex-shrink-0 border-2 border-border"
              style={{ backgroundColor: group.color }}
            />
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg truncate">{group.name}</CardTitle>
              {group.description && (
                <CardDescription className="line-clamp-2 mt-1">
                  {group.description}
                </CardDescription>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="flex-shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleOpenDialog(group)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => handleDelete(group.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <Badge variant="outline" className="font-mono">
          {group.color}
        </Badge>
      </CardContent>
    </Card>
  ))}
</div>

// ...existing code...
      )}
    </div>
  )
}