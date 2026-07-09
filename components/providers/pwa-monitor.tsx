"use client"

import { useEffect, useState } from "react"

export function PWAMonitor() {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    const hadController = !!navigator.serviceWorker.controller

    const handleControllerChange = () => {
      if (hadController) setShowBanner(true)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        navigator.serviceWorker.ready.then((reg) => reg.update()).catch(() => {})
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    navigator.serviceWorker.ready.then((reg) => reg.update()).catch(() => {})

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
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
