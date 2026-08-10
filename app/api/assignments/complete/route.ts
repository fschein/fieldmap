import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { sendNotification, notifyAdmins } from "@/lib/notifications"
import { requireUser } from "@/lib/utils/api-auth"

export async function POST(request: Request) {
  try {
    const { user, error: authError } = await requireUser()
    if (authError) return authError

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

    if (user.id !== userId) {
      return NextResponse.json({ error: "Você só pode concluir/devolver seus próprios territórios." }, { status: 403 })
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

    // 0b. Devolução: bloqueia se houver quadra "pela metade" (com anotação de
    // progresso mas não concluída) — força o dirigente a finalizar ou limpar
    // a anotação antes de devolver o território. Com campanha ativa, o
    // progresso real está em subdivision_campaign_progress, não na coluna
    // crua subdivisions — checar só a tabela crua deixaria esse bloqueio
    // nunca disparar quando há campanha.
    if (!isComplete) {
      const { data: subdivisions } = await supabaseAdmin
        .from("subdivisions")
        .select("id, name, completed, status, notes")
        .eq("territory_id", territoryId)

      let halfDoneNames: string[] = []

      if (campaignId && subdivisions?.length) {
        const { data: progress } = await supabaseAdmin
          .from("subdivision_campaign_progress")
          .select("subdivision_id, completed, status, notes")
          .eq("campaign_id", campaignId)
          .in("subdivision_id", subdivisions.map((s) => s.id))

        halfDoneNames = subdivisions
          .filter((s) => {
            const p = progress?.find((pr) => pr.subdivision_id === s.id)
            return p && !(p.completed || p.status === "completed") && p.notes?.trim()
          })
          .map((s) => s.name)
      } else {
        halfDoneNames = (subdivisions ?? [])
          .filter((s) => !(s.completed || s.status === "completed") && s.notes?.trim())
          .map((s) => s.name)
      }

      if (halfDoneNames.length > 0) {
        return NextResponse.json(
          {
            error: `Finalize ou limpe a anotação de progresso da(s) quadra(s) ${halfDoneNames.join(", ")} antes de devolver o território.`,
          },
          { status: 409 }
        )
      }
    }

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

    // 3. Ao concluir o território, a anotação crua de quadra nunca deve
    // persistir — senão ela "vaza" de volta numa campanha futura (quando
    // subdivision_campaign_progress ainda não tem linha e o app cai pro
    // valor cru de subdivisions.notes). completed/status só são resetados
    // quando não há campanha, pra não sobrescrever o histórico por campanha.
    if (isComplete) {
      const resetPayload: Record<string, unknown> = { notes: null, updated_at: now }
      if (!campaignId) {
        resetPayload.completed = false
        resetPayload.status = "available"
      }

      const { error: subdivisionError } = await supabaseAdmin
        .from("subdivisions")
        .update(resetPayload)
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
