// ============================================================================
// app/dashboard/territories/[id]/map/page.tsx
// ============================================================================
"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Check,
  Clock,
  Eye,
  Edit3,
  Trash2,
  Pencil,
  Plus,
  X,
  TrendingUp,
  LayoutGrid,
} from "lucide-react"
import type { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"

const TerritoryMap = dynamic(
  () => import("@/components/map/territory-map").then((mod) => mod.TerritoryMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Carregando mapa...</p>
        </div>
      </div>
    ),
  }
)

export default function TerritoryMapPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [territory, setTerritory] = useState<TerritoryWithSubdivisions | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedSubdivision, setSelectedSubdivision] = useState<Subdivision | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [dnvDialogOpen, setDnvDialogOpen] = useState(false)
  const [createDnvDialogOpen, setCreateDnvDialogOpen] = useState(false)
  const [editTerritoryDialogOpen, setEditTerritoryDialogOpen] = useState(false)

  const [newSubdivisionName, setNewSubdivisionName] = useState("")
  const [editSubdivisionName, setEditSubdivisionName] = useState("")
  const [editSubdivisionNotes, setEditSubdivisionNotes] = useState("")
  const [pendingCoordinates, setPendingCoordinates] = useState<[number, number][][] | null>(null)
  const [focusedSubdivisionId, setFocusedSubdivisionId] = useState<string | null>(null)

  const [isAddingDnv, setIsAddingDnv] = useState(false)
  const [newDnvCoords, setNewDnvCoords] = useState<[number, number] | null>(null)
  const [editingDnv, setEditingDnv] = useState<any>(null)
  const [dnvFormData, setDnvFormData] = useState({ address: "", notes: "" })

  const [territoryForm, setTerritoryForm] = useState({ name: "", number: "", color: "" })
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)

  const supabase = getSupabaseBrowserClient()

  useEffect(() => { fetchTerritory() }, [id])

  async function fetchTerritory() {
    const { data, error } = await supabase
      .from("territories")
      .select(`
        *,
        subdivisions(*),
        do_not_visits(*),
        campaign:campaigns(*),
        assigned_to_user:profiles!territories_assigned_to_fkey(id, name, email)
      `)
      .eq("id", id)
      .order("name", { foreignTable: "subdivisions" })
      .single()

    if (data) {
      setTerritory(data as TerritoryWithSubdivisions)
      setTerritoryForm({ name: data.name || "", number: data.number || "", color: data.color || "#C65D3B" })
    }
    setLoading(false)
  }

  const handleSubdivisionCreate = async (coordinates: [number, number][][]) => {
    setPendingCoordinates(coordinates)
    const tNumber = territory?.number || "??"
    const count = territory?.subdivisions?.length || 0
    const suffix = String.fromCharCode(65 + count)
    setNewSubdivisionName(`${tNumber}-${suffix}`)
    setDialogOpen(true)
  }

  const handleSaveNewSubdivision = async () => {
    if (!pendingCoordinates || !newSubdivisionName.trim()) return
    setSaving(true)
    const { error } = await supabase.from("subdivisions").insert({
      territory_id: id, name: newSubdivisionName,
      coordinates: pendingCoordinates, status: "available", completed: false,
    })
    if (error) alert("Erro ao criar subdivisão: " + error.message)
    setDialogOpen(false)
    setPendingCoordinates(null)
    setNewSubdivisionName("")
    setSaving(false)
    fetchTerritory()
  }

  const handleSubdivisionUpdate = async (subdivisionId: string, coordinates: [number, number][][]) => {
    setSaving(true)
    await supabase.from("subdivisions").update({ coordinates }).eq("id", subdivisionId)
    setSaving(false)
    fetchTerritory()
  }

  const handleSubdivisionDelete = async (subdivisionId: string) => {
    if (!confirm("Excluir esta subdivisão?")) return
    setSaving(true)
    await supabase.from("subdivisions").delete().eq("id", subdivisionId)
    if (selectedSubdivision?.id === subdivisionId) setSelectedSubdivision(null)
    setSaving(false)
    fetchTerritory()
  }

  const handleSubdivisionSelect = (subdivision: Subdivision) => setSelectedSubdivision(subdivision)

  const handleFocusSubdivision = (subdivision: Subdivision) => {
    setFocusedSubdivisionId(null)
    setTimeout(() => { setFocusedSubdivisionId(subdivision.id); setSelectedSubdivision(subdivision) }, 10)
  }

  const handleEditSubdivision = () => {
    if (!selectedSubdivision) return
    setEditSubdivisionName(selectedSubdivision.name)
    setEditSubdivisionNotes(selectedSubdivision.notes || "")
    setEditDialogOpen(true)
  }

  const handleSaveEditSubdivision = async () => {
    if (!selectedSubdivision || !editSubdivisionName.trim()) return
    setSaving(true)
    const { error } = await supabase.from("subdivisions")
      .update({ name: editSubdivisionName, notes: editSubdivisionNotes })
      .eq("id", selectedSubdivision.id)
    if (error) alert("Erro: " + error.message)
    setEditDialogOpen(false)
    setSaving(false)
    fetchTerritory()
  }

  const toggleSubdivisionStatus = async (subdivision: Subdivision) => {
    const newCompleted = !subdivision.completed
    await supabase.from("subdivisions")
      .update({ completed: newCompleted, status: newCompleted ? "completed" : "available" })
      .eq("id", subdivision.id)
    fetchTerritory()
  }

  const handleMapClick = async (latlng: [number, number]) => {
    if (!isAddingDnv) return
    setNewDnvCoords(latlng)
    setDnvFormData({ address: "Carregando endereço...", notes: "" })
    setCreateDnvDialogOpen(true)
    setIsAddingDnv(false)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng[0]}&lon=${latlng[1]}`)
      const data = await res.json()
      const shortAddress = data?.display_name?.split(",").slice(0, 3).join(", ") || ""
      setDnvFormData(prev => ({ ...prev, address: shortAddress }))
    } catch { setDnvFormData(prev => ({ ...prev, address: "" })) }
  }

  const handleCreateDnv = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDnvCoords) return
    setSaving(true)
    try {
      const { error } = await supabase.from("do_not_visits").insert({
        territory_id: id, latitude: newDnvCoords[0], longitude: newDnvCoords[1],
        address: dnvFormData.address, notes: dnvFormData.notes,
      })
      if (error) throw error
      setCreateDnvDialogOpen(false)
      fetchTerritory()
    } catch (error: any) { alert("Erro: " + error.message) }
    finally { setSaving(false) }
  }

  const handleDnvClick = (dnv: any) => {
    setEditingDnv(dnv)
    setDnvFormData({ address: dnv.address || "", notes: dnv.notes || "" })
    setDnvDialogOpen(true)
  }

  const handleDnvUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingDnv) return
    setSaving(true)
    try {
      const { error } = await supabase.from("do_not_visits")
        .update({ address: dnvFormData.address, notes: dnvFormData.notes })
        .eq("id", editingDnv.id)
      if (error) throw error
      setDnvDialogOpen(false)
      fetchTerritory()
    } catch (error: any) { alert("Erro: " + error.message) }
    finally { setSaving(false) }
  }

  const handleDeleteDnv = async () => {
    if (!editingDnv || !confirm("Excluir?")) return
    setSaving(true)
    try {
      await supabase.from("do_not_visits").delete().eq("id", editingDnv.id)
      setDnvDialogOpen(false)
      fetchTerritory()
    } catch (error: any) { alert("Erro: " + error.message) }
    finally { setSaving(false) }
  }

  const handleUpdateTerritory = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from("territories")
        .update({ name: territoryForm.name, number: territoryForm.number, color: territoryForm.color })
        .eq("id", id)
      if (error) throw error
      setEditTerritoryDialogOpen(false)
      fetchTerritory()
    } catch (error: any) { alert("Erro: " + error.message) }
    finally { setSaving(false) }
  }

  const getStatusBadge = (subdivision: Subdivision) => {
    if (subdivision.completed || subdivision.status === "completed")
      return <Badge className="bg-green-600 text-white text-xs shadow-none">Concluída</Badge>
    if (subdivision.status === "assigned")
      return <Badge className="bg-primary text-primary-foreground text-xs shadow-none">Designada</Badge>
    return <Badge variant="outline" className="text-xs bg-muted border-border">Disponível</Badge>
  }

  const getProgressStats = () => {
    if (!territory?.subdivisions) return { completed: 0, total: 0, percentage: 0 }
    const total = territory.subdivisions.length
    const completed = territory.subdivisions.filter(s => s.completed || s.status === "completed").length
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Sincronizando território...</p>
        </div>
      </div>
    )
  }

  if (!territory) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Território não encontrado</p>
        <Button asChild><Link href="/dashboard/territories"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button>
      </div>
    )
  }

  const stats = getProgressStats()

  return (
    /*
     * Layout strategy:
     * O GlobalHeader tem h-16 (64px) e é fixed/sticky no layout pai com pt-20.
     * Esta página usa `p-0 pt-0` no container do layout, então precisa ocupar
     * 100dvh e descontar apenas o header global (64px = 4rem).
     *
     * Usamos dvh (dynamic viewport height) para mobile: considera a barra
     * do browser corretamente, eliminando o espaço em branco na parte inferior.
     */
    <div className="flex flex-col h-[calc(100dvh-64px)] md:h-dvh">

      {/* ── Subheader da página do mapa ── */}
      {/*
       * Fica abaixo do GlobalHeader (que já ocupa os 64px do topo).
       * Altura: 48px — compacto mas com alvo de toque adequado no mobile.
       * Contém: voltar | dot+número+nome | lápis editar | [spacer] | progresso | painel-quadras
       */}
      <div className="h-12 border-b bg-card flex items-center gap-2 px-3 shrink-0 z-20">

        {/* Voltar */}
        <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0 shrink-0 text-muted-foreground">
          <Link href="/dashboard/territories">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Dot colorido + número + nome */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div
            className="h-6 w-6 rounded-md shrink-0 flex items-center justify-center text-white font-bold text-[10px]"
            style={{ backgroundColor: territory.color }}
          >
            {territory.number.slice(0, 2)}
          </div>
          <div className="min-w-0 flex items-center gap-1">
            <span className="text-[11px] font-mono text-muted-foreground shrink-0 hidden sm:inline">
              T-{territory.number}
            </span>
            <span className="text-[13px] font-semibold text-foreground truncate">
              {territory.name}
            </span>
            {/* Editar território */}
            <button
              onClick={() => setEditTerritoryDialogOpen(true)}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Progresso compacto — sempre visível */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-medium text-foreground tabular-nums">
            {stats.completed}/{stats.total}
          </span>
          <div className="h-1.5 w-14 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${stats.percentage}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:inline">
            {stats.percentage}%
          </span>
        </div>

        {saving && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
        )}

        {/* Botão Painel de Quadras — mobile only, ícone de grid */}
        <button
          className="md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
          onClick={() => setShowMobileSidebar(true)}
          aria-label="Abrir painel de quadras"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
      </div>

      {/* ── Corpo: mapa + sidebar ── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Overlay mobile */}
        {showMobileSidebar && (
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-[1900] backdrop-blur-sm"
            onClick={() => setShowMobileSidebar(false)}
          />
        )}

        {/* DNV adding banner */}
        {isAddingDnv && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-red-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
            <MapPin className="h-4 w-4" />
            <span className="text-sm font-bold">Clique no endereço no mapa</span>
            <button className="ml-1" onClick={() => setIsAddingDnv(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* MAP */}
        <div className="flex-1 relative" style={{ zIndex: 1 }}>
          <TerritoryMap
            territory={territory}
            subdivisions={territory.subdivisions || []}
            editable
            onSubdivisionCreate={handleSubdivisionCreate}
            onSubdivisionUpdate={handleSubdivisionUpdate}
            onSubdivisionDelete={handleSubdivisionDelete}
            onSubdivisionSelect={handleSubdivisionSelect}
            onMapClick={handleMapClick}
            focusedSubdivisionId={focusedSubdivisionId}
          />
        </div>

        {/* SIDEBAR */}
        <div
          className={[
            "fixed inset-y-0 right-0 z-[2000] w-80 bg-card flex flex-col shadow-2xl transition-transform duration-300 ease-in-out",
            showMobileSidebar ? "translate-x-0" : "translate-x-full",
            "md:relative md:translate-x-0 md:w-96 md:border-l md:shadow-none md:inset-y-auto",
          ].join(" ")}
        >
          {/* Mobile close bar */}
          <div className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-muted shrink-0">
            <span className="text-[13px] font-semibold text-foreground">Painel de trabalho</span>
            <Button variant="outline" size="sm" className="h-7 text-xs rounded-full" onClick={() => setShowMobileSidebar(false)}>
              Fechar
            </Button>
          </div>

          <Tabs defaultValue="quadras" className="flex flex-col flex-1 overflow-hidden">

            {/* Tab list */}
            <div className="px-4 py-2 border-b bg-muted/30 shrink-0">
              <TabsList className="w-full grid grid-cols-2 bg-muted h-9 border">
                <TabsTrigger value="quadras" className="text-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  Quadras
                  <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">
                    {territory.subdivisions?.length || 0}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="dnv" className="text-xs font-medium data-[state=active]:bg-red-50 data-[state=active]:text-red-600 dark:data-[state=active]:bg-red-950">
                  Não visitar
                  <span className="ml-1.5 text-[10px] font-semibold">
                    {((territory as any).do_not_visits?.length) || 0}
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Quadras tab */}
            <TabsContent value="quadras" className="flex-1 flex flex-col m-0 overflow-hidden outline-none data-[state=inactive]:hidden">

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b bg-muted/20 shrink-0">
                {[
                  { icon: <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />, value: stats.total - stats.completed, label: "Pendentes" },
                  { icon: <Check className="h-3.5 w-3.5 text-emerald-500" />, value: stats.completed, label: "Concluídas" },
                  { icon: <TrendingUp className="h-3.5 w-3.5 text-primary" />, value: `${stats.percentage}%`, label: "Meta" },
                ].map((s, i) => (
                  <div key={i} className="flex flex-col p-2 rounded-xl bg-card border border-border shadow-sm">
                    {s.icon}
                    <span className="font-bold text-foreground text-sm mt-1">{s.value}</span>
                    <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-tight">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {territory.subdivisions?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <div className="h-14 w-14 bg-muted rounded-full flex items-center justify-center mb-3 border-2 border-dashed border-border">
                      <MapPin className="h-7 w-7 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm font-semibold text-foreground mb-1">Sem quadras definidas</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Use a ferramenta de desenho no mapa para criar divisões do território.
                    </p>
                  </div>
                ) : (
                  territory.subdivisions?.map((subdivision) => {
                    const isSelected = selectedSubdivision?.id === subdivision.id
                    const isCompleted = subdivision.completed || subdivision.status === "completed"
                    return (
                      <div
                        key={subdivision.id}
                        onClick={() => handleFocusSubdivision(subdivision)}
                        className={[
                          "group relative rounded-xl border p-3 transition-all cursor-pointer",
                          isSelected
                            ? "border-primary ring-2 ring-primary/10 bg-primary/5"
                            : isCompleted
                            ? "bg-emerald-500/8 border-emerald-200 dark:border-emerald-900"
                            : "bg-card hover:border-muted-foreground/30",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-bold text-foreground text-sm truncate">{subdivision.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {getStatusBadge(subdivision)}
                            <button
                              className={[
                                "w-7 h-7 flex items-center justify-center rounded-lg transition-all",
                                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                                "hover:bg-muted text-muted-foreground",
                              ].join(" ")}
                              onClick={(e) => { e.stopPropagation(); handleFocusSubdivision(subdivision) }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {subdivision.notes && (
                          <p className="text-[11px] text-muted-foreground bg-muted rounded-lg px-2 py-1.5 mb-2 line-clamp-2">
                            {subdivision.notes}
                          </p>
                        )}

                        {isSelected && (
                          <div className="flex gap-1.5 pt-2.5 border-t border-primary/20 mt-1">
                            <Button
                              size="sm"
                              className={[
                                "flex-1 h-8 text-xs font-medium",
                                isCompleted ? "bg-muted text-foreground hover:bg-muted/80" : "bg-emerald-600 hover:bg-emerald-700 text-white",
                              ].join(" ")}
                              onClick={(e) => { e.stopPropagation(); toggleSubdivisionStatus(subdivision) }}
                            >
                              {isCompleted ? "Marcar pendente" : "Concluir"}
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              className="h-8 w-8 p-0 shrink-0"
                              onClick={(e) => { e.stopPropagation(); handleEditSubdivision() }}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              className="h-8 w-8 p-0 shrink-0 border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); handleSubdivisionDelete(subdivision.id) }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>

            {/* DNV tab */}
            <TabsContent value="dnv" className="flex-1 flex flex-col m-0 outline-none data-[state=inactive]:hidden">
              <div className="px-4 py-3 border-b shrink-0">
                <Button
                  className="w-full bg-red-600 hover:bg-red-700 text-white h-9 text-sm font-medium gap-1.5"
                  onClick={() => setIsAddingDnv(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Marcar não visitar
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {!(territory as any).do_not_visits?.length ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <div className="h-14 w-14 bg-muted rounded-full flex items-center justify-center mb-3 border-2 border-dashed border-border text-red-400/40">
                      <MapPin className="h-7 w-7" />
                    </div>
                    <p className="text-sm font-semibold text-foreground mb-1">Sem restrições</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Clique no botão acima e marque no mapa endereços a evitar.
                    </p>
                  </div>
                ) : (
                  (territory as any).do_not_visits.map((dnv: any) => {
                    const date = new Date(dnv.created_at)
                    const isExpired = Date.now() - date.getTime() > 365 * 24 * 60 * 60 * 1000
                    return (
                      <div
                        key={dnv.id}
                        className={[
                          "group p-3 rounded-xl border text-sm transition-all cursor-pointer",
                          isExpired ? "bg-orange-500/8 border-orange-300 dark:border-orange-900" : "bg-card border-red-200 dark:border-red-900/40",
                        ].join(" ")}
                        onClick={() => handleDnvClick(dnv)}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground text-xs leading-tight line-clamp-2">
                              {dnv.address || "Endereço não informado"}
                            </p>
                            {isExpired ? (
                              <span className="text-[10px] font-bold text-destructive uppercase tracking-wide">Expirado</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                Desde {date.toLocaleDateString("pt-BR")}
                              </span>
                            )}
                          </div>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
                        </div>
                        {dnv.notes && (
                          <p className="text-[11px] text-muted-foreground bg-muted rounded-lg px-2 py-1.5 mt-2">
                            {dnv.notes}
                          </p>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Assignee footer */}
          {territory.assigned_to && (
            <div className="shrink-0 px-4 py-3 border-t bg-muted/40 flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center font-bold text-[10px] text-primary-foreground shrink-0">
                {territory.assigned_to_user?.name?.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest leading-none">Designado</p>
                <p className="text-[13px] font-semibold text-foreground truncate mt-0.5">
                  {territory.assigned_to_user?.name}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}

      {/* Edit Territory */}
      <Dialog open={editTerritoryDialogOpen} onOpenChange={setEditTerritoryDialogOpen}>
        <DialogContent className="z-[9999] sm:max-w-[400px]">
          <form onSubmit={handleUpdateTerritory}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Configurar território</DialogTitle>
              <DialogDescription className="text-[13px]">Informações básicas de identificação.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Número</Label>
                  <Input value={territoryForm.number} className="font-mono h-9 text-sm"
                    onChange={(e) => setTerritoryForm({ ...territoryForm, number: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nome</Label>
                  <Input value={territoryForm.name} className="h-9 text-sm"
                    onChange={(e) => setTerritoryForm({ ...territoryForm, name: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {["#C65D3B","#2563eb","#16a34a","#d97706","#7c3aed","#db2777","#4b5563"].map(c => (
                    <button key={c} type="button"
                      className={["h-7 w-7 rounded-full border-2 transition-all", territoryForm.color === c ? "border-primary ring-2 ring-primary/20 scale-110" : "border-transparent"].join(" ")}
                      style={{ backgroundColor: c }}
                      onClick={() => setTerritoryForm({ ...territoryForm, color: c })}
                    />
                  ))}
                  <Input type="color" className="w-7 h-7 p-0 border-none rounded-full overflow-hidden cursor-pointer"
                    value={territoryForm.color}
                    onChange={(e) => setTerritoryForm({ ...territoryForm, color: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" className="h-9 text-sm" onClick={() => setEditTerritoryDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="h-9 text-sm" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Subdivision */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="z-[9999] sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Nova quadra</DialogTitle>
            <DialogDescription className="text-[13px]">Identifique a área desenhada.</DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Input value={newSubdivisionName} onChange={(e) => setNewSubdivisionName(e.target.value)}
              placeholder="Ex: 05-A, Setor Norte" className="font-bold text-lg h-12" autoFocus />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="h-9 text-sm" onClick={() => { setDialogOpen(false); setPendingCoordinates(null) }}>Cancelar</Button>
            <Button className="h-9 text-sm" onClick={handleSaveNewSubdivision} disabled={saving || !newSubdivisionName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar quadra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subdivision */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="z-[9999] sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Editar quadra</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <Input value={editSubdivisionName} onChange={(e) => setEditSubdivisionName(e.target.value)}
              className="font-bold h-9 text-sm" autoFocus />
            <Textarea value={editSubdivisionNotes} onChange={(e) => setEditSubdivisionNotes(e.target.value)}
              placeholder="Notas de campo (opcional)" className="min-h-[80px] text-sm" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="h-9 text-sm" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button className="h-9 text-sm" onClick={handleSaveEditSubdivision} disabled={saving || !editSubdivisionName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create DNV */}
      <Dialog open={createDnvDialogOpen} onOpenChange={setCreateDnvDialogOpen}>
        <DialogContent className="z-[9999] sm:max-w-[380px]">
          <form onSubmit={handleCreateDnv}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-red-700">Bloquear localização</DialogTitle>
              <DialogDescription className="text-[13px]">Endereço a ser evitado pelos publicadores.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="bg-destructive/8 p-3 rounded-xl border border-destructive/20 flex gap-2.5 items-center">
                <div className="bg-destructive/15 p-1.5 rounded-lg shrink-0">
                  <MapPin className="h-4 w-4 text-destructive" />
                </div>
                <p className="text-[11px] font-mono text-muted-foreground">
                  {newDnvCoords?.[0].toFixed(6)}, {newDnvCoords?.[1].toFixed(6)}
                </p>
              </div>
              <Input value={dnvFormData.address} onChange={(e) => setDnvFormData({ ...dnvFormData, address: e.target.value })}
                placeholder="Endereço" className="h-9 text-sm" />
              <Textarea value={dnvFormData.notes} onChange={(e) => setDnvFormData({ ...dnvFormData, notes: e.target.value })}
                placeholder="Motivo / observações" className="min-h-[80px] text-sm" />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" className="h-9 text-sm" onClick={() => setCreateDnvDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="h-9 text-sm bg-red-600 hover:bg-red-700 text-white" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar bloqueio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit DNV */}
      <Dialog open={dnvDialogOpen} onOpenChange={setDnvDialogOpen}>
        <DialogContent className="z-[9999] sm:max-w-[380px]">
          <form onSubmit={handleDnvUpdate}>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base font-semibold">Editar bloqueio</DialogTitle>
                <button type="button" onClick={handleDeleteDnv} disabled={saving}
                  className="flex items-center gap-1 text-[12px] text-destructive hover:text-destructive/80 font-medium">
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Input value={dnvFormData.address} onChange={(e) => setDnvFormData({ ...dnvFormData, address: e.target.value })}
                placeholder="Endereço" className="h-9 text-sm" />
              <Textarea value={dnvFormData.notes} onChange={(e) => setDnvFormData({ ...dnvFormData, notes: e.target.value })}
                placeholder="Notas" className="min-h-[80px] text-sm" />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" className="h-9 text-sm" onClick={() => setDnvDialogOpen(false)} disabled={saving}>Cancelar</Button>
              <Button type="submit" className="h-9 text-sm" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}