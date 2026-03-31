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
  isSupervisor: boolean
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
        .select("id, name, email, role, phone, must_change_password, is_active, group_id")
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
      const p = await fetchProfile(data.user.id)
      if (p && p.is_active === false) {
        await supabase.auth.signOut()
        return { data: null, error: { message: "Sua conta está inativa. Procure um administrador." } }
      }
      setUser(data.user)
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
          full_name: fullName,
          must_change_password: false,
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

    // 1. Safety Catch: Force unblock after 6 seconds if auth hangs
    const safetyTimeout = setTimeout(() => {
      if (mounted && !isReady) {
        console.warn("Auth Provider: Unblocking UI via Safety Catch (6s timeout)")
        setIsReady(true)
        setLoading(false)
      }
    }, 6000)

    const finishInitialization = (session: Session | null) => {
      if (!mounted) return
      
      clearTimeout(safetyTimeout)
      
      if (session?.user) {
        // Buscamos o profile de forma asíncrona mas sincronizada com o estado 'ready'
        fetchProfile(session.user.id).then(p => {
          if (mounted) {
            if (p && p.is_active === false) {
              signOut()
            } else {
              setProfile(p)
              setUser(session.user)
            }
            setIsReady(true)
            setLoading(false)
          }
        })
      } else {
        setUser(null)
        setProfile(null)
        setIsReady(true)
        setLoading(false)
      }
    }

    // 2. Proactive Session Check (Immediate)
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      const { session } = data
      if (mounted && !isReady) {
        console.log("Auth Provider: Proactive session check complete")
        finishInitialization(session)
      }
    })

    // 3. Auth State Change Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return

        console.log("Auth Provider Event:", event)

        if (event === "INITIAL_SESSION") {
          // Se o getSession já ganhou a corrida, ignore o INITIAL_SESSION redundante
          if (!isReady) {
            finishInitialization(session)
          }
          return
        }

        if (event === "SIGNED_IN" && session?.user) {
          setUser(session.user)
          fetchProfile(session.user.id).then(p => {
            if (mounted) {
              setProfile(p)
              setIsReady(true)
              setLoading(false)
            }
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
      clearTimeout(safetyTimeout)
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const isAdmin = profile?.role === "admin"
  const isSupervisor = profile?.role === "supervisor" || isAdmin
  const isDirigente = profile?.role === "dirigente" || isSupervisor || isAdmin

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      isReady,
      loading,
      isAdmin,
      isSupervisor,
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