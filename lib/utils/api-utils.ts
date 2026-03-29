/**
 * Cria um AbortSignal que dispara após um tempo determinado.
 * @param timeoutMs Tempo em milissegundos (padrão 15s)
 */
export function createTimeoutSignal(timeoutMs: number = 15000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId)
  }
}

/**
 * Erro customizado para timeouts de API
 */
export class ApiTimeoutError extends Error {
  constructor(message: string = "A requisição demorou muito para responder") {
    super(message)
    this.name = "ApiTimeoutError"
  }
}
