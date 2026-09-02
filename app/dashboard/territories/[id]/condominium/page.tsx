"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { useAppSettings } from "@/hooks/use-app-settings"
import { fmtTerritoryNumber } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, Pencil, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { HouseByHouse, type HouseGroup, type UnitStatus } from "@/components/dashboard/house-by-house"
import { HouseEditor } from "@/components/dashboard/house-editor"

// ============================================================================
// TYPES
// ============================================================================

type Subtype = "building" | "houses"

interface UnitRow {
  id: string
  number: string
  floor: number | null
  status: UnitStatus
  marked_at: string | null
  marked_by: string | null
}

interface GroupRow {
  id: string
  name: string
  order_index: number
  completed?: boolean
  units: UnitRow[]
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
  const { user, isAdmin, isSupervisor } = useAuth()
  const { settings } = useAppSettings()

  const [territory, setTerritory] = useState<{
    id: string
    number: string
    name: string
    color: string
    subtype: Subtype
  } | null>(null)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)

  async function fetchData() {
    const { data: terrData, error: terrError } = await supabase
      .from("territories")
      .select("id, number, name, type, subtype, color")
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

    const subtype: Subtype = (terrData as any).subtype === "houses" ? "houses" : "building"

    setTerritory({
      id: terrData.id,
      number: terrData.number,
      name: terrData.name,
      color: terrData.color,
      subtype,
    })

    if (subtype === "building") {
      const { data, error } = await supabase
        .from("blocks")
        .select("id, name, order_index, units(id, number, floor, status, marked_at, marked_by)")
        .eq("territory_id", id)
        .order("order_index")

      if (!error && data) {
        setGroups(data.map((b: any) => ({
          id: b.id,
          name: b.name,
          order_index: b.order_index,
          units: b.units ?? [],
        })))
      }
    } else {
      const { data, error } = await supabase
        .from("subdivisions")
        .select("id, name, order_index, completed, units(id, number, floor, status, marked_at, marked_by)")
        .eq("territory_id", id)
        .order("order_index")

      if (!error && data) {
        setGroups(data.map((s: any) => ({
          id: s.id,
          name: s.name,
          order_index: s.order_index,
          completed: s.completed,
          units: s.units ?? [],
        })))
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router])

  async function handleMarkUnit(unitId: string, status: UnitStatus) {
    const { error } = await supabase
      .from("units")
      .update({ status, marked_by: user?.id ?? null, marked_at: new Date().toISOString() })
      .eq("id", unitId)
    if (error) {
      toast.error("Erro ao marcar unidade: " + error.message)
      return
    }
    fetchData()
  }

  async function handleAddUnits(groupId: string, numbers: string[]) {
    const payload = numbers.map((number) =>
      territory?.subtype === "building"
        ? { block_id: groupId, number, status: "pending" }
        : { subdivision_id: groupId, number, status: "pending" }
    )
    const { error } = await supabase.from("units").insert(payload)
    if (error) {
      toast.error("Erro ao adicionar casas: " + error.message)
      return
    }
    fetchData()
  }

  async function handleRemoveUnit(unitId: string) {
    const { error } = await supabase.from("units").delete().eq("id", unitId)
    if (error) {
      toast.error("Erro ao remover casa: " + error.message)
      return
    }
    fetchData()
  }

  async function handleFinalizeGroup(groupId: string) {
    // Só quadras (subdivisions) têm campo "completed" persistível — blocos não têm no schema.
    const { error } = await supabase
      .from("subdivisions")
      .update({ completed: true, status: "completed" })
      .eq("id", groupId)
    if (error) {
      toast.error("Erro ao finalizar: " + error.message)
      return
    }
    fetchData()
  }

  async function handleAddGroup(name: string) {
    if (!territory) return
    const { error } = await supabase.from("subdivisions").insert({
      territory_id: territory.id,
      name,
      order_index: groups.length,
      completed: false,
    })
    if (error) {
      toast.error("Erro ao criar rua: " + error.message)
      return
    }
    fetchData()
  }

  async function handleRenameGroup(groupId: string, name: string) {
    const table = territory?.subtype === "building" ? "blocks" : "subdivisions"
    const { error } = await supabase.from(table).update({ name }).eq("id", groupId)
    if (error) {
      toast.error("Erro ao renomear: " + error.message)
      return
    }
    fetchData()
  }

  async function handleDeleteGroup(groupId: string) {
    const table = territory?.subtype === "building" ? "blocks" : "subdivisions"
    const { error } = await supabase.from(table).delete().eq("id", groupId)
    if (error) {
      toast.error("Erro ao excluir: " + error.message)
      return
    }
    fetchData()
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

  if (!isSupervisor) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center space-y-4 px-6 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive/40" />
        <h2 className="text-xl font-bold">Módulo em teste</h2>
        <p className="text-muted-foreground">
          A tela de casas de condomínio está em teste — disponível só para administradores e superintendentes de serviço por enquanto.
        </p>
      </div>
    )
  }

  const houseGroups: HouseGroup[] = groups.map((g) => ({
    id: g.id,
    label: g.name || (territory.subtype === "building" ? "Bloco" : "Casas"),
    units: g.units,
    completed: territory.subtype === "houses" ? g.completed : undefined,
  }))

  if (editorOpen) {
    return (
      <HouseEditor
        territoryName={territory.name}
        territoryNumber={fmtTerritoryNumber(territory.number)}
        groups={houseGroups.map((g) => ({ id: g.id, label: g.label, units: g.units }))}
        onBack={() => setEditorOpen(false)}
        onAddUnits={handleAddUnits}
        onRemoveUnit={handleRemoveUnit}
        onAddGroup={territory.subtype === "houses" && isAdmin ? handleAddGroup : undefined}
        onRenameGroup={isAdmin ? handleRenameGroup : undefined}
        onDeleteGroup={isAdmin ? handleDeleteGroup : undefined}
        addGroupLabel={territory.subtype === "building" ? "Novo bloco" : "Nova rua"}
        addGroupPlaceholder={territory.subtype === "building" ? "Nome do bloco" : "Nome da rua"}
      />
    )
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-64px)] md:min-h-dvh">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0">
        <button type="button" onClick={() => router.back()} className="shrink-0">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-foreground truncate">{territory.name}</p>
          <p className="text-xs text-muted-foreground truncate">{fmtTerritoryNumber(territory.number)}</p>
        </div>

        {isAdmin && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditorOpen(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Editar casas
          </Button>
        )}
      </div>

      {/* ── Grupos (blocos ou ruas) ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <HouseByHouse
          groups={houseGroups}
          currentMarkerId={user?.id ?? null}
          onMark={handleMarkUnit}
          unitLabel={territory.subtype === "building" ? "Unidade" : "Casa"}
          onFinalizeGroup={territory.subtype === "houses" ? handleFinalizeGroup : undefined}
          emptyHint={
            territory.subtype === "building"
              ? "Nenhum bloco cadastrado."
              : "Nenhuma rua cadastrada ainda."
          }
          enabledOptions={settings.enabled_marking_options}
        />
      </div>
    </div>
  )
}
