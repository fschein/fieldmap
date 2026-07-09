"use client"

import { useEffect } from "react"

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Erro ao registrar service worker:", err)
    })
  }, [])

  return null
}
