"use client"

import { use, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { fmtTerritoryNumber } from "@/lib/utils"
import { Loader2, ShieldAlert, MapPin } from "lucide-react"
import { HouseByHouse, type HouseGroup, type UnitStatus } from "@/components/dashboard/house-by-house"
import { SettingsProvider } from "@/providers/settings-provider"
import { A11yControls } from "@/components/dashboard/a11y-controls"
import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"

const SESSION_KEY = "fieldmap_field_session_id"

function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY)
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, sessionId)
  }
  return sessionId
}

interface RpcRow {
  link_valid: boolean
  link_expired: boolean
  territory_name: string | null
  territory_number: string | null
  group_id: string | null
  group_label: string | null
  unit_id: string | null
  unit_number: string | null
  unit_floor: number | null
  unit_status: UnitStatus | null
  unit_marked_at: string | null
  unit_marked_by: string | null
}

const supabase = getSupabaseBrowserClient()

function FieldMapBrandHeader() {
  return (
    <div className="h-14 flex items-center justify-between gap-2 px-4 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <FieldMapLogoBrand className="h-6 w-auto opacity-90 shrink-0" />
        <span className="font-bold text-foreground tracking-tight text-base truncate">
          Field<span className="text-primary">Map</span>
        </span>
      </div>
      <A11yControls />
    </div>
  )
}

export default function FieldLinkPage(props: { params: Promise<{ token: string }> }) {
  return (
    <SettingsProvider>
      <FieldLinkPageContent {...props} />
    </SettingsProvider>
  )
}

function FieldLinkPageContent({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)

  const [loading, setLoading] = useState(true)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [rows, setRows] = useState<RpcRow[]>([])

  async function fetchData() {
    const { data, error } = await supabase.rpc("get_field_link_units", { p_link_id: token })
    if (error) {
      console.error("Erro ao carregar link de campo:", error)
    }
    if (!error && data) {
      setRows(data as RpcRow[])
    }
    setLoading(false)
  }

  useEffect(() => {
    setSessionId(getOrCreateSessionId())
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleMark(unitId: string, status: UnitStatus) {
    if (!sessionId) return
    const { error } = await supabase.rpc("mark_unit_via_link", {
      p_link_id: token,
      p_unit_id: unitId,
      p_session_id: sessionId,
      p_new_status: status,
    })
    if (error) {
      alert("Não foi possível marcar: " + error.message)
      return
    }
    fetchData()
  }

  if (loading || !sessionId) {
    return (
      <div className="min-h-dvh flex flex-col">
        <FieldMapBrandHeader />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  const meta = rows[0]
  const linkValid = meta?.link_valid ?? false
  const linkExpired = meta?.link_expired ?? false

  if (!linkValid) {
    return (
      <div className="min-h-dvh flex flex-col">
        <FieldMapBrandHeader />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 space-y-3">
          <ShieldAlert className="h-12 w-12 text-destructive/40" />
          <h1 className="text-lg font-bold">Link inválido</h1>
          <p className="text-sm text-muted-foreground">Este link de campo não existe mais ou foi digitado errado.</p>
        </div>
      </div>
    )
  }

  const groupsMap = new Map<string, HouseGroup>()
  for (const r of rows) {
    if (!r.group_id || !r.unit_id) continue
    if (!groupsMap.has(r.group_id)) {
      groupsMap.set(r.group_id, { id: r.group_id, label: r.group_label || "Casas", units: [] })
    }
    groupsMap.get(r.group_id)!.units.push({
      id: r.unit_id,
      number: r.unit_number || "",
      floor: r.unit_floor,
      status: r.unit_status || "pending",
      marked_at: r.unit_marked_at,
      marked_by: r.unit_marked_by,
    })
  }
  const groups = Array.from(groupsMap.values())

  return (
    <div className="min-h-dvh flex flex-col">
      <FieldMapBrandHeader />
      <div className="h-14 flex items-center gap-2 px-4 shrink-0 border-t border-border">
        <MapPin className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {meta?.territory_number ? fmtTerritoryNumber(meta.territory_number) : ""} {meta?.territory_name}
          </p>
          {linkExpired && (
            <p className="text-[0.6875rem] text-destructive font-medium">Link expirado — somente leitura</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <HouseByHouse
          groups={groups}
          currentMarkerId={sessionId}
          readOnly={linkExpired}
          onMark={handleMark}
          emptyHint="Nenhuma unidade cadastrada neste link ainda."
        />
      </div>
    </div>
  )
}
