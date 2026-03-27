"use client"

import { useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Lock, Eye, EyeOff, CheckCircle2, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

export default function SetupPasswordPage() {
  const { user, profile, refreshProfile } = useAuth()
  const router = useRouter()
  const [changingPassword, setChangingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [passwords, setPasswords] = useState({
    new: "",
    confirm: ""
  })
  const supabase = getSupabaseBrowserClient()

  if (!profile?.must_change_password) {
    // Se não precisa mudar, não deveria estar aqui
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <h2 className="text-xl font-bold">Sua senha já está segura!</h2>
        <Button onClick={() => router.push("/dashboard/my-assignments")}> Ir para o Início </Button>
      </div>
    )
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new !== passwords.confirm) {
      toast.error("As senhas não coincidem")
      return
    }

    if (passwords.new.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres")
      return
    }

    setChangingPassword(true)
    try {
      const { error: authError } = await supabase.auth.updateUser({
        password: passwords.new
      })
      if (authError) throw authError

      // Remove o flag de obrigatoriedade
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user?.id)
      if (profileError) throw profileError

      toast.success("Senha definida com sucesso!")
      
      // Atualiza o estado global e redireciona
      await refreshProfile()
      router.push("/dashboard/my-assignments")
    } catch (error: any) {
      toast.error("Erro ao atualizar senha: " + error.message)
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Primeiro Acesso</h1>
          <p className="text-muted-foreground text-lg">
            Seja bem-vindo ao <strong>FieldMap</strong>! Para sua segurança, defina uma nova senha pessoal.
          </p>
        </div>

        <Card className="border-primary/20 shadow-xl bg-white/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl">Configurar Senha</CardTitle>
            <CardDescription>
              Após criar sua nova senha, você terá acesso total ao sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={passwords.new}
                    onChange={(e) => setPasswords(prev => ({ ...prev, new: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                    className="pr-10 h-12 text-lg"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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
                  placeholder="Repita a senha"
                  className="h-12 text-lg"
                  required
                />
              </div>

              <Button type="submit" disabled={changingPassword || !passwords.new} className="w-full h-12 text-lg shadow-lg">
                {changingPassword ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Salvando Senha...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Ativar Minha Conta
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 p-4 bg-amber-50 rounded-lg border border-amber-100 text-amber-800 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <p>Dica: Use uma combinação de letras, números e símbolos.</p>
        </div>
      </div>
    </div>
  )
}
