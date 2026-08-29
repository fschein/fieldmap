"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { GroupList, type EditableGroup } from "@/components/dashboard/house-editor"
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react"

export interface EditableQuadra {
  id: string
  label: string
  /** Ruas cadastradas dentro dessa quadra. */
  streets: EditableGroup[]
}

interface QuadraEditorProps {
  territoryName: string
  territoryNumber: string
  quadras: EditableQuadra[]
  onBack: () => void
  onAddStreet?: (quadraId: string, name: string) => Promise<void>
  onAddUnits: (streetId: string, numbers: string[]) => Promise<void>
  onRemoveUnit: (unitId: string, streetId: string) => Promise<void>
  onRenameStreet?: (streetId: string, name: string) => Promise<void>
  onDeleteStreet?: (streetId: string) => Promise<void>
  /** Abre já expandida nessa quadra — usado pelo atalho de "casas" no card da quadra. */
  initialExpandedQuadraId?: string | null
}

/**
 * Editor de casas de três níveis (residencial): Quadra → Rua → Casas.
 * Cada quadra é um card colapsável simples; ao expandir, mostra a
 * lista de ruas daquela quadra reaproveitando o mesmo GroupList do
 * HouseEditor (condomínio), só que aninhado um nível mais fundo.
 */
export function QuadraEditor({
  territoryName,
  territoryNumber,
  quadras,
  onBack,
  onAddStreet,
  onAddUnits,
  onRemoveUnit,
  onRenameStreet,
  onDeleteStreet,
  initialExpandedQuadraId,
}: QuadraEditorProps) {
  const [expandedQuadraId, setExpandedQuadraId] = useState<string | null>(
    initialExpandedQuadraId ?? null
  )

  const sortedQuadras = [...quadras].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR", { numeric: true, sensitivity: "base" })
  )

  return (
    <div className="flex flex-col min-h-[calc(100dvh-64px)] md:min-h-dvh">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0">
        <button type="button" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="min-w-0">
          <p className="text-lg font-bold text-foreground truncate">Editar casas</p>
          <p className="text-sm text-muted-foreground truncate">{territoryName} · {territoryNumber}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {sortedQuadras.map((quadra) => {
          const isExpanded = expandedQuadraId === quadra.id
          return (
            <div key={quadra.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedQuadraId(isExpanded ? null : quadra.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="font-semibold text-sm text-foreground truncate">{quadra.label}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[0.6875rem]">
                    {quadra.streets.length} {quadra.streets.length === 1 ? "rua" : "ruas"}
                  </Badge>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 border-t border-border pt-3">
                  <GroupList
                    groups={quadra.streets}
                    onAddUnits={onAddUnits}
                    onRemoveUnit={onRemoveUnit}
                    onAddGroup={onAddStreet ? (name) => onAddStreet(quadra.id, name) : undefined}
                    onRenameGroup={onRenameStreet}
                    onDeleteGroup={onDeleteStreet}
                    addGroupLabel="Nova rua"
                    addGroupPlaceholder="Nome da rua"
                    emptyHint="Nenhuma rua cadastrada nesta quadra ainda."
                  />
                </div>
              )}
            </div>
          )
        })}

        {quadras.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma quadra criada ainda.
          </div>
        )}
      </div>
    </div>
  )
}
