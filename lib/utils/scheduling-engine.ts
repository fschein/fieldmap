import { format, startOfWeek, endOfWeek, subWeeks, isWithinInterval, parseISO } from "date-fns"

export interface LeaderAvailability {
  profile_id: string
  arrangement_id: string
  frequency: number | null // null or 0 = Unlimited
}

export interface ScheduleItem {
  id?: string
  date: string
  arrangement_id: string
  leader_id: string | null
  territory_id: string | null
  status: 'draft' | 'published' | 'manual'
}

export interface EngineOptions {
  avoidSameWeek: boolean
  prioritizeInterval: boolean
}

/**
 * Scheduling Engine
 * Core logic to select the best leader for a given slot based on scores.
 */
export function selectBestLeader(
  date: string,
  arrangementId: string,
  candidates: LeaderAvailability[],
  currentMonthSchedules: ScheduleItem[],
  options: EngineOptions,
  lastLeaderInSlotId: string | null = null
): string | null {
  if (candidates.length === 0) return null

  const targetDate = parseISO(date)
  
  // Calculate scores for each candidate
  const scoredCandidates = candidates.map(c => {
    let score = 0
    
    // 1. Total assignments in the month (Workload Balance)
    const monthCount = currentMonthSchedules.filter(s => s.leader_id === c.profile_id).length
    
    // Hard Constraint check (if frequency is set)
    if (c.frequency && c.frequency > 0 && monthCount >= c.frequency) {
      return { ...c, score: Infinity, monthCount }
    }

    score += monthCount // +1 per assignment

    // 2. Same Slot Alternation (+3 if was the last one in this SPECIFIC slot)
    if (lastLeaderInSlotId && c.profile_id === lastLeaderInSlotId) {
      score += 3
    }

    // 3. Same Week check (+3)
    if (options.avoidSameWeek) {
      const weekStart = startOfWeek(targetDate, { weekStartsOn: 0 })
      const weekEnd = endOfWeek(targetDate, { weekStartsOn: 0 })
      const inSameWeek = currentMonthSchedules.some(s => 
        s.leader_id === c.profile_id && 
        isWithinInterval(parseISO(s.date), { start: weekStart, end: weekEnd })
      )
      if (inSameWeek) score += 3
    }

    // 3. Interval check (+2 for prev week)
    if (options.prioritizeInterval) {
      const prevWeekStart = startOfWeek(subWeeks(targetDate, 1), { weekStartsOn: 0 })
      const prevWeekEnd = endOfWeek(subWeeks(targetDate, 1), { weekStartsOn: 0 })
      const inPrevWeek = currentMonthSchedules.some(s => 
        s.leader_id === c.profile_id && 
        isWithinInterval(parseISO(s.date), { start: prevWeekStart, end: prevWeekEnd })
      )
      if (inPrevWeek) score += 2
    }

    return { ...c, score, monthCount }
  })

  // Filter out candidates who hit their limit (Infinity score)
  let eligible = scoredCandidates.filter(c => c.score !== Infinity)

  // Fallback: If ALL candidates hit their limit, we MUST still fill the slot.
  // Rule: "Nunca usar lógica que resulte em escala incompleta automaticamente"
  // We'll pick from those who have NO frequency limit first, 
  // or if everyone has a limit, we pick the one with the lowest score among all.
  if (eligible.length === 0) {
    eligible = scoredCandidates.sort((a, b) => a.score - b.score)
  } else {
    // Normal case: Sort by score
    eligible.sort((a, b) => a.score - b.score)
  }

  return eligible[0]?.profile_id || null
}
