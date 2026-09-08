import { describe, it, expect, vi } from "vitest"

// O módulo testado chama getSupabaseBrowserClient() no top-level (fora de
// qualquer função) — sem mockar isso, o import real tentaria criar um
// client de verdade e falharia sem as env vars do Supabase.
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({}),
}))

import {
  effectiveLastActivity,
  pickOldest,
  buildPreview,
  requestTerritoryCore,
} from "@/hooks/use-request-territory"

// ── helpers de fixture ──

function territory(overrides: Record<string, any> = {}) {
  return {
    id: "t1",
    group_id: null,
    type: "residential",
    last_completed_at: null,
    assignments: [],
    ...overrides,
  }
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString()
}

describe("effectiveLastActivity", () => {
  it("retorna null quando não há last_completed_at nem assignments", () => {
    expect(effectiveLastActivity(territory())).toBeNull()
  })

  it("retorna last_completed_at quando não há assignments", () => {
    const t = territory({ last_completed_at: daysAgo(10) })
    expect(effectiveLastActivity(t)).toBe(t.last_completed_at)
  })

  it("ignora assignments com assigned_at null", () => {
    const t = territory({
      last_completed_at: null,
      assignments: [{ assigned_at: null }],
    })
    expect(effectiveLastActivity(t)).toBeNull()
  })

  it("usa o assigned_at de uma designação ativa quando é mais recente que last_completed_at (território em mãos, ainda não concluído)", () => {
    const completedAt = daysAgo(60)
    const assignedAt = daysAgo(5)
    const t = territory({
      last_completed_at: completedAt,
      assignments: [{ assigned_at: assignedAt, status: "active" }],
    })
    expect(effectiveLastActivity(t)).toBe(assignedAt)
  })

  it("usa o assigned_at de uma designação pausada por campanha (território em mãos, só pausado)", () => {
    const completedAt = daysAgo(60)
    const assignedAt = daysAgo(5)
    const t = territory({
      last_completed_at: completedAt,
      assignments: [{ assigned_at: assignedAt, status: "paused" }],
    })
    expect(effectiveLastActivity(t)).toBe(assignedAt)
  })

  it("ignora o assigned_at de uma designação devolvida sem trabalho (bug: pedir e devolver não deve contar como atividade recente)", () => {
    const completedAt = daysAgo(60)
    const assignedAt = daysAgo(1) // pedido e devolvido hoje mesmo
    const t = territory({
      last_completed_at: completedAt,
      assignments: [{ assigned_at: assignedAt, status: "returned" }],
    })
    expect(effectiveLastActivity(t)).toBe(completedAt)
  })

  it("ignora o assigned_at de uma designação já concluída (last_completed_at já é a fonte correta pra conclusão)", () => {
    const completedAt = daysAgo(10)
    const assignedAt = daysAgo(40) // início da designação que gerou essa conclusão
    const t = territory({
      last_completed_at: completedAt,
      assignments: [{ assigned_at: assignedAt, status: "completed" }],
    })
    expect(effectiveLastActivity(t)).toBe(completedAt)
  })

  it("pega a data mais recente entre múltiplas designações ativas/pausadas", () => {
    const older = daysAgo(30)
    const newer = daysAgo(3)
    const t = territory({
      assignments: [
        { assigned_at: older, status: "active" },
        { assigned_at: newer, status: "paused" },
      ],
    })
    expect(effectiveLastActivity(t)).toBe(newer)
  })
})

describe("pickOldest", () => {
  it("prioriza território nunca trabalhado (null) sobre um trabalhado há muito tempo", () => {
    const neverWorked = territory({ id: "never" })
    const workedLongAgo = territory({ id: "old", last_completed_at: daysAgo(400) })
    const result = pickOldest([workedLongAgo, neverWorked])
    expect(result.id).toBe("never")
    expect(result.effective_last_activity).toBeNull()
  })

  it("entre dois com atividade, escolhe o mais antigo", () => {
    const older = territory({ id: "older", last_completed_at: daysAgo(200) })
    const newer = territory({ id: "newer", last_completed_at: daysAgo(10) })
    const result = pickOldest([newer, older])
    expect(result.id).toBe("older")
  })

  it("empate na data de atividade é desempatado por menos conclusões recentes (últimos 6 meses)", () => {
    const sameDate = daysAgo(200)
    const completedMoreRecently = territory({
      id: "many-completions",
      last_completed_at: sameDate,
      assignments: [
        { assigned_at: null, completed_at: daysAgo(200) },
        { assigned_at: null, completed_at: daysAgo(30) },
      ],
    })
    const completedLessRecently = territory({
      id: "few-completions",
      last_completed_at: sameDate,
      assignments: [{ assigned_at: null, completed_at: daysAgo(200) }],
    })
    const result = pickOldest([completedMoreRecently, completedLessRecently])
    expect(result.id).toBe("few-completions")
  })
})

