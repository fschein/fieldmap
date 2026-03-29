"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Loader2, MapPin, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface ActiveTerritory {
  id: string
  number: number
  name: string | null
  color: string
  subdivisions: { status: string; completed: boolean }[]
  assignments: {
    id: string
    assigned_at: string
    status: string
    campaign: { name: string } | null
  }[]
}

interface HistoryEntry {
  id: string
  territory_id: string
  assigned_at: string
  returned_at: string | null
  completed_at: string | null
  status: "completed" | "returned"
  territory: {
    number: number
    name: string | null
    color: string
  }
  campaign: { name: string } | null
  final_progress?: number | null
}

function calcProgress(subdivisions: { status: string; completed: boolean }[]): number {
  if (!subdivisions?.length) return 0
  const done = subdivisions.filter((s) => s.completed || s.status === "completed").length
  return Math.round((done / subdivisions.length) * 100)
}

export function MobileTerritoriesView() {
  const { user, isReady } = useAuth()
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [active, setActive] = useState<ActiveTerritory[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)

    try {
      // 1. Carrega Territórios Ativos
      const { data: activeData, error: activeError } = await supabase
        .from("territories")
        .select(`
          id, number, name, color,
          subdivisions(status, completed),
          assignments(id, assigned_at, status, campaign:campaigns(name))
        `)
        .eq("assigned_to", user.id)
        .order("number", { ascending: true })

      if (activeError) {
        console.error("Erro ao carregar territórios ativos:", activeError)
      } else {
        setActive((activeData as unknown as ActiveTerritory[]) || [])
      }

      // 2. Carrega Histórico (sem o campo inexistente final_progress)
      const { data: historyData, error: historyError } = await supabase
        .from("assignments")
        .select(`
          id, assigned_at, returned_at, completed_at, status,
          territory:territories(number, name, color),
          campaign:campaigns(name)
        `)
        .eq("user_id", user.id)
        .in("status", ["completed", "returned"])
        .order("completed_at", { ascending: false, nullsFirst: false })
        .order("returned_at", { ascending: false, nullsFirst: false })
        .limit(15)

      if (historyError) {
        console.error("Erro ao carregar histórico:", historyError)
      } else {
        setHistory((historyData as unknown as HistoryEntry[]) || [])
      }
    } catch (err) {
      console.error("Erro ao carregar territórios:", err)
    } finally {
      setLoading(false)
    }
  }, [user?.id, supabase])

  useEffect(() => {
    if (isReady) fetchData()
  }, [isReady, fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 px-2 py-8 md:p-6 pb-24 max-w-2xl mx-auto animate-in fade-in duration-500">
      <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Territórios</h1>

      {/* Ativos Agora */}
      <section className="space-y-3">
        <h2 className="text-[12px] font-bold text-slate-400 uppercase tracking-widest px-1">Ativos agora</h2>
        {active.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
            <MapPin className="h-8 w-8 opacity-20" />
            <p className="text-xs font-medium">Nenhum território ativo</p>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((t) => {
              const progress = calcProgress(t.subdivisions)
              const assignmentAt = t.assignments?.find(a => a.status === 'active')?.assigned_at
              const days = assignmentAt ? Math.ceil((Date.now() - new Date(assignmentAt).getTime()) / (1000 * 60 * 60 * 24)) : 0
              const isOverdue = days > 90

              return (
                <div
                  key={t.id}
                  onClick={() => router.push(`/dashboard/my-assignments/${t.id}/map`)}
                  className={cn(
                    "bg-white p-4 rounded-xl mx-0 space-y-3 shadow-sm border transition-all active:scale-[0.98] cursor-pointer",
                    isOverdue ? "border-red-200 bg-red-50/10" : "border-slate-100"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full shadow-inner" style={{ backgroundColor: t.color || '#C65D3B' }} />
                      <span className="font-extrabold text-slate-900 text-base">Território {t.number}</span>
                    </div>
                    <div className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded-full border",
                      progress > 60 ? "bg-green-50 text-green-600 border-green-500/10" : "bg-red-50 text-red-600 border-red-500/10"
                    )}>
                      {progress}%
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all rounded-full", progress > 60 ? "bg-green-500" : "bg-red-500")}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Histórico */}
      <section className="space-y-3">
        <h2 className="text-[13px] font-bold text-slate-400 uppercase tracking-widest px-1">Histórico</h2>
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
          {history.length === 0 ? (
            <p className="p-10 text-center text-xs text-slate-400">Nenhum registro encontrado.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {history.map((h) => {
                const date = h.completed_at || h.returned_at
                const isCompleted = h.status === "completed"
                const progress = h.final_progress ?? (isCompleted ? 100 : 0)

                return (
                  <div key={h.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-slate-200" />
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-900 text-[15px]">Território {h.territory?.number}</p>
                        <p className="text-[13px] text-slate-400 font-bold uppercase tracking-tight">
                          {isCompleted ? 'Concluído' : 'Devolvido'} • {date ? format(new Date(date), "MMM yyyy", { locale: ptBR }) : '-'}
                        </p>
                      </div>
                    </div>
                    <div className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded-full border shadow-sm",
                      progress >= 100
                        ? "bg-slate-50 text-slate-500 border-slate-100"
                        : "bg-orange-50 text-orange-600 border-orange-100"
                    )}>
                      {progress}%
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
