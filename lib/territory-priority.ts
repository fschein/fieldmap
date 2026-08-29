import type { Subdivision } from "@/lib/types"

// ============================================================================
// Extraído de components/dashboard/admin-territories-view.tsx pra ser
// reaproveitado por qualquer tela que precise da mesma definição de
// "livre"/"urgente" (ex: página de Grupos) sem duplicar (e arriscar
// divergir) a lógica de dias inativos.
// ============================================================================

export interface TerritoryWithDetails {
  id: string
  number: string
  name: string
  type: string
  subtype?: string | null
  color: string
  status?: string
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
  } | null
  campaign?: {
    id: string
    name: string
  } | null
  subdivisions?: Subdivision[]
}

export interface PriorityScore {
  territory: TerritoryWithDetails & { assignments?: any[] }
  score: number
  daysInactive: number
  daysAssigned?: number
  isReturned?: boolean
  priority: 'critical' | 'high' | 'medium' | 'low'
  reason: string
}

export function calculatePriorityScore(territory: TerritoryWithDetails & { assignments?: any[] }): PriorityScore {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  let score = 0
  let daysInactive = 0
  let daysAssigned = 0
  let priority: 'critical' | 'high' | 'medium' | 'low' = 'low'
  let reason = ''

  // 1. Encontrar a última designação encerrada (returned ou completed)
  const latestFinishedAssignment = [...(territory.assignments || [])]
    .filter(a => a.status !== 'active')
    .sort((a, b) => {
      const dateA = new Date(a.completed_at || a.returned_at || a.updated_at || a.assigned_at).getTime()
      const dateB = new Date(b.completed_at || b.returned_at || b.updated_at || b.assigned_at).getTime()
      if (dateA !== dateB) return dateB - dateA
      return b.id.localeCompare(a.id)
    })[0]

  const isReturned = !territory.assigned_to && latestFinishedAssignment?.status === 'returned'

  // 2. Dias Inativo (LIVRE): hoje - (data real da liberação)
  // Isso define a URGÊNCIA do território ser trabalhado.
  let lastActivityDate: string | Date = territory.created_at || new Date().toISOString()

  if (isReturned) {
    lastActivityDate = latestFinishedAssignment?.returned_at || latestFinishedAssignment?.updated_at || lastActivityDate
  } else if (!territory.assigned_to) {
    if (latestFinishedAssignment) {
      lastActivityDate = latestFinishedAssignment.completed_at || latestFinishedAssignment.updated_at || lastActivityDate
    } else if (territory.last_completed_at) {
      lastActivityDate = territory.last_completed_at
    }
  }

  const lastActivity = new Date(lastActivityDate)
  // Fallback seguro: se a data for inválida (ex: string malformada ou undefined), assume a data atual para evitar NaN
  const activityDay = isNaN(lastActivity.getTime())
    ? new Date(today)
    : new Date(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate())

  const diffInactive = today.getTime() - activityDay.getTime()
  daysInactive = Math.max(0, Math.floor(diffInactive / (1000 * 60 * 60 * 24)))

  // 3. Dias Designado: hoje - (assigned_at da designação ativa)
  if (territory.assigned_to) {
    const activeAssignment = territory.assignments?.find((a: any) => a.status === 'active')
    if (activeAssignment && activeAssignment.assigned_at) {
      const assignedDate = new Date(activeAssignment.assigned_at)
      if (!isNaN(assignedDate.getTime())) {
        const assignedDay = new Date(assignedDate.getFullYear(), assignedDate.getMonth(), assignedDate.getDate())
        const diffAssigned = today.getTime() - assignedDay.getTime()
        daysAssigned = Math.max(0, Math.floor(diffAssigned / (1000 * 60 * 60 * 24)))
      }
    }
  }

  // Calcula score baseado em dias inativos (mesmo se estiver designado, o score de "atraso" é mantido)
  if (daysInactive >= 30) {
    score = 100
    priority = 'critical'
    reason = `Inativo há ${daysInactive} dias`
  } else if (daysInactive >= 10) {
    score = 50
    priority = 'medium'
    reason = `Parado há ${daysInactive} dias`
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

  // Penalidade: já está designado (reduz prioridade na lista de "A designar")
  if (territory.assigned_to) {
    score -= 50
  }

  return {
    territory,
    score: Math.max(0, score),
    daysInactive,
    daysAssigned,
    isReturned,
    priority,
    reason
  }
}
