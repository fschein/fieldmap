"use client"

import { useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, User, Mail, Shield, Lock, Eye, EyeOff, CheckCircle2, LogOut } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export default function ProfilePage() {
  const { user, profile, signOut } = useAuth()
  const [name, setName] = useState(profile?.name || "")
  const [phone, setPhone] = useState(profile?.phone || "")
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [passwords, setPasswords] = useState({
    new: "",
    confirm: ""
  })
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const supabase = getSupabaseBrowserClient()

  const handleSave = async () => {
    if (!user) return
    
    setSaving(true)
    setMessage(null)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          name,
          phone: phone || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", user?.id)

      if (error) {
        setMessage({ type: "error", text: "Erro ao salvar perfil: " + error.message })
      } else {
        setMessage({ type: "success", text: "Perfil salvo com sucesso!" })
      }
    } catch (error: any) {
      setMessage({ type: "error", text: "Erro ao salvar perfil: " + error.message })
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new !== passwords.confirm) {
      toast.error("As senhas não coincidem")
      return
    }

    // Regex de senha forte: 8+ carac, letra, número, especial
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/
    if (!passwordRegex.test(passwords.new)) {
      toast.error("A senha deve ter no mínimo 8 caracteres, incluindo letras, números e um caractere especial (@$!%*#?&).")
      return
    }

    setChangingPassword(true)
    try {
      const { error: authError } = await supabase.auth.updateUser({
        password: passwords.new
      })
      if (authError) throw authError

      // Se mudou a senha, remove o flag de obrigatoriedade
      if (profile?.must_change_password) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ must_change_password: false })
          .eq("id", user?.id)
        if (profileError) console.error("Erro ao atualizar flag de senha:", profileError)
      }

      toast.success("Senha atualizada com sucesso!")
      setPasswords({ new: "", confirm: "" })
    } catch (error: any) {
      toast.error("Erro ao atualizar senha: " + error.message)
    } finally {
      setChangingPassword(false)
    }
  }

  const getRoleName = (role: string) => {
    switch (role) {
      case "admin":
        return "Administrador"
      case "dirigente":
        return "Dirigente"
      case "publicador":
        return "Publicador"
      default:
        return role
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "destructive"
      case "dirigente":
        return "default"
      default:
        return "secondary"
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-10">
      {/* HEADER PREMIUM */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary border-2 border-primary/20 shadow-sm">
            <User className="h-8 w-8" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold tracking-tight">{profile?.name || "Meu Perfil"}</h1>
              <Badge variant={getRoleBadgeVariant(profile?.role || "publicador") as any} className="h-5 px-1.5 text-[10px] uppercase font-black tracking-wider">
                {getRoleName(profile?.role || "publicador")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {user?.email}
            </p>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => signOut()} 
          className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive h-10 px-4 font-bold shadow-sm"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair do App
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados Pessoais</CardTitle>
          <CardDescription>
            Atualize suas informações pessoais
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name" className="text-sm font-bold">Nome Completo</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="h-11"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="phone" className="text-sm font-bold">WhatsApp / Telefone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                className="h-11"
              />
            </div>
          </div>

          {message && (
            <p className={`text-sm ${message.type === "success" ? "text-emerald-500" : "text-destructive"}`}>
              {message.text}
            </p>
          )}

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              "Salvar Alterações"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className={cn(profile?.must_change_password && "border-primary ring-1 ring-primary/20")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Alterar Senha
          </CardTitle>
          <CardDescription>
            Defina uma nova senha segura para sua conta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={passwords.new}
                  onChange={(e) => setPasswords(prev => ({ ...prev, new: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwords.confirm}
                onChange={(e) => setPasswords(prev => ({ ...prev, confirm: e.target.value }))}
                placeholder="Repita a nova senha"
              />
            </div>

            <Button type="submit" disabled={changingPassword || !passwords.new} className="w-full sm:w-auto">
              {changingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Atualizando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Atualizar Senha
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
