import webpush from "web-push"
import { SupabaseClient } from "@supabase/supabase-js"

// Configura VAPID uma única vez ao importar o módulo
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL = process.env.VAPID_EMAIL || "admin@fieldmap.app"

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export type NotificationType =
  | "assigned"               // dirigente recebeu território
  | "returned"               // dirigente devolveu sem concluir
  | "completed"              // dirigente concluiu território
  | "overdue"                // território atrasado (sem devolver)
  | "idle_publisher"         // dirigente ficou sem território
  | "completed_subdivisions" // todas quadras concluídas, mas não devolveu
  | "progress_60"            // dirigente passou de 60% do território
  | "request"                // publicador solicitou território
  | "idle"                   // (legado)

export interface NotifyOptions {
  /** Supabase client com service role para contornar RLS */
  supabase: SupabaseClient
  /** Tipo da notificação */
  type: NotificationType
  /** Título exibido na notificação */
  title: string
  /** Corpo da mensagem */
  message: string
  /** URL para abrir ao clicar na notificação push */
  url?: string
  /** UUID do usuário que gerou o evento */
  createdBy?: string
  /** UUID do território envolvido */
  territoryId?: string
  /**
   * UUID do usuário destinatário da notificação.
   * NULL = visível para todos os admins.
   */
  targetUserId?: string | null
  /**
   * Role do destinatário — envia push para todos com esse role.
   */
  targetRole?: "admin" | "dirigente" | "publicador" | "supervisor"
}

/**
 * Insere a notificação no banco (in-app) E dispara Web Push.
 */
export async function sendNotification(opts: NotifyOptions): Promise<void> {
  const {
    supabase,
    type,
    title,
    message,
    url,
    createdBy,
    territoryId,
    targetUserId,
    targetRole,
  } = opts

  // 1. Insere notificação no banco
  const { error: notifError } = await supabase.from("notifications").insert({
    type,
    title,
    message,
    created_by: createdBy ?? null,
    territory_id: territoryId ?? null,
    target_user_id: targetUserId ?? null,
  })

  if (notifError) {
    console.error("[sendNotification] Erro ao inserir notificação:", notifError.message)
  }

  // 2. Busca subscriptions push
  let subscriptions: PushSubscriptionRow[] = []

  if (targetUserId) {
    const { data } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", targetUserId)
    subscriptions = data ?? []
  } else if (targetRole) {
    const { data } = await supabase
      .from("push_subscriptions")
      .select("*, profiles!inner(role)")
      .eq("profiles.role", targetRole)
    subscriptions = data ?? []
  }

  if (subscriptions.length === 0 || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return

  const payload = JSON.stringify({ title, message, url: url ?? "/dashboard" })

  // 3. Dispara push
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  )

  // 4. Remove subscriptions expiradas
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === "rejected") {
      const err = result.reason as { statusCode?: number }
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", subscriptions[i].id)
      } else {
        console.warn("[sendNotification] Push falhou:", (result.reason as any)?.message)
      }
    }
  }
}

/**
 * Atalho: notifica todos os admins do sistema.
 */
export async function notifyAdmins(
  supabase: SupabaseClient,
  opts: Omit<NotifyOptions, "supabase" | "targetRole" | "targetUserId">
): Promise<void> {
  return sendNotification({ ...opts, supabase, targetRole: "admin" })
}

interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}