describe("buildPreview", () => {
  it("retorna reason 'empty' quando não há território nenhum na região", () => {
    expect(buildPreview([], null, 25)).toEqual({ territory: null, days: Infinity, reason: "empty" })
  })

  it("retorna reason 'covered' quando todos os territórios já foram cobertos na campanha ativa", () => {
    const t = territory({ id: "t1" })
    const coveredIds = new Set(["t1"])
    const result = buildPreview([t], coveredIds, 25)
    expect(result).toEqual({ territory: null, days: Infinity, reason: "covered" })
  })

  it("retorna reason 'recent' quando o único território não coberto foi trabalhado há menos que minRestDays", () => {
    const t = territory({ id: "t1", last_completed_at: daysAgo(5) })
    const result = buildPreview([t], null, 25)
    expect(result).toEqual({ territory: null, days: Infinity, reason: "recent" })
  })

  it("retorna reason 'ok' com o território mais antigo elegível e o número de dias correto", () => {
    const eligible = territory({ id: "eligible", last_completed_at: daysAgo(100) })
    const tooRecent = territory({ id: "recent", last_completed_at: daysAgo(1) })
    const result = buildPreview([tooRecent, eligible], null, 25)
    expect(result.reason).toBe("ok")
    expect(result.territory?.id).toBe("eligible")
    expect(result.days).toBe(100)
  })

  it("quando não há campanha ativa (coveredIds null), nenhum território é filtrado por cobertura", () => {
    const t = territory({ id: "t1", last_completed_at: daysAgo(100) })
    const result = buildPreview([t], null, 25)
    expect(result.reason).toBe("ok")
  })
})

// ── requestTerritoryCore: a corrida corrigida em 7f30564 ──

/**
 * Constrói um mock encadeável de query builder do Supabase. Cada chamada a
 * `.from(table)` consome a próxima resposta da fila — na ordem em que o
 * código real as dispara.
 */
function makeSupabaseMock(responses: Array<{ data?: any; error?: any }>) {
  let call = 0
  const fromCalls: string[] = []
  const from = vi.fn((table: string) => {
    fromCalls.push(table)
    const response = responses[call] ?? { data: null, error: null }
    call += 1
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      is: vi.fn(() => builder),
      update: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      order: vi.fn(() => builder),
      then: (resolve: any) => resolve(response),
    }
    return builder
  })
  return { from, fromCalls }
}

describe("requestTerritoryCore", () => {
  it("caminho feliz: reserva o território e cria a designação", async () => {
    const supabase = makeSupabaseMock([
      { data: [] }, // campaigns
      { data: [{ id: "t1" }], error: null }, // update territories (reserva ganha)
      { data: null, error: null }, // insert assignments
    ])

    await expect(requestTerritoryCore(supabase as any, "user-1", "t1")).resolves.toBeUndefined()
    expect(supabase.fromCalls).toEqual(["campaigns", "territories", "assignments"])
  })

  it("corrida perdida: update de reserva afeta 0 linhas (outra pessoa já pegou) e NÃO cria designação", async () => {
    const supabase = makeSupabaseMock([
      { data: [] }, // campaigns
      { data: [], error: null }, // update territories: 0 linhas — já foi pego por outra pessoa
    ])

    await expect(requestTerritoryCore(supabase as any, "user-1", "t1")).rejects.toThrow(
      /acabou de ser designado para outra pessoa/
    )
    // Não deve ter chamado assignments.insert — a designação nunca foi criada.
    expect(supabase.fromCalls).toEqual(["campaigns", "territories"])
    // A proteção real contra a corrida é esse filtro: sem ele, um update
    // que bate por id sempre "acha" a linha (mesmo já designada a outra
    // pessoa) e o bug de 7f30564 volta a existir mesmo com o guard acima.
    const territoriesBuilder = supabase.from.mock.results[1].value
    expect(territoriesBuilder.is).toHaveBeenCalledWith("assigned_to", null)
  })

  it("erro no update de reserva propaga o erro original e não tenta inserir designação", async () => {
    const dbError = new Error("connection reset")
    const supabase = makeSupabaseMock([
      { data: [] }, // campaigns
      { data: null, error: dbError }, // update territories falha
    ])

    await expect(requestTerritoryCore(supabase as any, "user-1", "t1")).rejects.toBe(dbError)
    expect(supabase.fromCalls).toEqual(["campaigns", "territories"])
  })

  it("se o insert da designação falha depois da reserva, desfaz a reserva do território", async () => {
    const assignError = new Error("insert failed")
    const supabase = makeSupabaseMock([
      { data: [] }, // campaigns
      { data: [{ id: "t1" }], error: null }, // update territories (reserva ganha)
      { data: null, error: assignError }, // insert assignments falha
      { data: null, error: null }, // rollback update territories
    ])

    await expect(requestTerritoryCore(supabase as any, "user-1", "t1")).rejects.toBe(assignError)
    expect(supabase.fromCalls).toEqual(["campaigns", "territories", "assignments", "territories"])
  })

  it("só considera campanha ativa cujo start_date já passou e end_date (se houver) ainda não passou", async () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    const supabase = makeSupabaseMock([
      {
        data: [
          { id: "future", start_date: tomorrow, end_date: null }, // ainda não começou
          { id: "expired", start_date: yesterday, end_date: yesterday }, // já terminou
          { id: "valid", start_date: yesterday, end_date: null }, // em andamento
        ],
      },
      { data: [{ id: "t1" }], error: null },
      { data: null, error: null },
    ])

    await requestTerritoryCore(supabase as any, "user-1", "t1")

    // A segunda chamada (.from("territories")) deve ter recebido o
    // campaign_id da campanha "valid" no update.
    const territoriesUpdateCall = supabase.from.mock.results[1].value.update.mock.calls[0][0]
    expect(territoriesUpdateCall.campaign_id).toBe("valid")
    void today
  })
})
