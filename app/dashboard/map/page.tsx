"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"

const OverviewMap = dynamic(() => import("./overview-map"), { ssr: false, loading: () => <MapLoader /> })

function MapLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export interface GroupInfo {
  id: string
  name: string
  color: string
}

export interface SubdivisionFlat {
  id: string
  name: string
  coordinates: [number, number][][] | null
  completed: boolean
  notes: string | null
  territoryId: string
  territoryName: string
  territoryNumber: string
  groupId: string | null
  groupColor: string
  groupName: string
  assigneeName: string | null
  historyCount: number
}

export default function MapPage() {
  const supabase = getSupabaseBrowserClient()
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [subdivisions, setSubdivisions] = useState<SubdivisionFlat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: gData }, { data: tAll }, { data: aData }, { data: histData }] = await Promise.all([
        supabase.from("groups").select("id, name, color").order("name"),
        supabase.from("territories").select(`
          id, name, number, group_id,
          subdivisions ( id, name, coordinates, completed, notes )
        `).neq("status", "inactive").order("number"),
        supabase.from("assignments")
          .select("territory_id, user_id, group_id, profiles!assignments_user_id_fkey(name), groups:groups(name)")
          .eq("status", "active"),
        supabase.from("assignments")
          .select("territory_id")
          .eq("status", "completed"),
      ])

      const groupMap = new Map<string, GroupInfo>((gData ?? []).map((g: any) => [g.id, g]))

      const assigneeMap = new Map<string, string>()
      ;(aData ?? []).forEach((a: any) => {
        const name = a.profiles?.name || a.groups?.name || null
        if (name) assigneeMap.set(a.territory_id, name)
      })

      // Count completed assignments per territory
      const historyMap = new Map<string, number>()
      ;(histData ?? []).forEach((a: any) => {
        historyMap.set(a.territory_id, (historyMap.get(a.territory_id) ?? 0) + 1)
      })

      const flat: SubdivisionFlat[] = []
      ;(tAll ?? []).forEach((t: any) => {
        const group = t.group_id ? groupMap.get(t.group_id) : null
        const count = historyMap.get(t.id) ?? 0
        ;(t.subdivisions ?? []).forEach((s: any) => {
          if (!s.coordinates?.length) return
          flat.push({
            id: s.id,
            name: s.name,
            coordinates: s.coordinates,
            completed: s.completed ?? false,
            notes: s.notes ?? null,
            territoryId: t.id,
            territoryName: t.name,
            territoryNumber: t.number,
            groupId: t.group_id ?? null,
            groupColor: group?.color ?? "#6b7280",
            groupName: group?.name ?? "Sem grupo",
            assigneeName: assigneeMap.get(t.id) ?? null,
            historyCount: count,
          })
        })
      })

      setGroups(gData ?? [])
      setSubdivisions(flat)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Carregando mapa…</span>
      </div>
    )
  }

  return (
    <div className="h-[calc(100dvh-4rem)] w-full overflow-hidden">
      <OverviewMap groups={groups} subdivisions={subdivisions} />
    </div>
  )
}
