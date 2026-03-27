"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Printer, Calendar } from "lucide-react"

interface Assignment {
  id: string
  status: string
  assigned_at: string
  completed_at: string | null
  user_name: string
  territory_id: string
  territory_number: string
  territory_name: string
}

interface TerritorySummary {
  id: string
  number: string
  name: string
  current_status: string
  current_publisher: string | null
  last_completion: string | null
  frequency: number
}

type ViewMode = "summary" | "complete"

export default function ReportsPage() {
  const { isReady } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [summaries, setSummaries] = useState<TerritorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("summary")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const supabase = getSupabaseBrowserClient()

  // Definir datas padrão (últimos 12 meses)
  useEffect(() => {
    const end = new Date()
    const start = new Date()
    start.setMonth(start.getMonth() - 12)
    
    setEndDate(end.toISOString().split('T')[0])
    setStartDate(start.toISOString().split('T')[0])
  }, [])

  const fetchData = useCallback(async () => {
    if (!startDate || !endDate) return
    
    setLoading(true)
    try {
      // Buscar todos os assignments com joins explícitos
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from("assignments")
        .select(`
          id,
          status,
          assigned_at,
          completed_at,
          user_id,
          territory_id,
          profiles!assignments_user_id_fkey (
            name
          ),
          territories!assignments_territory_id_fkey (
            number,
            name
          )
        `)
        .gte('assigned_at', startDate)
        .lte('assigned_at', endDate)
        .order('assigned_at', { ascending: false })

      if (assignmentsError) throw assignmentsError

      // Transformar dados
      const formattedAssignments: Assignment[] = (assignmentsData || []).map((a: any) => ({
        id: a.id,
        status: a.status,
        assigned_at: a.assigned_at,
        completed_at: a.completed_at,
        user_name: a.profiles?.name || 'Não atribuído',
        territory_id: a.territory_id,
        territory_number: a.territories?.number || '—',
        territory_name: a.territories?.name || 'Sem nome'
      }))

      setAssignments(formattedAssignments)

      // Buscar todos os territórios para o resumo
      const { data: territoriesData, error: territoriesError } = await supabase
        .from("territories")
        .select('id, number, name, status, assigned_to, last_completed_at, profiles!territories_assigned_to_fkey(name)')
        .order('number', { ascending: true })

      if (territoriesError) throw territoriesError

      // Criar resumo estratégico
      const summaryData: TerritorySummary[] = (territoriesData || []).map((t: any) => {
        const territoryAssignments = formattedAssignments.filter(a => a.territory_id === t.id)
        const completedCount = territoryAssignments.filter(a => a.status === 'completed').length
        const lastCompleted = territoryAssignments.find(a => a.completed_at)?.completed_at || null

        return {
          id: t.id,
          number: t.number || '—',
          name: t.name,
          current_status: t.status || 'available',
          current_publisher: t.profiles?.name || null,
          last_completion: lastCompleted,
          frequency: completedCount
        }
      })

      setSummaries(summaryData)
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error?.message || error)
    } finally {
      setLoading(false)
    }
  }, [supabase, startDate, endDate])

  useEffect(() => {
    if (isReady && startDate && endDate) {
      fetchData()
    }
  }, [isReady, startDate, endDate, fetchData])

  const formatDate = (date: string | null) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString("pt-BR", { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    })
  }

  const formatDateShort = (date: string | null) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString("pt-BR", { 
      day: '2-digit', 
      month: '2-digit', 
      year: '2-digit' 
    })
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; class: string }> = {
      'assigned': { label: 'Designado', class: 'bg-blue-100 text-blue-800' },
      'active': { label: 'Em Campo', class: 'bg-blue-100 text-blue-800' },
      'in_progress': { label: 'Em Andamento', class: 'bg-yellow-100 text-yellow-800' },
      'completed': { label: 'Concluído', class: 'bg-green-100 text-green-800' },
      'returned': { label: 'Devolvido', class: 'bg-orange-100 text-orange-800' },
      'available': { label: 'Disponível', class: 'bg-slate-100 text-slate-600' }
    }
    
    const statusInfo = statusMap[status] || { label: status, class: 'bg-slate-100 text-slate-600' }
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${statusInfo.class} print:border print:border-slate-300`}>
        {statusInfo.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="w-full max-w-[95%] mx-auto px-3 py-4 print:p-0 print:max-w-full">
      {/* Cabeçalho de Impressão */}
      <div className="hidden print:block mb-3">
        <div className="flex justify-between items-center border-b-2 border-slate-900 pb-2 mb-3">
          <div>
            <h1 className="text-base font-bold">
              {viewMode === "summary" ? "Resumo Estratégico" : "Histórico Completo"}
            </h1>
            <p className="text-[10px] text-slate-600">
              Período: {formatDate(startDate)} a {formatDate(endDate)}
            </p>
          </div>
          <div className="text-right text-[10px] text-slate-600">
            <div>Sistema de Gestão de Territórios</div>
            <div>{new Date().toLocaleString("pt-BR")}</div>
          </div>
        </div>
      </div>

      {/* Controles - Tela */}
      <div className="print:hidden space-y-3 mb-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h1 className="text-xl font-bold">Relatórios</h1>
            <p className="text-xs text-slate-500">Análise de cobertura territorial</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex items-end gap-3 p-3 bg-slate-50 rounded-lg border">
          {/* Modo de Visualização */}
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-700 mb-1 block">
              Modo de Visualização
            </label>
            <Select value={viewMode} onValueChange={(v: ViewMode) => setViewMode(v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Resumo Estratégico</SelectItem>
                <SelectItem value="complete">Histórico Completo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Data Início */}
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-700 mb-1 block">
              Data Início
            </label>
            <div className="relative">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-sm"
              />
              <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Data Fim */}
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-700 mb-1 block">
              Data Fim
            </label>
            <div className="relative">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 text-sm"
              />
              <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Botão Aplicar */}
          <Button onClick={fetchData} size="sm" className="h-9">
            Aplicar Filtros
          </Button>
        </div>
      </div>

      {/* Tabela: Resumo Estratégico */}
      {viewMode === "summary" && (
        <div className="border rounded-lg overflow-hidden print:border-slate-400">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100 print:bg-slate-50">
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900">Nº</TableHead>
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900">Nome do Território</TableHead>
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900">Status Atual</TableHead>
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900">Publicador</TableHead>
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900 text-right">Última Conclusão</TableHead>
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900 text-center">Frequência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((summary, index) => (
                <TableRow 
                  key={summary.id} 
                  className={`h-8 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-slate-100/50 print:hover:bg-transparent`}
                >
                  <TableCell className="py-1 text-xs font-semibold text-slate-900">
                    {summary.number}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-slate-700">
                    {summary.name}
                  </TableCell>
                  <TableCell className="py-1 text-xs">
                    {getStatusBadge(summary.current_status)}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-slate-700">
                    {summary.current_publisher || '—'}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-slate-600 text-right font-mono">
                    {formatDateShort(summary.last_completion)}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-slate-900 font-semibold text-center">
                    {summary.frequency}x
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {summaries.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              Nenhum território encontrado no período selecionado
            </div>
          )}
        </div>
      )}

      {/* Tabela: Histórico Completo */}
      {viewMode === "complete" && (
        <div className="border rounded-lg overflow-hidden print:border-slate-400">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100 print:bg-slate-50">
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900">Nº</TableHead>
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900">Território</TableHead>
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900">Publicador</TableHead>
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900 text-right">Data de Início</TableHead>
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900 text-right">Data de Conclusão</TableHead>
                <TableHead className="h-9 py-2 text-xs font-bold text-slate-900 print:border-b-2 print:border-slate-900">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment, index) => (
                <TableRow 
                  key={assignment.id}
                  className={`h-8 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-slate-100/50 print:hover:bg-transparent`}
                >
                  <TableCell className="py-1 text-xs font-semibold text-slate-900">
                    {assignment.territory_number}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-slate-700">
                    {assignment.territory_name}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-slate-700">
                    {assignment.user_name}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-slate-600 text-right font-mono">
                    {formatDateShort(assignment.assigned_at)}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-slate-600 text-right font-mono">
                    {formatDateShort(assignment.completed_at)}
                  </TableCell>
                  <TableCell className="py-1 text-xs">
                    {getStatusBadge(assignment.status)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {assignments.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              Nenhuma designação encontrada no período selecionado
            </div>
          )}
        </div>
      )}

      {/* Rodapé - Tela */}
      <div className="print:hidden text-center text-[10px] text-slate-400 mt-4 pt-3 border-t">
        <p>Sistema de Gestão de Territórios • {summaries.length} territórios • {assignments.length} designações</p>
      </div>

      {/* Estilos de Impressão */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          * {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }

          body {
            background: white !important;
            font-size: 9px !important;
          }

          /* Ocultar elementos da UI */
          nav, aside, header, footer,
          .print\\:hidden,
          [role="navigation"],
          [data-sidebar] {
            display: none !important;
          }

          /* Container 100% */
          .max-w-\\[95\\%\\] {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Tabela */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }

          th, td {
            border: 0.5px solid #cbd5e1 !important;
            padding: 2px 4px !important;
            line-height: 1.2 !important;
          }

          th {
            background: #f8fafc !important;
            font-weight: bold !important;
          }

          /* Zebra striping */
          tr:nth-child(even) {
            background: #f8fafc !important;
          }

          tr:nth-child(odd) {
            background: white !important;
          }

          /* Badges */
          .bg-blue-100 { background: #dbeafe !important; color: #1e40af !important; }
          .bg-green-100 { background: #dcfce7 !important; color: #166534 !important; }
          .bg-yellow-100 { background: #fef9c3 !important; color: #854d0e !important; }
          .bg-orange-100 { background: #ffedd5 !important; color: #9a3412 !important; }
          .bg-slate-100 { background: #f1f5f9 !important; color: #475569 !important; }

          /* Tipografia */
          .text-xs { font-size: 9px !important; }
          .text-\\[10px\\] { font-size: 8px !important; }
          
          /* Sem bordas arredondadas */
          * {
            border-radius: 0 !important;
            box-shadow: none !important;
          }

          /* Headers */
          h1 { font-size: 14px !important; }
          
          /* Quebras de página */
          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  )
}
