"use client"

import { createContext, useContext, useEffect, useState, useCallback, SetStateAction } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import type { Profile } from "@/lib/types"

type AuthContextType = {
  user: User | null
  profile: Profile | null
  isReady: boolean
  loading: boolean
  isAdmin: boolean
  isDirigente: boolean
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const supabase = getSupabaseBrowserClient()
  const router = useRouter()

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()

      if (error) {
        console.error("Error fetching profile:", error)
        return null
      }
      
      return data as Profile
    } catch (err) {
      console.error("Exception fetching profile:", err)
      return null
    }
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (user) {
      const userProfile = await fetchProfile(user.id)
      setProfile(userProfile)
    }
  }, [user, fetchProfile])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (data.user && !error) {
      setUser(data.user)
      const userProfile = await fetchProfile(data.user.id)
      setProfile(userProfile)
    }
    
    return { data, error }
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

    const initializeAuth = async () => {
      try {
        // Busca a sessão atual
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error("Error getting session:", error)
        }

        if (session?.user && mounted) {
          setUser(session.user)
          const userProfile = await fetchProfile(session.user.id)
          if (mounted) {
            setProfile(userProfile)
          }
        }
      } catch (error) {
        console.error("Error initializing auth:", error)
      } finally {
        if (mounted) {
          setIsReady(true)
          setLoading(false)
        }
      }
    }

    initializeAuth()

    // Listener para mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string, session: any) => {
        if (!mounted) return

        console.log("Auth state change:", event)

        if (event === "SIGNED_IN" && session?.user) {
          setUser(session.user)
          const userProfile = await fetchProfile(session.user.id)
          if (mounted) {
            setProfile(userProfile)
            setIsReady(true)
            setLoading(false)
          }
        }

        if (event === "SIGNED_OUT") {
          setUser(null)
          setProfile(null)
          setIsReady(true)
          setLoading(false)
        }

        if (event === "TOKEN_REFRESHED" && session?.user) {
          setUser(session.user)
          // Não busca profile novamente no refresh, já temos
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile])

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