import { createClient } from "@supabase/supabase-js"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { sendNotification, NotificationType } from "@/lib/notifications"

/**
 * POST /api/push/send
 *
 * Aceita chamadas de:
 * - Servidor interno (cron, server actions) via header `x-cron-secret`
 * - Usuários autenticados com role admin/dirigente via cookie de sessão
 */
export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const cronSecret = process.env.CRON_SECRET

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Variáveis de ambiente não configuradas" }, { status: 500 })
    }

    // Verificação: aceita cron secret OU sessão de admin/dirigente
    const internalKey = req.headers.get("x-cron-secret")
    const isInternalCall = cronSecret && internalKey === cronSecret

    const body = await req.json()
    const { type, title, message, url, targetUserId, targetRole, createdBy, territoryId } = body

    if (!isInternalCall) {
      const supabase = await getSupabaseServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
      }

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (!profile || !["admin", "dirigente"].includes(profile.role)) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
      }

      // Chamadas de sessão só podem notificar um usuário específico, nunca um role inteiro
      if (targetRole) {
        return NextResponse.json({ error: "targetRole não permitido para chamadas autenticadas por sessão" }, { status: 403 })
      }
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    if (!targetUserId && !targetRole) {
      return NextResponse.json({ error: "targetUserId ou targetRole obrigatório" }, { status: 400 })
    }

    await sendNotification({
      supabase: supabaseAdmin,
      type: (type as NotificationType) ?? "assigned",
      title,
      message,
      url,
      createdBy,
      territoryId,
      targetUserId,
      targetRole,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[push/send] Erro:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
