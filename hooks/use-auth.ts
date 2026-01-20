"use client"

import { useEffect, useState } from "react"
import type { Profile } from "@/lib/types"

// Mock user data for MVP development
const MOCK_USER = {
  id: "mock-user-id",
  email: "admin@example.com",
}

const MOCK_PROFILE: Profile = {
  id: "mock-user-id",
  email: "admin@example.com",
  name: "Administrador Mock",
  phone: null, // Add phone field
  role: "admin", // Change to "dirigente" or "publicador" to test different roles
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}


export function useAuth() {
  const [user] = useState(MOCK_USER)
  const [profile] = useState<Profile>(MOCK_PROFILE)
  const [loading] = useState(false)
  const [isReady] = useState(true)

  useEffect(() => {
    console.log("useAuth - Mock mode active")
    console.log("useAuth - Mock user:", MOCK_USER)
    console.log("useAuth - Mock profile:", MOCK_PROFILE)
  }, [])

  // Mock functions - don't do anything for now
  const signIn = async (email: string, password: string) => {
    console.log("useAuth - Mock signIn called (disabled)")
    return { data: null, error: null }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    console.log("useAuth - Mock signUp called (disabled)")
    return { data: null, error: null }
  }

  const signOut = async () => {
    console.log("useAuth - Mock signOut called (disabled)")
    return { error: null }
  }

  const isAdmin = profile?.role === "admin"
  const isDirigente = profile?.role === "dirigente" || isAdmin
  const isPublicador = profile?.role === "publicador"

  return {
    user,
    profile,
    loading,
    isReady,
    signIn,
    signUp,
    signOut,
    isAdmin,
    isDirigente,
    isPublicador,
  }
}

/*
 * INSTRUÇÕES PARA REATIVAR O LOGIN:
 * 
 * 1. Substitua todo este arquivo pelo código original do useAuth
 * 2. Corrija os tipos do onAuthStateChange:
 *    
 *    supabase.auth.onAuthStateChange(
 *      async (event: string, session: any) => {
 *        // seu código aqui
 *      }
 *    )
 * 
 * 3. Ou importe os tipos corretos:
 *    import type { AuthChangeEvent, Session } from "@supabase/supabase-js"
 *    
 *    supabase.auth.onAuthStateChange(
 *      async (event: AuthChangeEvent, session: Session | null) => {
 *        // seu código aqui
 *      }
 *    )
 */