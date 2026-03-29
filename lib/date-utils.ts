// lib/date-utils.ts

/**
 * Retorna a data de hoje no formato YYYY-MM-DD levando em conta o fuso horário local.
 * Diferente de new Date().toISOString() que pode retornar o dia seguinte dependendo do horário.
 */
export function getLocalTodayStr() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Converte uma string YYYY-MM-DD para ISO string às 12:00 local para evitar shifts.
 */
export function toLocalISOString(dateStr: string | null) {
  if (!dateStr || dateStr === "") return null
  if (dateStr.includes('T')) return dateStr
  // Usar 12:00 sem 'Z' cria a data no fuso local do navegador
  const d = new Date(`${dateStr}T12:00:00`)
  return d.toISOString()
}

/**
 * Formata uma data para exibição (pt-BR) de forma segura.
 */
export function formatSafeDate(dateStr: string | null | undefined) {
  if (!dateStr) return ""
  
  // Se for apenas YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  // Se for ISO, forçar 12:00 para evitar o shift de fuso ao exibir apenas a data
  if (dateStr.includes('T')) {
    const justDate = dateStr.split('T')[0]
    const [y, m, d] = justDate.split('-')
    return `${d}/${m}/${y}`
  }

  return new Date(dateStr).toLocaleDateString('pt-BR')
}
