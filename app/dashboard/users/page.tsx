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
import { Loader2, UserPlus, Pencil, Trash2, Mail, Phone, ShieldAlert, Lock, Copy, RefreshCw, CheckCircle2, UserCheck, UserMinus } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface UserProfile {
  id: string
  name: string
  email: string
  role: "admin" | "dirigente" | "publicador" | "supervisor"
  phone: string | null
  group_id?: string | null
  groups?: { name: string } | null
  gender?: "M" | "F"
  must_change_password?: boolean
  is_active?: boolean
  last_seen_at?: string
}

interface Group {
  id: string
  name: string
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
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)

  // Modal de Criar/Editar
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    email: string
    role: "admin" | "dirigente" | "publicador" | "supervisor"
    phone: string
    gender: "M" | "F"
    groupId: string
    password: string
    isActive: boolean
  }>({ name: "", email: "", role: "publicador", phone: "", gender: "M", groupId: "none", password: "", isActive: true })

  // Modal de Redefinir Senha
  const [resetUser, setResetUser] = useState<UserProfile | null>(null)
  const [tempPassword, setTempPassword] = useState("")
  const [isCopied, setIsCopied] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const supabase = getSupabaseBrowserClient()

  const fetchGroups = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("groups").select("id, name").order("name")
      if (error) throw error
      setGroups(data || [])
    } catch (err: any) {
      console.error("Erro ao buscar grupos:", err.message)
    }
  }, [supabase])

  const fetchUsers = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, phone, last_seen_at, group_id, is_active, gender, groups(name)")
        .order("name")
      if (error) throw error
      setUsers(data as any[])
    } catch (err: any) {
      console.error("Erro ao buscar usuários:", err.message)
    } finally {
      setLoading(false)
    }
  }, [supabase, user])

  useEffect(() => {
    if (isReady && user && (isAdmin || isDirigente)) {
      fetchGroups()
      fetchUsers()
    }
  }, [isReady, isAdmin, isDirigente, user, fetchUsers, fetchGroups])

  // ─────────── Criar / Editar ───────────
  const handleOpenDialog = (u?: UserProfile) => {
    if (u) {
      setEditingUser(u)
      setFormData({ 
        name: u.name, 
        email: u.email, 
        role: u.role, 
        phone: u.phone || "", 
        gender: u.gender || "M", 
        groupId: u.group_id || "none",
        password: "" ,
        isActive: u.is_active !== false
      })
    } else {
      setEditingUser(null)
      setFormData({ 
        name: "", 
        email: "", 
        role: "publicador", 
        phone: "", 
        gender: "M", 
        groupId: "none",
        password: generateTempPassword(),
        isActive: true
      })
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
        group_id: formData.groupId === "none" ? null : formData.groupId,
        is_active: formData.isActive,
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
          body: JSON.stringify({ 
            ...formData, 
            group_id: formData.groupId === "none" ? null : formData.groupId 
          }),
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">Usuários</h1>
          <p className="text-xs text-muted-foreground font-medium mt-1">Controle de acesso, níveis de permissão e contatos.</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <UserPlus className="mr-2 h-4 w-4" /> Criar Usuário
        </Button>
      </div>

      <div className="border border-border rounded-sm bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-[200px]">Nome</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>Visto por último</TableHead>
              <TableHead className="text-right sr-only">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">Nenhum usuário cadastrado.</TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                 <TableRow key={u.id} className="hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => handleOpenDialog(u)}>
                   <TableCell className="font-medium text-foreground">
                     <div className="flex items-center gap-2">
                       <span
                         className={cn(
                           "w-2 h-2 rounded-full",
                           u.is_active === false ? "bg-muted-foreground/30" : (u.gender === "F" ? "bg-pink-500" : "bg-primary")
                         )}
                         title={u.is_active === false ? "Inativo" : (u.gender === "F" ? "Irmã" : "Irmão")}
                       />
                       <span className={u.is_active === false ? "text-muted-foreground" : ""}>{u.name}</span>
                       {u.is_active === false && <Badge variant="secondary" className="text-[0.5625rem] h-4 px-1">Inativo</Badge>}
                     </div>
                   </TableCell>
                   <TableCell className={u.is_active === false ? "opacity-50" : ""}>
                     <div className="flex flex-col gap-1 text-[0.6875rem] text-muted-foreground">
                       <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {u.email}</div>
                       {u.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {u.phone}</div>}
                     </div>
                   </TableCell>
                   <TableCell className={u.is_active === false ? "opacity-50" : ""}>
                     {u.groups?.name ? (
                       <Badge variant="secondary" className="text-[0.625rem]">
                         {u.groups.name}
                       </Badge>
                     ) : (
                       <span className="text-[0.625rem] text-muted-foreground italic">Sem grupo</span>
                     )}
                   </TableCell>
                   <TableCell className={u.is_active === false ? "opacity-50" : ""}>
                     <Badge variant={u.role === "admin" ? "default" : "outline"} className="capitalize text-[0.5625rem]">
                       {u.role}
                     </Badge>
                   </TableCell>
                   <TableCell className={u.is_active === false ? "opacity-50" : ""}>
                     <span className="text-[0.6875rem] text-muted-foreground italic">
                       {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString('pt-BR', {
                         day: '2-digit',
                         month: '2-digit',
                         year: 'numeric',
                         hour: '2-digit',
                         minute: '2-digit'
                       }) : "Nunca"}
                     </span>
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de Usuário</Label>
                  <Select value={formData.role} onValueChange={(v: any) => setFormData({ ...formData, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="publicador">Publicador</SelectItem>
                      <SelectItem value="dirigente">Dirigente</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Grupo (Domingo)</Label>
                  <Select value={formData.groupId} onValueChange={(v) => setFormData({ ...formData, groupId: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {groups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editingUser && (
                <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Status do Usuário</Label>
                    <p className="text-xs text-muted-foreground">
                      {formData.isActive ? "Acesso liberado ao sistema." : "Acesso bloqueado temporariamente."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[0.625rem] font-bold text-muted-foreground uppercase tracking-wider">{formData.isActive ? "Ativo" : "Inativo"}</span>
                    <Switch 
                      checked={formData.isActive} 
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} 
                    />
                  </div>
                </div>
              )}

              {editingUser && (
                <div className="bg-primary/5 p-3 rounded-md border border-primary/20 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs text-primary font-bold flex items-center gap-1.5">
                      <Lock className="h-3 w-3" /> Segurança
                    </Label>
                    <p className="text-[0.625rem] text-primary/70">Redefinir acesso do usuário.</p>
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-[0.6875rem] border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => handleOpenResetDialog(editingUser)}
                  >
                    Redefinir Senha
                  </Button>
                </div>
              )}

              {!editingUser && (
                <div className="space-y-1 bg-yellow-500/10 p-3 rounded-md border border-yellow-500/20">
                  <Label className="text-xs text-foreground font-bold italic">Senha Temporária</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={formData.password} className="bg-card font-mono text-sm border-border" />
                    <Button type="button" size="sm" variant="outline" onClick={() => setFormData({ ...formData, password: generateTempPassword() })}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(formData.password) }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[0.625rem] text-muted-foreground mt-1">Copie esta senha e envie ao usuário. Ele deverá trocá-la no primeiro acesso.</p>
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
              <Lock className="h-4 w-4 text-primary" />
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
              className={cn("w-full transition-colors", isCopied && "bg-emerald-600 text-white")}
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
              className="w-full sm:w-auto bg-primary text-primary-foreground"
            >
              {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar e Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}