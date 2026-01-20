"use client"

import React from "react"

import { useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Settings, User, Lock, CheckCircle } from "lucide-react"

export default function SettingsPage() {
  const { profile, isAdmin } = useAuth()
  const [fullName, setFullName] = useState(profile?.name || "")
  const [phone, setPhone] = useState(profile?.phone || "")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [profileLoading, setProfileLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = getSupabaseBrowserClient()

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileLoading(true)
    setProfileSuccess(false)
    setError(null)

    const { error } = await supabase
      .from("profiles")
      .update({
        name: fullName,
        phone: phone || null,
      })
      .eq("id", profile?.id)

    if (error) {
      setError(error.message)
    } else {
      setProfileSuccess(true)
    }
    setProfileLoading(false)
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordLoading(true)
    setPasswordSuccess(false)
    setError(null)

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem")
      setPasswordLoading(false)
      return
    }

    if (newPassword.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres")
      setPasswordLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      setError(error.message)
    } else {
      setPasswordSuccess(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    }
    setPasswordLoading(false)
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">Gerencie seu perfil</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Meu Perfil
            </CardTitle>
            <CardDescription>Atualize suas informações pessoais</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {profileSuccess && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>Perfil atualizado com sucesso!</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" value={profile?.email || ""} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <Button type="submit" disabled={profileLoading}>
                {profileLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Salvar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie seu perfil e configurações do sistema
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Meu Perfil
            </CardTitle>
            <CardDescription>Atualize suas informações pessoais</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {profileSuccess && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>Perfil atualizado com sucesso!</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" value={profile?.email || ""} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <Button type="submit" disabled={profileLoading}>
                {profileLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Salvar
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Alterar Senha
            </CardTitle>
            <CardDescription>Atualize sua senha de acesso</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {passwordSuccess && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>Senha alterada com sucesso!</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                />
              </div>
              <Button type="submit" disabled={passwordLoading}>
                {passwordLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Alterar Senha
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
