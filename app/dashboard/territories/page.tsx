// ============================================================================
// app/dashboard/territories/page.tsx - DASHBOARD ESTRATÉGICO
// ============================================================================
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog"
import { 
  Plus, 
  Map, 
  Loader2, 
  MapPin, 
  User, 
  Calendar,
  AlertTriangle,
  TrendingUp,
  Search,
  X,
  Sparkles,
  Clock
} from "lucide-react"
import type { Profile, Campaign, Subdivision } from "@/lib/types"
import { Separator } from "@radix-ui/react-select"

// ============================================================================
// INTERFACES
// ============================================================================

interface TerritoryWithDetails {
  id: string
  number: string
  name: string
  type: string
  color: string
  description?: string
  assigned_to: string | null
  last_completed_at: string | null
  created_at: string
  group?: {
    id: string
    name: string
    color: string
  }
  assigned_to_user?: {
    id: string
    name: string
    email: string
  }
  subdivisions?: Subdivision[]
}

interface PriorityScore {
  territory: TerritoryWithDetails
  score: number
  daysInactive: number
  priority: 'critical' | 'high' | 'medium' | 'low'
  reason: string
}

// ============================================================================
// FUNÇÕES DE CÁLCULO
// ============================================================================

function calculatePriorityScore(territory: TerritoryWithDetails): PriorityScore {
  const now = new Date()
  let score = 0
  let daysInactive = 0
  let priority: 'critical' | 'high' | 'medium' | 'low' = 'low'
  let reason = ''

  // Calcula dias de inatividade
  if (territory.last_completed_at) {
    const lastCompleted = new Date(territory.last_completed_at)
    daysInactive = Math.floor((now.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24))
  } else {
    // Se nunca foi trabalhado, usa a data de criação
    const createdAt = new Date(territory.created_at)
    daysInactive = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Calcula score baseado em dias inativos
  if (daysInactive > 180) { // 6 meses
    score = 100
    priority = 'critical'
    reason = `Não trabalhado há ${Math.floor(daysInactive / 30)} meses`
  } else if (daysInactive > 120) { // 4 meses
    score = 75
    priority = 'high'
    reason = `Inativo há ${Math.floor(daysInactive / 30)} meses`
  } else if (daysInactive > 60) { // 2 meses
    score = 50
    priority = 'medium'
    reason = 'Precisa de atenção'
  } else {
    score = 25
    priority = 'low'
    reason = 'Em dia'
  }

  // Bonus: território nunca designado
  if (!territory.last_completed_at) {
    score += 10
    reason = 'Nunca foi trabalhado'
  }

  // Penalidade: já está designado
  if (territory.assigned_to) {
    score -= 50
  }

  return {
    territory,
    score: Math.max(0, score),
    daysInactive,
    priority,
    reason
  }
}

function getProgressStats(subdivisions?: Subdivision[]) {
  if (!subdivisions || subdivisions.length === 0) {
    return { completed: 0, total: 0, percentage: 0 }
  }

  const completed = subdivisions.filter(s => s.completed || s.status === 'completed').length
  const total = subdivisions.length
  const percentage = Math.round((completed / total) * 100)

  return { completed, total, percentage }
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function TerritoriesPage() {
  const supabase = getSupabaseBrowserClient()
  const [territories, setTerritories] = useState<TerritoryWithDetails[]>([])
  const [priorityTerritories, setPriorityTerritories] = useState<PriorityScore[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  
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
        assigned_to_user:profiles!territories_assigned_to_fkey(id, name, email),
        subdivisions(id, territory_id, completed, status, name)
      `)
      .order("number")

    if (!error && data) {
      const territoriesData = data as unknown as TerritoryWithDetails[]
      setTerritories(territoriesData)

      // Calcula prioridades
      const priorities = territoriesData
        .map(t => calculatePriorityScore(t))
        .sort((a, b) => b.score - a.score)

      setPriorityTerritories(priorities)
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

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.email.toLowerCase().includes(searchUser.toLowerCase())
  )

  const filteredTerritories = territories.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.number.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Top 3 sugestões (territórios livres com maior prioridade)
  const topSuggestions = priorityTerritories
    .filter(p => !p.territory.assigned_to)
    .slice(0, 3)

  const getPriorityBadge = (priority: PriorityScore['priority']) => {
    switch (priority) {
      case 'critical':
        return <Badge className="bg-red-600 text-white">Crítico</Badge>
      case 'high':
        return <Badge className="bg-orange-500 text-white">Alta</Badge>
      case 'medium':
        return <Badge className="bg-yellow-500 text-white">Média</Badge>
      default:
        return <Badge variant="outline">Baixa</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Territórios</h1>
          <p className="text-muted-foreground">
            Dashboard estratégico de gerenciamento
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/territories/new">
            <Plus className="mr-2 h-4 w-4" />
            Novo Território
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <Map className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{territories.length}</div>
            <p className="text-xs text-muted-foreground">territórios cadastrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Designados</span>
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {territories.filter(t => t.assigned_to).length}
            </div>
            <p className="text-xs text-muted-foreground">em campo agora</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Disponíveis</span>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {territories.filter(t => !t.assigned_to).length}
            </div>
            <p className="text-xs text-muted-foreground">prontos para designação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Críticos</span>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {priorityTerritories.filter(p => p.priority === 'critical').length}
            </div>
            <p className="text-xs text-muted-foreground">&gt;6 meses inativos</p>
          </CardContent>
        </Card>
      </div>

      {/* Sugestões de Designação */}
      {topSuggestions.length > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Sugestões de Designação</h2>
              <Badge variant="secondary" className="ml-2">Top 3</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Territórios prioritários disponíveis para designação
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {topSuggestions.map((priority, index) => {
                const stats = getProgressStats(priority.territory.subdivisions)
                
                return (
                  <Card key={priority.territory.id} className="border-2 hover:border-primary transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                            {index + 1}
                          </div>
                          <Badge variant="outline" className="font-mono text-xs">
                            #{priority.territory.number}
                          </Badge>
                        </div>
                        {getPriorityBadge(priority.priority)}
                      </div>
                      
                      <h3 className="font-semibold text-sm mb-1 truncate">
                        {priority.territory.name}
                      </h3>
                      
                      <p className="text-xs text-muted-foreground mb-3">
                        {priority.reason}
                      </p>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                        <Clock className="h-3 w-3" />
                        <span>{priority.daysInactive} dias inativo</span>
                      </div>

                      <div className="space-y-1 mb-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Subdivisões</span>
                          <span className="font-semibold">{stats.completed}/{stats.total}</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-600 transition-all"
                            style={{ width: `${stats.percentage}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => handleOpenAssignDialog(priority.territory)}
                        >
                          Designar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          asChild
                        >
                          <Link href={`/dashboard/territories/${priority.territory.id}/map`}>
                            <MapPin className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredTerritories.length} resultado{filteredTerritories.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid de Territórios */}
      {filteredTerritories.length === 0 ? (
        <Card className="p-12 text-center">
          <Map className="h-12 w-12 text-muted-foreground mb-4 mx-auto" />
          <p className="text-lg font-medium">Nenhum território encontrado</p>
          <p className="text-sm text-muted-foreground mb-4">
            {searchTerm ? 'Tente uma busca diferente' : 'Crie seu primeiro território'}
          </p>
          {!searchTerm && (
            <Button asChild>
              <Link href="/dashboard/territories/new">
                <Plus className="mr-2 h-4 w-4" />
                Novo Território
              </Link>
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTerritories.map((territory) => {
            const priority = priorityTerritories.find(p => p.territory.id === territory.id)
            const stats = getProgressStats(territory.subdivisions)
            const isOverdue = priority && priority.daysInactive > 180

            return (
              <Card 
                key={territory.id} 
                className={`
                  hover:shadow-md transition-all
                  ${isOverdue ? 'border-red-300 bg-red-50/30' : ''}
                `}
              >
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div 
                        className="h-8 w-8 rounded-md flex-shrink-0"
                        style={{ backgroundColor: territory.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge variant="outline" className="font-mono text-xs">
                            #{territory.number}
                          </Badge>
                          {priority && getPriorityBadge(priority.priority)}
                        </div>
                        <h3 className="font-semibold text-sm truncate">
                          {territory.name}
                        </h3>
                      </div>
                    </div>
                  </div>

                  {/* Alert se crítico */}
                  {isOverdue && (
                    <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-red-100 border border-red-200">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                      <span className="text-xs text-red-700 font-medium">
                        {priority.reason}
                      </span>
                    </div>
                  )}

                  {/* Group */}
                  {territory.group && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <div 
                        className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: territory.group.color }}
                      />
                      <span className="truncate">{territory.group.name}</span>
                    </div>
                  )}

                  {/* Assigned User */}
                  {territory.assigned_to_user ? (
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 border border-blue-200 flex-1 min-w-0">
                        <User className="h-3 w-3 text-blue-600 flex-shrink-0" />
                        <span className="text-xs font-medium text-blue-700 truncate">
                          {territory.assigned_to_user.name}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 italic">
                      <User className="h-3 w-3" />
                      <span>Não designado</span>
                    </div>
                  )}

                  {/* Progress */}
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">
                        Subdivisões
                      </span>
                      <span className="font-semibold">
                        {stats.completed}/{stats.total}
                        {stats.total > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({stats.percentage}%)
                          </span>
                        )}
                      </span>
                    </div>
                    
                    {stats.total > 0 ? (
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${
                            stats.percentage === 100 
                              ? 'bg-green-600' 
                              : stats.percentage > 0 
                              ? 'bg-blue-600' 
                              : 'bg-slate-300'
                          }`}
                          style={{ width: `${stats.percentage}%` }}
                        />
                      </div>
                    ) : (
                      <div className="h-2 bg-slate-200 rounded-full flex items-center justify-center">
                        <span className="text-[8px] text-muted-foreground font-medium">
                          Sem subdivisões
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Dias inativo */}
                  {priority && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                      <Clock className="h-3 w-3" />
                      <span>
                        {priority.daysInactive} dia{priority.daysInactive !== 1 ? 's' : ''} desde última conclusão
                      </span>
                    </div>
                  )}

                  <Separator className="my-3" />

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1 h-8 text-xs"
                      asChild
                    >
                      <Link href={`/dashboard/territories/${territory.id}/map`}>
                        <MapPin className="mr-1.5 h-3.5 w-3.5" />
                        Abrir Mapa
                      </Link>
                    </Button>
                    
                    {!territory.assigned_to && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => handleOpenAssignDialog(territory)}
                      >
                        <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
                        Designar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md z-[9999]">
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