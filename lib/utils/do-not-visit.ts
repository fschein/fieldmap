const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

export function isDnvExpired(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  return Date.now() - new Date(createdAt).getTime() > ONE_YEAR_MS
}

export function countExpiredDnvs(doNotVisits: { created_at?: string | null }[] | null | undefined): number {
  return doNotVisits?.filter((dnv) => isDnvExpired(dnv.created_at)).length || 0
}
