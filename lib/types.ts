// lib/types.ts - Correções específicas para relatórios

export type UserRole = "admin" | "dirigente" | "publicador"
export type TerritoryType = "residencial" | "comercial"
export type AssignmentStatus = "active" | "completed" | "returned" | "pending" | "in_progress"

export interface Profile {
  id: string
  name: string
  email: string
  role: UserRole
  phone: string | null
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  name: string
  description: string | null
  active: boolean
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  name: string
  color: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Block {
  id: string
  territory_id: string
  geometry: GeoJSON.Polygon | null
  order_index: number
  completed: boolean
  name?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Territory {
  id: string
  number: string
  name: string
  type: TerritoryType
  description: string | null
  group_id: string | null
  assigned_to: string | null
  geometry: GeoJSON.Polygon | null
  created_at: string
  updated_at: string
}

// Tipo retornado pela VIEW territories_with_assignment
export interface TerritoryWithAssignment extends Territory {
  assigned_to_name: string | null
  assigned_to_email: string | null
  assigned_at: string | null
  campaign_id: string | null
  campaign_name: string | null
  blocks?: Block[]
}

export interface Assignment {
  id: string
  territory_id: string
  block_id: string | null
  user_id: string
  campaign_id: string | null
  status: AssignmentStatus
  assigned_at: string
  delivered_at: string | null
  completed_at: string | null
  returned_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Stats específicos para relatórios
export interface TerritoryReportStats {
  territory_id: string
  territory_number: string
  territory_name: string
  assigned_to_name: string | null
  assigned_at: string | null
  total_blocks: number
  completed_blocks: number
  completion_percentage: number
  days_retained: number | null
  is_overdue: boolean // true se > 90 dias
}

export interface ReportStats {
  totalAssignments: number
  completedAssignments: number
  returnedAssignments: number
  inProgressAssignments: number
  averageCompletionDays: number
  totalBlocks: number
  completedBlocks: number
  territoryStats: TerritoryReportStats[]
}