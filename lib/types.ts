export type UserRole = "admin" | "dirigente" | "publicador"
export type TerritoryType = "residencial" | "comercial"
export type AssignmentStatus = "active" | "completed" | "returned" | "pending" | "in_progress";
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

export interface Territory {
  id: string
  number: string
  name: string
  type: TerritoryType
  description: string | null
  group_id: string | null
  assigned_to: string | null // User ID who has the territory
  geometry: GeoJSON.Polygon | null
  created_at: string
  updated_at: string
}

export interface Block {
  notes: string
  name: string
  id: string
  territory_id: string
  geometry: GeoJSON.Polygon
  order_index: number
  completed: boolean
  created_at: string
  updated_at: string
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

// Extended types with relations
export interface TerritoryWithDetails extends Territory {
  group?: Group
  assigned_to_user?: Profile
  assigned_at?: string
  campaign?: Campaign
  blocks?: Block[]
}

export interface AssignmentWithDetails extends Assignment {
  user: Profile;
  assigned_by_user?: Profile;
  block?: {
    id: string;
    name: string;
    territory: Territory & {
      campaign?: Campaign;
    };
  };
}

export interface DashboardStats {
  total_territories: number
  total_blocks: number
  assigned_blocks: number
  completed_blocks: number
  available_blocks: number
  active_campaigns: number
}