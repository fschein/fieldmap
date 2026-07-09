"use client"

import { useEffect, useState } from "react"

export function PWAMonitor() {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    let shown = false
    const show = () => { if (!shown) { shown = true; setShowBanner(true) } }

    // Backup: controllerchange cobre casos em que o SW já foi trocado antes do mount
    const hadController = !!navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) show()
    })

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return

      // SW em waiting já existente (update anterior não aplicado)
      if (registration.waiting && navigator.serviceWorker.controller) {
        show()
        return
      }

      // Caminho principal: updatefound → statechange → activated
      // Dispara APÓS nosso registration.update(), sem race condition
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing
        if (!worker) return
        worker.addEventListener("statechange", () => {
          if (worker.state === "activated") show()
        })
      })

      registration.update().catch(() => {})
    })

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        navigator.serviceWorker.getRegistration()
          .then((reg) => reg?.update())
          .catch(() => {})
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [])

  if (!showBanner) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 px-4 py-2.5 bg-[#044454] text-white shadow-lg">
      <span className="text-sm font-medium">Nova versão disponível.</span>
      <button
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg bg-white/20 px-4 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-white/30 transition-colors"
      >
        Atualizar
      </button>
    </div>
  )
}
