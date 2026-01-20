export type UserRole = "admin" | "dirigente" | "publicador"

export interface Profile {
  id: string
  email: string
  name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  name: string
  description: string | null
  start_date: string
  end_date: string | null
  is_active: boolean
  created_at: string
}

export interface Territory {
  id: string
  campaign_id: string
  name: string
  description: string | null
  coordinates: [number, number][][] | null // GeoJSON polygon coordinates
  color: string
  created_at: string
  updated_at: string
}

export interface Block {
  id: string
  territory_id: string
  name: string
  coordinates: [number, number][][] | null
  status: "available" | "assigned" | "completed"
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Assignment {
  id: string
  block_id: string
  user_id: string
  assigned_by: string
  assigned_at: string
  completed_at: string | null
  returned_at: string | null
  notes: string | null
  return_reason: string | null
  status: "pending" | "in_progress" | "completed" | "returned"
}

export interface AssignmentWithDetails extends Assignment {
  block: Block & {
    territory: Territory & {
      campaign: Campaign
    }
  }
  user: Profile
  assigned_by_user: Profile
}

export interface TerritoryWithBlocks extends Territory {
  blocks: Block[]
  campaign: Campaign
}

export interface CampaignWithStats extends Campaign {
  territories_count: number
  blocks_count: number
  assigned_blocks: number
  completed_blocks: number
}

export interface DashboardStats {
  total_territories: number
  total_blocks: number
  assigned_blocks: number
  completed_blocks: number
  available_blocks: number
  active_campaigns: number
}
