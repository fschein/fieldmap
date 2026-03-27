import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Se for um link de recuperação de senha, redirecionar para a página de update-password
      const type = searchParams.get("type")
      if (type === "recovery") {
        return NextResponse.redirect(new URL("/auth/update-password", origin))
      }
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  // Em caso de erro, redirecionar para a página de login
  return NextResponse.redirect(new URL("/login?error=auth_error", origin))
}
