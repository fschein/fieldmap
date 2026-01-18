"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { User } from "@supabase/supabase-js"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Profile } from "@/lib/types"

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const mountedRef = useRef(true)
  const initializingRef = useRef(false)

  const fetchProfile = useCallback(async (userId: string, abortSignal?: AbortSignal) => {
    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()
      
      if (abortSignal?.aborted) return null
      
      if (error) {
        return null
      }
      
      return data as Profile
    } catch (err) {
      if (abortSignal?.aborted) return null
      return null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const abortController = new AbortController()
    
    const initAuth = async () => {
      if (initializingRef.current) return
      initializingRef.current = true
      
      try {
        const supabase = getSupabaseBrowserClient()
        
        const { data: { user: currentUser }, error } = await supabase.auth.getUser()
        
        if (abortController.signal.aborted || !mountedRef.current) return
        
        if (error) {
          setUser(null)
          setProfile(null)
          setLoading(false)
          setIsReady(true)
          return
        }
        
        setUser(currentUser)
        
        if (currentUser) {
          const profileData = await fetchProfile(currentUser.id, abortController.signal)
          if (abortController.signal.aborted || !mountedRef.current) return
          setProfile(profileData)
        }
        
        setLoading(false)
        setIsReady(true)
      } catch (err) {
        if (abortController.signal.aborted || !mountedRef.current) return
        setLoading(false)
        setIsReady(true)
      } finally {
        initializingRef.current = false
      }
    }

    initAuth()

    const supabase = getSupabaseBrowserClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return
        
        if (event === "SIGNED_OUT") {
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }
        
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          const newUser = session?.user ?? null
          setUser(newUser)
          
          if (newUser && mountedRef.current) {
            const profileData = await fetchProfile(newUser.id)
            if (mountedRef.current) {
              setProfile(profileData)
            }
          }
          setLoading(false)
        }
      }
    )

    return () => {
      mountedRef.current = false
      abortController.abort()
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseBrowserClient()
    setLoading(true)
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) {
        setLoading(false)
        return { data: null, error }
      }
      
      if (data.user && mountedRef.current) {
        setUser(data.user)
        const profileData = await fetchProfile(data.user.id)
        if (mountedRef.current) {
          setProfile(profileData)
        }
      }
      
      setLoading(false)
      return { data, error: null }
    } catch (err) {
      setLoading(false)
      return { data: null, error: err as Error }
    }
  }, [fetchProfile])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const supabase = getSupabaseBrowserClient()
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || window.location.origin,
          data: {
            full_name: fullName,
          },
        },
      })
      return { data, error }
    } catch (err) {
      return { data: null, error: err as Error }
    }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    
    try {
      setUser(null)
      setProfile(null)
      const { error } = await supabase.auth.signOut()
      return { error }
    } catch (err) {
      return { error: err as Error }
    }
  }, [])

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
