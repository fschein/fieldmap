"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

const CHECK_INTERVAL_MS = 5 * 60 * 1000

export function VersionCheck() {
  const notifiedRef = useRef(false)

  useEffect(() => {
    const buildId = process.env.NEXT_PUBLIC_BUILD_ID

    const checkVersion = async () => {
      if (notifiedRef.current || !buildId) return
      try {
        const res = await fetch("/api/version", { cache: "no-store" })
        const { version } = await res.json()
        // version null = ambiente sem VERCEL_GIT_COMMIT_SHA (dev local) — não dá pra comparar
        if (!version || version === buildId) return

        notifiedRef.current = true
        toast("Nova versão disponível", {
          description: "Atualize pra pegar as últimas correções.",
          duration: Infinity,
          closeButton: true,
          action: {
            label: "Atualizar",
            onClick: () => window.location.reload(),
          },
        })
      } catch {
        // Falha de rede ao checar versão não é motivo pra incomodar o usuário
      }
    }

    checkVersion()
    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS)

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkVersion()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [])

  return null
}
