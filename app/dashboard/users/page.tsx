"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, Users, Search, Pencil } from "lucide-react"
import type { Profile, UserRole } from "@/lib/types"
import { useSearchParams } from "next/navigation"
import Loading from "./loading"

export default function UsersPage() {
  const { isAdmin } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [filteredUsers, setFilteredUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [newRole, setNewRole] = useState<UserRole>("publicador")
  const [submitting, setSubmitting] = useState(false)
  const supabase = getSupabaseBrowserClient()
  const searchParams = useSearchParams()

  useEffect(() => {
    fetchUsers()
  }, [])

  useEffect(() => {
    const filtered = users.filter(
      (user) =>
        user.name?.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase())
    )
    setFilteredUsers(filtered)
  }, [search, users])

  async function fetchUsers() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("name")

    if (data) {
      setUsers(data as Profile[])
      setFilteredUsers(data as Profile[])
    }
    setLoading(false)
  }

  const handleOpenEditDialog = (user: Profile) => {
    setSelectedUser(user)
    setNewRole(user.role)
    setEditDialogOpen(true)
  }

  const handleUpdateRole = async () => {
    if (!selectedUser) return
    setSubmitting(true)

    await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", selectedUser.id)

    setEditDialogOpen(false)
    setSubmitting(false)
    fetchUsers()
  }

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-red-500 hover:bg-red-600">Admin</Badge>
      case "dirigente":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Dirigente</Badge>
      case "publicador":
        return <Badge variant="secondary">Publicador</Badge>
      default:
        return <Badge variant="secondary">{role}</Badge>
    }
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Você não tem permissão para acessar esta página
        </p>
      </div>
    )
  }

  if (loading) {
    return <Loading />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Usuários</h1>
        <p className="text-muted-foreground">
          Gerencie os usuários e suas permissões
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Lista de Usuários</CardTitle>
              <CardDescription>
                {users.length} usuários cadastrados
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar usuário..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Nenhum usuário encontrado</p>
              <p className="text-sm text-muted-foreground">
                {search
                  ? "Tente buscar com outros termos"
                  : "Não há usuários cadastrados"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Cadastrado em</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name || "Sem nome"}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditDialog(user)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Role Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Função</DialogTitle>
            <DialogDescription>
              Altere a função do usuário {selectedUser?.name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Função</label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publicador">Publicador</SelectItem>
                  <SelectItem value="dirigente">Dirigente</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                <strong>Publicador:</strong> Pode ver e trabalhar em suas designações.
                <br />
                <strong>Dirigente:</strong> Pode gerenciar territórios e designações.
                <br />
                <strong>Admin:</strong> Acesso total ao sistema.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateRole} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
