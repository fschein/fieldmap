"use client"

import { use, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn, compareHouseNumbers, fmtTerritoryNumber } from "@/lib/utils"
import { Loader2, ShieldAlert, MapPin, Lightbulb, X, Plus } from "lucide-react"
import { HouseByHouse, type HouseGroup, type UnitStatus } from "@/components/dashboard/house-by-house"
import { SettingsProvider } from "@/providers/settings-provider"
import { A11yControls } from "@/components/dashboard/a11y-controls"
import { FieldMapLogoBrand } from "@/components/icons/fieldmap-logo"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

// Mesmo tom usado em components/dashboard/house-by-house.tsx e
// subdivision-drawer.tsx pra ações do módulo de casas/link de campo.
const TEAL = "oklch(0.68 0.12 195)"
const TEAL_DARK = "oklch(0.14 0.03 195)"

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
  unit_pending_action: "add" | "remove" | null
}

const supabase = getSupabaseBrowserClient()

function FieldMapBrandHeader({
  onSuggestEdit,
  suggestActive,
}: {
  onSuggestEdit?: () => void
  suggestActive?: boolean
}) {
  return (
    <div className="h-14 flex items-center justify-between gap-2 px-4 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <FieldMapLogoBrand className="h-6 w-auto opacity-90 shrink-0" />
        <span className="font-bold text-foreground tracking-tight text-base truncate">
          Field<span className="text-primary">Map</span>
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onSuggestEdit && (
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-9 w-9 p-0", suggestActive && "text-primary bg-primary/10")}
            title="Sugerir edição"
            onClick={onSuggestEdit}
          >
            <Lightbulb className="h-5 w-5" />
            <span className="sr-only">Sugerir edição</span>
          </Button>
        )}
        <A11yControls />
      </div>
    </div>
  )
}

