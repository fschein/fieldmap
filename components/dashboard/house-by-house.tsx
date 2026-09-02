"use client"

import { useState, type ReactNode, type CSSProperties } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, compareHouseNumbers } from "@/lib/utils"
import { ChevronDown, ChevronUp, Loader2, Ban, Check, CheckCircle2, FlagOff, Mail, Home } from "lucide-react"
import type { MarkingOption } from "@/lib/types"

// ── Cores exatas da gaveta de marcação (mock aprovado) ──
const DRAWER_BG = "oklch(0.24 0.02 220)"
const DRAWER_BORDER = "oklch(0.36 0.02 215)"
const HANDLE_COLOR = "oklch(0.4 0.02 215)"
const TITLE_COLOR = "oklch(0.94 0.006 210)"
const SUBTITLE_COLOR = "oklch(0.62 0.02 210)"
const SECONDARY_COLOR = "oklch(0.6 0.02 210)"
const CANCEL_COLOR = "oklch(0.5 0.02 210)"
const TEAL = "oklch(0.68 0.12 195)"
const TEAL_DARK = "oklch(0.14 0.03 195)"
const ALERT = "oklch(0.72 0.15 55)"
const ALERT_TEXT = "oklch(0.75 0.15 55)"
const ALERT_BG = "oklch(0.27 0.05 55)"

export type UnitStatus = "pending" | "visited" | "visited_carta" | "do_not_visit" | "not_home"

export interface HouseUnit {
  id: string
  number: string
  floor: number | null
  status: UnitStatus
  marked_at: string | null
  marked_by: string | null
  /** Sugestão de edição pendente de aprovação (link de campo) — null/undefined = normal. */
  pending_action?: "add" | "remove" | null
}

export interface HouseGroup {
  id: string
  label: string
  units: HouseUnit[]
  /** Só quadras (subdivisions) têm um "completed" persistido — blocos não têm esse campo no schema. */
  completed?: boolean
}

interface HouseByHouseProps {
  groups: HouseGroup[]
  /** auth.uid() (modo staff) ou ID de sessão anônima (modo link) — decide quem pode desmarcar um "não visitar". */
  currentMarkerId: string | null
  /** Link expirado — nenhuma ação de escrita disponível. */
  readOnly?: boolean
  onMark: (unitId: string, newStatus: UnitStatus) => Promise<void>
  /** Presente só pra grupos com completed persistível (quadras). */
  onFinalizeGroup?: (groupId: string) => Promise<void>
  /** Slot livre no cabeçalho do grupo — ex.: botão de gerar link de campo. */
  renderGroupExtra?: (groupId: string) => ReactNode
  emptyHint?: string
  /** Rótulo no título da gaveta — "Casa" (padrão) ou "Unidade" (condomínio tipo Predial). */
  unitLabel?: string
  /** Quais opções de marcação aparecem na gaveta — vem de app_settings.enabled_marking_options. */
  enabledOptions?: MarkingOption[]
}

function isGroupFullyMarked(group: HouseGroup) {
  if (group.units.length === 0) return false
  return group.units.every((u) => u.status === "visited" || u.status === "visited_carta" || u.status === "do_not_visit")
}

function statusChipClasses(status: UnitStatus, pendingAction?: "add" | "remove" | null) {
  if (pendingAction === "add") {
    return "text-emerald-700 dark:text-emerald-400 border-2 border-dashed border-emerald-500"
  }
  if (pendingAction === "remove") {
    return "text-red-700 dark:text-red-400 border-2 border-dashed border-red-500"
  }
  switch (status) {
    case "visited":
    case "visited_carta":
      return "border-2"
    case "do_not_visit":
      return "bg-transparent text-amber-600 dark:text-amber-500 border-2 border-dashed border-amber-600 dark:border-amber-500"
    case "not_home":
      return "bg-transparent text-blue-600 dark:text-blue-400 border-2 border-dashed border-blue-600 dark:border-blue-400"
    default:
      return "bg-gray-200 text-gray-900 border-2 border-gray-400 dark:bg-muted dark:text-muted-foreground dark:border-transparent"
  }
}

function statusChipStyle(status: UnitStatus, pendingAction?: "add" | "remove" | null): CSSProperties | undefined {
  if (pendingAction === "add") {
    return { backgroundImage: "repeating-linear-gradient(45deg, rgba(16,185,129,0.16) 0 6px, transparent 6px 12px)" }
  }
  if (pendingAction === "remove") {
    return { backgroundImage: "repeating-linear-gradient(45deg, rgba(239,68,68,0.16) 0 6px, transparent 6px 12px)" }
  }
  switch (status) {
    case "visited":
    case "visited_carta":
      return { background: TEAL, color: TEAL_DARK, borderColor: "transparent" }
    default:
      return undefined
  }
}

