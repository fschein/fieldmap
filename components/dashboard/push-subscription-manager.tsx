"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useAuth } from "@/hooks/use-auth"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export function PushSubscriptionManager() {
  const { user } = useAuth()
  const [isSupported, setIsSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true)
      checkSubscription()
    } else {
      setLoading(false)
    }
  }, [])

  const checkSubscription = async () => {
    try {
      // Pequeno timeout para não travar se o Service Worker não carregar
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout SW")), 3000))
      ]) as ServiceWorkerRegistration

      const sub = await registration.pushManager.getSubscription()
      setSubscription(sub)
    } catch (error) {
      console.warn("Aviso ao verificar inscrição push (pode estar em ambiente de dev):", error)
      setIsSupported(false) // Desabilita se o SW não estiver pronto
    } finally {
      setLoading(false)
    }
  }

  const subscribe = async () => {
    if (!VAPID_PUBLIC_KEY) {
      toast.error("Chave VAPID não configurada")
      return
    }

    setLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })

      // Salvar no servidor
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub })
      })

      if (!res.ok) throw new Error("Erro ao salvar inscrição no servidor")

      setSubscription(sub)
      toast.success("Notificações ativadas com sucesso!")
    } catch (error: any) {
      console.error("Erro ao inscrever:", error)
      toast.error("Não foi possível ativar as notificações: " + error.message)
    } finally {
      setLoading(false)
    }
  }

  const unsubscribe = async () => {
    if (!subscription) return

    setLoading(true)
    try {
      await subscription.unsubscribe()
      
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      })

      setSubscription(null)
      toast.success("Notificações desativadas.")
    } catch (error) {
      console.error("Erro ao desinscrever:", error)
      toast.error("Erro ao desativar notificações.")
    } finally {
      setLoading(false)
    }
  }

  if (!isSupported || !user) return null

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 border border-border rounded-lg shadow-sm mb-4">
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        {subscription ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground">Notificações no Celular</p>
        <p className="text-[0.625rem] text-muted-foreground truncate">
          {subscription ? "Você receberá notificações sobre seus territórios" : "Ative para receber notificações em tempo real"}
        </p>
      </div>
      <Button 
        variant={subscription ? "ghost" : "default"} 
        size="sm" 
        className="h-8 text-[0.6875rem]"
        onClick={subscription ? unsubscribe : subscribe}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : (subscription ? "Desativar" : "Ativar")}
      </Button>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
