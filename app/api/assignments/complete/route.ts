import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

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

    // 0. Verifica se o território ainda está designado para este usuário
    const { data: currentTerritory } = await supabaseAdmin
      .from("territories")
      .select("assigned_to")
      .eq("id", territoryId)
      .single()
    
    if (currentTerritory?.assigned_to !== userId) {
      return NextResponse.json({ error: "Este território não está mais designado para você." }, { status: 403 })
    }

    if (!["complete", "return"].includes(action)) {
      return NextResponse.json({ error: "action deve ser 'complete' ou 'return'" }, { status: 400 })
    }

    const isComplete = action === "complete"
    const now = new Date().toISOString()

    // 1. Atualiza o assignment do usuário para este território
    const { error: assignmentError } = await supabaseAdmin
      .from("assignments")
      .update({
        status: isComplete ? "completed" : "returned",
        completed_at: isComplete ? now : null,
        returned_at: !isComplete ? now : null,
        ...(reason ? { 
          notes: reason,
          return_reason: reason 
        } : {}),
      })
      .eq("territory_id", territoryId)
      .eq("user_id", userId)
      .eq("status", "active")

    if (assignmentError) throw assignmentError

    // 2. Atualiza o território: limpa assigned_to e status
    const { error: territoryError } = await supabaseAdmin
      .from("territories")
      .update({
        assigned_to: null,
        status: isComplete ? "completed" : "available",
        ...(isComplete ? { last_completed_at: now } : {}),
      })
      .eq("id", territoryId)

    if (territoryError) throw territoryError

    // 3. Reseta as quadras (subdivisions) APENAS se for conclusão TOTAL
    if (isComplete) {
      const { error: subdivisionError } = await supabaseAdmin
        .from("subdivisions")
        .update({
          completed: false,
          status: "available",
          updated_at: now,
        })
        .eq("territory_id", territoryId)

      if (subdivisionError) {
        console.warn("Aviso: erro ao resetar quadras:", subdivisionError.message)
      }
    }



    // 3. Busca o nome do usuário para notificação
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email")
      .eq("id", userId)
      .single()

    const { data: territory } = await supabaseAdmin
      .from("territories")
      .select("number")
      .eq("id", territoryId)
      .single()

    // Conta quadras para enriquecer a mensagem de devolução
    const { data: subdivisions } = await supabaseAdmin
      .from("subdivisions")
      .select("completed")
      .eq("territory_id", territoryId)

    const totalSubs = subdivisions?.length ?? 0
    // Note: at this point subdivisions were already reset, so count from the original request
    // We retrieve from the assignment context instead — use preReset count passed in body (or just describe action)
    const userName = profile?.name || profile?.email || "Um publicador"
    const territoryNumber = territory?.number || territoryId

    // 5. Insere notificação para o admin
    // Para devoluções parciais, a mensagem informa o progresso
    const notificationMessage = isComplete
      ? `${userName} concluiu o Território ${territoryNumber}.`
      : `${userName} devolveu o Território ${territoryNumber} sem concluir todas as quadras.`

    await supabaseAdmin.from("notifications").insert({
      type: isComplete ? "completed" : "returned",
      title: isComplete ? "Território Concluído" : "Território Devolvido",
      message: notificationMessage,
      created_by: userId,
      territory_id: territoryId,
    })

    // 5. Verifica se o usuário ficou sem territórios → idle notification
    const { count } = await supabaseAdmin
      .from("territories")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", userId)

    if ((count ?? 1) === 0) {
      await supabaseAdmin.from("notifications").insert({
        type: "idle",
        title: "Publicador sem Território",
        message: `${userName} ficou sem territórios após devolver o Território ${territoryNumber}.`,
        created_by: userId,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao processar devolução/conclusão:", error)
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}
