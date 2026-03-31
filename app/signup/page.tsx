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
import { Loader2, ArrowLeft } from "lucide-react"
import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"

export default function SignupPage() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  
  const { signUp, user, isReady } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isReady && user) {
      router.replace("/dashboard")
    }
  }, [user, isReady, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    
    setError(null)
    setIsSubmitting(true)

    try {
      const { error: signUpError } = await signUp(email, password, fullName)

      if (signUpError) {
        setError(signUpError.message)
        setIsSubmitting(false)
      } else {
        setIsSuccess(true)
        // O Supabase handle_new_user trigger criará o profile
      }
    } catch (err: any) {
      setError("Erro ao criar conta. Tente novamente.")
      setIsSubmitting(false)
    }
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md text-center py-10">
          <CardHeader>
            <div className="flex justify-center mb-4">
               <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                 <Loader2 className="h-8 w-8 animate-spin" />
               </div>
            </div>
            <CardTitle className="text-2xl">Conta Criada!</CardTitle>
            <CardDescription className="text-base mt-2">
              Estamos preparando seu acesso. <br/>
              Se você é o primeiro usuário, já entrará como **Administrador**.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Redirecionando para o painel em instantes...
            </p>
          </CardContent>
          <CardFooter className="flex justify-center">
             <Button asChild variant="outline">
               <Link href="/login">Ir para Login</Link>
             </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pt-10 pb-2 relative">
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute left-4 top-4" 
            asChild
          >
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          
          <div className="flex items-center justify-center gap-3 mb-4">
            <FieldMapLogoBrand className="h-10 w-10 shrink-0" />
            <CardTitle className="text-4xl font-black tracking-tighter">
              <span className="text-slate-900">Field</span>
              <span className="text-[#C65D3B]">Map</span>
            </CardTitle>
          </div>
          <CardDescription>
            Crie sua conta para começar a gerenciar territórios
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
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input
                id="fullName"
                placeholder="Seu nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            
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
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 mt-6">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                "Criar Conta"
              )}
            </Button>
            <p className="text-center text-sm text-muted-foreground mt-2">
              Já tem uma conta?{" "}
              <Link href="/login" className="text-primary font-bold hover:underline">
                Entrar
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
