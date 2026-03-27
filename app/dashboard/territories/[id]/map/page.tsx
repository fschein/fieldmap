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
  ChevronRight
} from "lucide-react"
import type { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"

// Dynamic import for map to avoid SSR issues
const TerritoryMap = dynamic(
  () => import("@/components/map/territory-map").then((mod) => mod.TerritoryMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-50">
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
  const [newSubdivisionName, setNewSubdivisionName] = useState("")
  const [editSubdivisionName, setEditSubdivisionName] = useState("")
  const [editSubdivisionNotes, setEditSubdivisionNotes] = useState("")
  const [pendingCoordinates, setPendingCoordinates] = useState<[number, number][][] | null>(null)
  const [focusedSubdivisionId, setFocusedSubdivisionId] = useState<string | null>(null)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [dnvDialogOpen, setDnvDialogOpen] = useState(false)
  const [editingDnv, setEditingDnv] = useState<any>(null)
  const [dnvFormData, setDnvFormData] = useState({ address: "", notes: "" })
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
    setFocusedSubdivisionId(subdivision.id)
    setSelectedSubdivision(subdivision)
    // O mapa vai reagir a essa mudança via prop
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

  const handleDnvClick = (dnv: any) => {
    setEditingDnv(dnv)
    setDnvFormData({ address: dnv.address || "", notes: dnv.notes || "" })
    setDnvDialogOpen(true)
  }

  const handleDnvSubmit = async (e: React.FormEvent) => {
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
    if (!editingDnv || !confirm("Tem certeza que deseja excluir?" )) return
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

  const getStatusBadge = (subdivision: Subdivision) => {
    if (subdivision.completed || subdivision.status === 'completed') {
      return <Badge className="bg-green-600 text-white text-xs">Concluída</Badge>
    }
    if (subdivision.status === 'assigned') {
      return <Badge className="bg-yellow-500 text-white text-xs">Designada</Badge>
    }
    return <Badge variant="outline" className="text-xs">Disponível</Badge>
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
          <p className="text-sm text-muted-foreground">Carregando território...</p>
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
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-0">
      {/* Header Compacto */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/territories">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Territórios
            </Link>
          </Button>
          
          <div className="h-6 w-px bg-border" />
          
          <div className="flex items-center gap-3">
            <div
              className="h-6 w-6 rounded-md flex-shrink-0"
              style={{ backgroundColor: territory.color }}
            />
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  #{territory.number}
                </Badge>
                <h1 className="text-lg font-bold">{territory.name}</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress Badge */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-slate-100 border">
            <span className="text-xs font-medium">Progresso:</span>
            <span className="text-sm font-bold">
              {stats.completed}/{stats.total}
            </span>
            <div className="h-2 w-20 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-600 transition-all"
                style={{ width: `${stats.percentage}%` }}
              />
            </div>
          </div>

          {saving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Salvando...</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Overlay do mobile quando sidebar tá aberta */}
        {showMobileSidebar && (
          <div 
            className="md:hidden fixed inset-0 bg-black/40 z-[1900] transition-opacity" 
            onClick={() => setShowMobileSidebar(false)}
          />
        )}

        {/* MAP - Ocupa a maior parte */}
        <div className="flex-1 relative" style={{ zIndex: 1 }}>
          <TerritoryMap
            territory={territory}
            subdivisions={territory.subdivisions || []}
            editable
            onSubdivisionCreate={handleSubdivisionCreate}
            onSubdivisionUpdate={handleSubdivisionUpdate}
            onSubdivisionDelete={handleSubdivisionDelete}
            onSubdivisionSelect={handleSubdivisionSelect}
            focusedSubdivisionId={focusedSubdivisionId}
          />
          
          {/* Botão Flutuante Mobile para abrir a Sidebar */}
          <Button
            className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] shadow-lg rounded-full px-6 bg-slate-900 hover:bg-slate-800 text-white"
            onClick={() => setShowMobileSidebar(true)}
          >
            <MapPin className="h-4 w-4 mr-2" />
            Painel de Quadras
          </Button>
        </div>

        {/* SIDEBAR - Lista de Subdivisões */}
        <div 
          className={`
            fixed inset-y-0 right-0 z-[2000] w-80 bg-white flex flex-col overflow-hidden shadow-2xl transition-transform duration-300 ease-in-out
            ${showMobileSidebar ? 'translate-x-0' : 'translate-x-full'}
            md:relative md:translate-x-0 md:w-96 md:border-l md:shadow-none
          `}
        >
          {/* Botão Fechar (só mobile) */}
          <div className="md:hidden flex items-center justify-between p-3 border-b bg-slate-100">
            <span className="font-semibold text-sm">Painel de Quadras</span>
            <Button variant="ghost" size="sm" onClick={() => setShowMobileSidebar(false)}>
              Fechar
            </Button>
          </div>
          <Tabs defaultValue="quadras" className="flex flex-col h-full overflow-hidden">
            {/* Sidebar Header with Tabs */}
            <div className="p-3 border-b bg-slate-50">
              <TabsList className="w-full grid grid-cols-2 bg-slate-200/50">
                <TabsTrigger value="quadras" className="text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  Quadras <Badge variant="secondary" className="ml-1 bg-slate-100 text-[10px] px-1 py-0">{territory.subdivisions?.length || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger value="dnv" className="text-xs font-semibold data-[state=active]:bg-red-50 data-[state=active]:text-red-700 data-[state=active]:shadow-sm">
                  Não Visitar <Badge variant="secondary" className="ml-1 bg-white text-[10px] px-1 py-0">{((territory as any).do_not_visits?.length) || 0}</Badge>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="quadras" className="flex-1 flex flex-col m-0 overflow-hidden outline-none data-[state=inactive]:hidden">
              {/* Stats compactos */}
              <div className="grid grid-cols-3 gap-2 text-xs p-3 border-b bg-slate-50/50 shrink-0">
                <div className="flex flex-col items-center p-2 rounded bg-white border">
                  <Clock className="h-3 w-3 text-slate-400 mb-1" />
                  <span className="font-bold">{stats.total - stats.completed}</span>
                  <span className="text-[10px] text-muted-foreground">Pendentes</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded bg-white border">
                  <Check className="h-3 w-3 text-green-600 mb-1" />
                  <span className="font-bold">{stats.completed}</span>
                  <span className="text-[10px] text-muted-foreground">Concluídas</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded bg-white border">
                  <MapPin className="h-3 w-3 text-blue-600 mb-1" />
                  <span className="font-bold">{stats.percentage}%</span>
                  <span className="text-[10px] text-muted-foreground">Progresso</span>
                </div>
              </div>

              {/* Lista de Subdivisões */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {territory.subdivisions?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <MapPin className="h-12 w-12 text-muted-foreground mb-3 opacity-50" />
                    <p className="text-sm font-medium text-slate-700 mb-1">
                      Nenhuma subdivisão criada
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Desenhe polígonos no mapa usando as ferramentas
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
                          group relative rounded-lg border p-3 transition-all cursor-pointer
                          ${isSelected 
                            ? 'border-primary bg-primary/5 shadow-sm' 
                            : 'hover:bg-slate-50 hover:border-slate-300'
                          }
                          ${isCompleted ? 'bg-green-50/50' : ''}
                        `}
                        onClick={() => handleFocusSubdivision(subdivision)}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-sm truncate">
                                {subdivision.name}
                              </span>
                              {isSelected && (
                                <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
                              )}
                            </div>
                            {getStatusBadge(subdivision)}
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleFocusSubdivision(subdivision)
                              }}
                              title="Centralizar no mapa"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Notes */}
                        {subdivision.notes && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                            {subdivision.notes}
                          </p>
                        )}

                        {/* Actions quando selecionada */}
                        {isSelected && (
                          <div className="flex gap-1 pt-2 border-t mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-8 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleSubdivisionStatus(subdivision)
                              }}
                            >
                              {isCompleted ? (
                                <>
                                  <Clock className="h-3 w-3 mr-1" />
                                  Marcar Pendente
                                </>
                              ) : (
                                <>
                                  <Check className="h-3 w-3 mr-1" />
                                  Marcar Concluída
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditSubdivision()
                              }}
                              title="Editar"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSubdivisionDelete(subdivision.id)
                              }}
                              title="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="dnv" className="flex-1 overflow-y-auto p-3 m-0 outline-none data-[state=inactive]:hidden bg-slate-50/30">
              <div className="space-y-3">
                {!(territory as any).do_not_visits || (territory as any).do_not_visits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <MapPin className="h-10 w-10 text-muted-foreground mb-3 opacity-30" />
                    <p className="text-sm text-muted-foreground">
                      Nenhum registro de "Não Visitar".
                    </p>
                  </div>
                ) : (
                  (territory as any).do_not_visits.map((dnv: any) => {
                    const date = new Date(dnv.created_at)
                    const isExpired = new Date().getTime() - date.getTime() > 365 * 24 * 60 * 60 * 1000
                    return (
                      <div key={dnv.id} className={`p-3 rounded-lg border text-sm transition-all ${isExpired ? 'bg-orange-50 border-orange-200' : 'bg-white border-red-100 shadow-sm'}`}>
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h4 className="font-bold text-slate-800 line-clamp-2 leading-tight">
                            {dnv.address || "Endereço não informado"}
                          </h4>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-slate-400 hover:text-primary shrink-0 -mt-1 -mr-1"
                            onClick={(e) => { e.stopPropagation(); handleDnvClick(dnv); }}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {isExpired ? (
                          <Badge variant="outline" className="text-[10px] mb-2 bg-orange-100/50 text-orange-800 border-orange-200">
                            Expirado (Acima de 1 ano)
                          </Badge>
                        ) : (
                          <div className="text-[10px] text-slate-500 mb-2 font-medium">Marcado em: {date.toLocaleDateString("pt-BR")}</div>
                        )}
                        <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                          {dnv.notes || "Sem observações."}
                        </p>
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Assigned User Info */}
          {territory.assigned_to && (
            <div className="p-3 border-t bg-slate-50">
              <p className="text-xs text-muted-foreground mb-1">Designado para:</p>
              <p className="font-medium text-sm">{territory.assigned_to_user?.name || territory.assigned_to}</p>
            </div>
          )}
        </div>
      </div>

      {/* New Subdivision Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="z-[9999]">
          <DialogHeader>
            <DialogTitle>Nova Subdivisão</DialogTitle>
            <DialogDescription>
              Configure os detalhes da subdivisão desenhada
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="subdivisionName">Nome da subdivisão</Label>
              <Input
                id="subdivisionName"
                value={newSubdivisionName}
                onChange={(e) => setNewSubdivisionName(e.target.value)}
                placeholder="Ex: 05-A, Setor Norte, Rua Principal"
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
              disabled={saving || !newSubdivisionName.trim()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subdivision Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="z-[9999]">
          <DialogHeader>
            <DialogTitle>Editar Subdivisão</DialogTitle>
            <DialogDescription>
              Altere o nome e observações
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Nome</Label>
              <Input
                id="editName"
                value={editSubdivisionName}
                onChange={(e) => setEditSubdivisionName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editNotes">Observações (opcional)</Label>
              <Input
                id="editNotes"
                value={editSubdivisionNotes}
                onChange={(e) => setEditSubdivisionNotes(e.target.value)}
                placeholder="Ex: Área comercial, casas numeradas..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveEditSubdivision} 
              disabled={saving || !editSubdivisionName.trim()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DNV Edit Dialog */}
      <Dialog open={dnvDialogOpen} onOpenChange={setDnvDialogOpen}>
        <DialogContent className="z-[9999]">
          <form onSubmit={handleDnvSubmit}>
            <DialogHeader>
              <div className="flex items-center justify-between mt-2">
                <DialogTitle>Editar Não Visitar</DialogTitle>
                <Button type="button" variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 -mr-4 -mt-6" onClick={handleDeleteDnv} disabled={saving}>
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir
                </Button>
              </div>
              <DialogDescription>
                Atualize o endereço ou as observações desta casa bloqueada.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="dnv-address">Endereço (opcional)</Label>
                <Input
                  id="dnv-address"
                  value={dnvFormData.address}
                  onChange={(e) => setDnvFormData({ ...dnvFormData, address: e.target.value })}
                  placeholder="Ex: Rua das Flores, 123"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dnv-notes">Observações</Label>
                <Textarea
                  id="dnv-notes"
                  value={dnvFormData.notes}
                  onChange={(e) => setDnvFormData({ ...dnvFormData, notes: e.target.value })}
                  placeholder="Ex: Morador pediu para não bater no portão."
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDnvDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}