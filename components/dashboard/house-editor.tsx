"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn, compareHouseNumbers } from "@/lib/utils"
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Pencil, Trash2, X, Check } from "lucide-react"

export interface EditableUnit {
  id: string
  number: string
}

export interface EditableGroup {
  id: string
  label: string
  units: EditableUnit[]
}

function parseNumbers(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(",")) {
    const n = part.trim()
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

interface GroupListProps {
  groups: EditableGroup[]
  onAddUnits: (groupId: string, numbers: string[]) => Promise<void>
  onRemoveUnit: (unitId: string, groupId: string) => Promise<void>
  onAddGroup?: (name: string) => Promise<void>
  /** Presente quando o grupo pode ser renomeado depois de salvo. */
  onRenameGroup?: (groupId: string, name: string) => Promise<void>
  /** Presente quando o grupo pode ser excluído (junto com suas casas). */
  onDeleteGroup?: (groupId: string) => Promise<void>
  addGroupLabel?: string
  addGroupPlaceholder?: string
  emptyHint?: string
  initialExpandedGroupId?: string | null
}

/**
 * Lista de grupos editáveis (ruas de uma quadra, ou ruas/blocos de um
 * condomínio) — cada um colapsável, com cadastro de casas em lote,
 * remoção por casa, e renomear/excluir do grupo em si. Reaproveitado
 * tanto pelo HouseEditor (nível único, condomínio) quanto pelo
 * QuadraEditor (aninhado dentro de cada quadra, residencial).
 */
export function GroupList({
  groups,
  onAddUnits,
  onRemoveUnit,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  addGroupLabel = "Nova rua",
  addGroupPlaceholder = "Nome da rua",
  emptyHint = "Nenhuma rua cadastrada ainda.",
  initialExpandedGroupId,
}: GroupListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedGroupId ?? null)
  const [inputByGroup, setInputByGroup] = useState<Record<string, string>>({})
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null)
  const [removingUnitId, setRemovingUnitId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [addingGroup, setAddingGroup] = useState(false)
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [savingRenameId, setSavingRenameId] = useState<string | null>(null)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)

  const handleAdd = async (groupId: string) => {
    const numbers = parseNumbers(inputByGroup[groupId] || "")
    if (numbers.length === 0) return
    setAddingGroupId(groupId)
    try {
      await onAddUnits(groupId, numbers)
      setInputByGroup((prev) => ({ ...prev, [groupId]: "" }))
    } finally {
      setAddingGroupId(null)
    }
  }

  const handleRemove = async (unitId: string, groupId: string) => {
    setRemovingUnitId(unitId)
    try {
      await onRemoveUnit(unitId, groupId)
    } finally {
      setRemovingUnitId(null)
    }
  }

  const handleAddGroup = async () => {
    if (!onAddGroup || !newGroupName.trim()) return
    setAddingGroup(true)
    try {
      await onAddGroup(newGroupName.trim())
      setNewGroupName("")
    } finally {
      setAddingGroup(false)
    }
  }

  const startRename = (group: EditableGroup) => {
    setRenamingGroupId(group.id)
    setRenameValue(group.label)
  }

  const handleSaveRename = async (groupId: string) => {
    if (!onRenameGroup || !renameValue.trim()) return
    setSavingRenameId(groupId)
    try {
      await onRenameGroup(groupId, renameValue.trim())
      setRenamingGroupId(null)
    } finally {
      setSavingRenameId(null)
    }
  }

  const handleDeleteGroup = async (group: EditableGroup) => {
    if (!onDeleteGroup) return
    if (!confirm(`Excluir "${group.label}"? Todas as ${group.units.length} casas cadastradas nela também serão apagadas.`)) return
    setDeletingGroupId(group.id)
    try {
      await onDeleteGroup(group.id)
    } finally {
      setDeletingGroupId(null)
    }
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isExpanded = expandedId === group.id
        const sortedUnits = [...group.units].sort((a, b) => compareHouseNumbers(a.number, b.number))
        return (
          <div key={group.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="w-full flex items-center justify-between gap-3 px-4 py-3">
              {renamingGroupId === group.id ? (
                <div className="flex-1 flex items-center gap-1.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleSaveRename(group.id) }
                      if (e.key === "Escape") setRenamingGroupId(null)
                    }}
                    className="h-8 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveRename(group.id)}
                    disabled={savingRenameId === group.id || !renameValue.trim()}
                    className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                  >
                    {savingRenameId === group.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingGroupId(null)}
                    className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : group.id)}
                  className="flex-1 flex items-center gap-1.5 min-w-0 text-left"
                >
                  <span className="font-semibold text-sm text-foreground truncate">{group.label}</span>
                  {onRenameGroup && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); startRename(group) }}
                      className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                    </span>
                  )}
                </button>
              )}

              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="secondary" className="text-[0.6875rem]">{group.units.length} casas</Badge>
                {onDeleteGroup && renamingGroupId !== group.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteGroup(group)}
                    disabled={deletingGroupId === group.id}
                    className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    {deletingGroupId === group.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : group.id)}
                  className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                <div className="flex flex-wrap gap-2">
                  {sortedUnits.map((u) => (
                    <span
                      key={u.id}
                      className="h-8 pl-3 pr-1.5 rounded-lg bg-muted text-foreground text-xs font-bold flex items-center gap-1.5"
                    >
                      {u.number}
                      <button
                        type="button"
                        onClick={() => handleRemove(u.id, group.id)}
                        disabled={removingUnitId === u.id}
                        className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        {removingUnitId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                      </button>
                    </span>
                  ))}
                  {group.units.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-1">Nenhuma casa cadastrada ainda.</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    value={inputByGroup[group.id] || ""}
                    onChange={(e) => setInputByGroup((prev) => ({ ...prev, [group.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(group.id) } }}
                    placeholder="Ex.: 12, 14, 16, 18"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => handleAdd(group.id)}
                    disabled={addingGroupId === group.id || !(inputByGroup[group.id] || "").trim()}
                  >
                    {addingGroupId === group.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {emptyHint}
        </div>
      )}

      {onAddGroup && (
        <div className={cn("rounded-xl border border-dashed p-3 space-y-2")}>
          <p className="text-xs font-medium text-muted-foreground">{addGroupLabel}</p>
          <div className="flex gap-2">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddGroup() } }}
              placeholder={addGroupPlaceholder}
              className="flex-1"
            />
            <Button type="button" variant="outline" onClick={handleAddGroup} disabled={addingGroup || !newGroupName.trim()}>
              {addingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : `+ ${addGroupLabel.replace(/^Nova?\s+/i, "")}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface HouseEditorProps {
  territoryName: string
  territoryNumber: string
  groups: EditableGroup[]
  onBack: () => void
  onAddUnits: (groupId: string, numbers: string[]) => Promise<void>
  onRemoveUnit: (unitId: string, groupId: string) => Promise<void>
  onAddGroup?: (name: string) => Promise<void>
  onRenameGroup?: (groupId: string, name: string) => Promise<void>
  onDeleteGroup?: (groupId: string) => Promise<void>
  addGroupLabel?: string
  addGroupPlaceholder?: string
  /** Abre já expandido nesse grupo — usado pelo atalho de "casas" no card da quadra. */
  initialExpandedGroupId?: string | null
}

/** Editor de casas de nível único (condomínio: ruas ou blocos → casas direto). */
export function HouseEditor({
  territoryName,
  territoryNumber,
  groups,
  onBack,
  onAddUnits,
  onRemoveUnit,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  addGroupLabel = "Nova rua",
  addGroupPlaceholder = "Nome da rua",
  initialExpandedGroupId,
}: HouseEditorProps) {
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

      <div className="flex-1 overflow-y-auto p-3">
        <GroupList
          groups={groups}
          onAddUnits={onAddUnits}
          onRemoveUnit={onRemoveUnit}
          onAddGroup={onAddGroup}
          onRenameGroup={onRenameGroup}
          onDeleteGroup={onDeleteGroup}
          addGroupLabel={addGroupLabel}
          addGroupPlaceholder={addGroupPlaceholder}
          initialExpandedGroupId={initialExpandedGroupId}
        />
      </div>
    </div>
  )
}
