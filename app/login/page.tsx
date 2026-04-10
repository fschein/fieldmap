"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { MapPin, Loader2 } from "lucide-react"
import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { signIn, user, loading, isReady } = useAuth()
  const router = useRouter()
  const [isEmpty, setIsEmpty] = useState(false)

  useEffect(() => {
    async function checkEmpty() {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client")
      const supabase = getSupabaseBrowserClient()
      const { count, error: countError } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
      
      if (!countError && count === 0) {
        setIsEmpty(true)
      }
    }

    if (isReady) {
      checkEmpty()
    }

    if (isReady && user) {
      router.replace("/dashboard")
    }
  }, [user, isReady, router])

if (!isReady) return <Loader2 className="animate-spin" />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (isSubmitting) return
    
    setError(null)
    setIsSubmitting(true)

    try {
      const { error: signInError } = await signIn(email, password)

      if (signInError) {
        setError(signInError.message === "Invalid login credentials" 
          ? "E-mail ou senha incorretos" 
          : signInError.message)
        setIsSubmitting(false)
      }
      // If successful, the auth state will update and trigger the redirect
    } catch {
      setError("Erro ao fazer login. Tente novamente.")
      setIsSubmitting(false)
    }
  }

  // Show loading state while auth is initializing
  if (!isReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Don't render login form if already authenticated
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pt-10 pb-2">
          <div className="flex items-center justify-center gap-3 mb-4">
            <FieldMapLogoBrand className="h-10 w-10 shrink-0" />
            <CardTitle className="text-4xl font-black tracking-tighter">
              <span className="text-slate-900">Field</span>
              <span className="text-[#C65D3B]">Map</span>
            </CardTitle>
          </div>
          <CardDescription>
            Entre com suas credenciais para acessar o sistema
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="current-password"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 mt-4">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </CardFooter>
        </form>

        {isEmpty && (
          <div className="px-6 pb-8">
            <div className="pt-6 border-t border-dashed border-slate-200">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-[#C65D3B] text-white rounded text-[0.5625rem] font-black uppercase tracking-tighter shadow-sm">Onboarding</span>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Primeira Instalação?</h3>
                  </div>
                  
                  <p className="text-sm text-slate-600 leading-relaxed font-medium">
                    Detectamos que este banco está vazio. Se você é o responsável pela montagem do sistema, crie a primeira conta agora:
                  </p>
                  
                  <Button asChild variant="default" className="w-full bg-[#C65D3B] hover:bg-[#A84A2B] text-white shadow-md font-bold py-6">
                    <Link href="/signup">Criar Conta de Administrador</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
