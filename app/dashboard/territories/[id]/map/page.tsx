"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArrowLeft, Loader2, Save, MapPin } from "lucide-react"
import type { TerritoryWithBlocks, Block } from "@/lib/types"

// Dynamic import for map to avoid SSR issues
const TerritoryMap = dynamic(
  () => import("@/components/map/territory-map").then((mod) => mod.TerritoryMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
  const [territory, setTerritory] = useState<TerritoryWithBlocks | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newBlockName, setNewBlockName] = useState("")
  const [pendingCoordinates, setPendingCoordinates] = useState<[number, number][][] | null>(null)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    fetchTerritory()
  }, [id])

  async function fetchTerritory() {
    const { data } = await supabase
      .from("territories")
      .select(`
        *,
        blocks(*),
        campaign:campaigns(*)
      `)
      .eq("id", id)
      .single()

    if (data) {
      setTerritory(data as TerritoryWithBlocks)
    }
    setLoading(false)
  }

  const handleBlockCreate = async (coordinates: [number, number][][]) => {
    setPendingCoordinates(coordinates)
    const blockCount = territory?.blocks?.length || 0
    setNewBlockName(`Quadra ${blockCount + 1}`)
    setDialogOpen(true)
  }

  const handleSaveNewBlock = async () => {
    if (!pendingCoordinates || !newBlockName.trim()) return
    setSaving(true)

    await supabase.from("blocks").insert({
      territory_id: id,
      name: newBlockName,
      coordinates: pendingCoordinates,
      status: "available",
    })

    setDialogOpen(false)
    setPendingCoordinates(null)
    setNewBlockName("")
    setSaving(false)
    fetchTerritory()
  }

  const handleBlockUpdate = async (blockId: string, coordinates: [number, number][][]) => {
    setSaving(true)
    await supabase
      .from("blocks")
      .update({ coordinates })
      .eq("id", blockId)
    setSaving(false)
    fetchTerritory()
  }

  const handleBlockDelete = async (blockId: string) => {
    setSaving(true)
    await supabase.from("blocks").delete().eq("id", blockId)
    setSaving(false)
    fetchTerritory()
  }

  const handleBlockSelect = (block: Block) => {
    setSelectedBlock(block)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-500 hover:bg-green-600">Disponível</Badge>
      case "assigned":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Designada</Badge>
      case "completed":
        return <Badge variant="secondary">Concluída</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!territory) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Território não encontrado</p>
        <Button asChild className="mt-4">
          <Link href="/dashboard/territories">Voltar</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/dashboard/territories/${id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <div
                className="h-4 w-4 rounded-full"
                style={{ backgroundColor: territory.color }}
              />
              <h1 className="text-2xl font-bold">{territory.name}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Editor de Mapa | {territory.blocks?.length || 0} quadras
            </p>
          </div>
        </div>
        {saving && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Salvando...
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Map */}
        <div className="flex-1 rounded-lg border overflow-hidden">
          <TerritoryMap
            territory={territory}
            blocks={territory.blocks || []}
            editable
            onBlockCreate={handleBlockCreate}
            onBlockUpdate={handleBlockUpdate}
            onBlockDelete={handleBlockDelete}
            onBlockSelect={handleBlockSelect}
          />
        </div>

        {/* Sidebar */}
        <Card className="w-80 overflow-hidden flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quadras</CardTitle>
            <CardDescription>
              {territory.blocks?.length || 0} quadras no território
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {territory.blocks?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Desenhe quadras no mapa usando as ferramentas
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {territory.blocks?.map((block) => (
                  <div
                    key={block.id}
                    className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedBlock?.id === block.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => handleBlockSelect(block)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{block.name}</span>
                      {getStatusBadge(block.status)}
                    </div>
                    {block.notes && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {block.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Block Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Quadra</DialogTitle>
            <DialogDescription>
              Dê um nome para a quadra que você desenhou
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="blockName">Nome da quadra</Label>
              <Input
                id="blockName"
                value={newBlockName}
                onChange={(e) => setNewBlockName(e.target.value)}
                placeholder="Ex: Quadra 1, Rua Principal"
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
            <Button onClick={handleSaveNewBlock} disabled={saving || !newBlockName.trim()}>
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
    </div>
  )
}
