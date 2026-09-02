"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { AppSettings } from "@/lib/types"

const supabase = getSupabaseBrowserClient()

// Mesmo padrão dos defaults da migration 056 — usado só como fallback caso
// a linha ainda não exista ou a consulta falhe, pra nunca travar a tela.
const DEFAULT_SETTINGS: AppSettings = {
  overdue_days: 90,
  recent_days: 25,
  use_houses: true,
  enabled_marking_options: ["visited", "visited_carta", "do_not_visit"],
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from("app_settings")
      .select("overdue_days, recent_days, use_houses, enabled_marking_options")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }: { data: AppSettings | null }) => {
        if (active && data) setSettings(data as AppSettings)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { settings, loading }
}
