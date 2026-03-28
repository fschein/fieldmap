import { getSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { subscription } = await req.json()
    
    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: "Dados de inscrição inválidos" }, { status: 400 })
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updated_at: new Date().toISOString()
      }, { onConflict: 'endpoint' })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao salvar inscrição push:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { endpoint } = await req.json()

    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint não fornecido" }, { status: 400 })
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao remover inscrição push:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
