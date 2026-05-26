"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn, fmtTerritoryNumber } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Loader2, Trash2, AlertTriangle, ArrowLeft } from "lucide-react"
import { toast } from "sonner"

// ============================================================================
// INTERFACES
// ============================================================================

interface TerritoryData {
  id: string
  number: string
  name: string
  type?: string | null
  subtype?: string | null
  color?: string | null
  status?: string | null
  group?: { id: string; name: string; color: string } | null
  assigned_to: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  territory: TerritoryData | null
  groups: { id: string; name: string; color: string }[]
  onSuccess: () => void
}

interface BlockForm {
  name: string
  floors: number
  aptsPerFloor: number
}

type TerritoryTypeOption = "residencial" | "comercial" | "condominium"
type SubtypeOption = "building" | "houses"

const supabase = getSupabaseBrowserClient()

// ============================================================================
// HELPERS
// ============================================================================

function getTypeFromTerritory(t: TerritoryData | null): TerritoryTypeOption {
  if (!t) return "residencial"
  if (t.type === "comercial") return "comercial"
  if (t.type === "condominium") return "condominium"
  return "residencial"
}

function getSubtypeFromTerritory(t: TerritoryData | null): SubtypeOption {
  if (!t) return "building"
  if (t.subtype === "houses") return "houses"
  return "building"
}

