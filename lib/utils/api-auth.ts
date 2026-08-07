import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"

type AuthResult = { user: { id: string }; error: null } | { user: null; error: NextResponse }

/**
 * Garante que a requisição vem de um usuário autenticado (sessão via cookie).
 */
export async function requireUser(): Promise<AuthResult> {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) }
  }

  return { user, error: null }
}

/**
 * Garante que a requisição vem de um usuário autenticado com um dos roles permitidos.
 */
export async function requireRole(roles: string[]): Promise<AuthResult> {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || !roles.includes(profile.role)) {
    return { user: null, error: NextResponse.json({ error: "Não autorizado" }, { status: 403 }) }
  }

  return { user, error: null }
}
