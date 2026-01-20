// app/dashboard/users/page.tsx
"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { Loader2, Users, Search, Pencil, Trash2, UserPlus, Shield, User } from "lucide-react"
import type { Profile, UserRole } from "@/lib/types"

export default function UsersPage() {
  const { isAdmin, isDirigente, profile: currentUser } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [filteredUsers, setFilteredUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  
  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createData, setCreateData] = useState({
    name: "",
    email: "",
    password: "",
    role: "publicador" as UserRole,
  })
  
  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [editData, setEditData] = useState({
    name: "",
    role: "publicador" as UserRole,
  })
  
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null)
  
  const [submitting, setSubmitting] = useState(false)
  const supabase = getSupabaseBrowserClient()

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
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("name")

      if (error) throw error

      if (data) {
        setUsers(data as Profile[])
        setFilteredUsers(data as Profile[])
      }
    } catch (error) {
      console.error("Error fetching users:", error)
    } finally {
      setLoading(false)
    }
  }

  // Stats
  const totalUsers = users.length
  const adminCount = users.filter(u => u.role === "admin").length
  const dirigenteCount = users.filter(u => u.role === "dirigente").length
  const publicadorCount = users.filter(u => u.role === "publicador").length

  // Create user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // 1. Create user in Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: createData.email,
        password: createData.password,
        options: {
          data: {
            name: createData.name,
            role: createData.role,
          },
        },
      })

      if (authError) throw authError

      if (authData.user) {
        // 2. Insert into profiles (if trigger doesn't exist)
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({
            id: authData.user.id,
            name: createData.name,
            email: createData.email,
            role: createData.role,
          })

        if (profileError) throw profileError
      }

      setCreateDialogOpen(false)
      setCreateData({
        name: "",
        email: "",
        password: "",
        role: "publicador",
      })
      fetchUsers()
    } catch (error: any) {
      console.error("Error creating user:", error)
      alert("Erro ao criar usuário: " + (error.message || "Erro desconhecido"))
    } finally {
      setSubmitting(false)
    }
  }

  // Edit user
  const handleOpenEditDialog = (user: Profile) => {
    setSelectedUser(user)
    setEditData({
      name: user.name || "",
      role: user.role,
    })
    setEditDialogOpen(true)
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return
    setSubmitting(true)

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          name: editData.name,
          role: editData.role,
        })
        .eq("id", selectedUser.id)

      if (error) throw error

      setEditDialogOpen(false)
      fetchUsers()
    } catch (error: any) {
      console.error("Error updating user:", error)
      alert("Erro ao atualizar usuário: " + (error.message || "Erro desconhecido"))
    } finally {
      setSubmitting(false)
    }
  }

  // Delete user
  const handleOpenDeleteDialog = (user: Profile) => {
    setUserToDelete(user)
    setDeleteDialogOpen(true)
  }

  const handleDeleteUser = async () => {
    if (!userToDelete) return
    setSubmitting(true)

    try {
      // Delete from profiles (cascade will handle auth)
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userToDelete.id)

      if (error) throw error

      setDeleteDialogOpen(false)
      setUserToDelete(null)
      fetchUsers()
    } catch (error: any) {
      console.error("Error deleting user:", error)
      alert("Erro ao excluir usuário: " + (error.message || "Erro desconhecido"))
    } finally {
      setSubmitting(false)
    }
  }

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "admin":
        return (
          <Badge className="bg-red-500 hover:bg-red-600">
            <Shield className="h-3 w-3 mr-1" />
            Admin
          </Badge>
        )
      case "dirigente":
        return (
          <Badge className="bg-blue-500 hover:bg-blue-600">
            <User className="h-3 w-3 mr-1" />
            Dirigente
          </Badge>
        )
      case "publicador":
        return <Badge variant="secondary">Publicador</Badge>
      default:
        return <Badge variant="secondary">{role}</Badge>
    }
  }

  const canManageUsers = isAdmin || isDirigente

  if (!canManageUsers) {
    return (
      <div className="text-center py-12">
        <Users className="h-12 w-12 text-muted-foreground mb-4 mx-auto" />
        <p className="text-muted-foreground">
          Você não tem permissão para acessar esta página
        </p>
      </div>
    )
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
        <h1 className="text-3xl font-bold">Usuários</h1>
        <p className="text-muted-foreground">Gerencie os usuários e suas permissões</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Usuários</p>
                <p className="text-2xl font-bold">{totalUsers}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Administradores</p>
                <p className="text-2xl font-bold">{adminCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                <Shield className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Dirigentes</p>
                <p className="text-2xl font-bold">{dirigenteCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
                <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Publicadores</p>
                <p className="text-2xl font-bold">{publicadorCount}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <Users className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Lista de Usuários</CardTitle>
              <CardDescription>{filteredUsers.length} usuários</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuário..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {isAdmin && (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Novo Usuário
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Nenhum usuário encontrado</p>
              <p className="text-sm text-muted-foreground">
                {search ? "Tente buscar com outros termos" : "Não há usuários cadastrados"}
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
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name || "Sem nome"}
                      {user.id === currentUser?.id && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Você
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>{new Date(user.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEditDialog(user)}
                          title="Editar usuário"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isAdmin && user.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDeleteDialog(user)}
                            title="Excluir usuário"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreateUser}>
            <DialogHeader>
              <DialogTitle>Novo Usuário</DialogTitle>
              <DialogDescription>Crie um novo usuário no sistema</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Nome completo *</Label>
                <Input
                  id="create-name"
                  value={createData.name}
                  onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
                  placeholder="João Silva"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">E-mail *</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={createData.email}
                  onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
                  placeholder="joao@email.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Senha *</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={createData.password}
                  onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-role">Função *</Label>
                <Select
                  value={createData.role}
                  onValueChange={(v) => setCreateData({ ...createData, role: v as UserRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="publicador">Publicador</SelectItem>
                    <SelectItem value="dirigente">Dirigente</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Usuário"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <form onSubmit={handleUpdateUser}>
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
              <DialogDescription>
                Altere os dados de {selectedUser?.name || selectedUser?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome completo</Label>
                <Input
                  id="edit-name"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  placeholder="Nome do usuário"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Função</Label>
                <Select
                  value={editData.role}
                  onValueChange={(v) => setEditData({ ...editData, role: v as UserRole })}
                >
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
                  <strong>Publicador:</strong> Acesso limitado às suas designações
                  <br />
                  <strong>Dirigente:</strong> Pode gerenciar territórios e designações
                  <br />
                  <strong>Admin:</strong> Acesso total ao sistema
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir o usuário <strong>{userToDelete?.name || userToDelete?.email}</strong>.
              Esta ação não pode ser desfeita e todos os dados relacionados a este usuário serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={submitting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir Usuário"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}