import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 1. Cria uma resposta inicial
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  // 2. Configura o cliente do Supabase
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 3. Verifica o usuário (Isso mantém a sessão viva/refresh)
  const { data: { user } } = await supabase.auth.getUser()

  const isDashboardPage = request.nextUrl.pathname.startsWith('/dashboard')
  const isLoginPage = request.nextUrl.pathname.startsWith('/login')
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth')

  // 4. Lógica de Redirecionamento
  // Libera as rotas /auth/* para permitir links de reset de senha e callbacks
  if (isAuthPage) {
    return response
  }

  if (!user && isDashboardPage) {
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  if (user && isLoginPage) {
    const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url))
    response.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  // 5. Verificar se a troca de senha é obrigatória (Apenas para rotas do Dashboard)
  if (user && isDashboardPage && !request.nextUrl.pathname.startsWith('/dashboard/settings')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .single()

    if (profile?.must_change_password) {
      const redirectResponse = NextResponse.redirect(new URL('/dashboard/settings?force=true', request.url))
      response.cookies.getAll().forEach(cookie => {
        redirectResponse.cookies.set(cookie)
      })
      return redirectResponse
    }
  }

  return response
}

// 5. Configuração de performance (Ignora arquivos inúteis)
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}