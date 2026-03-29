"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { createTimeoutSignal } from "@/lib/utils/api-utils"
import { useRouter } from "next/navigation"
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js"
import type { Profile } from "@/lib/types"

type AuthContextType = {
  user: User | null
  profile: Profile | null
  isReady: boolean
  loading: boolean
  isAdmin: boolean
  isDirigente: boolean
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ data: any; error: any }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Singleton fora do componente — referência 100% estável entre renders
const supabase = getSupabaseBrowserClient()

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { signal, clear } = createTimeoutSignal(15000)
    try {
      // Select explícito para evitar erro se colunas opcionais ainda não existirem no BD
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, phone, must_change_password")
        .eq("id", userId)
        .abortSignal(signal)
        .single()

      if (error) {
        // Ignora erro de perfil não encontrado (novo usuário) silenciosamente
        if (error.code !== 'PGRST116') {
          console.warn("Error fetching profile:", error.message)
        }
        return null
      }
      return data as Profile
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn("Timeout ao carregar perfil (15s)")
      } else {
        console.warn("Exception fetching profile:", err)
      }
      return null
    } finally {
      clear()
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser) {
      const p = await fetchProfile(currentUser.id)
      setProfile(p)
    }
  }, [fetchProfile])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (data.user && !error) {
      setUser(data.user)
      const p = await fetchProfile(data.user.id)
      setProfile(p)
    }
    return { data, error }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: fullName,
        },
      },
    })
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return

        console.log("Auth event:", event)

        if (event === "INITIAL_SESSION") {
          // ✅ LOCK RESOLVIDO AQUI: isReady e loading são definidos PRIMEIRO,
          // de forma síncrona, ANTES de qualquer fetch de dados.
          // Isso garante que o spinner NUNCA fica preso esperando a rede.
          if (session?.user) {
            setUser(session.user)
          } else {
            setUser(null)
            setProfile(null)
          }

          // Desbloqueia a UI imediatamente
          setIsReady(true)
          setLoading(false)

          // Busca o profile de forma assíncrona e não-bloqueante
          if (session?.user) {
            fetchProfile(session.user.id).then(p => {
              if (mounted) setProfile(p)
            })
          }
          return
        }

        if (event === "SIGNED_IN" && session?.user) {
          setUser(session.user)
          setIsReady(true)
          setLoading(false)
          fetchProfile(session.user.id).then(p => {
            if (mounted) setProfile(p)
          })
          return
        }

        if (event === "SIGNED_OUT") {
          setUser(null)
          setProfile(null)
          setIsReady(true)
          setLoading(false)
          return
        }

        if (event === "TOKEN_REFRESHED" && session?.user) {
          setUser(session.user)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const isAdmin = profile?.role === "admin"
  const isDirigente = profile?.role === "dirigente" || isAdmin

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      isReady,
      loading,
      isAdmin,
      isDirigente,
      signIn,
      signUp,
      signOut,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuthContext = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuthContext deve ser usado dentro de um AuthProvider")
  }
  return context
}