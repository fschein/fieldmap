"use client"

import { useEffect } from "react"
import { toast } from "sonner"

function showUpdateToast(registration: ServiceWorkerRegistration) {
  toast("Nova versão disponível", {
    description: "Atualize para ter as últimas melhorias.",
    duration: Infinity,
    action: {
      label: "Atualizar agora",
      onClick: () => {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" })
      },
    },
  })
}

export function PWAMonitor() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    const handleControllerChange = () => {
      window.location.reload()
    }

    const handleOnline = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) await registration.update()
      } catch {
        // silencioso
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange)
    window.addEventListener("online", handleOnline)

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return

      if (registration.waiting) {
        showUpdateToast(registration)
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateToast(registration)
          }
        })
      })
    })

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange)
      window.removeEventListener("online", handleOnline)
    }
  }, [])

  return null
}