function EditableStreetGrid({
  group,
  stagedAdds,
  stagedRemoveIds,
  onToggleRemove,
  onAddNumber,
  onUndoAdd,
}: {
  group: HouseGroup
  stagedAdds: string[]
  stagedRemoveIds: Set<string>
  onToggleRemove: (unitId: string) => void
  onAddNumber: (number: string) => void
  onUndoAdd: (index: number) => void
}) {
  const [adding, setAdding] = useState(false)
  const [addValue, setAddValue] = useState("")
  const sortedUnits = [...group.units].sort((a, b) => compareHouseNumbers(a.number, b.number))
  const total = group.units.length + stagedAdds.length - stagedRemoveIds.size

  const handleConfirmAdd = () => {
    if (addValue.trim()) onAddNumber(addValue.trim())
    setAddValue("")
    setAdding(false)
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <p className="font-semibold text-sm text-foreground truncate">{group.label}</p>
        <span className="text-[0.6875rem] text-muted-foreground tabular-nums shrink-0">{total}</span>
      </div>
      <div className="p-4 grid grid-cols-4 gap-2.5 md:[grid-template-columns:repeat(auto-fill,minmax(64px,84px))]">
        {sortedUnits.map((u) => {
          const isRemoving = stagedRemoveIds.has(u.id)
          return (
            <div key={u.id} className="relative">
              <div
                className={cn(
                  "aspect-square rounded-xl text-lg font-bold flex items-center justify-center",
                  isRemoving
                    ? "text-red-700 dark:text-red-400 border-2 border-dashed border-red-500"
                    : "chip-jiggle bg-gray-200 text-gray-900 border-2 border-gray-400 dark:bg-muted dark:text-muted-foreground dark:border-transparent"
                )}
                style={isRemoving ? { backgroundImage: "repeating-linear-gradient(45deg, rgba(239,68,68,0.16) 0 6px, transparent 6px 12px)" } : undefined}
              >
                {u.number}
              </div>
              <button
                type="button"
                onClick={() => onToggleRemove(u.id)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}

        {stagedAdds.map((num, i) => (
          <div key={`add-${i}`} className="relative">
            <div
              className="aspect-square rounded-xl text-lg font-bold flex items-center justify-center text-emerald-700 dark:text-emerald-400 border-2 border-dashed border-emerald-500"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(16,185,129,0.16) 0 6px, transparent 6px 12px)" }}
            >
              {num}
            </div>
            <button
              type="button"
              onClick={() => onUndoAdd(i)}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {adding ? (
          <div className="aspect-square rounded-xl border-2 border-dashed border-primary flex flex-col items-center justify-center gap-1 p-1">
            <input
              autoFocus
              inputMode="numeric"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirmAdd() }}
              className="w-full text-center text-sm bg-transparent outline-none text-foreground"
              placeholder="Nº"
            />
            <button type="button" onClick={handleConfirmAdd} className="text-[0.625rem] font-bold text-primary">
              OK
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/40 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
      </div>
      <style jsx global>{`
        @keyframes chip-jiggle {
          0%, 100% { transform: rotate(-1.2deg); }
          50% { transform: rotate(1.2deg); }
        }
        .chip-jiggle {
          animation: chip-jiggle 0.24s ease-in-out infinite;
        }
      `}</style>
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
  const [suggestMode, setSuggestMode] = useState(false)
  const [suggestStreetId, setSuggestStreetId] = useState<string | null>(null)
  const [stagedAdds, setStagedAdds] = useState<string[]>([])
  const [stagedRemoveIds, setStagedRemoveIds] = useState<Set<string>>(new Set())
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false)

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

  function handleToggleSuggestMode(groups: HouseGroup[]) {
    if (!suggestMode) {
      setSuggestStreetId((prev) => prev ?? groups[0]?.id ?? null)
      setStagedAdds([])
      setStagedRemoveIds(new Set())
    }
    setSuggestMode((v) => !v)
  }

  function handleCancelSuggest() {
    setSuggestMode(false)
    setStagedAdds([])
    setStagedRemoveIds(new Set())
  }

  function handleToggleRemove(unitId: string) {
    setStagedRemoveIds((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }

  function handleAddNumber(number: string) {
    setStagedAdds((prev) => [...prev, number])
  }

  function handleUndoAdd(index: number) {
    setStagedAdds((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmitSuggestions() {
    if (!suggestStreetId || (stagedAdds.length === 0 && stagedRemoveIds.size === 0)) return
    setSubmittingSuggestion(true)
    try {
      const { error } = await supabase.rpc("submit_unit_suggestions_via_link", {
        p_link_id: token,
        p_street_id: suggestStreetId,
        p_add_numbers: stagedAdds,
        p_remove_unit_ids: Array.from(stagedRemoveIds),
      })
      if (error) {
        toast.error("Não foi possível enviar a sugestão: " + error.message)
        return
      }
      toast.success("Sugestão enviada! Um admin ou supervisor vai revisar.")
      setSuggestMode(false)
      setStagedAdds([])
      setStagedRemoveIds(new Set())
      fetchData()
    } finally {
      setSubmittingSuggestion(false)
    }
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
      pending_action: r.unit_pending_action,
    })
  }
  const groups = Array.from(groupsMap.values())
  const currentSuggestGroup = groups.find((g) => g.id === suggestStreetId) ?? groups[0]

  return (
    <div className="min-h-dvh flex flex-col">
      <FieldMapBrandHeader
        onSuggestEdit={groups.length > 0 ? () => handleToggleSuggestMode(groups) : undefined}
        suggestActive={suggestMode}
      />
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

      {suggestMode ? (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {groups.length > 1 && (
              <Select value={suggestStreetId ?? ""} onValueChange={setSuggestStreetId}>
                <SelectTrigger className="h-11 bg-background border-border rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {currentSuggestGroup && (
              <EditableStreetGrid
                group={currentSuggestGroup}
                stagedAdds={stagedAdds}
                stagedRemoveIds={stagedRemoveIds}
                onToggleRemove={handleToggleRemove}
                onAddNumber={handleAddNumber}
                onUndoAdd={handleUndoAdd}
              />
            )}
          </div>
          <div className="p-4 shrink-0 border-t border-border flex gap-2">
            <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={handleCancelSuggest}>
              Cancelar
            </Button>
            <Button
              className="flex-1 h-12 rounded-xl font-bold border-0"
              style={{ background: TEAL, color: TEAL_DARK }}
              disabled={submittingSuggestion || (stagedAdds.length === 0 && stagedRemoveIds.size === 0)}
              onClick={handleSubmitSuggestions}
            >
              {submittingSuggestion ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar sugestão"}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <HouseByHouse
            groups={groups}
            currentMarkerId={sessionId}
            readOnly={linkExpired}
            onMark={handleMark}
            emptyHint="Nenhuma unidade cadastrada neste link ainda."
          />
        </div>
      )}
    </div>
  )
}