function statusChipIcon(status: UnitStatus) {
  switch (status) {
    case "visited":
      return <Check className="h-4 w-4" />
    case "visited_carta":
      return <Mail className="h-4 w-4" />
    case "do_not_visit":
      return <Ban className="h-4 w-4" />
    case "not_home":
      return <Home className="h-4 w-4" />
    default:
      return null
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

export function HouseByHouse({
  groups,
  currentMarkerId,
  readOnly = false,
  onMark,
  onFinalizeGroup,
  renderGroupExtra,
  emptyHint = "Nenhuma unidade cadastrada.",
  unitLabel = "Casa",
  enabledOptions = ["visited", "visited_carta", "do_not_visit"],
}: HouseByHouseProps) {
  const isEnabled = (opt: MarkingOption) => enabledOptions.includes(opt)
  const [expandedId, setExpandedId] = useState<string | null>(groups[0]?.id ?? null)
  const [activeUnit, setActiveUnit] = useState<HouseUnit | null>(null)
  const [saving, setSaving] = useState(false)
  const [finalizingGroupId, setFinalizingGroupId] = useState<string | null>(null)

  const handleMark = async (status: UnitStatus) => {
    if (!activeUnit) return
    setSaving(true)
    try {
      await onMark(activeUnit.id, status)
      setActiveUnit(null)
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async (groupId: string) => {
    if (!onFinalizeGroup) return
    setFinalizingGroupId(groupId)
    try {
      await onFinalizeGroup(groupId)
    } finally {
      setFinalizingGroupId(null)
    }
  }

  const isLockedForMe = (u: HouseUnit) =>
    u.status === "do_not_visit" && u.marked_by !== null && u.marked_by !== currentMarkerId

  return (
    <div className="space-y-2 max-w-[640px] mx-auto">
      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {emptyHint}
        </div>
      )}

      {groups.map((group) => {
        const isExpanded = expandedId === group.id
        const sortedUnits = [...group.units].sort((a, b) => compareHouseNumbers(a.number, b.number))
        const doneCount = group.units.filter((u) => u.status === "visited" || u.status === "visited_carta" || u.status === "do_not_visit").length
        const total = group.units.length
        const fullyMarked = isGroupFullyMarked(group)

        return (
          <div key={group.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : group.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-sm text-foreground truncate">{group.label}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 max-w-[140px] rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: total ? `${(doneCount / total) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="text-[0.6875rem] text-muted-foreground tabular-nums shrink-0">
                    {doneCount}/{total}
                  </span>
                  {group.completed && (
                    <Badge variant="secondary" className="text-[0.5625rem] h-4 px-1">Concluída</Badge>
                  )}
                </div>
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                <div className="grid grid-cols-4 gap-2.5 md:[grid-template-columns:repeat(auto-fill,minmax(64px,84px))]">
                  {sortedUnits.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setActiveUnit(u)}
                      style={statusChipStyle(u.status, u.pending_action)}
                      className={cn(
                        "aspect-square rounded-xl text-lg font-bold flex flex-col items-center justify-center gap-1 transition-transform active:scale-95",
                        statusChipClasses(u.status, u.pending_action)
                      )}
                    >
                      <span>{u.number}</span>
                      {statusChipIcon(u.status)}
                    </button>
                  ))}
                </div>

                {!readOnly && onFinalizeGroup && !group.completed && (
                  <Button
                    variant={fullyMarked ? "default" : "outline"}
                    size="sm"
                    disabled={!fullyMarked || finalizingGroupId === group.id}
                    onClick={() => handleFinalize(group.id)}
                    className="w-full"
                  >
                    {finalizingGroupId === group.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : fullyMarked ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Finalizar</>
                    ) : (
                      <><FlagOff className="h-3.5 w-3.5 mr-1.5" /> Finalizar (falta marcar todas)</>
                    )}
                  </Button>
                )}

                {renderGroupExtra?.(group.id)}
              </div>
            )}
          </div>
        )
      })}

      {/* ── Gaveta de ação por unidade ── */}
      {activeUnit && (
        <div className="fixed inset-0 z-[9999]">
          <div
            className="absolute inset-0 animate-in fade-in-0 duration-200"
            style={{ background: "rgba(10,14,16,0.6)" }}
            onClick={() => setActiveUnit(null)}
          />
          <div
            className="absolute inset-x-0 bottom-0 animate-in slide-in-from-bottom duration-200"
            style={{
              borderRadius: "20px 20px 0 0",
              padding: "16px 20px 32px",
              background: DRAWER_BG,
              borderTop: `1px solid ${DRAWER_BORDER}`,
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 999, background: HANDLE_COLOR, margin: "0 auto 4px" }} />

            <p style={{ fontSize: 18, fontWeight: 700, color: TITLE_COLOR, textAlign: "center", marginTop: 8 }}>
              {unitLabel} {activeUnit.number}
            </p>
            {activeUnit.marked_at && (activeUnit.status === "visited" || activeUnit.status === "visited_carta") && (
              <p style={{ fontSize: 12.5, color: SUBTITLE_COLOR, textAlign: "center", marginTop: 4 }}>
                {activeUnit.status === "visited" ? "Conversado por último em" : "Deixou carta em"} {fmtDate(activeUnit.marked_at)}
              </p>
            )}

            <div style={{ marginTop: 20 }}>
              {readOnly || isLockedForMe(activeUnit) ? (
                <div className="flex flex-col items-center text-center">
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 52, height: 52, borderRadius: "50%", background: ALERT_BG, marginBottom: 12 }}
                  >
                    <Ban style={{ width: 26, height: 26, color: ALERT_TEXT }} />
                  </div>
                  <p style={{ fontSize: 16.5, fontWeight: 700, color: ALERT_TEXT }}>Não bater nesta casa</p>
                  <p style={{ fontSize: 13, color: SUBTITLE_COLOR, marginTop: 4 }}>
                    {readOnly ? "O link de campo expirou." : "Marcada por outra pessoa — só o admin pode alterar."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveUnit(null)}
                    className="w-full"
                    style={{
                      marginTop: 20, height: 44, borderRadius: 14,
                      border: `1.5px solid ${SECONDARY_COLOR}`,
                      background: "transparent", color: TITLE_COLOR,
                      fontSize: 15, fontWeight: 700,
                    }}
                  >
                    Fechar
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col" style={{ gap: 12 }}>
                    {isEnabled("visited") && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleMark("visited")}
                        className="flex items-center justify-center disabled:opacity-60"
                        style={{ height: 60, borderRadius: 14, gap: 10, background: TEAL, color: TEAL_DARK, border: "none", fontSize: 16.5, fontWeight: 700 }}
                      >
                        <Check style={{ width: 20, height: 20 }} />
                        Falou com morador
                      </button>
                    )}
                    {isEnabled("visited_carta") && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleMark("visited_carta")}
                        className="flex items-center justify-center disabled:opacity-60"
                        style={{ height: 60, borderRadius: 14, gap: 10, background: "transparent", color: TEAL, border: `1.5px solid ${TEAL}`, fontSize: 16.5, fontWeight: 700 }}
                      >
                        <Mail style={{ width: 20, height: 20 }} />
                        Deixou carta
                      </button>
                    )}
                    {isEnabled("not_home") && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleMark("not_home")}
                        className="flex items-center justify-center disabled:opacity-60"
                        style={{ height: 60, borderRadius: 14, gap: 10, background: "transparent", color: "oklch(0.68 0.12 235)", border: "1.5px solid oklch(0.68 0.12 235)", fontSize: 16.5, fontWeight: 700 }}
                      >
                        <Home style={{ width: 20, height: 20 }} />
                        Não em casa
                      </button>
                    )}
                    {isEnabled("do_not_visit") && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleMark("do_not_visit")}
                        className="flex items-center justify-center disabled:opacity-60"
                        style={{ height: 60, borderRadius: 14, gap: 10, background: "transparent", color: ALERT, border: `1.5px dashed ${ALERT}`, fontSize: 16.5, fontWeight: 700 }}
                      >
                        <Ban style={{ width: 20, height: 20 }} />
                        Não visitar
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col items-center">
                    {activeUnit.status !== "pending" && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleMark("pending")}
                        className="w-full flex items-center justify-center"
                        style={{ height: 46, background: "transparent", border: "none", color: SECONDARY_COLOR, fontSize: 14.5, fontWeight: 600 }}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Voltar para pendente"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveUnit(null)}
                      className="w-full"
                      style={{ height: 44, background: "transparent", border: "none", color: CANCEL_COLOR, fontSize: 14.5, fontWeight: 600 }}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
