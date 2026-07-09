import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { notifyAdmins } from "@/lib/notifications"

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

    const { userId } = await request.json()
    if (!userId) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 })
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email")
      .eq("id", userId)
      .single()

    const userName = profile?.name || profile?.email || "Um publicador"

    await notifyAdmins(supabaseAdmin, {
      type: "request",
      title: "Pedido de Território",
      message: `${userName} está solicitando um novo território para trabalhar.`,
      url: "/dashboard/assignments",
      createdBy: userId,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao notificar pedido de território:", error)
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}
