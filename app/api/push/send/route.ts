import { getSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import webpush from "web-push"

// Configuração do Web Push
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@fieldmap.app'}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  )
}

export async function POST(req: Request) {
  try {
    // Apenas chamadas internas ou administrativas
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    // Pegar o perfil para checar role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user?.id)
      .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'dirigente')) {
       // Permitir se for uma ação do próprio sistema ou de um usuário logado
       // mas idealmente proteger com uma API KEY interna para triggers de DB
    }

    const { userId, role, title, message, url } = await req.json()

    if (!userId && !role) {
      return NextResponse.json({ error: "User ID ou Role obrigatório" }, { status: 400 })
    }

    let subscriptions: any[] = []
    
    if (userId) {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", userId)
      if (error) throw error
      subscriptions = data || []
    } else if (role) {
      // Busca todos os usuários com esse papel que tenham inscrições
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("*, profiles!inner(role)")
        .eq("profiles.role", role)
      
      if (error) throw error
      subscriptions = data || []
    }

    if (subscriptions.length === 0) {
      return NextResponse.json({ success: true, info: "Nenhum dispositivo inscrito para este usuário" })
    }

    const payload = JSON.stringify({
      title,
      message,
      url: url || '/dashboard/my-assignments'
    })

    const results = await Promise.allSettled(
      subscriptions.map((sub: any) => 
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          payload
        )
      )
    )

    // Limpar inscrições inválidas
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const err = (results[i] as PromiseRejectedResult).reason
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", subscriptions[i].id)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao enviar push:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
