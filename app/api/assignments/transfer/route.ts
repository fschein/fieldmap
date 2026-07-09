import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { notifyAdmins, sendNotification } from "@/lib/notifications"

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

    const { territoryId, assignmentId, fromUserId, toUserId } = await request.json()

    if (!territoryId || !assignmentId || !fromUserId || !toUserId) {
      return NextResponse.json(
        { error: "territoryId, assignmentId, fromUserId e toUserId são obrigatórios" },
        { status: 400 }
      )
    }

    const [fromProfileRes, toProfileRes, territoryRes, assignmentRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("name, email").eq("id", fromUserId).single(),
      supabaseAdmin.from("profiles").select("name, email").eq("id", toUserId).single(),
      supabaseAdmin.from("territories").select("number, name").eq("id", territoryId).single(),
      supabaseAdmin.from("assignments").select("campaign_id").eq("id", assignmentId).single(),
    ])

    const fromName = fromProfileRes.data?.name || fromProfileRes.data?.email || "Alguém"
    const toName = toProfileRes.data?.name || toProfileRes.data?.email || "outro publicador"
    const territoryNumber = territoryRes.data?.number || territoryId
    const territoryName = territoryRes.data?.name || ""
    const campaignId = assignmentRes.data?.campaign_id ?? null

    const now = new Date().toISOString()

    const { error: returnError } = await supabaseAdmin
      .from("assignments")
      .update({
        status: "returned",
        returned_at: now,
        return_reason: `Transferido para ${toName}`,
      })
      .eq("id", assignmentId)
    if (returnError) throw returnError

    const { error: insertError } = await supabaseAdmin.from("assignments").insert({
      territory_id: territoryId,
      user_id: toUserId,
      status: "active",
      assigned_at: now,
      campaign_id: campaignId,
    })
    if (insertError) throw insertError

    const { error: territoryError } = await supabaseAdmin
      .from("territories")
      .update({ assigned_to: toUserId })
      .eq("id", territoryId)
    if (territoryError) throw territoryError

    const label = `${territoryNumber}${territoryName ? ` - ${territoryName}` : ""}`

    await notifyAdmins(supabaseAdmin, {
      type: "transferred",
      title: "Território Transferido 🔄",
      message: `${fromName} transferiu o Território ${label} para ${toName}.`,
      url: `/dashboard/territories/${territoryId}`,
      createdBy: fromUserId,
      territoryId,
    })

    await sendNotification({
      supabase: supabaseAdmin,
      type: "assigned",
      title: "Território Recebido",
      message: `${fromName} transferiu o Território ${label} para você.`,
      url: `/dashboard/my-assignments/${territoryId}/map`,
      createdBy: fromUserId,
      territoryId,
      targetUserId: toUserId,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao transferir território:", error)
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}
