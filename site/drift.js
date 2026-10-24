// Versions of checks whose verdict, quote or source key changed after publication (DRIFT-03..05).
// Pure, like core.js: the build, the browser and the tests all run the same code.

/** @typedef {import('./core.js').Context} Context */
/** @typedef {import('../src/types.ts').CheckRecord} CheckRecord */
/** @typedef {import('../src/types.ts').HistoryEntry} HistoryEntry */
/** @typedef {ReturnType<typeof versions>[number]} Version */
/** @typedef {'harsher' | 'milder' | 'gained' | 'lost'} Direction */

// verdadeiro < impreciso < falso; "sem faixa" has no place in the order.
const ORDER = ['verdadeiro', 'impreciso', 'falso']

const shown = (/** @type {HistoryEntry} */ h) =>
  h.label !== undefined || h.quote !== undefined || h.key !== undefined

// Oldest version first. Each history entry holds the old value of every field that changed on
// its date, so the versions are rebuilt from the current record backwards. An old label gets
// the band it maps to in today's table. Entries that changed only the speaker are skipped.
/** @param {Context} ctx @param {CheckRecord} record */
export function versions(ctx, record) {
  const list = [
    {
      label: record.label,
      band: record.band,
      quote: record.quote,
      key: record.key,
      since: /** @type {string | null} */ (null),
      until: /** @type {string | null} */ (null),
    },
  ]
  for (const h of (record.history ?? []).filter(shown).toReversed()) {
    const newer = list[0]
    newer.since = h.until
    list.unshift({
      label: h.label ?? newer.label,
      band: h.label === undefined ? newer.band : ctx.bandOf(record.outlet, h.label),
      quote: h.quote ?? newer.quote,
      key: h.key === undefined ? newer.key : h.key,
      since: null,
      until: h.until,
    })
  }
  return list
}

// Where a band change went, or null when the band stayed the same (DRIFT-04).
/** @param {string} from @param {string} to @returns {Direction | null} */
export function direction(from, to) {
  const [a, b] = [ORDER.indexOf(from), ORDER.indexOf(to)]
  if (a === b) return null
  if (a < 0) return 'gained'
  if (b < 0) return 'lost'
  return b > a ? 'harsher' : 'milder'
}

// Word-level longest common subsequence of a and b, as runs of kept ('='), removed ('-') and
// added ('+') words, so a quote edit shows exactly what the agency took out and put in.
/** @param {string} a @param {string} b */
export function wordDiff(a, b) {
  const x = a.split(/\s+/).filter(Boolean)
  const y = b.split(/\s+/).filter(Boolean)
  // lcs[i][j]: length of the common subsequence of x[i..] and y[j..].
  const lcs = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  /** @type {{ op: '=' | '-' | '+', text: string }[]} */
  const runs = []
  const push = (/** @type {'=' | '-' | '+'} */ op, /** @type {string} */ word) => {
    const last = runs.at(-1)
    if (last?.op === op) last.text += ` ${word}`
    else runs.push({ op, text: word })
  }
  // On a tie the removed word goes first, so a replaced word reads as removed, then added.
  let [i, j] = [0, 0]
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      push('=', x[i])
      i++
      j++
    } else if (j >= y.length || (i < x.length && lcs[i + 1][j] >= lcs[i][j + 1])) push('-', x[i++])
    else push('+', y[j++])
  }
  return runs
}

// Live records with a label, quote or key change, in the archive's order: debate newest first,
// agency name, position on the page (DRIFT-03).
/** @param {Context} ctx @param {string | null} debate */
export const changed = (ctx, debate) =>
  ctx.records.filter(
    (r) => !r.missingSince && (!debate || r.debate === debate) && r.history?.some(shown),
  )

// Per candidate and agency, the band changes between consecutive versions (DRIFT-04).
/** @param {Context} ctx @param {string | null} debate */
export function driftCounts(ctx, debate) {
  const records = changed(ctx, debate)
  return ctx.candidates.map((candidate) => ({
    candidate,
    outlets: ctx.outletIds.map((outlet) => {
      const cell = { outlet, harsher: 0, milder: 0, gained: 0, lost: 0 }
      for (const r of records) {
        if (r.outlet !== outlet || r.speaker !== candidate.id) continue
        const list = versions(ctx, r)
        for (let i = 1; i < list.length; i++) {
          const dir = direction(list[i - 1].band, list[i].band)
          if (dir) cell[dir]++
        }
      }
      return cell
    }),
  }))
}

// The band a record had before its latest band change, or null when its band never changed.
/** @param {Context} ctx @param {CheckRecord} record */
export function previousBand(ctx, record) {
  const list = versions(ctx, record)
  return list.findLast((v) => v.band !== record.band)?.band ?? null
}
