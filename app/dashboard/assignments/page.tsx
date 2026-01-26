"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, User, Calendar, CheckCircle, RotateCcw, MapPin } from "lucide-react"
import type { AssignmentStatus } from "@/lib/types"
import { AssignmentDialog } from "@/components/dashboard/assignment-dialog"

interface AssignmentWithDetails {
  id: string
  status: AssignmentStatus
  assigned_at: string
  completed_at: string | null
  returned_at: string | null
  user_id: string
  territory_id: string
  subdivisions_id: string | null
  user?: { name: string } | null
  territory?: { name: string; color?: string; number?: string } | null
  subdivisions?: { name: string } | null
}

export default function AssignmentsPage() {
  const { isReady, isAdmin, isDirigente } = useAuth()
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = getSupabaseBrowserClient()

  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true)
      
      // Busca assignments com as relações corretas
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from("assignments")
        .select(`
          id, status, assigned_at, completed_at, returned_at, 
          user_id, territory_id, subdivisions_id,
          profiles!assignments_user_id_fkey ( name ),
          territories ( name, color, number ),
          subdivisions ( name )
        `)
        .order("assigned_at", { ascending: false })

      if (assignmentsError) {
        console.error("Erro na query:", assignmentsError)
        throw assignmentsError
      }

      // Mapeia os dados para o formato esperado
      const mapped = assignmentsData?.map((a: {
        subdivisions_id: any; id: any; status: any; assigned_at: any; completed_at: any; returned_at: any; user_id: any; territory_id: any; subdivision_id: any; profiles: any; territories: any; subdivisions: any 
}) => ({
        id: a.id,
        status: a.status,
        assigned_at: a.assigned_at,
        completed_at: a.completed_at,
        returned_at: a.returned_at,
        user_id: a.user_id,
        territory_id: a.territory_id,
        subdivisions_id: a.subdivisions_id,
        user: a.profiles,
        territory: a.territories,
        subdivisions: <a href="" className="subdivisions"></a>
      })) || []

      setAssignments(mapped)
    } catch (error) {
      console.error("Erro ao buscar designações:", error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (isReady) {
      fetchAssignments()
    }
  }, [isReady, fetchAssignments])

  const columns: { label: string; status: AssignmentStatus; color: string }[] = [
    { label: "Ativos", status: "active", color: "bg-blue-50/50" },
    { label: "Concluídos", status: "completed", color: "bg-green-50/50" },
    { label: "Devolvidos", status: "returned", color: "bg-orange-50/50" },
  ]

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Designações</h1>
          <p className="text-muted-foreground">Gerencie o progresso dos territórios.</p>
        </div>
        
        {(isAdmin || isDirigente) && (
          <AssignmentDialog onSuccess={fetchAssignments} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {columns.map((column) => {
          const columnAssignments = assignments.filter(a => a.status === column.status)
          
          return (
            <div key={column.status} className={`rounded-xl p-4 ${column.color} min-h-[500px] border border-dashed border-slate-200`}>
              <h3 className="mb-4 flex items-center justify-between font-semibold text-slate-700 px-1">
                {column.label}
                <Badge variant="secondary" className="rounded-full">
                  {columnAssignments.length}
                </Badge>
              </h3>

              <div className="space-y-3">
                {columnAssignments.length > 0 ? (
                  columnAssignments.map((assignment) => (
                    <AssignmentCard 
                      key={assignment.id} 
                      assignment={assignment} 
                      onUpdate={fetchAssignments}
                    />
                  ))
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Nenhuma designação {column.label.toLowerCase()}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AssignmentCard({ 
  assignment, 
  onUpdate 
}: { 
  assignment: AssignmentWithDetails
  onUpdate: () => void 
}) {
  const supabase = getSupabaseBrowserClient()
  const [updating, setUpdating] = useState(false)

  const updateStatus = async (newStatus: AssignmentStatus) => {
    setUpdating(true)
    const updateData: any = { 
      status: newStatus,
      updated_at: new Date().toISOString()
    }
    
    if (newStatus === 'completed') updateData.completed_at = new Date().toISOString()
    if (newStatus === 'returned') updateData.returned_at = new Date().toISOString()

    const { error } = await supabase
      .from("assignments")
      .update(updateData)
      .eq("id", assignment.id)

    if (!error) onUpdate()
    setUpdating(false)
  }

  const daysInField = () => {
    const start = new Date(assignment.assigned_at)
    const end = assignment.completed_at 
      ? new Date(assignment.completed_at)
      : new Date()
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  }

  const days = daysInField()
  const isOverdue = days > 90 && assignment.status === 'active'

  return (
    <Card className={`shadow-sm border-none ring-1 overflow-hidden transition-all hover:ring-2 ${
      isOverdue 
        ? 'ring-red-300 hover:ring-red-400' 
        : 'ring-slate-200 hover:ring-slate-300'
    }`}>
      <CardContent className="p-4 space-y-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <p className="font-bold text-slate-900 leading-tight truncate">
                {assignment.territory?.name || "Território sem nome"}
                {assignment.territory?.number && (
                  <span className="text-xs text-muted-foreground ml-1">
                    #{assignment.territory.number}
                  </span>
                )}
              </p>
            </div>
            
            {assignment.subdivisions?.name && (
              <p className="text-xs text-muted-foreground ml-5 truncate">
                {assignment.subdivisions.name}
              </p>
            )}
            
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 ml-5">
              <Calendar className="h-3 w-3" />
              {new Date(assignment.assigned_at).toLocaleDateString('pt-BR')}
              <span className={`ml-1 font-semibold ${isOverdue ? 'text-red-600' : ''}`}>
                • {days}d
              </span>
            </p>
          </div>
          
          {assignment.territory?.color && (
            <div 
              className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white"
              style={{ backgroundColor: assignment.territory.color }}
            />
          )}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <User className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-medium text-slate-700 truncate">
            {assignment.user?.name || "Sem designação"}
          </span>
        </div>

        {isOverdue && (
          <div className="bg-red-50 border border-red-200 rounded-md px-2 py-1">
            <p className="text-[10px] text-red-700 font-medium">
              ⚠️ Território há mais de 90 dias em campo
            </p>
          </div>
        )}

        {assignment.status === 'active' && (
          <div className="flex justify-end gap-1 pt-2">
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 text-green-600 hover:text-green-700 hover:bg-green-50 px-2" 
              onClick={() => updateStatus('completed')} 
              disabled={updating}
            >
              {updating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Concluir
                </>
              )}
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50 px-2" 
              onClick={() => updateStatus('returned')} 
              disabled={updating}
            >
              {updating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Devolver
                </>
              )}
            </Button>
          </div>
        )}

        {assignment.status === 'completed' && assignment.completed_at && (
          <div className="text-[10px] text-green-600 flex items-center gap-1 pt-1">
            <CheckCircle className="h-3 w-3" />
            Concluído em {new Date(assignment.completed_at).toLocaleDateString('pt-BR')}
          </div>
        )}

        {assignment.status === 'returned' && assignment.returned_at && (
          <div className="text-[10px] text-orange-600 flex items-center gap-1 pt-1">
            <RotateCcw className="h-3 w-3" />
            Devolvido em {new Date(assignment.returned_at).toLocaleDateString('pt-BR')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}