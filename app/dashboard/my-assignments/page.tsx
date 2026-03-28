"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, MapPin, CheckCircle2, Calendar, TrendingUp, AlertCircle, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface TerritoryAssignment extends TerritoryWithSubdivisions {
  assignments: { assigned_at: string; status: string }[]
  status: string
}

export default function MyAssignmentsPage() {
  const { user, profile, isReady } = useAuth()
  const [territories, setTerritories] = useState<TerritoryAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const fetchMyAssignments = useCallback(async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      // Buscar territórios atribuídos ao usuário com status 'assigned'
      const { data: territoriesData, error: territoriesError } = await supabase
        .from("territories")
        .select(`
          *,
          campaign:campaigns(*),
          subdivisions(*),
          assignments(*)
        `)
        .eq("assigned_to", user.id)
        .order("number", { ascending: true })

      if (territoriesError) {
        console.error("Erro ao buscar territórios:", territoriesError)
        throw territoriesError
      }

      const territoriesWithProgress = territoriesData || []
      setTerritories(territoriesWithProgress)
      
      // Cache para uso offline
      localStorage.setItem("my_assignments_cache", JSON.stringify(territoriesWithProgress))
    } catch (error: any) {
      console.error("Erro ao carregar designações:", error?.message || error)
      
      // Tentar carregar do cache se estiver offline ou der erro
      const cached = localStorage.getItem("my_assignments_cache")
      if (cached) {
        setTerritories(JSON.parse(cached))
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id, supabase])

  useEffect(() => {
    if (isReady) {
      fetchMyAssignments()
      
      // Cooldown check
      const lastRequest = localStorage.getItem("last_territory_request")
      if (lastRequest) {
        const diff = Date.now() - parseInt(lastRequest)
        const fiveMin = 5 * 60 * 1000
        if (diff < fiveMin) {
          setCooldown(Math.ceil((fiveMin - diff) / 1000))
        }
      }
    }
  }, [isReady, fetchMyAssignments])

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  const calculateDaysWithTerritory = (territory: TerritoryAssignment) => {
    const activeAssignment = territory.assignments?.find(a => a.status === 'active')
    const assignedAt = activeAssignment?.assigned_at
    
    if (!assignedAt) return 0
    const diffTime = Math.abs(new Date().getTime() - new Date(assignedAt).getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const calculateProgress = (subdivisions?: Subdivision[]): number => {
    if (!subdivisions || subdivisions.length === 0) return 0
    const completed = subdivisions.filter(s => s.status === "completed" || s.completed).length
    return Math.round((completed / subdivisions.length) * 100)
  }

  const getProgressColor = (progress: number): string => {
    if (progress === 0) return "bg-slate-200"
    if (progress < 30) return "bg-red-500"
    if (progress < 70) return "bg-yellow-500"
    return "bg-green-500"
  }

  const handleOpenMap = (territory: TerritoryAssignment) => {
    router.push(`/dashboard/my-assignments/${territory.id}/map`)
  }

  const handleRequestTerritory = async () => {
    if (!user?.id || !profile?.name || requesting || cooldown > 0) return
    setRequesting(true)
    try {
      const { error } = await supabase.from("notifications").insert({
        type: "request",
        title: "Pedido de Território",
        message: `${profile.name} está solicitando um novo território para trabalhar.`,
        created_by: user.id,
      })
      if (error) throw error

      // Enviar notificação push para administradores
      fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "admin",
          title: "Novo Pedido de Território",
          message: `${profile.name} solicitou um novo território.`,
          url: "/dashboard/assignments"
        })
      }).catch(err => console.error("Erro ao disparar push:", err))

      localStorage.setItem("last_territory_request", Date.now().toString())
      setCooldown(300) // 5 minutes
      toast.success("Pedido enviado! O administrador será notificado.")
    } catch (e: any) {
      toast.error("Não foi possível enviar o pedido. Tente novamente.")
    } finally {
      setRequesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (territories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="rounded-full bg-slate-100 p-6">
          <MapPin className="h-12 w-12 text-slate-400" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold text-slate-900">Nenhum território designado</h3>
          <p className="text-base text-slate-500 max-w-md">
            Você não possui territórios atribuídos no momento.
          </p>
        </div>
        <Button 
          onClick={handleRequestTerritory} 
          disabled={requesting || cooldown > 0} 
          className="mt-2 bg-[#C65D3B] hover:bg-[#A84F32] text-white border-none shadow-md"
        >
          {requesting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <AlertCircle className="h-4 w-4 mr-2" />
          )}
          {cooldown > 0 ? `Aguarde ${Math.floor(cooldown / 60)}:${(cooldown % 60).toString().padStart(2, '0')}` : "Pedir Novo Território"}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Minhas Designações</h1>
          <p className="text-base text-muted-foreground">
            Acompanhe o progresso de cada território
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRequestTerritory} 
          disabled={requesting || cooldown > 0}
          className={cn(
            "border-primary text-primary hover:bg-primary/5 font-semibold transition-all",
            cooldown > 0 && "opacity-50 cursor-not-allowed"
          )}
        >
          {requesting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <AlertCircle className="h-4 w-4 mr-2" />
          )}
          {cooldown > 0 ? `Pedido enviado (${Math.floor(cooldown / 60)}:${(cooldown % 60).toString().padStart(2, '0')})` : "Pedir Novo Território"}
        </Button>
      </div>

      {/* Estatísticas Rápidas */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Progresso Médio</p>
              <div className="text-2xl font-bold text-slate-900">
                {territories.length > 0 ? Math.round(
                  territories.reduce((acc, t) => acc + calculateProgress(t.subdivisions), 0) / territories.length
                ) : 0}%
              </div>
            </div>
            <div className="h-10 w-10 bg-blue-50/50 rounded-full flex items-center justify-center border border-blue-100">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Quadras Concluídas</p>
              <div className="text-2xl font-bold text-slate-900">
                {territories.reduce(
                  (acc, t) => acc + (t.subdivisions?.filter(s => s.completed || s.status === 'completed').length || 0),
                  0
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                de {territories.reduce((acc, t) => acc + (t.subdivisions?.length || 0), 0)} totais
              </p>
            </div>
            <div className="h-10 w-10 bg-green-50/50 rounded-full flex items-center justify-center border border-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Territórios */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {territories.map((territory) => {
          const progress = calculateProgress(territory.subdivisions)
          const days = calculateDaysWithTerritory(territory)
          const isOverdue = days > 90
          const completedSubdivisions = territory.subdivisions?.filter(
            s => s.completed || s.status === 'completed'
          ).length || 0
          const totalSubdivisions = territory.subdivisions?.length || 0

          return (
            <Card 
              key={territory.id} 
              className="hover:shadow-md transition-all shadow-sm flex flex-col cursor-pointer border-slate-200 hover:border-slate-300 relative overflow-hidden group active:scale-[0.98]"
              onClick={() => handleOpenMap(territory)}
            >
              {/* Seta indicadora à direita (Terracota) */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/50 group-hover:text-primary transition-colors transform group-hover:-translate-x-1">
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              
              {/* Highlight Esquerdo (Terracota) */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary/20 group-hover:bg-primary transition-colors" />

              <CardHeader className="p-4 pl-5 pb-2 pr-12">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 pr-2">
                    <CardTitle className="text-lg sm:text-xl text-slate-800">
                      Território {territory.number}
                    </CardTitle>
                    {territory.name && <CardDescription className="text-sm line-clamp-1">{territory.name}</CardDescription>}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-lg text-slate-700">{progress}%</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 pl-5 pt-0 space-y-3 flex-1 flex flex-col justify-end pr-12">
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{days} {days === 1 ? 'dia' : 'dias'}</span>
                    {isOverdue && <span className="text-red-500 font-bold ml-1 text-xs uppercase tracking-wider">Atraso</span>}
                  </div>
                  {territory.campaign && (
                    <Badge variant="outline" className="text-[10px] sm:text-xs bg-slate-50 border-slate-200 text-slate-600">
                      {territory.campaign.name}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5 mt-2">
                  <div className="w-full h-2 rounded-full overflow-hidden bg-slate-100">
                    <div className="h-full bg-green-500 transition-all rounded-full" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 font-medium tracking-tight">
                    {completedSubdivisions} de {totalSubdivisions} quadras finalizadas
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
