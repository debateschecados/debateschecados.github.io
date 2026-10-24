// Distance of each agency from the other agencies on shared claims (LEAN-01..05). Pure, like
// core.js: the build, the browser, `pnpm lean` and the tests all run the same code.

/** @typedef {import('./core.js').Context} Context */
/** @typedef {import('./compare.js').Row} Row */
/** @typedef {'small' | 'none' | 'c1' | 'c2'} Verdict */
/** @typedef {ReturnType<typeof lean>} Lean */

export const SCORE = /** @type {Record<string, number>} */ ({
  verdadeiro: 0,
  impreciso: 1,
  falso: 2,
})
// Below this many deviations for either candidate, no interval and no sentence (LEAN-04).
export const MIN_N = 10
export const B = 5000

// How the fixed sentences name each candidate; any other candidate goes by its short name.
const NAMES = /** @type {Record<string, string>} */ ({ lula: 'Lula', flavio: 'Flávio Bolsonaro' })
const COUNT = ['nenhuma', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito']

const mean = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0) / xs.length

// On each row, every member with a band in SCORE, when there are two or more of them, gets its
// score minus the mean score of the other such members (LEAN-01).
/** @param {Row[]} rows */
export function deviations(rows) {
  return rows.flatMap((row) => {
    const scored = row.cells.flatMap((r) => (r && r.band in SCORE ? [r] : []))
    if (scored.length < 2) return []
    const total = scored.reduce((sum, r) => sum + SCORE[r.band], 0)
    return scored.map((r) => ({
      outlet: r.outlet,
      speaker: row.speaker,
      value: SCORE[r.band] - (total - SCORE[r.band]) / (scored.length - 1),
    }))
  })
}

// Percentile bootstrap of mean(c2) - mean(c1), 90%. The generator is a fixed LCG started at 42,
// one per agency, so the same data always gives the same interval (LEAN-02).
/** @param {number[]} c1 @param {number[]} c2 @returns {[number, number]} */
export function interval(c1, c2) {
  let s = 42
  const draw = (/** @type {number[]} */ xs) => {
    let sum = 0
    for (let i = 0; i < xs.length; i++) {
      s = (s * 1664525 + 1013904223) % 4294967296
      sum += xs[Math.floor((s / 4294967296) * xs.length)]
    }
    return sum / xs.length
  }
  const stats = new Float64Array(B)
  for (let b = 0; b < B; b++) {
    const m2 = draw(c2)
    stats[b] = m2 - draw(c1)
  }
  stats.sort()
  return [stats[Math.round(B * 0.05)], stats[Math.round(B * 0.95) - 1]]
}

// Per agency in name order: n and mean deviation per candidate in ballot order, the distance
// mean(c2) - mean(c1), its interval and the verdict of the sentence rule (LEAN-02..04).
/** @param {Context} ctx @param {Row[]} rows */
export function lean(ctx, rows) {
  const all = deviations(rows)
  const [c1, c2] = ctx.candidates
  return ctx.outletIds.map((outlet) => {
    const values = ctx.candidates.map((c) =>
      all.filter((d) => d.outlet === outlet && d.speaker === c.id).map((d) => d.value),
    )
    const candidates = ctx.candidates.map((c, i) => ({
      id: c.id,
      n: values[i].length,
      mean: values[i].length ? mean(values[i]) : null,
    }))
    const [m1, m2] = candidates.map((c) => c.mean)
    const distance = m1 === null || m2 === null ? null : m2 - m1
    if (!c1 || !c2 || candidates.some((c) => c.n < MIN_N))
      return {
        outlet,
        candidates,
        distance,
        interval: null,
        verdict: /** @type {Verdict} */ ('small'),
      }
    const [lo, hi] = interval(values[0], values[1])
    /** @type {Verdict} */
    const verdict = lo > 0 ? 'c2' : hi < 0 ? 'c1' : 'none'
    return {
      outlet,
      candidates,
      distance,
      interval: /** @type {[number, number]} */ ([lo, hi]),
      verdict,
    }
  })
}

const called = (/** @type {{ id: string, short: string }} */ c) => NAMES[c.id] ?? c.short

// The fixed sentence of LEAN-03, or "amostra pequena" in its place (LEAN-04).
/** @param {Verdict} verdict @param {Context} ctx */
export function sentence(verdict, ctx) {
  if (verdict === 'small') return 'amostra pequena'
  if (verdict === 'none') return 'sem diferença clara entre os candidatos'
  const c = ctx.candidates[verdict === 'c1' ? 0 : 1]
  return `mais dura com ${called(c)} do que as outras agências`
}

// The page's opening line (LEAN-05): one sentence per agency with a clear difference, in agency
// order, or the "nenhuma" sentence when no agency has one.
/** @param {Lean} result @param {Context} ctx */
export function headline(result, ctx) {
  const clear = result.filter((r) => r.verdict === 'c1' || r.verdict === 'c2')
  if (!clear.length) {
    const n = ctx.outletIds.length
    return `Pelos dados de hoje, nenhuma das ${COUNT[n] ?? n} mostra diferença clara entre os candidatos.`
  }
  return clear
    .map((r) => {
      const c = ctx.candidates[r.verdict === 'c1' ? 0 : 1]
      return `${ctx.outlets[r.outlet].name} foi mais dura com ${called(c)} do que as outras agências.`
    })
    .join(' ')
}

// "+0,12", "−0,05", "0,00": two decimals, pt-BR comma, a real minus sign.
export const signed = (/** @type {number} */ v) => {
  const r = Math.round(v * 100) / 100
  const s = Math.abs(r).toFixed(2).replace('.', ',')
  return r > 0 ? `+${s}` : r < 0 ? `−${s}` : s
}
