import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { sendNotification } from "@/lib/notifications"

// Brasil (São Paulo) não observa horário de verão desde 2019 → offset fixo UTC-3
const BRAZIL_UTC_OFFSET_HOURS = 3

// Janela de tolerância em torno do alvo (2h / 24h), pra cobrir o intervalo entre execuções do cron
const WINDOW_MINUTES = 20

function scheduledStartUTC(date: string, startTime: string): Date {
  const [h, m] = startTime.split(":").map(Number)
  const midnightUTC = new Date(`${date}T00:00:00Z`).getTime()
  return new Date(midnightUTC + (h + BRAZIL_UTC_OFFSET_HOURS) * 3600000 + m * 60000)
}

function withinWindow(diffMinutes: number, targetMinutes: number): boolean {
  return Math.abs(diffMinutes - targetMinutes) <= WINDOW_MINUTES
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")
  const provided =
    authHeader?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret")

  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Variáveis de ambiente não configuradas" }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 3600000).toISOString().slice(0, 10)
  const tomorrow = new Date(now.getTime() + 24 * 3600000).toISOString().slice(0, 10)

  const { data: schedules } = await supabase
    .from("schedules")
    .select("id, date, leader_id, schedule_arrangements(start_time, label)")
    .eq("status", "published")
    .not("leader_id", "is", null)
    .gte("date", yesterday)
    .lte("date", tomorrow)

  const results = { checkin: 0, upcoming: 0 }

  for (const s of schedules ?? []) {
    const arrangement = s.schedule_arrangements as any
    if (!arrangement?.start_time || !s.leader_id) continue

    const start = scheduledStartUTC(s.date, arrangement.start_time)
    const diffMinutes = (now.getTime() - start.getTime()) / 60000
    const label = arrangement.label || "saída de campo"

    // ── Check-in: ~2h depois do início ──────────────────────────────────────
    if (withinWindow(diffMinutes, 120)) {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "schedule_checkin")
        .eq("target_user_id", s.leader_id)
        .gte("created_at", start.toISOString())

      if ((count ?? 0) === 0) {
        await sendNotification({
          supabase,
          type: "schedule_checkin",
          title: "Como foi o trabalho? 👀",
          message: `Não esqueça de atualizar as quadras da sua ${label} de hoje.`,
          url: "/dashboard/my-assignments",
          targetUserId: s.leader_id,
        })
        results.checkin++
      }
    }

    // ── Aviso de saída em ~24h ──────────────────────────────────────────────
    if (withinWindow(-diffMinutes, 24 * 60)) {
      const dedupeSince = new Date(start.getTime() - 30 * 3600000).toISOString()
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "schedule_upcoming")
        .eq("target_user_id", s.leader_id)
        .gte("created_at", dedupeSince)

      if ((count ?? 0) === 0) {
        await sendNotification({
          supabase,
          type: "schedule_upcoming",
          title: "Saída de Campo Amanhã 📅",
          message: `Você tem ${label} marcada para amanhã.`,
          url: "/dashboard/my-schedule",
          targetUserId: s.leader_id,
        })
        results.upcoming++
      }
    }
  }

  return NextResponse.json({ success: true, results })
}
