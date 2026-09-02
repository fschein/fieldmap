import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { sendNotification } from "@/lib/notifications"

/**
 * GET /api/cron/campaign-lifecycle
 *
 * Verificação diária (Vercel Cron):
 * 1. Campanha entrou no período (start_date chegou, ainda não processada):
 *    libera territórios designados fora dela — pausa a designação antiga
 *    (sem apagar/perder progresso) e limpa assigned_to/status do
 *    território, pra entrar no pool de "pedir território" da campanha.
 * 2. Campanha saiu do período (end_date passou, ainda não restaurada):
 *    retoma as designações pausadas por ela, devolvendo o território pro
 *    dono original — interrompendo à força quem tiver pego durante a
 *    campanha, se for o caso.
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

  const today = new Date().toISOString().slice(0, 10)
  const results = { released: 0, restored: 0, interrupted: 0, deactivated: 0 }

  // ─── 0. Campanhas com end_date já passado — desativa (não dá mais pra pedir/designar) ──
  const { data: expiredCampaigns } = await supabase
    .from("campaigns")
    .update({ active: false })
    .eq("active", true)
    .not("end_date", "is", null)
    .lt("end_date", today)
    .select("id")
  results.deactivated = expiredCampaigns?.length ?? 0

  // ─── 1. Campanhas que entraram no período — libera territórios ────────────
  const { data: startingCampaigns } = await supabase
    .from("campaigns")
    .select("id, name, start_date, end_date")
    .eq("active", true)
    .is("territories_released_at", null)
    .lte("start_date", today)

  for (const campaign of startingCampaigns ?? []) {
    if (campaign.end_date && campaign.end_date < today) continue // já passou, não faz sentido liberar

    const { data: assigned } = await supabase
      .from("territories")
      .select("id, number, name, assigned_to")
      .eq("status", "assigned")
      .not("assigned_to", "is", null)

    for (const territory of assigned ?? []) {
      const { data: activeAssignment } = await supabase
        .from("assignments")
        .select("id, user_id, campaign_id")
        .eq("territory_id", territory.id)
        .eq("status", "active")
        .maybeSingle()

      if (!activeAssignment || activeAssignment.campaign_id === campaign.id) continue

      await supabase
        .from("assignments")
        .update({ status: "paused", paused_for_campaign_id: campaign.id })
        .eq("id", activeAssignment.id)

      await supabase
        .from("territories")
        .update({ assigned_to: null, status: "available" })
        .eq("id", territory.id)

      if (activeAssignment.user_id) {
        await sendNotification({
          supabase,
          type: "campaign_paused",
          title: "Território pausado pela campanha 📋",
          message: `A campanha "${campaign.name}" começou — o Território ${territory.number}${territory.name ? ` - ${territory.name}` : ""} foi liberado. Peça um território pra participar da campanha; o seu volta com o progresso intacto quando ela terminar.`,
          url: "/dashboard/my-assignments",
          territoryId: territory.id,
          targetUserId: activeAssignment.user_id,
        })
      }

      results.released++
    }

    await supabase
      .from("campaigns")
      .update({ territories_released_at: new Date().toISOString() })
      .eq("id", campaign.id)
  }

  // ─── 2. Campanhas que terminaram — restaura territórios pausados ──────────
  const { data: endedCampaigns } = await supabase
    .from("campaigns")
    .select("id, name, end_date")
    .not("territories_released_at", "is", null)
    .is("territories_restored_at", null)
    .not("end_date", "is", null)
    .lt("end_date", today)

  for (const campaign of endedCampaigns ?? []) {
    const { data: pausedAssignments } = await supabase
      .from("assignments")
      .select("id, user_id, territory_id, territories(number, name, assigned_to)")
      .eq("status", "paused")
      .eq("paused_for_campaign_id", campaign.id)

    for (const paused of pausedAssignments ?? []) {
      const territory = paused.territories as any
      const currentHolder = territory?.assigned_to as string | null

      if (currentHolder && currentHolder !== paused.user_id) {
        // Alguém pegou esse território durante a campanha — interrompe à força.
        const { data: interrupted } = await supabase
          .from("assignments")
          .select("id, user_id")
          .eq("territory_id", paused.territory_id)
          .eq("status", "active")
          .maybeSingle()

        if (interrupted) {
          await supabase
            .from("assignments")
            .update({ status: "returned", returned_at: new Date().toISOString(), return_reason: "Campanha encerrada" })
            .eq("id", interrupted.id)

          if (interrupted.user_id) {
            await sendNotification({
              supabase,
              type: "campaign_restored",
              title: "Campanha encerrada 📋",
              message: `A campanha "${campaign.name}" terminou — o Território ${territory.number}${territory.name ? ` - ${territory.name}` : ""} voltou pro dono original.`,
              url: "/dashboard/my-assignments",
              territoryId: paused.territory_id,
              targetUserId: interrupted.user_id,
            })
            results.interrupted++
          }
        }
      } else if (currentHolder === paused.user_id) {
        // O próprio dono já pegou de novo por conta própria — só fecha a pausada.
        await supabase.from("assignments").update({ status: "returned" }).eq("id", paused.id)
        continue
      }

      await supabase
        .from("territories")
        .update({ assigned_to: paused.user_id, status: "assigned" })
        .eq("id", paused.territory_id)

      await supabase
        .from("assignments")
        .update({ status: "active" })
        .eq("id", paused.id)

      if (paused.user_id) {
        await sendNotification({
          supabase,
          type: "campaign_restored",
          title: "Seu território voltou! 📋",
          message: `A campanha "${campaign.name}" terminou — o Território ${territory?.number}${territory?.name ? ` - ${territory.name}` : ""} voltou pra você, com o progresso de quadras de antes.`,
          url: `/dashboard/my-assignments/${paused.territory_id}/map`,
          territoryId: paused.territory_id,
          targetUserId: paused.user_id,
        })
      }

      results.restored++
    }

    await supabase
      .from("campaigns")
      .update({ territories_restored_at: new Date().toISOString() })
      .eq("id", campaign.id)
  }

  console.log("[cron/campaign-lifecycle] Resultado:", results)
  return NextResponse.json({ success: true, results })
}
