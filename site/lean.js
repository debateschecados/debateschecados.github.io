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
// The interval is 97.5% per agency, so that with four agencies the chance that any one gets a
// "mais dura" sentence by chance alone is about 1 in 10 (1 - 0.975^4). Each tail leaves out
// 1.25% of the sorted resamples: sorted[62] to sorted[4937].
const TAIL = Math.floor(B * 0.0125)

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

// Percentile bootstrap of mean(c2) - mean(c1), 97.5%. The generator is a fixed LCG started at 42,
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
  return [stats[TAIL], stats[B - 1 - TAIL]]
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
    const range = interval(values[0], values[1])
    return { outlet, candidates, distance, interval: range, verdict: verdictOf(range) }
  })
}

// Two decimals, as the page prints them; -0 included, so it compares like 0.
const round2 = (/** @type {number} */ v) => Math.round(v * 100) / 100

// The sentence rule of LEAN-03 on the interval ends as printed: an end shown as "0,00" counts
// as containing 0.
/** @param {[number, number]} range @returns {Verdict} */
export function verdictOf([lo, hi]) {
  if (round2(lo) > 0) return 'c2'
  if (round2(hi) < 0) return 'c1'
  return 'none'
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

// "A", "A e B", "A, B e C".
const list = (/** @type {string[]} */ xs) =>
  xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`

// The page's opening line (LEAN-05), in agency order: one sentence per agency with a clear
// difference; when there is none, which agencies show no clear difference, or that none has
// enough claims; then which agencies have a small sample, unless all of them do.
/** @param {Lean} result @param {Context} ctx */
export function headline(result, ctx) {
  const names = (/** @type {Verdict} */ verdict) =>
    result.filter((r) => r.verdict === verdict).map((r) => ctx.outlets[r.outlet].name)
  const lines = result.flatMap((r) => {
    if (r.verdict !== 'c1' && r.verdict !== 'c2') return []
    const c = ctx.candidates[r.verdict === 'c1' ? 0 : 1]
    return [
      `${ctx.outlets[r.outlet].name} foi mais dura com ${called(c)} do que as outras agências.`,
    ]
  })
  const none = names('none')
  const small = names('small')
  if (!lines.length && !none.length)
    return 'Pelos dados de hoje, nenhuma agência tem falas suficientes para medir a diferença.'
  if (!lines.length && !small.length) {
    const n = ctx.outletIds.length
    return `Pelos dados de hoje, nenhuma das ${COUNT[n] ?? n} mostra diferença clara entre os candidatos.`
  }
  if (!lines.length)
    lines.push(
      `Pelos dados de hoje, ${list(none)} ${none.length === 1 ? 'não mostra' : 'não mostram'} diferença clara entre os candidatos.`,
    )
  if (small.length)
    lines.push(`${list(small)} ${small.length === 1 ? 'tem' : 'têm'} amostra pequena.`)
  return lines.join(' ')
}

// "+0,12", "−0,05", "0,00": two decimals, pt-BR comma, a real minus sign, never "−0,00".
export const signed = (/** @type {number} */ v) => {
  const r = round2(v)
  const s = Math.abs(r).toFixed(2).replace('.', ',')
  return r > 0 ? `+${s}` : r < 0 ? `−${s}` : s
}
