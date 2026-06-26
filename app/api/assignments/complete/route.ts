import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { sendNotification, notifyAdmins } from "@/lib/notifications"

export async function POST(request: Request) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json({ error: "Variáveis de ambiente não configuradas." }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { territoryId, userId, action, reason } = await request.json()

    if (!territoryId || !userId || !action) {
      return NextResponse.json({ error: "territoryId, userId e action são obrigatórios" }, { status: 400 })
    }

    // 0. Verifica se o território ainda está designado para este usuário e busca o campaign_id do assignment ativo
    const [currentTerritoryRes, activeAssignmentRes] = await Promise.all([
      supabaseAdmin
        .from("territories")
        .select("assigned_to")
        .eq("id", territoryId)
        .single(),
      supabaseAdmin
        .from("assignments")
        .select("campaign_id")
        .eq("territory_id", territoryId)
        .eq("status", "active")
        .eq("user_id", userId)
        .maybeSingle()
    ])

    const currentTerritory = currentTerritoryRes.data
    const campaignId = activeAssignmentRes.data?.campaign_id

    if (currentTerritory?.assigned_to !== userId) {
      return NextResponse.json({ error: "Este território não está designado para você." }, { status: 403 })
    }

    const now = new Date().toISOString()
    const isComplete = action === "complete"

    // 1. Atualiza o assignment
    const { error: assignmentError } = await supabaseAdmin
      .from("assignments")
      .update({
        status: isComplete ? "completed" : "returned",
        completed_at: isComplete ? now : null,
        returned_at: !isComplete ? now : null,
        ...(reason ? { notes: reason, return_reason: reason } : {}),
      })
      .eq("territory_id", territoryId)
      .eq("status", "active")
      .eq("user_id", userId)

    if (assignmentError) throw assignmentError

    // 2. Atualiza o território (território com campanha concluída volta a ser disponível/available)
    const { error: territoryError } = await supabaseAdmin
      .from("territories")
      .update({
        assigned_to: null,
        status: (isComplete && !campaignId) ? "completed" : "available",
        ...(isComplete ? { last_completed_at: now } : {}),
      })
      .eq("id", territoryId)

    if (territoryError) throw territoryError

    // 3. Reseta as quadras APENAS se for conclusão TOTAL e não for campanha
    if (isComplete && !campaignId) {
      const { error: subdivisionError } = await supabaseAdmin
        .from("subdivisions")
        .update({ completed: false, status: "available", updated_at: now })
        .eq("territory_id", territoryId)

      if (subdivisionError) {
        console.warn("Aviso: erro ao resetar quadras:", subdivisionError.message)
      }
    }

    // 4. Busca dados para enriquecer as notificações
    const [profileRes, territoryRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("name, email").eq("id", userId).single(),
      supabaseAdmin.from("territories").select("number, name").eq("id", territoryId).single(),
    ])

    const userName = profileRes.data?.name || profileRes.data?.email || "Um publicador"
    const territoryNumber = territoryRes.data?.number || territoryId
    const territoryName = territoryRes.data?.name || ""

    // 5. Notifica os admins sobre a ação do dirigente
    await notifyAdmins(supabaseAdmin, {
      type: isComplete ? "completed" : "returned",
      title: isComplete ? "Território Concluído ✅" : "Território Devolvido 🔄",
      message: isComplete
        ? `${userName} concluiu o Território ${territoryNumber}${territoryName ? ` - ${territoryName}` : ""}.`
        : `${userName} devolveu o Território ${territoryNumber}${territoryName ? ` - ${territoryName}` : ""} sem concluir todas as quadras.`,
      url: `/dashboard/territories/${territoryId}`,
      createdBy: userId,
      territoryId,
    })

    // 6. Verifica se o dirigente ficou sem territórios → notifica admins
    const { count } = await supabaseAdmin
      .from("territories")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", userId)

    if ((count ?? 1) === 0) {
      await notifyAdmins(supabaseAdmin, {
        type: "idle_publisher",
        title: "Dirigente Sem Território ⚠️",
        message: `${userName} ficou sem territórios após devolver o Território ${territoryNumber}.`,
        url: "/dashboard/assignments",
        createdBy: userId,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao processar devolução/conclusão:", error)
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}
