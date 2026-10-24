// Claim rows, coverage and relative rigor for the comparison page. Pure, like core.js:
// the build, the browser and the tests all run the same code.

import { options } from './core.js'

/** @typedef {import('./core.js').Context} Context */
/** @typedef {import('../src/types.ts').CheckRecord} CheckRecord */
/** @typedef {import('../src/claims/groups.ts').ClaimGroup} ClaimGroup */
/** @typedef {ReturnType<typeof createComparison>} Comparison */
/** @typedef {Comparison['rows'][number]} Row */
/** @typedef {ReturnType<typeof emptyCompareState>} CompareState */

// A table cell based on fewer claims or comparisons than this is marked "amostra pequena".
export const SMALL = 10

export const isSmall = (/** @type {number} */ base) => base < SMALL

// verdadeiro < impreciso < falso. "sem faixa" has no place in the order and is never compared.
const ORDER = ['verdadeiro', 'impreciso', 'falso']
const rankOf = (/** @type {string | undefined} */ band) => (band ? ORDER.indexOf(band) : -1)

const byId = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0)

// One row per claim group with two or more records still found at the source (CMP-05), cells
// in agency name order, rows by debate newest first, then the smallest page position (CMP-04).
// `curated` holds the record ids of the latest curation input.
/** @param {Context} ctx @param {{ groups: ClaimGroup[] }} file @param {Iterable<string>} curated */
export function createComparison(ctx, file, curated) {
  const records = new Map(ctx.records.map((r) => [r.id, r]))
  const debateRank = (/** @type {string} */ id) => ctx.debates.findIndex((d) => d.id === id)
  const rows = file.groups.flatMap((group) => {
    const members = /** @type {CheckRecord[]} */ (
      group.records.map((id) => records.get(id)).filter((r) => r && !r.missingSince)
    )
    if (members.length < 2) return []
    const ranked = new Set(members.map((r) => r.band).filter((band) => rankOf(band) >= 0))
    return [
      {
        id: group.id,
        debate: group.debate,
        speaker: group.speaker,
        claim: group.claim,
        cells: ctx.outletIds.map((outlet) => members.find((r) => r.outlet === outlet) ?? null),
        divergent: ranked.size >= 2,
        pos: Math.min(...members.map((r) => r.pos)),
      },
    ]
  })
  rows.sort(
    (a, b) => debateRank(a.debate) - debateRank(b.debate) || a.pos - b.pos || byId(a.id, b.id),
  )
  return { rows, curated: new Set(curated) }
}

export const emptyCompareState = () => ({
  debate: /** @type {string | null} */ (null),
  speaker: /** @type {string | null} */ (null),
  div: false,
})

// Unknown values in a shared link are ignored, as on the main page.
/** @param {string} search @param {Context} ctx @returns {CompareState} */
export function readCompareState(search, ctx) {
  const params = new URLSearchParams(search)
  const state = emptyCompareState()
  for (const key of /** @type {const} */ (['debate', 'speaker'])) {
    const value = params.get(key)
    if (value !== null && options(ctx, key).includes(value)) state[key] = value
  }
  state.div = params.get('div') === '1'
  return state
}

/** @param {CompareState} state */
export function writeCompareState(state) {
  const params = new URLSearchParams()
  if (state.debate) params.set('debate', state.debate)
  if (state.speaker) params.set('speaker', state.speaker)
  if (state.div) params.set('div', '1')
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

// A divergence is a row with at least two different bands among verdadeiro, impreciso, falso.
/** @param {Row[]} rows @param {CompareState} state */
export const visibleRows = (rows, state) =>
  rows.filter(
    (r) =>
      (!state.debate || r.debate === state.debate) &&
      (!state.speaker || r.speaker === state.speaker) &&
      (!state.div || r.divergent),
  )

// Both tables count the rows the page lists for the debate filter, whatever the other filters.
/** @param {Row[]} rows @param {string | null} debate */
const inDebate = (rows, debate) => rows.filter((r) => !debate || r.debate === debate)

// Per candidate and agency: rows that include the agency (`n`) out of the candidate's rows
// (`of`), and the agency's curated records in no row (`solo`, "só ela checou").
// SPEC_DEVIATION: records missing from the curation input are left out of `solo`.
// Reason: nobody has looked for other agencies' checks of them yet, so "só ela checou" would
// not be known; the page counts them in the pending notice instead (CMP-06).
/** @param {Context} ctx @param {Comparison} comparison @param {string | null} debate */
export function coverage(ctx, { rows, curated }, debate) {
  const shown = inDebate(rows, debate)
  const grouped = new Set(rows.flatMap((r) => r.cells.flatMap((c) => (c ? [c.id] : []))))
  const solo = ctx.records.filter(
    (r) =>
      !r.missingSince &&
      curated.has(r.id) &&
      !grouped.has(r.id) &&
      (!debate || r.debate === debate),
  )
  return ctx.candidates.map((candidate) => {
    const mine = shown.filter((r) => r.speaker === candidate.id)
    return {
      candidate,
      outlets: ctx.outletIds.map((outlet, i) => ({
        outlet,
        n: mine.filter((r) => r.cells[i]).length,
        of: mine.length,
        solo: solo.filter((r) => r.outlet === outlet && r.speaker === candidate.id).length,
      })),
    }
  })
}

// Per candidate and agency: on each row, one comparison with every other agency whose band is
// in the order; the agency is harsher when its band is higher (RIGOR-02).
/** @param {Context} ctx @param {Comparison} comparison @param {string | null} debate */
export function rigor(ctx, { rows }, debate) {
  const shown = inDebate(rows, debate)
  return ctx.candidates.map((candidate) => ({
    candidate,
    outlets: ctx.outletIds.map((outlet, i) => {
      const cell = { outlet, harsher: 0, equal: 0, milder: 0, n: 0 }
      for (const row of shown) {
        const mine = rankOf(row.cells[i]?.band)
        if (row.speaker !== candidate.id || mine < 0) continue
        row.cells.forEach((other, j) => {
          const theirs = rankOf(other?.band)
          if (j === i || theirs < 0) return
          if (mine > theirs) cell.harsher++
          else if (mine < theirs) cell.milder++
          else cell.equal++
          cell.n++
        })
      }
      return cell
    }),
  }))
}

// Live records that the latest curation input does not hold yet (CMP-06).
/** @param {Context} ctx @param {Set<string>} curated */
export const pendingCount = (ctx, curated) =>
  ctx.records.filter((r) => !r.missingSince && !curated.has(r.id)).length
