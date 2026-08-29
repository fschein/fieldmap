import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formata número de território: numéricos viram R-01, R-02; alfanuméricos ficam como estão (COM-1, etc.) */
export function fmtTerritoryNumber(n: string | number | undefined | null): string {
  const s = String(n ?? '')
  return /^\d+$/.test(s) ? `R-${s.padStart(2, '0')}` : s
}

/**
 * Ordem "natural" para números de casa/apartamento (ex.: 9 < 10 < 12 < 12A < 14),
 * já que a coluna é texto livre e permite sufixos como "12A".
 */
export function compareHouseNumbers(a: string, b: string): number {
  const parts = /(\d+)|(\D+)/g
  const aParts = a.match(parts) || []
  const bParts = b.match(parts) || []
  const len = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < len; i++) {
    const ap = aParts[i] ?? ''
    const bp = bParts[i] ?? ''
    if (/^\d+$/.test(ap) && /^\d+$/.test(bp)) {
      const diff = parseInt(ap, 10) - parseInt(bp, 10)
      if (diff !== 0) return diff
    } else {
      const cmp = ap.localeCompare(bp)
      if (cmp !== 0) return cmp
    }
  }
  return 0
}
