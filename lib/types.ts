export type UserRole = "admin" | "dirigente" | "publicador"
export type TerritoryType = "residencial" | "comercial"
export type AssignmentStatus = "active" | "completed" | "returned"
export type SubdivisionStatus = "available" | "assigned" | "completed"

export interface Profile {
  id: string
  name: string
  email: string
  role: UserRole
  gender?: "M" | "F"
  must_change_password?: boolean
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

// Nova interface para Subdivision (antiga Block/Quadra)
export interface Subdivision {
  id: string
  territory_id: string
  name: string
  status: SubdivisionStatus
  coordinates: [number, number][][] | null // Array de polígonos
  geometry: GeoJSON.Polygon | null
  order_index: number
  completed: boolean
  notes?: string
  created_at: string
  updated_at: string
}

export interface Territory {
  id: string
  number: string
  name: string
  type: TerritoryType
  color: string
  description: string | null
  group_id: string | null
  assigned_to: string | null
  campaign_id: string | null
  geometry: GeoJSON.Polygon | null
  last_completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TerritoryWithSubdivisions extends Territory {
  subdivisions?: Subdivision[]
  campaign?: Campaign
  assigned_to_user?: {
    id: string
    name: string
    email: string
  } | null
}

export interface Assignment {
  id: string
  territory_id: string
  subdivision_id: string | null // Renomeado de block_id
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
