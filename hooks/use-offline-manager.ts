"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export interface PendingAction {
  id: string
  subdivisionId: string
  status: string
  completed: boolean
  timestamp: string
}

export function useOfflineManager() {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  // Atualiza o estado de conectividade
  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      toast.success("Conexão restabelecida. Sincronizando dados...")
      syncPendingActions()
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast.warning("Você está offline. As alterações serão salvas localmente.")
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    // Check for pending on mount
    const pending = JSON.parse(localStorage.getItem("pending_subdivision_updates") || "[]")
    setPendingCount(pending.length)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const syncPendingActions = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    const pending: PendingAction[] = JSON.parse(localStorage.getItem("pending_subdivision_updates") || "[]")
    
    if (pending.length === 0) return

    console.log(`Sincronizando ${pending.length} ações pendentes...`)
    
    let successCount = 0
    let failed: PendingAction[] = []

    for (const action of pending) {
      try {
        const { error } = await supabase
          .from("subdivisions")
          .update({
            status: action.status,
            completed: action.completed,
            updated_at: action.timestamp
          })
          .eq("id", action.subdivisionId)

        if (error) throw error
        successCount++
      } catch (err) {
        console.error("Erro ao sincronizar ação:", action.id, err)
        failed.push(action)
      }
    }

    localStorage.setItem("pending_subdivision_updates", JSON.stringify(failed))
    setPendingCount(failed.length)

    if (successCount > 0) {
      toast.success(`${successCount} alteração(ões) sincronizada(s) com sucesso.`)
      // Trigger a custom event so pages can refresh data
      window.dispatchEvent(new CustomEvent("sync-complete"))
    }
  }, [])

  const addPendingAction = useCallback((subdivisionId: string, status: string, completed: boolean) => {
    const pending: PendingAction[] = JSON.parse(localStorage.getItem("pending_subdivision_updates") || "[]")
    
    // Remove duplication if the same subdivision is updated multiple times while offline
    const filtered = pending.filter(p => p.subdivisionId !== subdivisionId)
    
    const newAction: PendingAction = {
      id: crypto.randomUUID(),
      subdivisionId,
      status,
      completed,
      timestamp: new Date().toISOString()
    }

    const updated = [...filtered, newAction]
    localStorage.setItem("pending_subdivision_updates", JSON.stringify(updated))
    setPendingCount(updated.length)
    
    // Notify local UI
    window.dispatchEvent(new CustomEvent("offline-action-added", { detail: newAction }))
  }, [])

  return { isOnline, pendingCount, addPendingAction, syncPendingActions }
}
