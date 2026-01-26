"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Loader2, Printer } from "lucide-react"

interface Profile {
  name: string
}

interface Assignment {
  id: string
  status: string
  assigned_at: string
  completed_at: string | null
  profiles: Profile | null
}

interface TerritoryData {
  id: string
  name: string
  number: string | null
  color?: string
  assignments: Assignment[]
}

export default function ReportsPage() {
  const { isReady } = useAuth()
  const [data, setData] = useState<TerritoryData[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<"6" | "12" | "all">("12")
  const supabase = getSupabaseBrowserClient()

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from("assignments")
        .select(`
          id, status, assigned_at, completed_at, territory_id,
          profiles!assignments_user_id_fkey ( name )
        `)
        .order('assigned_at', { ascending: false })

      if (assignmentsError) {
        console.error("Erro assignments:", assignmentsError)
        throw assignmentsError
      }

      const { data: territoriesData, error: territoriesError } = await supabase
        .from("territories")
        .select('id, name, number, color')
        .order('number', { ascending: true })

      if (territoriesError) {
        console.error("Erro territories:", territoriesError)
        throw territoriesError
      }

      const combined: TerritoryData[] = territoriesData.map((territory: { id: any; name: any; number: any; color: any }) => ({
        id: territory.id,
        name: territory.name,
        number: territory.number,
        color: territory.color,
        assignments: assignmentsData
          .filter((a: { territory_id: any }) => a.territory_id === territory.id)
          .map((a: { id: any; status: any; assigned_at: any; completed_at: any; profiles: any }) => ({
            id: a.id,
            status: a.status,
            assigned_at: a.assigned_at,
            completed_at: a.completed_at,
            profiles: a.profiles
          }))
      }))

      setData(combined)
    } catch (error: any) {
      console.error("Erro no fetchStats:", error?.message || error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (isReady) fetchStats()
  }, [isReady, fetchStats])

  const getFilteredAssignments = (territory: TerritoryData) => {
    const all = territory.assignments || []
    if (period === "all") {
      return all.sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())
    }

    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - parseInt(period))
    
    return all
      .filter(as => new Date(as.assigned_at) >= cutoff)
      .sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  const calculateDays = (start: string, end: string | null) => {
    const startDate = new Date(start)
    const endDate = end ? new Date(end) : new Date()
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-full mx-auto p-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between print:hidden border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registro de Cobertura</h1>
          <p className="text-sm text-muted-foreground">Histórico de designações por território</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Últimos 6 Meses</SelectItem>
              <SelectItem value="12">Últimos 12 Meses</SelectItem>
              <SelectItem value="all">Histórico Completo</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Lista de Territórios Compacta - Estilo Excel */}
      <div className="space-y-2 print:space-y-1">
        {data.map((territory) => {
          const history = getFilteredAssignments(territory)
          const completedCount = history.filter(a => a.status === 'completed').length
          const isActive = history.some(a => a.status === 'active' || a.status === 'in_progress')

          return (
            <div 
              key={territory.id} 
              className="border border-slate-300 rounded-md overflow-hidden bg-white print:border-slate-400 print:break-inside-avoid"
            >
              {/* Header Compacto do Território */}
              <div className="bg-slate-100 px-3 py-2 flex items-center justify-between border-b border-slate-300">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-slate-800 text-white font-bold text-xs px-2 py-0.5 rounded min-w-[35px] text-center">
                      {territory.number || '—'}
                    </div>
                    {territory.color && (
                      <div 
                        className="w-2.5 h-2.5 rounded-full ring-2 ring-slate-300"
                        style={{ backgroundColor: territory.color }}
                      />
                    )}
                    <h3 className="font-semibold text-sm text-slate-800">{territory.name}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isActive && (
                    <Badge className="bg-blue-600 text-white text-[10px] h-5 print:hidden">Em Campo</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] h-5">
                    {completedCount}x
                  </Badge>
                </div>
              </div>

              {/* Timeline Horizontal - Estilo Excel */}
              <div className="p-2">
                {history.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1 print:flex-wrap">
                    {history.map((assignment) => {
                      const days = calculateDays(assignment.assigned_at, assignment.completed_at)
                      const isOverdue = days > 90 && !assignment.completed_at
                      const statusColor = 
                        assignment.status === 'completed' ? 'bg-green-500' :
                        assignment.status === 'active' || assignment.status === 'in_progress' ? 'bg-blue-500' :
                        'bg-orange-500'

                      return (
                        <div
                          key={assignment.id}
                          className={`
                            flex-shrink-0 w-[140px] p-2 rounded border
                            print:w-[120px] print:p-1.5
                            ${assignment.status === 'completed' ? 'bg-green-50/50 border-green-200' :
                              assignment.status === 'active' || assignment.status === 'in_progress' ? 'bg-blue-50/50 border-blue-200' :
                              'bg-orange-50/50 border-orange-200'}
                            ${isOverdue ? 'ring-2 ring-red-300' : ''}
                          `}
                        >
                          {/* Status dot + Nome */}
                          <div className="flex items-start gap-1.5 mb-1">
                            <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${statusColor}`} />
                            <span className="text-[11px] font-medium text-slate-700 leading-tight line-clamp-2 print:text-[9px]">
                              {assignment.profiles?.name || 'Não atribuído'}
                            </span>
                          </div>

                          {/* Datas */}
                          <div className="text-[10px] text-slate-500 space-y-0.5 print:text-[8px]">
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">↓</span>
                              <span className="font-mono">{formatDate(assignment.assigned_at)}</span>
                            </div>
                            {assignment.completed_at && (
                              <div className="flex items-center gap-1">
                                <span className="text-slate-400">↑</span>
                                <span className="font-mono">{formatDate(assignment.completed_at)}</span>
                              </div>
                            )}
                          </div>

                          {/* Duração */}
                          <div className={`
                            text-[10px] font-semibold mt-1 print:text-[8px]
                            ${isOverdue ? 'text-red-600' : 'text-slate-500'}
                          `}>
                            {days}d
                            {isOverdue && <span className="ml-1">⚠️</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-3 text-xs text-slate-400 print:py-1.5 print:text-[10px]">
                    Sem registros no período
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Rodapé */}
      <div className="text-center text-xs text-slate-400 pt-4 border-t print:pt-2 print:text-[9px]">
        Gerado em {new Date().toLocaleString("pt-BR")} • Sistema de Gestão de Territórios
      </div>

      {/* Estilos de impressão */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print\\:break-inside-avoid {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}