async function suggestNumber(type: TerritoryTypeOption): Promise<string> {
  const { data, error } = await supabase.from("territories").select("number")
  if (error || !data) return type === "residencial" ? "1" : type === "comercial" ? "C-1" : "K-1"

  if (type === "residencial") {
    const nums = data
      .map((r: { number: string }) => r.number)
      .filter((n: string) => /^\d+$/.test(n))
      .map((n: string) => parseInt(n, 10))
    const max = nums.length > 0 ? Math.max(...nums) : 0
    return String(max + 1)
  }

  if (type === "comercial") {
    const prefix = "C-"
    const nums = data
      .map((r: { number: string }) => r.number)
      .filter((n: string) => n.startsWith(prefix))
      .map((n: string) => parseInt(n.slice(prefix.length), 10))
      .filter((n: number) => !isNaN(n))
    const max = nums.length > 0 ? Math.max(...nums) : 0
    return `${prefix}${max + 1}`
  }

  // condominium
  const prefix = "K-"
  const nums = data
    .map((r: { number: string }) => r.number)
    .filter((n: string) => n.startsWith(prefix))
    .map((n: string) => parseInt(n.slice(prefix.length), 10))
    .filter((n: number) => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `${prefix}${max + 1}`
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TerritoryFormModal({ open, onOpenChange, territory, groups, onSuccess }: Props) {
  const isEdit = !!territory

  // Step 1 fields
  const [type, setType] = useState<TerritoryTypeOption>("residencial")
  const [subtype, setSubtype] = useState<SubtypeOption>("building")
  const [number, setNumber] = useState("")
  const [name, setName] = useState("")
  const [groupId, setGroupId] = useState<string | null>(null)
  const [inactive, setInactive] = useState(false)

  // Step 1 UI state
  const [numberLoading, setNumberLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Step 2 state
  const [step, setStep] = useState<1 | 2>(1)
  const [createdTerritoryId, setCreatedTerritoryId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<BlockForm[]>([{ name: "", floors: 1, aptsPerFloor: 1 }])
  const [generating, setGenerating] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return

    setStep(1)
    setCreatedTerritoryId(null)
    setBlocks([{ name: "", floors: 1, aptsPerFloor: 1 }])
    setShowDeleteConfirm(false)

    if (territory) {
      setType(getTypeFromTerritory(territory))
      setSubtype(getSubtypeFromTerritory(territory))
      setNumber(territory.number)
      setName(territory.name)
      setGroupId(territory.group?.id || null)
      setInactive(territory.status === "inactive")
    } else {
      setType("residencial")
      setSubtype("building")
      setName("")
      setGroupId(null)
      setInactive(false)
      // fetch initial suggestion
      setNumberLoading(true)
      suggestNumber("residencial").then(n => {
        setNumber(n)
        setNumberLoading(false)
      })
    }
  }, [open])

  const handleTypeChange = (newType: TerritoryTypeOption) => {
    setType(newType)
    if (!isEdit) {
      setNumberLoading(true)
      suggestNumber(newType).then(n => {
        setNumber(n)
        setNumberLoading(false)
      })
    }
  }

  const handleDelete = async () => {
    if (!territory) return
    setDeleting(true)
    try {
      const { error } = await supabase.from("territories").delete().eq("id", territory.id)
      if (error) throw error
      toast.success(`Território ${fmtTerritoryNumber(territory.number)} excluído`)
      onOpenChange(false)
      onSuccess()
    } catch (e: any) {
      toast.error("Erro ao excluir: " + e.message)
    } finally {
      setDeleting(false)
    }
  }

  const handleSaveStep1 = async () => {
    setSaving(true)
    const newStatus = isEdit ? (inactive ? "inactive" : "available") : "available"

    try {
      if (isEdit && territory) {
        const { error } = await supabase
          .from("territories")
          .update({
            name,
            number,
            type,
            subtype: type === "condominium" ? subtype : null,
            group_id: groupId,
            status: newStatus,
            assigned_to: inactive ? null : territory.assigned_to,
          })
          .eq("id", territory.id)
        if (error) throw error
        onOpenChange(false)
        onSuccess()
      } else {
        // INSERT
        const { data, error } = await supabase
          .from("territories")
          .insert({
            name,
            number,
            type,
            subtype: type === "condominium" ? subtype : null,
            group_id: groupId,
            status: "available",
            color: "#044454",
          })
          .select("id")
          .single()
        if (error) throw error

        if (type === "condominium") {
          setCreatedTerritoryId(data.id)
          setStep(2)
        } else {
          onOpenChange(false)
          onSuccess()
        }
      }
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateUnits = async () => {
    if (!createdTerritoryId) return
    setGenerating(true)

    try {
      let totalUnits = 0

      for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        const block = blocks[blockIndex]
        const { data: blockData, error: blockError } = await supabase
          .from("blocks")
          .insert({
            territory_id: createdTerritoryId,
            name: block.name,
            order_index: blockIndex,
          })
          .select("id")
          .single()
        if (blockError) throw blockError

        const units: { block_id: string; number: string; floor: number; status: string }[] = []
        for (let floor = 1; floor <= block.floors; floor++) {
          for (let apt = 1; apt <= block.aptsPerFloor; apt++) {
            units.push({
              block_id: blockData.id,
              number: String(floor * 100 + apt),
              floor,
              status: "pending",
            })
          }
        }

        const { error: unitsError } = await supabase.from("units").insert(units)
        if (unitsError) throw unitsError

        totalUnits += units.length
      }

      toast.success(`${totalUnits} unidades criadas em ${blocks.length} blocos`)
      onOpenChange(false)
      onSuccess()
    } catch (e: any) {
      toast.error("Erro ao gerar unidades: " + e.message)
    } finally {
      setGenerating(false)
    }
  }

  const addBlock = () => {
    setBlocks(prev => [...prev, { name: "", floors: 1, aptsPerFloor: 1 }])
  }

  const removeBlock = (index: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== index))
  }

  const updateBlock = (index: number, field: keyof BlockForm, value: string | number) => {
    setBlocks(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b))
  }

  // ============================================================================
  // RENDER: STEP 1
  // ============================================================================

  const renderStep1 = () => (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? `Editar Território ${territory?.number}` : "Novo Território"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Ajuste as informações básicas e o grupo responsável."
            : "Cadastre um novo território para começar a mapear."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {/* Tipo */}
        <div className="space-y-1">
          <Label>Tipo</Label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["residencial", "comercial", "condominium"] as TerritoryTypeOption[]).map((opt, i) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleTypeChange(opt)}
                className={cn(
                  "flex-1 py-2 text-xs font-bold transition-colors",
                  i !== 0 && "border-l border-border",
                  type === opt
                    ? "bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:bg-muted/50"
                )}
              >
                {opt === "residencial" ? "Residencial" : opt === "comercial" ? "Comercial" : "Condominial"}
              </button>
            ))}
          </div>
        </div>

        {/* Subtipo — only visible for condominium */}
        {type === "condominium" && (
          <div className="space-y-1">
            <Label>Subtipo</Label>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["building", "houses"] as SubtypeOption[]).map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSubtype(opt)}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold transition-colors",
                    i !== 0 && "border-l border-border",
                    subtype === opt
                      ? "bg-foreground text-background"
                      : "bg-card text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {opt === "building" ? "Predial" : "Casas"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Número */}
        <div className="space-y-1">
          <Label>Número</Label>
          <div className="relative">
            <Input
              value={number}
              onChange={e => setNumber(e.target.value)}
              disabled={numberLoading}
            />
            {numberLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {!isEdit && number && !numberLoading && (
            <p className="text-xs text-muted-foreground">
              Exibido como {fmtTerritoryNumber(number)}
            </p>
          )}
        </div>

        {/* Nome */}
        <div className="space-y-1">
          <Label>Nome/Referência</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: Quadra do Mercado"
          />
        </div>

        {/* Grupo */}
        <div className="space-y-1">
          <Label className="text-primary font-bold">Grupo Responsável (Dom.)</Label>
          <div className="p-3 border rounded-lg bg-primary/5 border-primary/20 space-y-3">
            <p className="text-[0.6875rem] text-primary leading-tight font-medium">
              No domingo, o território será atribuído automaticamente a este grupo.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGroupId(null)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                  !groupId
                    ? "bg-card border-border text-foreground shadow-sm"
                    : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                Nenhum
              </button>
              {groups.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupId(g.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5",
                    groupId === g.id
                      ? "bg-background shadow-sm ring-1 ring-offset-1"
                      : "opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                  )}
                  style={{
                    borderColor: groupId === g.id ? g.color : "transparent",
                    color: groupId === g.id ? g.color : "inherit",
                    backgroundColor: groupId === g.id ? `${g.color}10` : ""
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Território Ativo — edit only */}
        {isEdit && (
          <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Território Ativo</Label>
              <p className="text-xs text-muted-foreground">Desative para ocultar das listas de designação.</p>
            </div>
            <Switch checked={!inactive} onCheckedChange={(val: boolean) => setInactive(!val)} />
          </div>
        )}
      </div>

      {showDeleteConfirm ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">
                Excluir {fmtTerritoryNumber(territory?.number)} — {territory?.name}?
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Esta ação é irreversível. O território, suas quadras, designações e histórico serão removidos permanentemente.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir definitivamente"}
            </Button>
          </div>
        </div>
      ) : (
        <DialogFooter className="gap-2">
          {isEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="mr-auto text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSaveStep1} disabled={saving || numberLoading}>
            {saving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : (!isEdit && type === "condominium") ? "Continuar →" : "Salvar"
            }
          </Button>
        </DialogFooter>
      )}
    </>
  )

  // ============================================================================
  // RENDER: STEP 2
  // ============================================================================

  const renderStep2 = () => (
    <>
      <DialogHeader>
        <DialogTitle>Adicionar Blocos e Unidades</DialogTitle>
        <DialogDescription>
          Configure os blocos e gere as unidades automaticamente.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
        {blocks.map((block, index) => {
          const totalUnits = block.floors * block.aptsPerFloor
          return (
            <div key={index} className="p-3 border rounded-lg bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  Bloco {index + 1}
                </span>
                {blocks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBlock(index)}
                    className="text-destructive hover:text-destructive/80 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Nome do bloco</Label>
                <Input
                  value={block.name}
                  onChange={e => updateBlock(index, "name", e.target.value)}
                  placeholder="Ex: Bloco A, Torre 1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Andares</Label>
                  <Input
                    type="number"
                    min={1}
                    value={block.floors}
                    onChange={e => updateBlock(index, "floors", Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Aptos por andar</Label>
                  <Input
                    type="number"
                    min={1}
                    value={block.aptsPerFloor}
                    onChange={e => updateBlock(index, "aptsPerFloor", Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
              </div>

              {block.name && (
                <p className="text-xs text-muted-foreground font-medium">
                  {block.name} · {block.floors} andares · {block.aptsPerFloor} aptos/andar → {totalUnits} unidades
                </p>
              )}
              {!block.name && (
                <p className="text-xs text-muted-foreground font-medium">
                  {block.floors} andares · {block.aptsPerFloor} aptos/andar → {totalUnits} unidades
                </p>
              )}
            </div>
          )
        })}

        <button
          type="button"
          onClick={addBlock}
          className="w-full py-2 text-sm font-bold text-primary border border-dashed border-primary/40 rounded-lg hover:bg-primary/5 transition-colors"
        >
          + Adicionar bloco
        </button>
      </div>

      <DialogFooter>
        <Button
          variant="ghost"
          className="mr-auto"
          onClick={() => setStep(1)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            onOpenChange(false)
            onSuccess()
          }}
        >
          Pular
        </Button>
        <Button onClick={handleGenerateUnits} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar unidades"}
        </Button>
      </DialogFooter>
    </>
  )

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        {step === 1 ? renderStep1() : renderStep2()}
      </DialogContent>
    </Dialog>
  )
}
