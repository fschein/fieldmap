import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json({ error: "Variáveis do Supabase faltando." }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Busca todos os perfis
    const { data: profiles, error: perfErro } = await supabaseAdmin.from("profiles").select("*")
    if (perfErro || !profiles) {
      return NextResponse.json({ error: perfErro?.message }, { status: 500 })
    }

    let fixCount = 0
    let logs: string[] = []

    // 2. Para cada perfil, verifica se o usuário auth existe
    for (const profile of profiles) {
      const { data: userAuth, error: authErr } = await supabaseAdmin.auth.admin.getUserById(profile.id)
      
      // Se não existir o Auth User para esse Profile ID
      if (authErr && authErr.message.includes("User not found")) {
        logs.push(`⚠️ ${profile.email}: Auth não encontrado para ID ${profile.id}. Tentando corrigir...`)
        
        // Renomeia o email do perfil fantasma temporariamente para não dar erro UNIQUE na Trigger
        await supabaseAdmin.from("profiles").update({ email: profile.email + ".bak" }).eq("id", profile.id)

        // Tenta criar o usuário no Auth (Isso dispara a Trigger e cria o novo Profile automaticamente)
        const { data: newAuthData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: profile.email,
          password: "SenhaTemporaria!2024",
          email_confirm: true,
          user_metadata: { name: profile.name, role: profile.role, phone: profile.phone, gender: profile.gender }
        })

        let finalAuthId = ""

        if (createErr && createErr.message.includes("already exists")) {
          // O e-mail existe no Auth, mas com outro ID. Precisamos listar para achar o ID.
          logs.push(`  ℹ️ O email ${profile.email} já existe no Auth com outro ID. Buscando...`)
          
          // Gambiarra necessária pois não existe getUserByEmail na v2 de forma exposta fácil no admin
          // (na verdade existe admin.listUsers, vamos usar paginação básica se tiver pouco usuário)
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers()
          const existingUser = listData?.users.find(u => u.email === profile.email)
          
          if (existingUser) {
            finalAuthId = existingUser.id
            logs.push(`  ✅ Encontrado ID real: ${finalAuthId}`)
          } else {
            logs.push(`  ❌ Erro: Não foi possível achar o usuário pelo e-mail na lista.`)
            continue
          }
        } else if (newAuthData?.user) {
          finalAuthId = newAuthData.user.id
          logs.push(`  ✅ Nova conta Auth criada. ID: ${finalAuthId}`)
        } else {
          logs.push(`  ❌ Erro ao criar conta Auth: ${createErr?.message}`)
          continue
        }

        // Se conseguimos um Auth Id válido e diferente do profile.id, vamos migrar os dados
        if (finalAuthId && finalAuthId !== profile.id) {
          logs.push(`  🔄 Migrando dados do Profile ${profile.id} -> ${finalAuthId}...`)
          
          // Passo A: Copiar o Profile para o novo ID
          // Passo A: A trigger já deve ter criado o perfil base. Vamos apenas atualizá-lo com todos os dados antigos.
          // Ignoramos o campo 'gender' no update se ele der erro de cache, mas tentamos passar.
          const { error: updateErr } = await supabaseAdmin.from("profiles").update({
            name: profile.name,
            role: profile.role,
            phone: profile.phone,
            must_change_password: true
          }).eq("id", finalAuthId)

          if (updateErr) {
            logs.push(`  ⚠️ Aviso ao enriquecer perfil novo: ${updateErr.message}`)
          }

          // Passo B: Migrar as tabelas que dependem do ID antigo
          await supabaseAdmin.from("territories").update({ assigned_to: finalAuthId }).eq("assigned_to", profile.id)
          await supabaseAdmin.from("assignments").update({ user_id: finalAuthId }).eq("user_id", profile.id)

          // Passo C: Deletar o Profile antigo "órfão"
          await supabaseAdmin.from("profiles").delete().eq("id", profile.id)

          logs.push(`  🎉 Sucesso: Usuário ${profile.name} corrigido!`)
          fixCount++
        }
      } else {
        logs.push(`✅ ${profile.email}: OK, auth_id confere.`)
      }
    }

    return NextResponse.json({
      message: `Manutenção concluída! ${fixCount} usuários corrigidos.`,
      logs
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
