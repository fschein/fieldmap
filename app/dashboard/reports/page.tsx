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

  const getPeriodLabel = () => {
    switch(period) {
      case "6": return "Últimos 6 Meses"
      case "12": return "Últimos 12 Meses"
      case "all": return "Histórico Completo"
      default: return ""
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-full mx-auto p-4 print:p-0">
      {/* Cabeçalho para Impressão - Visível apenas no PDF */}
      <div className="hidden print:block print-header">
        <div className="border-b-2 border-slate-800 pb-3 mb-4">
          <h1 className="text-2xl font-bold text-slate-900">Relatório de Territórios</h1>
          <div className="flex justify-between items-center mt-2 text-sm text-slate-600">
            <span>Registro de Cobertura - {getPeriodLabel()}</span>
            <span>Gerado em: {new Date().toLocaleDateString("pt-BR", { 
              day: '2-digit', 
              month: '2-digit', 
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</span>
          </div>
        </div>
      </div>

      {/* Cabeçalho - Visível apenas na tela */}
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

      {/* Lista de Territórios */}
      <div className="space-y-2 print:space-y-3">
        {data.map((territory) => {
          const history = getFilteredAssignments(territory)
          const completedCount = history.filter(a => a.status === 'completed').length
          const isActive = history.some(a => a.status === 'active' || a.status === 'in_progress')

          return (
            <div 
              key={territory.id} 
              className="territory-card border border-slate-300 rounded-md overflow-hidden bg-white"
            >
              {/* Header do Território */}
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

              {/* Timeline Horizontal */}
              <div className="p-2">
                {history.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1 print:flex-wrap print:gap-3">
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
                            assignment-card flex-shrink-0 w-[140px] p-2 rounded border
                            ${assignment.status === 'completed' ? 'bg-green-50/50 border-green-200' :
                              assignment.status === 'active' || assignment.status === 'in_progress' ? 'bg-blue-50/50 border-blue-200' :
                              'bg-orange-50/50 border-orange-200'}
                            ${isOverdue ? 'ring-2 ring-red-300' : ''}
                          `}
                        >
                          {/* Status dot + Nome */}
                          <div className="flex items-start gap-1.5 mb-1">
                            <div className={`status-dot w-2 h-2 rounded-full mt-1 flex-shrink-0 ${statusColor}`} />
                            <span className="text-[11px] font-medium text-slate-700 leading-tight line-clamp-2">
                              {assignment.profiles?.name || 'Não atribuído'}
                            </span>
                          </div>

                          {/* Datas */}
                          <div className="text-[10px] text-slate-500 space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">↓</span>
                              <span className="font-mono">{formatDate(assignment.assigned_at)}</span>
                            </div>
                            {assignment.completed_at && (
                              <div className="flex items-center gap-1">
                                <span className="text-slate-400">→</span>
                                <span className="font-mono">{formatDate(assignment.completed_at)}</span>
                              </div>
                            )}
                          </div>

                          {/* Duração */}
                          <div className={`
                            text-[10px] font-semibold mt-1
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
                  <div className="text-center py-3 text-xs text-slate-400">
                    Sem registros no período
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Rodapé - Visível apenas na tela */}
      <div className="text-center text-xs text-slate-400 pt-4 border-t print:hidden">
        Gerado em {new Date().toLocaleString("pt-BR")} • Sistema de Gestão de Territórios
      </div>

      {/* Estilos de impressão otimizados */}
      <style jsx global>{`
        @media print {
          /* Configuração da página */
          @page {
            size: A4 landscape;
            margin: 10mm 8mm;
          }
          
          /* Forçar cores exatas na impressão */
          * {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          
          /* Fundo branco puro para economizar tinta */
          body {
            background: white !important;
            color: #1e293b !important;
          }
          
          /* Ocultar elementos da UI */
          nav,
          aside,
          .sidebar,
          header,
          footer,
          .print\\:hidden,
          button:not(.print\\:block),
          [role="navigation"],
          [data-sidebar],
          .no-print {
            display: none !important;
          }
          
          /* Container principal - remover padding/margin excessivos */
          .max-w-full {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          
          /* Cabeçalho do documento (apenas impressão) */
          .print-header {
            display: block !important;
            margin-bottom: 12px !important;
          }
          
          /* Cards de território - otimização */
          .territory-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 8px !important;
            border: 1px solid #cbd5e1 !important;
            box-shadow: none !important;
            background: white !important;
          }
          
          /* Header dos cards - sem fundos coloridos */
          .territory-card > div:first-child {
            background: #f8fafc !important;
            border-bottom: 1px solid #cbd5e1 !important;
            padding: 6px 8px !important;
          }
          
          /* Cards de assignment */
          .assignment-card {
            width: 110px !important;
            padding: 6px !important;
            border: 1px solid #cbd5e1 !important;
            background: white !important;
            box-shadow: none !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          
          /* Fundos coloridos dos assignments - versão clara para impressão */
          .assignment-card.bg-green-50\\/50 {
            background: #f0fdf4 !important;
            border-color: #86efac !important;
          }
          
          .assignment-card.bg-blue-50\\/50 {
            background: #eff6ff !important;
            border-color: #93c5fd !important;
          }
          
          .assignment-card.bg-orange-50\\/50 {
            background: #fff7ed !important;
            border-color: #fdba74 !important;
          }
          
          /* Status dots - cores mais fortes para impressão */
          .status-dot.bg-green-500 {
            background: #22c55e !important;
          }
          
          .status-dot.bg-blue-500 {
            background: #3b82f6 !important;
          }
          
          .status-dot.bg-orange-500 {
            background: #f97316 !important;
          }
          
          /* Textos - aumentar contraste */
          .text-slate-700 {
            color: #334155 !important;
          }
          
          .text-slate-500 {
            color: #64748b !important;
          }
          
          .text-slate-400 {
            color: #94a3b8 !important;
          }
          
          .text-slate-800 {
            color: #1e293b !important;
          }
          
          .text-slate-900 {
            color: #0f172a !important;
          }
          
          /* Timeline flex - wrap na impressão */
          .print\\:flex-wrap {
            flex-wrap: wrap !important;
          }
          
          .print\\:gap-3 {
            gap: 8px !important;
          }
          
          /* Remover sombras e efeitos */
          * {
            box-shadow: none !important;
            text-shadow: none !important;
          }
          
          /* Badges */
          .badge {
            border: 1px solid #cbd5e1 !important;
            background: white !important;
            color: #475569 !important;
          }
          
          /* Garantir que números dos territórios sejam visíveis */
          .bg-slate-800 {
            background: #1e293b !important;
            color: white !important;
          }
          
          /* Espaçamento entre territórios */
          .print\\:space-y-3 > * + * {
            margin-top: 12px !important;
          }
          
          /* Evitar quebra de linha no meio dos elementos */
          h1, h2, h3, h4, h5, h6 {
            break-after: avoid !important;
            page-break-after: avoid !important;
          }
          
          /* Links - remover decoração */
          a {
            text-decoration: none !important;
            color: inherit !important;
          }
          
          /* Otimizar espaço vertical */
          .space-y-4 {
            row-gap: 8px !important;
          }
          
          /* Cor de fundo do indicador colorido */
          [style*="backgroundColor"] {
            print-color-adjust: exact !important;
          }
        }
        
        /* Estilos para tela - mantidos */
        @media screen {
          .print-header {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}