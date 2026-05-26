"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { fmtTerritoryNumber, cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { toast } from "sonner"

// ============================================================================
// TYPES
// ============================================================================

type UnitStatus = "pending" | "visited" | "do_not_visit"

interface Unit {
  id: string
  number: string
  floor: number
  status: UnitStatus
  observation: string | null
}

interface Block {
  id: string
  name: string
  order_index: number
  units: Unit[]
}

// ============================================================================
// COMPONENT
// ============================================================================

const supabase = getSupabaseBrowserClient()

export default function CondominiumPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [territory, setTerritory] = useState<{
    id: string
    number: string
    name: string
    color: string
  } | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null)
  const [actionUnit, setActionUnit] = useState<Unit | null>(null)
  const [actionMode, setActionMode] = useState<"select" | "dnv">("select")
  const [observation, setObservation] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchData() {
      // 1. Fetch territory
      const { data: terrData, error: terrError } = await supabase
        .from("territories")
        .select("id, number, name, type, color")
        .eq("id", id)
        .single()

      if (terrError || !terrData) {
        setLoading(false)
        return
      }

      if ((terrData as any).type !== "condominium") {
        router.replace(`/dashboard/territories/${id}/map`)
        return
      }

      setTerritory({
        id: terrData.id,
        number: terrData.number,
        name: terrData.name,
        color: terrData.color,
      })

      // 2. Fetch blocks + units
      const { data: blocksData, error: blocksError } = await supabase
        .from("blocks")
        .select("id, name, order_index, units(id, number, floor, status, observation)")
        .eq("territory_id", id)
        .order("order_index")

      if (!blocksError && blocksData) {
        const parsed: Block[] = blocksData.map((b: any) => ({
          id: b.id,
          name: b.name,
          order_index: b.order_index,
          units: (b.units ?? []) as Unit[],
        }))
        setBlocks(parsed)

        // Auto-expand block with most pending units
        if (parsed.length > 0) {
          let bestBlock = parsed[0]
          let bestCount = parsed[0].units.filter((u) => u.status === "pending").length
          for (const block of parsed) {
            const count = block.units.filter((u) => u.status === "pending").length
            if (count > bestCount) {
              bestCount = count
              bestBlock = block
            }
          }
          setExpandedBlockId(bestBlock.id)
        }
      }

      setLoading(false)
    }

    fetchData()
  }, [id, router])

  async function markUnit(status: UnitStatus) {
    if (!actionUnit) return
    setSaving(true)
    try {
      const patch: Record<string, any> = {
        status,
        observation: null,
        do_not_visit_until: null,
      }
      if (status === "do_not_visit") {
        patch.observation = observation.trim() || null
        patch.do_not_visit_until = new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000
        ).toISOString()
      }
      const { error } = await supabase
        .from("units")
        .update(patch)
        .eq("id", actionUnit.id)
      if (error) throw error
      // optimistic local update
      setBlocks((prev) =>
        prev.map((b) => ({
          ...b,
          units: b.units.map((u) =>
            u.id === actionUnit.id ? { ...u, ...patch } : u
          ),
        }))
      )
      setActionUnit(null)
    } catch (e: any) {
      toast.error("Erro: " + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!territory) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Território não encontrado</p>
      </div>
    )
  }

  // Progress totals
  const totalUnits = blocks.reduce((sum, b) => sum + b.units.length, 0)
  const totalVisited = blocks.reduce(
    (sum, b) => sum + b.units.filter((u) => u.status === "visited").length,
    0
  )

  return (
    <div className="flex flex-col min-h-[calc(100dvh-64px)] md:min-h-dvh">
      {/* ── Header ── */}
      <div className="h-12 border-b bg-card flex items-center gap-2 px-3 shrink-0 z-20 sticky top-0">
        {/* Back */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 shrink-0 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Number + name */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[11px] font-mono text-muted-foreground shrink-0">
            {fmtTerritoryNumber(territory.number)}
          </span>
          <span className="text-[13px] font-semibold text-foreground truncate">
            {territory.name}
          </span>
        </div>

        {/* Progress chip */}
        <span className="shrink-0 text-[11px] font-semibold bg-muted px-2 py-0.5 rounded-full border border-border text-muted-foreground tabular-nums">
          {totalVisited}/{totalUnits} visitadas
        </span>
      </div>

      {/* ── Block list ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {blocks.map((block) => {
          const blockVisited = block.units.filter((u) => u.status === "visited").length
          const blockTotal = block.units.length
          const isExpanded = expandedBlockId === block.id

          // Group units by floor, descending
          const floorMap = new Map<number, Unit[]>()
          for (const u of block.units) {
            if (!floorMap.has(u.floor)) floorMap.set(u.floor, [])
            floorMap.get(u.floor)!.push(u)
          }
          const floors = Array.from(floorMap.keys()).sort((a, b) => b - a)

          return (
            <div key={block.id} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Block header */}
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
                onClick={() =>
                  setExpandedBlockId(isExpanded ? null : block.id)
                }
              >
                <span className="text-sm font-bold text-foreground">
                  {block.name || `Bloco ${block.order_index + 1}`}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums",
                      blockVisited === 0
                        ? "text-muted-foreground bg-muted"
                        : "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30"
                    )}
                  >
                    {blockVisited}/{blockTotal}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded: floors */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                  {floors.map((floor) => {
                    const floorUnits = (floorMap.get(floor) ?? []).sort(
                      (a, b) =>
                        (parseInt(a.number, 10) || 0) -
                        (parseInt(b.number, 10) || 0)
                    )
                    return (
                      <div key={floor} className="flex items-start gap-2">
                        {/* Floor label */}
                        <span className="text-xs text-muted-foreground w-10 shrink-0 pt-1">
                          {floor === 0 ? "Térreo" : `${floor}º`}
                        </span>
                        {/* Unit chips */}
                        <div className="flex flex-wrap gap-1.5">
                          {floorUnits.map((unit) => (
                            <button
                              key={unit.id}
                              type="button"
                              className={cn(
                                "px-2 py-1 rounded text-xs font-mono font-medium border cursor-pointer transition-colors",
                                unit.status === "visited"
                                  ? "bg-emerald-500 text-white border-transparent"
                                  : unit.status === "do_not_visit"
                                  ? "bg-red-500 text-white border-transparent"
                                  : "bg-white dark:bg-background text-foreground border-border"
                              )}
                              onClick={() => {
                                setActionUnit(unit)
                                setActionMode("select")
                                setObservation("")
                              }}
                            >
                              {unit.number}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {blocks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted-foreground font-medium">Nenhum bloco cadastrado.</p>
          </div>
        )}
      </div>

      {/* ── Unit action Dialog ── */}
      <Dialog
        open={!!actionUnit}
        onOpenChange={(open) => {
          if (!open) setActionUnit(null)
        }}
      >
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader>
            <DialogTitle>Unidade {actionUnit?.number}</DialogTitle>
          </DialogHeader>

          {actionMode === "select" ? (
            <div className="space-y-2 py-2">
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => markUnit("visited")}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "✓ Marcar como visitado"
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950"
                onClick={() => setActionMode("dnv")}
                disabled={saving}
              >
                ✗ Não visitar
              </Button>
              <Button
                variant="link"
                className="w-full text-muted-foreground"
                onClick={() => setActionUnit(null)}
                disabled={saving}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Observação (opcional)</p>
                <Textarea
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Ex: horário difícil, tentar outro período — não informar nomes"
                  className="min-h-[80px] text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setActionMode("select")}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => markUnit("do_not_visit")}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Confirmar"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
