import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server' // NextRequest vem daqui

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Recupera o usuário de forma segura
  const { data: { user } } = await supabase.auth.getUser()

  const isDashboardPage = request.nextUrl.pathname.startsWith('/dashboard')
  const isLoginPage = request.nextUrl.pathname.startsWith('/login')

  // Redirecionamentos lógicos
  if (!user && isDashboardPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}