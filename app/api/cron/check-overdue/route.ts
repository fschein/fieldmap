import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { sendNotification, notifyAdmins } from "@/lib/notifications"

const OVERDUE_DAYS = parseInt(process.env.OVERDUE_DAYS ?? "90", 10)
const PROGRESS_THRESHOLD = 0.6 // 60%

/**
 * GET /api/cron/check-overdue
 *
 * Verificações periódicas (1x por dia via Vercel Cron):
 * 1. Territórios atrasados → notifica admins
 * 2. Territórios com 60%+ das quadras concluídas → notifica admins (uma vez por designação)
 * 3. Territórios com 100% das quadras concluídas → notifica o dirigente
 * 4. Dirigentes sem território ativo → notifica admins
 */
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

  const results: Record<string, number> = {
    overdue: 0,
    progress_60: 0,
    completed_subdivisions: 0,
    idle_publisher: 0,
  }

  // ─── 1. Territórios atrasados ─────────────────────────────────────────────
  const overdueThreshold = new Date()
  overdueThreshold.setDate(overdueThreshold.getDate() - OVERDUE_DAYS)

  const { data: overdueAssignments } = await supabase
    .from("assignments")
    .select("territory_id, user_id, assigned_at, territories(number, name), profiles(name, email)")
    .eq("status", "active")
    .lt("assigned_at", overdueThreshold.toISOString())

  for (const assignment of overdueAssignments ?? []) {
    const territory = assignment.territories as any
    const profile = assignment.profiles as any
    const userName = profile?.name || profile?.email || "Dirigente"
    const terrNumber = territory?.number || assignment.territory_id
    const terrName = territory?.name || ""
    const daysInField = Math.floor(
      (Date.now() - new Date(assignment.assigned_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    await notifyAdmins(supabase, {
      type: "overdue",
      title: "Território Atrasado ⏰",
      message: `${userName} está com o Território ${terrNumber}${terrName ? ` - ${terrName}` : ""} há ${daysInField} dias.`,
      url: `/dashboard/territories/${assignment.territory_id}`,
      createdBy: assignment.user_id,
      territoryId: assignment.territory_id,
    })

    if (assignment.user_id) {
      await sendNotification({
        supabase,
        type: "overdue",
        title: "Território Atrasado ⏰",
        message: `Você está com o Território ${terrNumber}${terrName ? ` - ${terrName}` : ""} há ${daysInField} dias. Que tal dar uma força nele?`,
        url: `/dashboard/my-assignments/${assignment.territory_id}/map`,
        createdBy: assignment.user_id,
        territoryId: assignment.territory_id,
        targetUserId: assignment.user_id,
      })
    }

    results.overdue++
  }

  // ─── 2. Progresso ≥ 60% (notifica admins uma única vez por designação) ────
  const { data: activeAssignments } = await supabase
    .from("assignments")
    .select("territory_id, user_id, assigned_at, territories(number, name, assigned_to), profiles(name, email)")
    .eq("status", "active")
    .not("user_id", "is", null)

  for (const assignment of activeAssignments ?? []) {
    const territory = assignment.territories as any
    if (!territory?.assigned_to) continue

    const { data: subs } = await supabase
      .from("subdivisions")
      .select("completed")
      .eq("territory_id", assignment.territory_id)

    if (!subs || subs.length === 0) continue

    const total = subs.length
    const done = subs.filter((s: any) => s.completed).length
    const ratio = done / total

    const terrNumber = territory?.number || assignment.territory_id
    const terrName = territory?.name || ""
    const profile = assignment.profiles as any
    const userName = profile?.name || profile?.email || "Dirigente"
    const pct = Math.round(ratio * 100)

    // ── 2a. 60%+ — avisa admin para já planejar próxima designação ──────────
    if (ratio >= PROGRESS_THRESHOLD && ratio < 1) {
      // Verifica se já enviamos essa notificação nessa designação (desde assigned_at)
      const { count: alreadySent } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "progress_60")
        .eq("territory_id", assignment.territory_id)
        .gte("created_at", assignment.assigned_at)

      if ((alreadySent ?? 0) === 0) {
        await notifyAdmins(supabase, {
          type: "progress_60",
          title: "Território com Bom Progresso 📊",
          message: `${userName} já concluiu ${done} de ${total} quadras (${pct}%) do Território ${terrNumber}${terrName ? ` - ${terrName}` : ""}. Bom momento para planejar a próxima designação.`,
          url: `/dashboard/territories/${assignment.territory_id}`,
          createdBy: assignment.user_id,
          territoryId: assignment.territory_id,
        })

        results.progress_60++
      }
    }

    // ── 2b. 100% — avisa o próprio dirigente para devolver ──────────────────
    if (ratio === 1) {
      await sendNotification({
        supabase,
        type: "completed_subdivisions",
        title: "Todas as Quadras Concluídas! 📋",
        message: `Você concluiu todas as ${total} quadras do Território ${terrNumber}${terrName ? ` - ${terrName}` : ""}. Lembre-se de devolver o território!`,
        url: `/dashboard/my-assignments/${assignment.territory_id}/map`,
        createdBy: assignment.user_id,
        territoryId: assignment.territory_id,
        targetUserId: assignment.user_id,
      })

      results.completed_subdivisions++
    }
  }

  // ─── 3. Dirigentes sem nenhum território ativo ────────────────────────────
  const { data: dirigentes } = await supabase
    .from("profiles")
    .select("id, name, email")
    .eq("role", "dirigente")

  for (const dirigente of dirigentes ?? []) {
    const { count } = await supabase
      .from("territories")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", dirigente.id)

    if ((count ?? 0) === 0) {
      const name = dirigente.name || dirigente.email || "Dirigente"

      await notifyAdmins(supabase, {
        type: "idle_publisher",
        title: "Dirigente Sem Território ⚠️",
        message: `${name} está sem nenhum território designado.`,
        url: "/dashboard/assignments",
        createdBy: dirigente.id,
      })

      results.idle_publisher++
    }
  }

  console.log("[cron/check-overdue] Resultado:", results)
  return NextResponse.json({ success: true, results })
}
