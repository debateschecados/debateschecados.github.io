// Filters, ordering and scoreboard counts. Pure: no DOM, no globals, so the build,
// the browser and the tests all run the same code.

/** @typedef {import('../src/types.ts').CheckRecord} CheckRecord */
/** @typedef {import('../src/config.ts').Candidate} Candidate */
/** @typedef {import('../src/config.ts').Outlet} Outlet */
/** @typedef {Pick<import('../src/config.ts').Debate, 'id' | 'date' | 'broadcaster'>} Debate */
/** @typedef {ReturnType<typeof createContext>} Context */
/** @typedef {ReturnType<typeof emptyState>} State */

export const BANDS = [
  { id: 'verdadeiro', name: 'Verdadeiro' },
  { id: 'impreciso', name: 'Impreciso' },
  { id: 'falso', name: 'Falso' },
  { id: 'sem faixa', name: 'Sem faixa' },
]

export const FILTERS = ['debate', 'outlet', 'speaker', 'band']

export const NOTICE =
  'Cada agência escolhe o que checar. A mesma fala pode aparecer uma vez por agência, então este placar soma checagens, não falas.'

// Sorts everything once: debates newest first, outlets by name with one pt-BR collator,
// candidates by ballot number, records by debate, outlet, then position on the page.
/** @param {{ records: CheckRecord[], candidates: Candidate[], outlets: Record<string, Outlet>, debates: Debate[] }} data */
export function createContext({ records, candidates, outlets, debates }) {
  const collator = new Intl.Collator('pt-BR')
  const sortedDebates = [...debates].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )
  const outletIds = Object.keys(outlets).sort((a, b) =>
    collator.compare(outlets[a].name, outlets[b].name),
  )
  const rank = (/** @type {string[]} */ ids) => {
    const map = new Map(ids.map((id, i) => [id, i]))
    return (/** @type {string} */ id) => map.get(id) ?? ids.length
  }
  const debateRank = rank(sortedDebates.map((d) => d.id))
  const outletRank = rank(outletIds)
  return {
    records: [...records].sort(
      (a, b) =>
        debateRank(a.debate) - debateRank(b.debate) ||
        outletRank(a.outlet) - outletRank(b.outlet) ||
        a.pos - b.pos,
    ),
    candidates: [...candidates].sort((a, b) => a.number - b.number),
    debates: sortedDebates,
    outlets,
    outletIds,
  }
}

export const emptyState = () => ({
  debate: /** @type {string | null} */ (null),
  outlet: /** @type {string | null} */ (null),
  speaker: /** @type {string | null} */ (null),
  band: /** @type {string | null} */ (null),
  removed: false,
})

// Valid values of each filter, in display order.
/** @param {Context} ctx @param {string} key @returns {string[]} */
export function options(ctx, key) {
  if (key === 'debate') return ctx.debates.map((d) => d.id)
  if (key === 'outlet') return ctx.outletIds
  if (key === 'speaker') return ctx.candidates.map((c) => c.id)
  return BANDS.map((b) => b.id)
}

// Unknown values in a shared link are ignored instead of emptying the list.
/** @param {string} search @param {Context} ctx @returns {State} */
export function readState(search, ctx) {
  const params = new URLSearchParams(search)
  const state = emptyState()
  for (const key of FILTERS) {
    const value = params.get(key)
    if (value !== null && options(ctx, key).includes(value)) state[key] = value
  }
  state.removed = params.get('removed') === '1'
  return state
}

/** @param {State} state */
export function writeState(state) {
  const params = new URLSearchParams()
  for (const key of FILTERS) if (state[key]) params.set(key, state[key])
  if (state.removed) params.set('removed', '1')
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** @param {CheckRecord} record @param {State} state @param {string} [except] */
const matches = (record, state, except) =>
  FILTERS.every((k) => k === except || !state[k] || record[k] === state[k])

// Records the list shows, in display order. `except` ignores one filter (option counts).
/** @param {Context} ctx @param {State} state @param {string} [except] @returns {CheckRecord[]} */
export const listed = (ctx, state, except) =>
  ctx.records.filter((r) => (state.removed || !r.missingSince) && matches(r, state, except))

/** @param {Context} ctx @param {State} state @param {string} key @param {string} value */
export const optionCount = (ctx, state, key, value) =>
  listed(ctx, state, key).filter((r) => r[key] === value).length

/** @param {Context} ctx @param {State} state */
export const removedCount = (ctx, state) =>
  ctx.records.filter((r) => r.missingSince && matches(r, state)).length

// Records no longer found at the source never count (HIST-02).
/** @param {Context} ctx @param {CheckRecord[]} items */
export const scoreboard = (ctx, items) =>
  ctx.candidates.map((candidate) => {
    const mine = items.filter((r) => !r.missingSince && r.speaker === candidate.id)
    return {
      candidate,
      total: mine.length,
      bands: BANDS.map((b) => ({ ...b, n: mine.filter((r) => r.band === b.id).length })),
    }
  })

export const isGeneral = (/** @type {State} */ state) => !state.outlet

/** @param {Context} ctx @param {State} state */
export const notice = (ctx, state) =>
  isGeneral(state) ? NOTICE : `Placar só com as checagens da ${ctx.outlets[state.outlet].name}.`
