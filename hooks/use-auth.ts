"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Profile } from "@/lib/types"
import type { User } from "@supabase/supabase-js"

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const mountedRef = useRef(true)
  const supabase = getSupabaseBrowserClient()

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    if (!mountedRef.current) return null
    
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()

      if (error || !data) return null
      return data as Profile
    } catch {
      return null
    }
  }, [supabase])

  useEffect(() => {
    mountedRef.current = true

    const initAuth = async () => {
      try {
        const { data: { user: currentUser }, error } = await supabase.auth.getUser()
        
        if (!mountedRef.current) return

        if (error || !currentUser) {
          setUser(null)
          setProfile(null)
          setLoading(false)
          setIsReady(true)
          return
        }

        setUser(currentUser)
        const userProfile = await fetchProfile(currentUser.id)
        
        if (!mountedRef.current) return
        
        setProfile(userProfile)
        setLoading(false)
        setIsReady(true)
      } catch {
        if (!mountedRef.current) return
        setUser(null)
        setProfile(null)
        setLoading(false)
        setIsReady(true)
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return

        if (event === "SIGNED_OUT" || !session?.user) {
          setUser(null)
          setProfile(null)
          return
        }

        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          setUser(session.user)
          const userProfile = await fetchProfile(session.user.id)
          if (mountedRef.current) {
            setProfile(userProfile)
          }
        }
      }
    )

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }, [supabase])

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || window.location.origin,
        data: { name }
      }
    })
    return { data, error }
  }, [supabase])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }, [supabase])

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
