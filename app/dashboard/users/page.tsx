"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, UserPlus, Pencil, Trash2, Mail, Phone, ShieldAlert } from "lucide-react"

interface UserProfile {
  id: string
  name: string
  email: string
  role: "admin" | "dirigente" | "publicador"
  phone: string | null
}

export default function UsersPage() {
  // 1. ADICIONAR 'user' AQUI
  const { isReady, isAdmin, isDirigente, user } = useAuth()
  
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)

  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: "admin" | "dirigente" | "publicador";
    phone: string;
  }>({ 
    name: "", 
    email: "", 
    role: "publicador", 
    phone: "" 
  })

  const supabase = getSupabaseBrowserClient()

  const fetchUsers = useCallback(async () => {
    // 2. PROTEÇÃO: Se não tem user, não busca (evita erro de permissão na navegação)
    if (!user) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, phone")
        .order("name")

      if (error) throw error
      setUsers(data as UserProfile[])
    } catch (err: any) {
      console.error("Erro ao buscar usuários:", err.message)
    } finally {
      setLoading(false)
    }
  }, [supabase, user]) // 3. ADICIONAR 'user' NAS DEPENDÊNCIAS

  useEffect(() => {
    // 4. GATILHO PERFEITO: Roda no F5 (quando isReady vira true) E na navegação (quando user monta)
    if (isReady && user && (isAdmin || isDirigente)) {
      fetchUsers()
    }
  }, [isReady, isAdmin, isDirigente, user, fetchUsers])

  // ... (O resto das funções handleOpenDialog, handleSubmit, handleDelete permanecem iguais)
  const handleOpenDialog = (user?: UserProfile) => {
    if (user) {
      setEditingUser(user)
      setFormData({ 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        phone: user.phone || "" 
      })
    } else {
      setEditingUser(null)
      setFormData({ name: "", email: "", role: "publicador", phone: "" })
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        phone: formData.phone || null,
        updated_at: new Date().toISOString()
      }
      if (editingUser) {
        const { error } = await supabase.from("profiles").update(payload).eq("id", editingUser.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("profiles").insert([payload])
        if (error) throw error
      }
      setIsDialogOpen(false)
      fetchUsers()
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este usuário permanentemente?")) return
    const { error } = await supabase.from("profiles").delete().eq("id", id)
    if (!error) fetchUsers()
  }
  // ... (Fim das funções auxiliares)

  if (!isReady) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
      </div>
    )
  }

  if (!isAdmin && !isDirigente) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive/40" />
        <h2 className="text-xl font-bold">Acesso Restrito</h2>
        <p className="text-muted-foreground text-center">Somente administradores ou dirigentes podem gerenciar esta lista.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">Controle de acesso e contatos.</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <UserPlus className="mr-2 h-4 w-4" /> Criar Usuário
        </Button>
      </div>

      <div className="border rounded-sm bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[250px]">Nome</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-200" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-slate-400 italic">Nenhum usuário cadastrado.</TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-700">{u.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {u.email}</div>
                      {u.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {u.phone}</div>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? 'default' : 'outline'} className="capitalize text-[9px]">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(u)}><Pencil className="h-4 w-4 text-slate-300" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)}><Trash2 className="h-4 w-4 text-destructive/60" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Dialogs mantidos iguais */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
              <DialogDescription>Ajuste as permissões e dados do perfil.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs">Nome Completo</Label>
                <Input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs">E-mail</Label>
                  <Input id="email" type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs">Telefone</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(51) 99999-9999" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo de Usuário</Label>
                <Select value={formData.role} onValueChange={(v: any) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="publicador">Publicador</SelectItem>
                    <SelectItem value="dirigente">Dirigente</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
                {editingUser ? "Salvar Alterações" : "Criar Usuário"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}