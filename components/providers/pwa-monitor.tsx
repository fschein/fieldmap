"use client"

import { useEffect } from "react"

/**
 * PWAMonitor — detecta SW travado de forma cirúrgica.
 *
 * Estratégia:
 * - Escuta o evento "controllerchange" para saber quando um novo SW assumiu
 *   e recarrega a página nesse momento (evita estado misto).
 * - Escuta "online" para forçar update do SW quando o dispositivo volta
 *   a ter rede — resolve o caso de app aberto offline por muito tempo.
 * - NÃO usa timer fixo de 15s (causava updates desnecessários em toda sessão).
 * - NÃO recarrega a página sozinho sem motivo real.
 */
export function PWAMonitor() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    const handleControllerChange = () => {
      // Um novo SW assumiu o controle — recarregar garante que o app
      // está usando os assets da versão nova, sem estado misto.
      console.log("[PWA] Novo service worker ativo, recarregando...")
      window.location.reload()
    }

    const handleOnline = async () => {
      // Voltou a ter rede — verifica se há atualização do SW pendente
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          await registration.update()
          // Se houver worker esperando (baixado enquanto offline), ativa agora
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" })
          }
        }
      } catch (err) {
        console.warn("[PWA] Erro ao atualizar SW após reconexão:", err)
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange)
    window.addEventListener("online", handleOnline)

    // Ao montar: se já há um SW esperando (sessão antiga aberta),
    // ativa imediatamente em vez de deixar em estado misto indefinidamente
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" })
      }
    })

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange)
      window.removeEventListener("online", handleOnline)
    }
  }, [])

  return null
}