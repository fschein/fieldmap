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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, UserPlus, Pencil, Trash2, Mail, Phone, ShieldAlert, Lock, Copy, RefreshCw, CheckCircle2 } from "lucide-react"

interface UserProfile {
  id: string
  name: string
  email: string
  role: "admin" | "dirigente" | "publicador"
  phone: string | null
  gender?: "M" | "F"
  must_change_password?: boolean
  last_seen_at?: string
}

function generateTempPassword() {
  const lower = "abcdefghjkmnpqrstuvwxyz"
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ"
  const digits = "23456789"
  const special = "!@#$%&"
  const all = lower + upper + digits + special

  // Garante ao menos 1 de cada tipo
  let pass = [
    lower.charAt(Math.floor(Math.random() * lower.length)),
    upper.charAt(Math.floor(Math.random() * upper.length)),
    digits.charAt(Math.floor(Math.random() * digits.length)),
    special.charAt(Math.floor(Math.random() * special.length)),
  ]

  for (let i = 0; i < 6; i++) {
    pass.push(all.charAt(Math.floor(Math.random() * all.length)))
  }

  // Embaralha
  return pass.sort(() => Math.random() - 0.5).join("")
}

export default function UsersPage() {
  const { isReady, isAdmin, isDirigente, user } = useAuth()

  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  // Modal de Criar/Editar
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    email: string
    role: "admin" | "dirigente" | "publicador"
    phone: string
    gender: "M" | "F"
    password: string
  }>({ name: "", email: "", role: "publicador", phone: "", gender: "M", password: "" })

  // Modal de Redefinir Senha
  const [resetUser, setResetUser] = useState<UserProfile | null>(null)
  const [tempPassword, setTempPassword] = useState("")
  const [isCopied, setIsCopied] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const supabase = getSupabaseBrowserClient()

  const fetchUsers = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, phone, last_seen_at")
        .order("name")
      if (error) throw error
      setUsers(data as UserProfile[])
    } catch (err: any) {
      console.error("Erro ao buscar usuários:", err.message)
    } finally {
      setLoading(false)
    }
  }, [supabase, user])

  useEffect(() => {
    if (isReady && user && (isAdmin || isDirigente)) {
      fetchUsers()
    }
  }, [isReady, isAdmin, isDirigente, user, fetchUsers])

  // ─────────── Criar / Editar ───────────
  const handleOpenDialog = (u?: UserProfile) => {
    if (u) {
      setEditingUser(u)
      setFormData({ name: u.name, email: u.email, role: u.role, phone: u.phone || "", gender: u.gender || "M", password: "" })
    } else {
      setEditingUser(null)
      setFormData({ name: "", email: "", role: "publicador", phone: "", gender: "M", password: generateTempPassword() })
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const profilePayload = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        phone: formData.phone || null,
        updated_at: new Date().toISOString(),
      }

      if (editingUser) {
        const { error } = await supabase.from("profiles").update(profilePayload).eq("id", editingUser.id)
        if (error) throw error
      } else {
        // Novo usuário via API Admin
        const res = await fetch("/api/admin/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formData }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Erro ao criar usuário")
      }
      setIsDialogOpen(false)
      fetchUsers()
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─────────── Redefinir Senha ───────────
  const handleOpenResetDialog = (u: UserProfile) => {
    setResetUser(u)
    setTempPassword(generateTempPassword())
    setIsCopied(false)
    setResetError(null)
  }

  const handleConfirmReset = async () => {
    if (!resetUser) return
    setIsResetting(true)
    setResetError(null)
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: resetUser.id, newPassword: tempPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erro ao redefinir senha")
      // Sucesso — fechar o modal
      setResetUser(null)
    } catch (err: any) {
      setResetError(err.message)
    } finally {
      setIsResetting(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPassword)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2500)
  }

  // ─────────── Deletar ───────────
  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este usuário permanentemente?")) return
    const { error } = await supabase.from("profiles").delete().eq("id", id)
    if (!error) fetchUsers()
  }

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
              <TableHead>Visto por último</TableHead>
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
                  <TableCell className="font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${u.gender === "F" ? "bg-pink-400" : "bg-blue-400"}`}
                        title={u.gender === "F" ? "Irmã" : "Irmão"}
                      />
                      {u.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {u.email}</div>
                      {u.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {u.phone}</div>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "outline"} className="capitalize text-[9px]">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-[11px] text-slate-500 italic">
                      {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : "Nunca"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Redefinir senha"
                        onClick={() => handleOpenResetDialog(u)}
                      >
                        <Lock className="h-4 w-4 text-orange-400" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(u)}>
                        <Pencil className="h-4 w-4 text-slate-300" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)}>
                        <Trash2 className="h-4 w-4 text-destructive/60" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Modal Criar/Editar ── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
              <DialogDescription>Ajuste as permissões e dados do perfil.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="name" className="text-xs">Nome Completo</Label>
                  <Input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sexo</Label>
                  <Select value={formData.gender} onValueChange={(v: any) => setFormData({ ...formData, gender: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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

              {!editingUser && (
                <div className="space-y-1 bg-amber-50 p-3 rounded-md border border-amber-100">
                  <Label className="text-xs text-amber-900 font-bold">Senha Temporária</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={formData.password} className="bg-white font-mono text-sm" />
                    <Button type="button" size="sm" variant="outline" onClick={() => setFormData({ ...formData, password: generateTempPassword() })}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(formData.password) }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-amber-700 mt-1">Copie esta senha e envie ao usuário. Ele deverá trocá-la no primeiro acesso.</p>
                </div>
              )}
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

      {/* ── Modal Redefinir Senha ── */}
      <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-orange-500" />
              Redefinir Senha
            </DialogTitle>
            <DialogDescription>
              Uma nova senha temporária será gerada para <strong>{resetUser?.name}</strong>. Copie e envie ao usuário — ele deverá trocá-la no próximo acesso.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <Label className="text-xs text-muted-foreground">Nova senha temporária</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={tempPassword}
                className="font-mono text-base tracking-widest text-center"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => { setTempPassword(generateTempPassword()); setIsCopied(false) }}
                title="Gerar nova senha"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <Button
              type="button"
              variant={isCopied ? "default" : "outline"}
              className={`w-full transition-colors ${isCopied ? "bg-green-600 text-white" : ""}`}
              onClick={handleCopy}
            >
              {isCopied ? (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Copiado!</>
              ) : (
                <><Copy className="h-4 w-4 mr-2" /> Copiar Senha</>
              )}
            </Button>

            {resetError && (
              <Alert variant="destructive">
                <AlertDescription>{resetError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setResetUser(null)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmReset}
              disabled={isResetting}
              className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar e Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}