"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, CheckCircle2, Copy, Loader2, Lock, RefreshCw, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"

interface UserProfile {
  id: string
  name: string
  email: string
  role: "admin" | "dirigente" | "publicador" | "supervisor"
  phone: string | null
  group_id?: string | null
  gender?: "M" | "F"
  is_active?: boolean
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

  let pass = [
    lower.charAt(Math.floor(Math.random() * lower.length)),
    upper.charAt(Math.floor(Math.random() * upper.length)),
    digits.charAt(Math.floor(Math.random() * digits.length)),
    special.charAt(Math.floor(Math.random() * special.length)),
  ]

  for (let i = 0; i < 6; i++) {
    pass.push(all.charAt(Math.floor(Math.random() * all.length)))
  }

  return pass.sort(() => Math.random() - 0.5).join("")
}

export default function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { isReady, isAdmin, isDirigente, user } = useAuth()
  const supabase = getSupabaseBrowserClient()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<{
    name: string
    email: string
    role: "admin" | "dirigente" | "publicador" | "supervisor"
    phone: string
    gender: "M" | "F"
    groupId: string
    isActive: boolean
    aptoCondominio: boolean
  }>({ name: "", email: "", role: "publicador", phone: "", gender: "M", groupId: "none", isActive: true, aptoCondominio: false })

  // Modal de Redefinir Senha
  const [isResetOpen, setIsResetOpen] = useState(false)
  const [tempPassword, setTempPassword] = useState("")
  const [isCopied, setIsCopied] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: userData, error: userError } = await supabase
      .from("profiles")
      .select("id, name, email, role, phone, group_id, gender, is_active, apto_condominio")
      .eq("id", id)
      .single()

    if (userError || !userData) {
      setNotFound(true)
      setLoading(false)
      return
    }

    // Inclui o grupo atual do usuário mesmo se estiver inativo, para não sumir do seletor
    let groupsQuery = supabase.from("groups").select("id, name").order("name")
    groupsQuery = userData.group_id
      ? groupsQuery.or(`is_active.eq.true,id.eq.${userData.group_id}`)
      : groupsQuery.eq("is_active", true)
    const { data: groupsData } = await groupsQuery

    setFormData({
      name: userData.name,
      email: userData.email,
      role: userData.role,
      phone: userData.phone || "",
      gender: userData.gender || "M",
      groupId: userData.group_id || "none",
      isActive: userData.is_active !== false,
      aptoCondominio: userData.apto_condominio === true,
    })
    setGroups(groupsData || [])
    setLoading(false)
  }, [supabase, id])

  useEffect(() => {
    if (isReady && user && (isAdmin || isDirigente)) {
      fetchData()
    }
  }, [isReady, isAdmin, isDirigente, user, fetchData])

  const handleBack = () => router.push("/dashboard/users")

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
        apto_condominio: formData.aptoCondominio,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from("profiles").update(profilePayload).eq("id", id)
      if (error) throw error
      handleBack()
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─────────── Redefinir Senha ───────────
  const handleOpenResetDialog = () => {
    setTempPassword(generateTempPassword())
    setIsCopied(false)
    setResetError(null)
    setIsResetOpen(true)
  }

  const handleConfirmReset = async () => {
    setIsResetting(true)
    setResetError(null)
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, newPassword: tempPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erro ao redefinir senha")
      setIsResetOpen(false)
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

  if (!isReady || loading) {
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

  if (notFound) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive/40" />
        <h2 className="text-xl font-bold">Usuário não encontrado</h2>
        <Button variant="outline" onClick={handleBack}>Voltar para a listagem</Button>
      </div>
    )
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[0.9375rem] font-semibold text-foreground truncate">Editar usuário</h1>
            <p className="text-xs text-muted-foreground truncate">Ajuste as permissões e dados do perfil.</p>
          </div>
        </div>

        {/* ── Corpo ── */}
        <div className="px-4 py-4 space-y-4 md:max-w-[640px] md:mx-auto">
          <div className="space-y-1">
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

          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs">E-mail</Label>
            <Input id="email" type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone" className="text-xs">Telefone</Label>
            <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(51) 99999-9999" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tipo de Usuário</Label>
            <Select
              value={formData.role}
              onValueChange={(v: any) => setFormData({ ...formData, role: v })}
              disabled={user?.id === id && formData.role === "admin"}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="publicador">Publicador</SelectItem>
                <SelectItem value="dirigente">Dirigente</SelectItem>
                <SelectItem value="supervisor">Spte. de Serviço</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
            {user?.id === id && formData.role === "admin" && (
              <p className="text-[0.6875rem] text-muted-foreground">
                Você não pode rebaixar seu próprio perfil de administrador — peça pra outro admin fazer isso.
              </p>
            )}
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

          {/* Status do usuário */}
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

          {/* Aptidão para condomínio */}
          <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Apto para condomínio</Label>
              <p className="text-xs text-muted-foreground">
                Recebeu treinamento e pode receber territórios de condomínio.
              </p>
            </div>
            <Switch
              checked={formData.aptoCondominio}
              onCheckedChange={(checked) => setFormData({ ...formData, aptoCondominio: checked })}
            />
          </div>

          {/* Segurança */}
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
              onClick={handleOpenResetDialog}
            >
              Redefinir Senha
            </Button>
          </div>
        </div>

        {/* ── Botão Salvar — acompanha o rodapé ao rolar, some no menu inferior ── */}
        <div className="sticky bottom-16 md:bottom-4 px-4 pt-4 mt-2">
          <div className="md:max-w-[640px] md:mx-auto">
            <Button type="submit" disabled={isSubmitting} className="w-full shadow-lg">
              {isSubmitting && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Salvar Alterações
            </Button>
          </div>
        </div>
      </form>

      {/* ── Modal Redefinir Senha ── */}
      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              Redefinir Senha
            </DialogTitle>
            <DialogDescription>
              Uma nova senha temporária será gerada para <strong>{formData.name}</strong>. Copie e envie ao usuário — ele deverá trocá-la no próximo acesso.
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
            <Button variant="outline" onClick={() => setIsResetOpen(false)} className="w-full sm:w-auto">
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
