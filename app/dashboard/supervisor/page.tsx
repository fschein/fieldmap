"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { 
  Loader2, 
  MapPin, 
  CheckCircle, 
  Clock, 
  Search,
  Users,
  ShieldCheck,
  ChevronRight
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

const supabase = getSupabaseBrowserClient()

export default function SupervisorDashboard() {
  const { user, profile, isSupervisor, isReady } = useAuth()
  const router = useRouter()
  
  const [territories, setTerritories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    
    // Busca territórios com seus dados de designação atual
    const { data: territoriesData, error: tError } = await supabase
      .from("territories")
      .select(`
        id, 
        name, 
        number, 
        status, 
        assigned_to,
        group_id,
        profiles:assigned_to(name),
        groups:group_id(name)
      `)
      .order("number", { ascending: true })

    if (tError) {
      console.error("Error fetching supervisor data:", tError)
    } else {
      setTerritories(territoriesData || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isReady) {
      if (!isSupervisor) {
        router.push("/dashboard/my-assignments")
        return
      }
      fetchData()
    }
  }, [isReady, isSupervisor, fetchData, router])

  if (!isReady || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
      </div>
    )
  }

  const activeTerritories = territories.filter(t => t.assigned_to && t.status !== 'inactive')
  const freeTerritories = territories.filter(t => !t.assigned_to && t.status !== 'inactive')

  const filteredInUse = activeTerritories.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.number.includes(search) ||
    t.profiles?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredFree = freeTerritories.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.number.includes(search)
  )

  return (
    <div className="space-y-6 pb-24 px-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">Gestão</h1>
          <p className="text-xs text-muted-foreground font-medium">Controle de territórios em campo</p>
        </div>
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
          <p className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground mb-1">Em Campo</p>
          <div className="text-2xl font-black text-foreground">{activeTerritories.length}</div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
          <p className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground mb-1">Livres</p>
          <div className="text-2xl font-black text-foreground">{freeTerritories.length}</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar por nome ou número..." 
          className="pl-9 h-11 bg-card border-border rounded-xl text-sm focus-visible:ring-primary"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* In Use List */}
      <div className="space-y-4">
        <h3 className="text-[0.6875rem] font-black uppercase tracking-[0.2em] text-muted-foreground px-1 flex items-center gap-2">
          <Clock className="h-3 w-3" /> Quem está com o quê ({filteredInUse.length})
        </h3>
        <div className="space-y-2">
          {filteredInUse.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground bg-card rounded-2xl border border-dashed border-border">
              {search ? "Nenhum resultado para a busca" : "Ninguém em campo no momento"}
            </div>
          ) : (
            filteredInUse.map((t) => (
              <div 
                key={t.id} 
                className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 transition-all active:scale-[0.98] hover:border-primary/30 shadow-sm"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-foreground text-lg leading-none mb-1">
                    {t.number}
                  </p>
                  <p className="text-[0.625rem] font-black text-primary truncate uppercase tracking-widest">
                    {t.profiles?.name || "Desconhecido"}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Free List */}
      <div className="space-y-4">
        <h3 className="text-[0.6875rem] font-black uppercase tracking-[0.2em] text-muted-foreground px-1 flex items-center gap-2">
          <MapPin className="h-3 w-3" /> Territórios Livres ({filteredFree.length})
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {filteredFree.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground bg-card rounded-2xl border border-dashed border-border col-span-full">
              {search ? "Nenhum resultado para a busca" : "Todos os territórios estão em campo!"}
            </div>
          ) : (
            filteredFree.map((t) => (
              <div 
                key={t.id} 
                className="bg-card rounded-2xl border border-border p-3 flex items-center gap-3 transition-all hover:border-primary/20"
              >
                <div className="h-8 w-8 rounded-lg bg-background border border-border flex items-center justify-center font-black text-xs text-muted-foreground">
                  {t.number}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {t.name}
                  </p>
                </div>
                <Badge variant="outline" className="text-[0.5625rem] font-black uppercase tracking-wider border-primary/20 text-primary bg-primary/5">
                  Livre
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
