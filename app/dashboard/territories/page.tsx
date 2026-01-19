// app/dashboard/territories/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, Map, Loader2, Pencil, Trash2, Eye, CornerDownRight, CornerUpLeft, Search, X } from "lucide-react"
import type { TerritoryWithDetails, Profile, Campaign } from "@/lib/types"

export default function TerritoriesPage() {
  const supabase = getSupabaseBrowserClient()
  const [territories, setTerritories] = useState<TerritoryWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  
  // Assignment modal
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedTerritory, setSelectedTerritory] = useState<TerritoryWithDetails | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [searchUser, setSearchUser] = useState("")
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    fetchTerritories()
    fetchUsers()
    fetchCampaigns()
  }, [])

  async function fetchTerritories() {
    const { data, error } = await supabase
      .from("territories")
      .select(`
        *,
        group:groups(id, name, color),
        assigned_to_user:profiles!territories_assigned_to_fkey(id, name, email)
      `)
      .order("number")

    if (!error && data) {
      setTerritories(data as unknown as TerritoryWithDetails[])
    }
    setLoading(false)
  }

  async function fetchUsers() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("role", ["dirigente", "publicador"])
      .order("name")
    
    if (data) setUsers(data)
  }

  async function fetchCampaigns() {
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .eq("active", true)
      .order("name")
    
    if (data) setCampaigns(data)
  }

  const handleOpenAssignDialog = (territory: TerritoryWithDetails) => {
    setSelectedTerritory(territory)
    setSelectedUserId(null)
    setSelectedCampaignId(null)
    setSearchUser("")
    setAssignDialogOpen(true)
  }

  const handleAssign = async () => {
    if (!selectedTerritory || !selectedUserId) return
    setAssigning(true)

    try {
      // Create assignment
      const { error: assignError } = await supabase
        .from("assignments")
        .insert({
          territory_id: selectedTerritory.id,
          user_id: selectedUserId,
          campaign_id: selectedCampaignId,
          status: "active",
          assigned_at: new Date().toISOString(),
        })

      if (assignError) throw assignError

      // Update territory assigned_to
      const { error: updateError } = await supabase
        .from("territories")
        .update({ assigned_to: selectedUserId })
        .eq("id", selectedTerritory.id)

      if (updateError) throw updateError

      setAssignDialogOpen(false)
      fetchTerritories()
    } catch (error: any) {
      alert("Erro ao designar território: " + error.message)
    } finally {
      setAssigning(false)
    }
  }

  const handleReturn = async (territory: TerritoryWithDetails) => {
    if (!confirm(`Devolver território ${territory.number} - ${territory.name}?`)) return

    try {
      // Mark assignment as returned
      await supabase
        .from("assignments")
        .update({ 
          status: "returned",
          delivered_at: new Date().toISOString()
        })
        .eq("territory_id", territory.id)
        .eq("status", "active")

      // Clear assigned_to
      await supabase
        .from("territories")
        .update({ assigned_to: null })
        .eq("id", territory.id)

      fetchTerritories()
    } catch (error: any) {
      alert("Erro ao devolver território: " + error.message)
    }
  }

  const handleDelete = async (territory: TerritoryWithDetails) => {
    if (!confirm(`Excluir território ${territory.number} - ${territory.name}?`)) return

    const { error } = await supabase
      .from("territories")
      .delete()
      .eq("id", territory.id)

    if (error) {
      alert("Erro ao excluir: " + error.message)
    } else {
      fetchTerritories()
    }
  }

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.email.toLowerCase().includes(searchUser.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Territórios</h1>
          <p className="text-muted-foreground">
            Gerencie os territórios e suas designações
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/territories/new">
            <Plus className="mr-2 h-4 w-4" />
            Novo Território
          </Link>
        </Button>
      </div>

      {territories.length === 0 ? (
        <Card className="p-12 text-center">
          <Map className="h-12 w-12 text-muted-foreground mb-4 mx-auto" />
          <p className="text-lg font-medium">Nenhum território criado</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {territories.map((territory) => (
            <Card 
              key={territory.id} 
              className="p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => window.location.href = `/dashboard/territories/${territory.id}`}
            >
              <div className="flex items-center justify-between gap-4">
                {/* Left: Info */}
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <Map className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono">
                        {territory.number}
                      </Badge>
                      <span className="font-semibold truncate">
                        {territory.name}
                      </span>
                      {territory.type === "comercial" && (
                        <Badge variant="secondary">Comercial</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                      {territory.group && (
                        <div className="flex items-center gap-1.5">
                          <div 
                            className="h-3 w-3 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: territory.group.color }}
                          />
                          <span>{territory.group.name}</span>
                        </div>
                      )}
                      
                      {territory.assigned_to_user && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs">Designado para:</span>
                          <span className="font-medium">
                            {territory.assigned_to_user.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {territory.assigned_to ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReturn(territory)}
                      title="Devolver território"
                    >
                      <CornerUpLeft className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleOpenAssignDialog(territory)}
                      title="Designar território"
                    >
                      <CornerDownRight className="h-4 w-4" />
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    title="Visualizar"
                  >
                    <Link href={`/dashboard/territories/${territory.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    title="Editar"
                  >
                    <Link href={`/dashboard/territories/${territory.id}/edit`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(territory)}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Designar Território</DialogTitle>
            <DialogDescription>
              {selectedTerritory?.number} - {selectedTerritory?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* User Search */}
            <div className="space-y-2">
              <Label>Designar para *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar dirigente ou publicador..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="pl-9"
                />
                {searchUser && (
                  <button
                    onClick={() => setSearchUser("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>

              {searchUser && (
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">
                      Nenhum usuário encontrado
                    </p>
                  ) : (
                    filteredUsers.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => {
                          setSelectedUserId(user.id)
                          setSearchUser(user.name)
                        }}
                        className={`w-full text-left p-3 hover:bg-muted transition-colors ${
                          selectedUserId === user.id ? "bg-muted" : ""
                        }`}
                      >
                        <p className="font-medium text-sm">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Campaign (optional) */}
            <div className="space-y-2">
              <Label>Campanha (opcional)</Label>
              <select
                value={selectedCampaignId || ""}
                onChange={(e) => setSelectedCampaignId(e.target.value || null)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Nenhuma campanha</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleAssign} 
                disabled={!selectedUserId || assigning}
              >
                {assigning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Designando...
                  </>
                ) : (
                  "Designar"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  )
}