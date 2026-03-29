import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json(
        { error: "Variáveis de ambiente do Supabase não configuradas no servidor." },
        { status: 500 }
      )
    }

    const { email, password, name, role, phone, gender, group_id } = await request.json()

    if (!email || !password || !name) {
      return NextResponse.json({ error: "E-mail, senha e nome são obrigatórios" }, { status: 400 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Cria o usuário no Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirma o email
      user_metadata: { name, role, phone, gender, group_id },
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const userId = authData.user.id

    // 2. Cria ou atualiza o Perfil na tabela profiles
    // Usamos upsert para cobrir o caso onde um Trigger de banco de dados
    // já possa ter criado a linha em profiles automaticamente.
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        name,
        email,
        role: role || "publicador",
        phone: phone || null,
        gender: gender || "M",
        group_id: group_id || null,
        must_change_password: true,
        updated_at: new Date().toISOString()
      })

    if (profileError) {
      // Se falhar o perfil, seria ideal deletar o auth user para manter consistência,
      // mas vamos retornar o erro para o log
      console.error("Erro ao criar perfil:", profileError.message)
      return NextResponse.json({ error: "Usuário criado, mas erro ao criar perfil: " + profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, user: authData.user })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}
