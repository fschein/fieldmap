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
