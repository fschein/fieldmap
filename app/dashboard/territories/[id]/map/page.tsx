// ============================================================================
// app/dashboard/territories/[id]/map/page.tsx - DASHBOARD COMPLETO
// ============================================================================
"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  Save,
  MapPin,
  Check,
  Clock,
  Eye,
  Edit3,
  Trash2,
  ChevronRight,
  Pencil,
  Plus,
  X,
  TrendingUp
} from "lucide-react"
import type { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"

// Dynamic import for map to avoid SSR issues
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

  // Modals
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [dnvDialogOpen, setDnvDialogOpen] = useState(false)
  const [createDnvDialogOpen, setCreateDnvDialogOpen] = useState(false)
  const [editTerritoryDialogOpen, setEditTerritoryDialogOpen] = useState(false)

  // Subdivision Forms
  const [newSubdivisionName, setNewSubdivisionName] = useState("")
  const [editSubdivisionName, setEditSubdivisionName] = useState("")
  const [editSubdivisionNotes, setEditSubdivisionNotes] = useState("")
  const [pendingCoordinates, setPendingCoordinates] = useState<[number, number][][] | null>(null)
  const [focusedSubdivisionId, setFocusedSubdivisionId] = useState<string | null>(null)

  // DNV Forms
  const [isAddingDnv, setIsAddingDnv] = useState(false)
  const [newDnvCoords, setNewDnvCoords] = useState<[number, number] | null>(null)
  const [editingDnv, setEditingDnv] = useState<any>(null)
  const [dnvFormData, setDnvFormData] = useState({ address: "", notes: "" })

  // Territory Edit Form
  const [territoryForm, setTerritoryForm] = useState({ name: "", number: "", color: "" })

  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    fetchTerritory()
  }, [id])

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
      .order('name', { foreignTable: 'subdivisions' })
      .single()

    if (error) {
      console.error("Erro ao buscar território:", error)
    }

    if (data) {
      setTerritory(data as TerritoryWithSubdivisions)
      setTerritoryForm({
        name: data.name || "",
        number: data.number || "",
        color: data.color || "#C65D3B"
      })
    }
    setLoading(false)
  }

  const handleSubdivisionCreate = async (coordinates: [number, number][][]) => {
    setPendingCoordinates(coordinates)

    // Nome automático baseado no número do território + letra sequencial
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
      territory_id: id,
      name: newSubdivisionName,
      coordinates: pendingCoordinates,
      status: "available",
      completed: false,
    })

    if (error) {
      console.error("Erro ao criar subdivisão:", error.message)
      alert("Erro ao criar subdivisão: " + error.message)
    }

    setDialogOpen(false)
    setPendingCoordinates(null)
    setNewSubdivisionName("")
    setSaving(false)
    fetchTerritory()
  }

  const handleSubdivisionUpdate = async (subdivisionId: string, coordinates: [number, number][][]) => {
    setSaving(true)
    const { error } = await supabase
      .from("subdivisions")
      .update({ coordinates })
      .eq("id", subdivisionId)

    if (error) {
      console.error("Erro ao atualizar subdivisão:", error)
    }

    setSaving(false)
    fetchTerritory()
  }

  const handleSubdivisionDelete = async (subdivisionId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta subdivisão?")) return

    setSaving(true)
    const { error } = await supabase
      .from("subdivisions")
      .delete()
      .eq("id", subdivisionId)

    if (error) {
      console.error("Erro ao deletar subdivisão:", error)
      alert("Erro ao deletar: " + error.message)
    }

    if (selectedSubdivision?.id === subdivisionId) {
      setSelectedSubdivision(null)
    }

    setSaving(false)
    fetchTerritory()
  }

  const handleSubdivisionSelect = (subdivision: Subdivision) => {
    setSelectedSubdivision(subdivision)
  }

  const handleFocusSubdivision = (subdivision: Subdivision) => {
    setFocusedSubdivisionId(null) // Reset first
    setTimeout(() => {
      setFocusedSubdivisionId(subdivision.id)
      setSelectedSubdivision(subdivision)
    }, 10)
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

    const { error } = await supabase
      .from("subdivisions")
      .update({
        name: editSubdivisionName,
        notes: editSubdivisionNotes
      })
      .eq("id", selectedSubdivision.id)

    if (error) {
      console.error("Erro ao atualizar:", error)
      alert("Erro: " + error.message)
    }

    setEditDialogOpen(false)
    setSaving(false)
    fetchTerritory()
  }

  const toggleSubdivisionStatus = async (subdivision: Subdivision) => {
    const newCompleted = !subdivision.completed
    const newStatus = newCompleted ? 'completed' : 'available'

    const { error } = await supabase
      .from("subdivisions")
      .update({
        completed: newCompleted,
        status: newStatus
      })
      .eq("id", subdivision.id)

    if (error) {
      console.error("Erro ao atualizar status:", error)
    }

    fetchTerritory()
  }

  // --- DNV Handlers ---

  const handleMapClick = async (latlng: [number, number]) => {
    if (isAddingDnv) {
      setNewDnvCoords(latlng)
      setDnvFormData({ address: "Carregando endereço...", notes: "" })
      setCreateDnvDialogOpen(true)
      setIsAddingDnv(false)

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng[0]}&lon=${latlng[1]}`)
        const data = await res.json()
        if (data && data.display_name) {
          // Extrair uma versão curta do endereço
          const parts = data.display_name.split(',')
          const shortAddress = parts.slice(0, 3).join(', ')
          setDnvFormData(prev => ({ ...prev, address: shortAddress }))
        } else {
          setDnvFormData(prev => ({ ...prev, address: "" }))
        }
      } catch (err) {
        setDnvFormData(prev => ({ ...prev, address: "" }))
      }
    }
  }

  const handleCreateDnv = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDnvCoords) return
    setSaving(true)
    try {
      const { error } = await supabase.from("do_not_visits").insert({
        territory_id: id,
        latitude: newDnvCoords[0],
        longitude: newDnvCoords[1],
        address: dnvFormData.address,
        notes: dnvFormData.notes,
      })
      if (error) throw error
      setCreateDnvDialogOpen(false)
      fetchTerritory()
    } catch (error: any) {
      alert("Erro ao criar Não Visitar: " + error.message)
    } finally {
      setSaving(false)
    }
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
      const { error } = await supabase.from("do_not_visits").update({
        address: dnvFormData.address,
        notes: dnvFormData.notes,
      }).eq("id", editingDnv.id)
      if (error) throw error
      setDnvDialogOpen(false)
      fetchTerritory()
    } catch (error: any) {
      alert("Erro ao atualizar Não Visitar: " + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDnv = async () => {
    if (!editingDnv || !confirm("Tem certeza que deseja excluir?")) return
    setSaving(true)
    try {
      const { error } = await supabase.from("do_not_visits").delete().eq("id", editingDnv.id)
      if (error) throw error
      setDnvDialogOpen(false)
      fetchTerritory()
    } catch (error: any) {
      alert("Erro ao excluir Não Visitar: " + error.message)
    } finally {
      setSaving(false)
    }
  }

  // --- Territory Handlers ---

  const handleUpdateTerritory = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from("territories").update({
        name: territoryForm.name,
        number: territoryForm.number,
        color: territoryForm.color,
      }).eq("id", id)
      if (error) throw error
      setEditTerritoryDialogOpen(false)
      fetchTerritory()
    } catch (error: any) {
      alert("Erro ao atualizar território: " + error.message)
    } finally {
      setSaving(false)
    }
  }

  const getStatusBadge = (subdivision: Subdivision) => {
    if (subdivision.completed || subdivision.status === 'completed') {
      return <Badge className="bg-green-600 text-white text-xs shadow-none">Concluída</Badge>
    }
    if (subdivision.status === 'assigned') {
      return <Badge className="bg-primary text-primary-foreground text-xs shadow-none">Designada</Badge>
    }
    return <Badge variant="outline" className="text-xs bg-muted border-border">Disponível</Badge>
  }

  const getProgressStats = () => {
    if (!territory?.subdivisions) return { completed: 0, total: 0, percentage: 0 }

    const total = territory.subdivisions.length
    const completed = territory.subdivisions.filter(s => s.completed || s.status === 'completed').length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return { completed, total, percentage }
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
        <Button asChild>
          <Link href="/dashboard/territories">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Territórios
          </Link>
        </Button>
      </div>
    )
  }

  const stats = getProgressStats()

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-0 bg-background">
      {/* Header Compacto - Padronizado com GlobalHeader h-16 */}
      <div className="h-16 border-b bg-card pl-14 pr-3 sm:px-6 flex items-center justify-between sticky top-0 z-20 shadow-sm gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground flex-shrink-0 h-8 px-2 sm:px-3">
            <Link href="/dashboard/territories">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Territórios</span>
            </Link>
          </Button>

          <div className="h-5 w-px bg-border hidden sm:block" />

          <div className="flex items-center gap-2 min-w-0">
            <div
              className="h-7 w-7 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-sm"
              style={{ backgroundColor: territory.color }}
            >
              {territory.number.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="font-mono text-xs bg-muted border-border text-muted-foreground hidden sm:flex">
                  T-{territory.number}
                </Badge>
                <h1 className="text-sm sm:text-lg font-bold text-foreground tracking-tight truncate max-w-[140px] sm:max-w-none">
                  {territory.name}
                </h1>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary flex-shrink-0" onClick={() => setEditTerritoryDialogOpen(true)}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {/* Progress Section - desktop only */}
          <div className="hidden sm:flex items-center gap-3 px-4 py-1.5 rounded-full bg-muted border border-border shadow-inner">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none mb-1">Status de Campo</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-foreground leading-none">
                  {stats.completed}/{stats.total} <span className="text-[10px] text-muted-foreground/50 font-normal">áreas</span>
                </span>
                <div className="h-2 w-24 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-500 rounded-full"
                    style={{ width: `${stats.percentage}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Progress mobile compacto */}
          <div className="sm:hidden flex items-center gap-1.5 text-xs">
            <span className="font-bold text-foreground">{stats.completed}/{stats.total}</span>
            <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500 rounded-full"
                style={{ width: `${stats.percentage}%` }}
              />
            </div>
          </div>

          {saving && (
            <div className="flex items-center gap-1 text-xs text-primary font-medium animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="hidden sm:inline">Salvando...</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Overlay do mobile quando sidebar tá aberta */}
        {showMobileSidebar && (
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-[1900] backdrop-blur-sm transition-opacity"
            onClick={() => setShowMobileSidebar(false)}
          />
        )}

        {/* MAP - Ocupa a maior parte */}
        <div className="flex-1 relative" style={{ zIndex: 1 }}>
          {isAddingDnv && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-red-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
              <MapPin className="h-4 w-4" />
              <span className="text-sm font-bold">Clique no endereço no mapa</span>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-white" onClick={() => setIsAddingDnv(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

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

          <Button
            className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] shadow-xl rounded-full px-8 bg-secondary hover:bg-secondary/80 text-secondary-foreground border-2 border-white/10 backdrop-blur-md"
            onClick={() => setShowMobileSidebar(true)}
          >
            <MapPin className="h-4 w-4 mr-2 text-primary" />
            <span className="font-bold">Painel de Quadras</span>
          </Button>
        </div>

        {/* SIDEBAR - Lista de Subdivisões */}
        <div
          className={`
            fixed inset-y-0 right-0 z-[2000] w-80 bg-card flex flex-col overflow-hidden shadow-2xl transition-transform duration-300 ease-in-out
            ${showMobileSidebar ? 'translate-x-0' : 'translate-x-full'}
            md:relative md:translate-x-0 md:w-96 md:border-l md:shadow-none
          `}
        >
          {/* Botão Fechar (só mobile) */}
          <div className="md:hidden flex items-center justify-between p-4 border-b bg-muted">
            <span className="font-bold text-foreground tracking-tight">Painel de Trabalho</span>
            <Button variant="outline" size="sm" className="rounded-full h-8" onClick={() => setShowMobileSidebar(false)}>
              Fechar
            </Button>
          </div>

          <Tabs defaultValue="quadras" className="flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b bg-muted/30">
              <TabsList className="w-full grid grid-cols-2 bg-muted p-1 h-10 border">
                <TabsTrigger value="quadras" className="text-xs font-bold data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  Quadras <Badge variant="secondary" className="ml-2 bg-muted-foreground/10 text-[10px] px-1.5 py-0">{territory.subdivisions?.length || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger value="dnv" className="text-xs font-bold data-[state=active]:bg-red-500/10 data-[state=active]:text-red-500 data-[state=active]:shadow-sm">
                  Não Visitar <Badge variant="secondary" className="ml-2 bg-card text-red-500 border-red-500/20 text-[10px] px-1.5 py-0">{((territory as any).do_not_visits?.length) || 0}</Badge>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="quadras" className="flex-1 flex flex-col m-0 overflow-hidden outline-none data-[state=inactive]:hidden bg-card">
              <div className="grid grid-cols-3 gap-3 text-xs p-4 border-b bg-muted/20 shrink-0">
                <div className="flex flex-col p-2.5 rounded-xl bg-card border border-border shadow-sm">
                  <Clock className="h-4 w-4 text-muted-foreground/40 mb-1" />
                  <span className="font-black text-foreground text-sm">{stats.total - stats.completed}</span>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Pendentes</span>
                </div>
                <div className="flex flex-col p-2.5 rounded-xl bg-card border border-border shadow-sm">
                  <Check className="h-4 w-4 text-emerald-500 mb-1" />
                  <span className="font-black text-foreground text-sm">{stats.completed}</span>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Concluídas</span>
                </div>
                <div className="flex flex-col p-2.5 rounded-xl bg-card border border-border shadow-sm">
                  <TrendingUp className="h-4 w-4 text-primary mb-1" />
                  <span className="font-black text-foreground text-sm">{stats.percentage}%</span>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Meta</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {territory.subdivisions?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4 border-2 border-dashed border-border">
                      <MapPin className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                    <p className="text-base font-bold text-foreground mb-2">Sem quadras definidas</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Use a ferramenta de desenho no mapa para criar as divisões desse território.
                    </p>
                  </div>
                ) : (
                  territory.subdivisions?.map((subdivision) => {
                    const isSelected = selectedSubdivision?.id === subdivision.id
                    const isCompleted = subdivision.completed || subdivision.status === 'completed'

                    return (
                      <div
                        key={subdivision.id}
                        className={`
                          group relative rounded-xl border p-4 transition-all cursor-pointer shadow-sm
                          ${isSelected
                            ? 'border-primary ring-2 ring-primary/10 bg-primary/5'
                            : 'bg-card hover:border-muted-foreground/30 hover:shadow-md'
                          }
                          ${isCompleted && !isSelected ? 'bg-emerald-500/10' : ''}
                        `}
                        onClick={() => handleFocusSubdivision(subdivision)}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-black text-foreground text-base tracking-tight truncate">
                                {subdivision.name}
                              </span>
                            </div>
                            {getStatusBadge(subdivision)}
                          </div>

                          <div className={`flex items-center gap-1 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-8 w-8 rounded-full bg-card border border-border shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleFocusSubdivision(subdivision)
                              }}
                            >
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>

                        {subdivision.notes && (
                          <div className="bg-muted p-2 rounded-lg border border-border mb-3">
                            <p className="text-[11px] text-muted-foreground font-medium line-clamp-2">
                              {subdivision.notes}
                            </p>
                          </div>
                        )}

                        {isSelected && (
                          <div className="flex gap-2 pt-3 border-t mt-3 border-primary/20">
                            <Button
                              size="sm"
                              className={`flex-1 h-9 rounded-lg font-bold text-xs ${isCompleted ? 'bg-secondary text-secondary-foreground' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleSubdivisionStatus(subdivision)
                              }}
                            >
                              {isCompleted ? 'Marcar Pendente' : 'Marcar Concluída'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 px-3 rounded-lg border-border"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditSubdivision()
                              }}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 px-3 rounded-lg border-destructive/20 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSubdivisionDelete(subdivision.id)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="dnv" className="flex-1 flex flex-col m-0 outline-none data-[state=inactive]:hidden bg-card">
              <div className="p-4 border-b bg-red-500/5 shrink-0">
                <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-10 shadow-lg shadow-red-500/10" onClick={() => setIsAddingDnv(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Não visitar
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {!(territory as any).do_not_visits || (territory as any).do_not_visits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4 border-2 border-dashed border-border text-red-500/30">
                      <MapPin className="h-8 w-8" />
                    </div>
                    <p className="text-base font-bold text-foreground mb-2">Sem restrições de visita</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Clique no botão acima e depois no mapa para registrar endereços que não devem ser visitados.
                    </p>
                  </div>
                ) : (
                  (territory as any).do_not_visits.map((dnv: any) => {
                    const date = new Date(dnv.created_at)
                    const isExpired = new Date().getTime() - date.getTime() > 365 * 24 * 60 * 60 * 1000
                    return (
                      <div key={dnv.id} className={`group p-4 rounded-xl border text-sm transition-all shadow-sm ${isExpired ? 'bg-orange-500/10 border-orange-500/20' : 'bg-card border-red-500/10'}`}>
                        <div className="flex justify-between items-start gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-black text-foreground line-clamp-2 leading-[1.2] text-sm mb-1">
                              {dnv.address || "Endereço não informado"}
                            </h4>
                            {isExpired ? (
                              <Badge className="bg-destructive text-destructive-foreground text-[9px] uppercase tracking-wider h-4">Expirado</Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">Desde {date.toLocaleDateString("pt-BR")}</span>
                            )}
                          </div>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 rounded-full bg-card border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); handleDnvClick(dnv); }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                        {dnv.notes && (
                          <div className="bg-muted/50 p-2.5 rounded-lg border border-border mt-2 text-xs text-muted-foreground leading-relaxed">
                            {dnv.notes}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Assigned User Info Desktop Footer */}
          {territory.assigned_to && (
            <div className="p-4 border-t bg-secondary text-secondary-foreground">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center font-bold text-xs text-primary-foreground">
                  {territory.assigned_to_user?.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-secondary-foreground/50 font-bold uppercase tracking-widest mb-0.5">Designado agora</p>
                  <p className="font-bold text-sm truncate">{territory.assigned_to_user?.name}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- MODALS --- */}

      {/* Territory Edit Dialog */}
      <Dialog open={editTerritoryDialogOpen} onOpenChange={setEditTerritoryDialogOpen}>
        <DialogContent className="z-[9999]">
          <form onSubmit={handleUpdateTerritory}>
            <DialogHeader>
              <DialogTitle>Configurar Território</DialogTitle>
              <DialogDescription>
                Atualize as informações básicas de identificação do território
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2 col-span-1">
                  <Label htmlFor="t-number">Número</Label>
                  <Input
                    id="t-number"
                    value={territoryForm.number}
                    className="font-mono font-bold"
                    onChange={(e) => setTerritoryForm({ ...territoryForm, number: e.target.value })}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="t-name">Nome do Território</Label>
                  <Input
                    id="t-name"
                    value={territoryForm.name}
                    className="font-bold"
                    onChange={(e) => setTerritoryForm({ ...territoryForm, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <Label>Cor de Destaque</Label>
                <div className="flex flex-wrap gap-2">
                  {['#C65D3B', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#4b5563'].map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`h-8 w-8 rounded-full border-2 transition-all ${territoryForm.color === c ? 'border-primary ring-2 ring-primary/20 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setTerritoryForm({ ...territoryForm, color: c })}
                    />
                  ))}
                  <div className="relative">
                    <Input
                      type="color"
                      className="w-8 h-8 p-0 border-none rounded-full overflow-hidden cursor-pointer"
                      value={territoryForm.color}
                      onChange={(e) => setTerritoryForm({ ...territoryForm, color: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTerritoryDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create DNV Dialog */}
      <Dialog open={createDnvDialogOpen} onOpenChange={setCreateDnvDialogOpen}>
        <DialogContent className="z-[9999]">
          <form onSubmit={handleCreateDnv}>
            <DialogHeader>
              <DialogTitle className="text-red-700">Bloquear Localização</DialogTitle>
              <DialogDescription>
                Este endereço será marcado com uma bolinha vermelha e deve ser evitado pelos publicadores.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20 flex gap-3 items-center">
                <div className="bg-destructive p-2 rounded-md">
                  <MapPin className="h-4 w-4 text-destructive-foreground" />
                </div>
                <div className="text-[11px] text-foreground leading-tight">
                  <p className="font-bold mb-0.5">Coordenadas capturadas:</p>
                  <p className="font-mono text-muted-foreground">{newDnvCoords?.[0].toFixed(6)}, {newDnvCoords?.[1].toFixed(6)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dnv-create-address">Confirmar Endereço</Label>
                <Input
                  id="dnv-create-address"
                  value={dnvFormData.address}
                  onChange={(e) => setDnvFormData({ ...dnvFormData, address: e.target.value })}
                  placeholder="Ex: Rua das Flores, 123"
                  className="font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dnv-create-notes">Observações/Motivo</Label>
                <Textarea
                  id="dnv-create-notes"
                  value={dnvFormData.notes}
                  onChange={(e) => setDnvFormData({ ...dnvFormData, notes: e.target.value })}
                  placeholder="Ex: Morador agressivo / Pediu para não ser visitado."
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDnvDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Bloqueio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Subdivision Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="z-[9999]">
          <DialogHeader>
            <DialogTitle>Nova Quadra</DialogTitle>
            <DialogDescription>
              Configure o identificador dessa nova área de trabalho.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="subdivisionName">Nome do Setor/Quadra</Label>
              <Input
                id="subdivisionName"
                value={newSubdivisionName}
                onChange={(e) => setNewSubdivisionName(e.target.value)}
                placeholder="Ex: 05-A, Setor Norte, Rua Principal"
                className="font-bold text-lg h-12"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false)
                setPendingCoordinates(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveNewSubdivision}
              className="bg-primary hover:bg-primary/90 font-bold"
              disabled={saving || !newSubdivisionName.trim()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Quadra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subdivision Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="z-[9999]">
          <DialogHeader>
            <DialogTitle>Ajustar Detalhes da Quadra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Identificador</Label>
              <Input
                id="editName"
                value={editSubdivisionName}
                onChange={(e) => setEditSubdivisionName(e.target.value)}
                className="font-bold"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editNotes">Notas de Campo (opcional)</Label>
              <Textarea
                id="editNotes"
                value={editSubdivisionNotes}
                onChange={(e) => setEditSubdivisionNotes(e.target.value)}
                placeholder="Ex: Área comercial, casas numeradas no portão..."
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveEditSubdivision}
              className="font-bold"
              disabled={saving || !editSubdivisionName.trim()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DNV Update Dialog */}
      <Dialog open={dnvDialogOpen} onOpenChange={setDnvDialogOpen}>
        <DialogContent className="z-[9999]">
          <form onSubmit={handleDnvUpdate}>
            <DialogHeader>
              <div className="flex items-center justify-between mt-2">
                <DialogTitle>Editar Bloqueio</DialogTitle>
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 -mr-4 -mt-6" onClick={handleDeleteDnv} disabled={saving}>
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir
                </Button>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="dnv-edit-address">Endereço</Label>
                <Input
                  id="dnv-edit-address"
                  value={dnvFormData.address}
                  onChange={(e) => setDnvFormData({ ...dnvFormData, address: e.target.value })}
                  className="font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dnv-edit-notes">Notas</Label>
                <Textarea
                  id="dnv-edit-notes"
                  value={dnvFormData.notes}
                  onChange={(e) => setDnvFormData({ ...dnvFormData, notes: e.target.value })}
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDnvDialogOpen(false)} disabled={saving}>Cancelar</Button>
              <Button type="submit" className="font-bold" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}