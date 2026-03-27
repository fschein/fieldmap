"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Lock, CheckCircle } from "lucide-react"

function validatePassword(password: string): string | null {
  if (password.length < 8) return "A senha deve ter pelo menos 8 caracteres."
  if (!/[a-zA-Z]/.test(password)) return "A senha deve conter pelo menos uma letra."
  if (!/[0-9]/.test(password)) return "A senha deve conter pelo menos um número."
  if (!/[^a-zA-Z0-9]/.test(password)) return "A senha deve conter pelo menos um caractere especial."
  return null
}

export default function UpdatePasswordPage() {
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const validationError = validatePassword(newPassword)
    if (validationError) {
      setError(validationError)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.")
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        setError(updateError.message)
        return
      }

      // Marcar must_change_password como false
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from("profiles")
          .update({ must_change_password: false })
          .eq("id", user.id)
      }

      setSuccess(true)
      setTimeout(() => router.push("/dashboard"), 2000)
    } catch (err) {
      setError("Ocorreu um erro ao atualizar a senha. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">Senha atualizada!</h2>
            <p className="text-muted-foreground text-sm">
              Sua senha foi salva com sucesso. Redirecionando...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-terracotta/10">
            <Lock className="h-6 w-6 text-terracotta" />
          </div>
          <CardTitle>Criar nova senha</CardTitle>
          <CardDescription>
            Escolha uma senha segura para proteger sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova senha</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                required
              />
            </div>

            <div className="rounded-md bg-slate-50 border p-3">
              <p className="text-xs text-muted-foreground font-medium mb-1">A senha deve ter:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li className={newPassword.length >= 8 ? "text-green-600" : ""}>✓ Mínimo 8 caracteres</li>
                <li className={/[a-zA-Z]/.test(newPassword) ? "text-green-600" : ""}>✓ Pelo menos 1 letra</li>
                <li className={/[0-9]/.test(newPassword) ? "text-green-600" : ""}>✓ Pelo menos 1 número</li>
                <li className={/[^a-zA-Z0-9]/.test(newPassword) ? "text-green-600" : ""}>✓ Pelo menos 1 caractere especial</li>
              </ul>
            </div>

            <Button
              type="submit"
              className="w-full bg-terracotta hover:bg-terracotta/90"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Salvar nova senha"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
