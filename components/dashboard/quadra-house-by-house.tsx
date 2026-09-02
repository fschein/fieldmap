"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { HouseByHouse, type HouseGroup, type UnitStatus } from "@/components/dashboard/house-by-house"
import type { MarkingOption } from "@/lib/types"

export interface MarkableQuadra {
  id: string
  label: string
  /** Ruas da quadra, já no formato de grupo do HouseByHouse. */
  streets: HouseGroup[]
}

interface QuadraHouseByHouseProps {
  quadras: MarkableQuadra[]
  currentMarkerId: string | null
  readOnly?: boolean
  onMark: (unitId: string, newStatus: UnitStatus) => Promise<void>
  onFinalizeGroup?: (streetId: string) => Promise<void>
  renderGroupExtra?: (streetId: string) => ReactNode
  unitLabel?: string
  emptyHint?: string
  initialExpandedQuadraId?: string | null
  enabledOptions?: MarkingOption[]
}

/**
 * Marcação (falado/carta/não visitar) em três níveis: Quadra → Rua → Casas.
 * Cada quadra é um card colapsável simples; ao expandir, aninha o mesmo
 * HouseByHouse já usado em toda parte, escopado às ruas daquela quadra.
 */
export function QuadraHouseByHouse({
  quadras,
  currentMarkerId,
  readOnly = false,
  onMark,
  onFinalizeGroup,
  renderGroupExtra,
  unitLabel,
  emptyHint = "Nenhuma casa cadastrada ainda.",
  initialExpandedQuadraId,
  enabledOptions,
}: QuadraHouseByHouseProps) {
  const [expandedQuadraId, setExpandedQuadraId] = useState<string | null>(
    initialExpandedQuadraId ?? null
  )
  const showProgress = !enabledOptions || enabledOptions.includes("visited")

  return (
    <div className="space-y-2 max-w-[640px] mx-auto">
      {quadras.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {emptyHint}
        </div>
      )}

      {quadras.map((quadra) => {
        const isExpanded = expandedQuadraId === quadra.id
        const allUnits = quadra.streets.flatMap((s) => s.units)
        const total = allUnits.length
        const done = allUnits.filter((u) => u.status === "visited" || u.status === "visited_carta" || u.status === "do_not_visit").length

        return (
          <div key={quadra.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedQuadraId(isExpanded ? null : quadra.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-sm text-foreground truncate">{quadra.label}</p>
                {showProgress && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 max-w-[140px] rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
                      />
                    </div>
                    <span className="text-[0.6875rem] text-muted-foreground tabular-nums shrink-0">
                      {done}/{total}
                    </span>
                  </div>
                )}
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-border pt-3">
                <HouseByHouse
                  groups={quadra.streets}
                  currentMarkerId={currentMarkerId}
                  readOnly={readOnly}
                  onMark={onMark}
                  onFinalizeGroup={onFinalizeGroup}
                  renderGroupExtra={renderGroupExtra}
                  unitLabel={unitLabel}
                  emptyHint="Nenhuma rua cadastrada nesta quadra ainda."
                  enabledOptions={enabledOptions}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
