// String templates shared by the build (pre-rendered page) and the browser.

import { isSmall, visibleRows } from './compare.js'
import { BANDS, hasRemoved, liveCount, optionCount, removedCount } from './core.js'
import { direction, previousBand, versions, wordDiff } from './drift.js'
import { MIN_N, sentence, signed } from './lean.js'

/** @typedef {import('./core.js').Context} Context */
/** @typedef {import('./compare.js').Row} Row */
/** @typedef {import('./compare.js').CompareState} CompareState */
/** @typedef {import('./core.js').State} State */
/** @typedef {import('../src/types.ts').CheckRecord} CheckRecord */
/** @typedef {ReturnType<typeof import('./core.js').scoreboard>} Board */
/** @typedef {import('./lean.js').Lean} Lean */
/** @typedef {import('./drift.js').Version} Version */

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const esc = (/** @type {unknown} */ value) =>
  String(value).replace(/[&<>"']/g, (ch) => ENTITIES[/** @type {keyof ENTITIES} */ (ch)])

// "2026-10-23" → "23/10" or "23/10/2026". String split, so no time zone can move the day.
export const shortDate = (/** @type {string} */ iso) =>
  iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/')
export const fullDate = (/** @type {string} */ iso) =>
  iso.slice(0, 10).split('-').reverse().join('/')

export const bandClass = (/** @type {string} */ band) => `band-${band.replace(' ', '-')}`
const bandName = (/** @type {string} */ band) => BANDS.find((b) => b.id === band)?.name ?? band

/** @param {CheckRecord} r @param {Context} ctx */
export function itemHtml(r, ctx) {
  const debate = ctx.debates.find((d) => d.id === r.debate)
  const speaker = ctx.candidates.find((c) => c.id === r.speaker)
  const outlet = ctx.outlets[r.outlet]
  const archived = r.evidence.archiveUrl
    ? ` <a class="src" href="${esc(r.evidence.archiveUrl)}">Cópia arquivada</a>`
    : ''
  const removed = r.missingSince
    ? `<p class="gone">não encontrado na fonte desde ${fullDate(r.missingSince)}</p>`
    : ''
  return `<li class="item ${bandClass(r.band)}${r.missingSince ? ' removed' : ''}" data-id="${esc(r.id)}">
  <div class="verdict" title="Rótulo da agência: ${esc(r.label)}"><h3>${esc(bandName(r.band))}</h3><small>${esc(outlet?.name ?? r.outlet)}</small></div>
  <div>
    <div class="who">${esc(speaker?.short ?? r.speaker)} no debate da ${esc(debate?.broadcaster.name ?? r.debate)}, ${debate ? shortDate(debate.date) : ''}</div>
    <p class="quote">“${esc(r.quote)}”</p>
    ${r.excerpt ? `<p class="excerpt">${esc(r.excerpt)}</p>` : ''}
    <p class="srcs"><a class="src" href="${esc(r.url)}">Ler a checagem completa</a>${archived}</p>
    ${removed}
  </div>
</li>`
}

// Scoreboard cards. The browser keeps the markup and only updates the numbers.
/** @param {Board} board @param {State} state @param {Context} ctx */
export function boardHtml(board, state, ctx) {
  const scope = state.outlet ? ` da ${esc(ctx.outlets[state.outlet].name)}` : ''
  return board
    .map(({ candidate: c, total, bands }) => {
      const last = bands.findLastIndex((b) => b.n)
      const bar = bands
        .map(
          (b, i) =>
            `<span class="${bandClass(b.id)}${b.n ? '' : ' zero'}${i === last ? ' end' : ''}" style="--i:${i};flex-grow:${b.n}" title="${b.name}: ${b.n}"></span>`,
        )
        .join('')
      const legend = bands
        .map(
          (b) =>
            `<div class="${bandClass(b.id)}"><strong data-v="${b.n}">${b.n}</strong><span>${b.name}</span></div>`,
        )
        .join('')
      return `<article class="cand" data-speaker="${esc(c.id)}">
  <div class="cand-head">
    <div class="portrait">
      <img class="face" src="sprites/${esc(c.sprite)}.svg" alt="">
      <img class="party" src="${esc(c.partyLogo)}" alt="${esc(c.party)}" title="${esc(c.party)}">
    </div>
    <div>
      <h2>${esc(c.name)}</h2>
      <div class="total"><span class="n" data-v="${total}">${total}</span> checagens<span class="scope">${scope}</span></div>
    </div>
  </div>
  <div class="bar">${bar}<i class="shine"></i></div>
  <div class="legend">${legend}</div>
</article>`
    })
    .join('')
}

// Debate selector: "Os dois" plus one button per debate with the broadcaster logo.
/** @param {Context} ctx */
export function debatesHtml(ctx) {
  const buttons = [
    `<button type="button" data-debate="">Os dois</button>`,
    ...ctx.debates.map(
      (d) =>
        `<button type="button" data-debate="${esc(d.id)}"><img src="${esc(d.broadcaster.logo)}" alt="">${esc(d.broadcaster.name)} ${shortDate(d.date)}</button>`,
    ),
  ]
  return `<span class="seg-thumb"></span>${buttons.join('')}`
}

// Popup button in the site's style instead of the native select (site/combo.js runs it).
// Every label sits in the button, stacked, so its width fits the longest one and never jumps.
/** @param {Context} ctx @param {State} state @param {string} key @param {string} label @param {string} all @param {[string, string][]} values */
const select = (ctx, state, key, label, all, values) => {
  const current = state[/** @type {'outlet'} */ (key)] ?? ''
  const options = [
    ['', all, ''],
    ...values.map(([v, t]) => [v, t, String(optionCount(ctx, state, key, v))]),
  ]
  const faces = options
    .map(
      ([v, t, n]) =>
        `<span${v === current ? ` id="f-${key}-v"` : ' aria-hidden="true"'}>${esc(t)}${n ? ` <span class="n">(${n})</span>` : ''}</span>`,
    )
    .join('')
  const items = options
    .map(
      ([v, t, n], i) =>
        `<li role="option" id="f-${key}-${i}" data-value="${esc(v)}" aria-selected="${v === current}">${esc(t)}${n ? `<span class="n">${n}</span>` : ''}</li>`,
    )
    .join('')
  return (
    `<div class="combo"><span class="combo-label" id="f-${key}">${label}</span>` +
    `<button type="button" class="combo-btn" data-key="${key}" data-value="${esc(current)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="f-${key}-list" aria-labelledby="f-${key} f-${key}-v">${faces}</button>` +
    `<ul class="combo-list" id="f-${key}-list" role="listbox" tabindex="-1" aria-labelledby="f-${key}">${items}</ul></div>`
  )
}

// Tabs: live checks, and the ones the agencies took down (HIST-02). Counts follow the filters.
/** @param {Context} ctx @param {State} state */
export function tabsHtml(ctx, state) {
  if (!hasRemoved(ctx)) return ''
  const tab = (
    /** @type {boolean} */ removed,
    /** @type {string} */ name,
    /** @type {number} */ n,
  ) =>
    `<button type="button" data-tab="${removed ? 'removed' : 'live'}" aria-pressed="${state.removed === removed}">${name} <span>${n}</span></button>`
  return (
    tab(false, 'Checagens', liveCount(ctx, state)) +
    tab(true, 'Removidas', removedCount(ctx, state))
  )
}

// Filter bar. The search box lives outside it so typing never loses focus.
/** @param {Context} ctx @param {State} state @param {number} shown */
export function filtersHtml(ctx, state, shown) {
  return (
    select(
      ctx,
      state,
      'outlet',
      'Agência',
      'Todas',
      ctx.outletIds.map((id) => [id, ctx.outlets[id].name]),
    ) +
    select(
      ctx,
      state,
      'speaker',
      'Candidato',
      'Todos',
      ctx.candidates.map((c) => [c.id, c.short]),
    ) +
    select(
      ctx,
      state,
      'band',
      'Veredito',
      'Todos',
      BANDS.map((b) => [b.id, b.name]),
    ) +
    `<span class="count"><span class="n">${shown}</span> checagens</span>`
  )
}

const plural = (/** @type {number} */ n, /** @type {string} */ one, /** @type {string} */ many) =>
  `${n} ${n === 1 ? one : many}`

const SMALL_SAMPLE = '<span class="small">amostra pequena</span>'

// Agencies always in name order and candidates in ballot order, never sorted by a number,
// and no column adds up an agency across candidates (RIGOR-05).
/** @template {{ candidate: { short: string }, outlets: unknown[] }} T @param {Context} ctx @param {T[]} columns @param {(cell: T['outlets'][number], column: T) => string} cell */
const agencyTable = (ctx, columns, cell) =>
  `<table><thead><tr><th>Agência</th>${columns.map((c) => `<th>${esc(c.candidate.short)}</th>`).join('')}</tr></thead><tbody>${ctx.outletIds
    .map(
      (outlet, i) =>
        `<tr><th scope="row">${esc(ctx.outlets[outlet].name)}</th>${columns.map((c) => `<td>${cell(c.outlets[i], c)}</td>`).join('')}</tr>`,
    )
    .join('')}</tbody></table>`

// One mark per claim in page order, filled when the agency checked it (RIGOR-01).
/** @param {Context} ctx @param {ReturnType<typeof import('./compare.js').coverage>} cov */
export const coverageHtml = (ctx, cov) =>
  agencyTable(ctx, cov, (o, { candidate }) => {
    const marks = o.marks.map((on) => `<i${on ? ' class="on"' : ''}></i>`).join('')
    const alt = `${ctx.outlets[o.outlet].name} checou ${o.n} de ${plural(o.of, 'fala', 'falas')} de ${candidate.short}`
    return `<span class="marks" role="img" aria-label="${esc(alt)}">${marks}</span><span class="line"><b>${o.n}</b> de ${plural(o.of, 'fala', 'falas')}</span><span class="line"><b>${o.solo}</b> só ela checou</span>${isSmall(o.of) ? SMALL_SAMPLE : ''}`
  })

const CHANGES = /** @type {const} */ ([
  ['harsher', 'ficou mais dura', 'ficaram mais duras'],
  ['milder', 'ficou mais branda', 'ficaram mais brandas'],
  ['gained', 'ganhou faixa', 'ganharam faixa'],
  ['lost', 'perdeu a faixa', 'perderam a faixa'],
])

// Band changes per agency and candidate, or "nenhuma mudança" (DRIFT-04).
/** @param {Context} ctx @param {ReturnType<typeof import('./drift.js').driftCounts>} counts */
export const driftCountsHtml = (ctx, counts) =>
  agencyTable(ctx, counts, (o) => {
    const lines = CHANGES.flatMap(([key, one, many]) =>
      o[key] ? [`<span class="line"><b>${o[key]}</b> ${o[key] === 1 ? one : many}</span>`] : [],
    )
    return lines.join('') || '<span class="line none">nenhuma mudança</span>'
  })

// A band's dot; the hollow "não checou" dot has no band.
const dot = (/** @type {string | null} */ band) =>
  `<i class="dot ${band ? bandClass(band) : 'none'}" aria-hidden="true"></i>`

/** @param {Context} ctx @param {string} id */
const debateOf = (ctx, id) => {
  const d = ctx.debates.find((x) => x.id === id)
  return d ? `${d.broadcaster.name}, ${shortDate(d.date)}` : id
}

/** @param {Context} ctx @param {string} id */
const speakerOf = (ctx, id) => ctx.candidates.find((c) => c.id === id)

// One column of the dot matrix: a button named by the claim and every agency's band. Each dot
// has its own text alternative, and a dot whose band changed is marked (CMP-01, CMP-08, DRIFT-05).
/** @param {Row} row @param {Context} ctx */
export function claimHtml(row, ctx) {
  const who = speakerOf(ctx, row.speaker)?.short ?? row.speaker
  // The claim goes inside sentences, so its own final period is dropped.
  const claim = row.claim.replace(/\.$/, '')
  const parts = row.cells.map((r, i) => {
    const name = ctx.outlets[ctx.outletIds[i]].name
    if (!r) return { name, text: 'não checou', dot: 'none', before: null }
    return { name, text: r.band, dot: bandClass(r.band), before: previousBand(ctx, r) }
  })
  const dots = parts
    .map((p) => {
      const was = p.before ? `, antes ${p.before}` : ''
      const alt = `${p.name}: ${p.text}${was}. ${claim}`
      return `<i class="dot ${p.dot}${p.before ? ' moved' : ''}" role="img" aria-label="${esc(alt)}"></i>`
    })
    .join('')
  const summary = parts
    .map((p) => `${p.name}: ${p.text}${p.before ? `, antes ${p.before}` : ''}`)
    .join('; ')
  const name = `${who}: ${claim}. ${row.divergent ? 'Divergência. ' : ''}${summary}.`
  return `<button type="button" class="claim${row.divergent ? ' div' : ''}" data-id="${esc(row.id)}" aria-expanded="false" aria-controls="detail" aria-label="${esc(name)}"><span class="txt">${esc(row.claim)}</span><span class="dots">${dots}</span></button>`
}

// The dot matrix: per debate, newest first, per candidate in ballot order, one column per row
// in page order (CMP-04) and one lane per agency in name order.
/** @param {Context} ctx @param {Row[]} rows */
export function matrixHtml(ctx, rows) {
  const lanes = ['Fala', ...ctx.outletIds.map((id) => ctx.outlets[id].name)]
    .map((name) => `<span>${esc(name)}</span>`)
    .join('')
  return ctx.debates
    .map((debate) => {
      const blocks = ctx.candidates
        .map((c) => {
          const mine = rows.filter((r) => r.debate === debate.id && r.speaker === c.id)
          return `<div class="seg-block" data-speaker="${esc(c.id)}"><div class="seg-label"><img src="sprites/${esc(c.sprite)}.svg" alt="">${esc(c.short)} <span class="n">${plural(mine.length, 'fala', 'falas')}</span></div><div class="cols">${mine.map((r) => claimHtml(r, ctx)).join('')}</div></div>`
        })
        .join('')
      return `<section class="staff" data-debate="${esc(debate.id)}"><h3>Debate da ${esc(debateOf(ctx, debate.id))}</h3><div class="score"><div class="lanes" aria-hidden="true">${lanes}</div><div class="segs">${blocks}</div></div></section>`
    })
    .join('')
}

const CLOSE =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'

// What the detail of a selected claim shows: speaker, debate, the claim, and per agency the
// band, its own label as text, the band before a band change and the link, or "não checou"
// (CMP-02, DRIFT-05).
/** @param {Row} row @param {Context} ctx */
export function detailHtml(row, ctx) {
  const who = speakerOf(ctx, row.speaker)
  const members = row.cells.filter((r) => r !== null)
  const bands = new Set(members.map((r) => r.band))
  const note = row.divergent
    ? `${members.length} agências checaram esta fala e deram faixas diferentes.`
    : bands.size === 1
      ? `${members.length} agências checaram esta fala e deram a mesma faixa.`
      : `${members.length} agências checaram esta fala.`
  const verdicts = row.cells
    .map((r, i) => {
      const name = `<span class="ag">${esc(ctx.outlets[ctx.outletIds[i]].name)}</span>`
      if (!r) return `<li class="no">${name}<span class="band">${dot(null)}não checou</span></li>`
      const before = previousBand(ctx, r)
      const was = before ? `<span class="was">faixa anterior: ${before}</span>` : ''
      return `<li>${name}<span class="band">${dot(r.band)}${r.band}</span><span class="lab">rótulo da agência: <q>${esc(r.label)}</q></span>${was}<a class="go" href="${esc(r.url)}">Ler a checagem</a></li>`
    })
    .join('')
  return `<button type="button" class="close" data-close aria-label="Fechar">${CLOSE}</button>
<p class="who-line">${esc(who?.short ?? row.speaker)} no debate da ${esc(debateOf(ctx, row.debate))}</p>
<blockquote>${esc(row.claim)}</blockquote>
<p class="divnote">${note}</p>
<ul class="verdicts">${verdicts}</ul>
<p class="gid-line">Código do grupo: <code class="gid">${esc(row.id)}</code></p>`
}

// The axes reach a little past the largest point or interval end, in steps of 0.25, never
// less than 0.5 on each side, so every bar fits. Only agencies with an interval are drawn.
// Past 1 the ticks go every 0.5, so the domain rounds up to a multiple of 0.5 and 0 stays a tick.
/** @param {Lean} result */
export function axisDomain(result) {
  const values = result.flatMap((r) => (r.interval ? [r.distance ?? 0, ...r.interval] : []))
  const top = Math.max(...values.map(Math.abs), 0)
  const domain = Math.max(0.5, Math.ceil((top + 0.05) * 4) / 4)
  return domain > 1 ? Math.ceil(domain * 2) / 2 : domain
}

/** @param {number} domain */
const scale = (domain) => (/** @type {number} */ v) =>
  `${Math.round(((Math.max(-domain, Math.min(domain, v)) + domain) / (2 * domain)) * 10000) / 100}%`

// A label near an end of the axis is anchored inward, so it stays inside the track.
const anchor = (/** @type {string} */ x) => {
  const p = Number.parseFloat(x)
  return p < 8 ? 'start' : p > 92 ? 'end' : 'middle'
}

// One horizontal axis per agency in name order, from "mais dura com Lula" to "mais dura com
// Flávio": the zero line over the interval bar, the point over both, no shaded zone around
// zero; the sentence of the fixed rule, or "amostra pequena" with an empty axis and the
// numbers as text only (LEAN-03, LEAN-04, LEAN-06).
/** @param {Context} ctx @param {Lean} result */
export function leanHtml(ctx, result) {
  const domain = axisDomain(result)
  const x = scale(domain)
  const [c1, c2] = ctx.candidates
  // Ticks every 0.25, or every 0.5 on a wide scale, so the labels stay readable on a phone.
  const step = domain > 1 ? 0.5 : 0.25
  const ticks = Array.from({ length: (2 * domain) / step + 1 }, (_, i) => -domain + i * step)
  const grid = ticks.filter((v) => v !== 0)
  const rows = result
    .map((r) => {
      const name = ctx.outlets[r.outlet].name
      const sub = r.candidates
        .map((c, i) => {
          const who = esc(ctx.candidates[i].short)
          return `<span>com ${who} ${c.mean === null ? 'sem dados' : signed(c.mean)}, ${plural(c.n, 'fala', 'falas')}</span>`
        })
        .join('')
      const said = sentence(r.verdict, ctx)
      const rule = `${said[0].toUpperCase()}${said.slice(1)}.`
      const distance = r.distance === null ? null : signed(r.distance)
      const nums = r.interval
        ? `Distância ${distance}, intervalo de 97,5% de ${signed(r.interval[0])} a ${signed(r.interval[1])}.`
        : distance === null
          ? 'Sem falas em comum para medir.'
          : `Distância ${distance}. Menos de ${MIN_N} falas de um dos candidatos, sem intervalo.`
      const parts = grid.map(
        (v) => `<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="4" y2="60"></line>`,
      )
      parts.push('<line class="base" x1="0" x2="100%" y1="34" y2="34"></line>')
      if (r.interval) {
        const [lo, hi] = r.interval.map(x)
        const width = `${Math.round((Number.parseFloat(hi) - Number.parseFloat(lo)) * 100) / 100}%`
        parts.push(
          `<rect class="ci" x="${lo}" y="30" width="${width}" height="8" rx="4"></rect>`,
          `<line class="ci-end" x1="${lo}" x2="${lo}" y1="27" y2="41"></line>`,
          `<line class="ci-end" x1="${hi}" x2="${hi}" y1="27" y2="41"></line>`,
        )
        const close = Number.parseFloat(hi) - Number.parseFloat(lo) < 16
        const ends = close
          ? [
              [
                x((r.interval[0] + r.interval[1]) / 2),
                `${signed(r.interval[0])} a ${signed(r.interval[1])}`,
              ],
            ]
          : [
              [lo, signed(r.interval[0])],
              [hi, signed(r.interval[1])],
            ]
        for (const [at, text] of ends)
          parts.push(
            `<text class="end" x="${at}" y="60" text-anchor="${anchor(at)}">${text}</text>`,
          )
      }
      parts.push('<line class="zero" x1="50%" x2="50%" y1="20" y2="48"></line>')
      if (r.interval && distance !== null) {
        const at = x(/** @type {number} */ (r.distance))
        parts.push(
          `<circle class="pt" cx="${at}" cy="34" r="4"></circle>`,
          `<text class="pt-label" x="${at}" y="14" text-anchor="${anchor(at)}">${distance}</text>`,
        )
      }
      const alt = `${name}: ${said}. ${nums}`
      return `<li class="lean-row" data-outlet="${esc(r.outlet)}" data-verdict="${r.verdict}">
  <div class="who"><strong>${esc(name)}</strong><span class="sub">${sub}</span></div>
  <svg class="track" width="100%" height="70" role="img" aria-label="${esc(alt)}">${parts.join('')}</svg>
  <p class="says"><span class="rule">${esc(rule)}</span><span class="nums">${nums}</span></p>
</li>`
    })
    .join('\n')
  const labels = ticks
    .map(
      (v) =>
        `<text x="${x(v)}" y="14" text-anchor="${anchor(x(v))}"${v === 0 ? ' class="z"' : ''}>${v === 0 ? '0' : signed(v)}</text>`,
    )
    .join('')
  const end = (/** @type {typeof c1} */ c, /** @type {string} */ side) =>
    `<div class="end ${side}"><img src="sprites/${esc(c.sprite)}.svg" alt=""><span><b>Mais dura com ${esc(c.short)}</b> do que as outras</span></div>`
  return `<div class="ends">${end(c1, 'left')}${end(c2, 'right')}</div>
<ol class="lean-rows">${rows}</ol>
<div class="axis"><svg class="ticks" width="100%" height="20" aria-hidden="true">${labels}</svg><p class="cap">Zero: igual às outras agências. Escala: verdadeiro 0, impreciso 1, falso 2.</p></div>
<div class="howto"><span class="k"><i class="k-pt"></i>distância medida</span><span class="k"><i class="k-ci"></i>intervalo de 97,5%</span><span class="k"><i class="k-z"></i>zero, sem diferença</span></div>`
}

// Each change of a record, from the version before it: band direction, quote edit, new key.
/** @param {Version} older @param {Version} newer */
const whatChanged = (older, newer) => {
  const notes = []
  const dir = direction(older.band, newer.band)
  if (dir) notes.push(CHANGES.find(([key]) => key === dir)?.[1] ?? '')
  else if (older.label !== newer.label) notes.push('trocou o rótulo, mesma faixa')
  if (older.quote !== newer.quote) notes.push('editou a citação')
  if (older.key !== newer.key) notes.push('a agência trocou o identificador interno')
  return notes
}

/** @param {Version} v */
const span = (v) =>
  v.since && v.until
    ? `de ${shortDate(v.since)} a ${shortDate(v.until)}`
    : v.until
      ? `até ${shortDate(v.until)}`
      : `desde ${shortDate(v.since ?? '')}, versão atual`

/** @param {{ op: string, text: string }[]} runs */
const diffHtml = (runs) =>
  runs
    .map((r) =>
      r.op === '-'
        ? `<del>${esc(r.text)}</del>`
        : r.op === '+'
          ? `<ins>${esc(r.text)}</ins>`
          : esc(r.text),
    )
    .join(' ')

// One changed record as a timeline from the first version to the current one, each version
// with its label, band and dates; a quote edit shows the words removed and added (DRIFT-03).
/** @param {CheckRecord} r @param {Context} ctx */
export function changeHtml(r, ctx) {
  const list = versions(ctx, r)
  const who = speakerOf(ctx, r.speaker)
  const chips = list
    .map((v, i) => {
      const notes = i ? whatChanged(list[i - 1], v) : []
      const dir = notes.length ? `<span class="dir">${notes.join(', ')}</span>` : ''
      return `<li class="ver${i === list.length - 1 ? ' now' : ' old'}"><span class="v">${dot(v.band)}${esc(v.label)}</span><span class="b">${v.band}</span>${dir}<span class="d">${span(v)}</span></li>`
    })
    .join('')
  const edits = list
    .slice(1)
    .flatMap((v, i) =>
      v.quote === list[i].quote
        ? []
        : [
            `<p class="qdiff">Citação editada em ${shortDate(v.since ?? '')}: ${diffHtml(wordDiff(list[i].quote, v.quote))}</p>`,
          ],
    )
    .join('')
  return `<li class="change" data-debate="${esc(r.debate)}" data-id="${esc(r.id)}">
  <img src="sprites/${esc(who?.sprite ?? r.speaker)}.svg" alt="">
  <p class="meta">${esc(ctx.outlets[r.outlet].name)}, debate da ${esc(debateOf(ctx, r.debate))}, <a href="${esc(r.url)}">ler a checagem</a></p>
  <p class="q">${esc(who?.short ?? r.speaker)}: “${esc(r.quote)}”</p>
  <ol class="tl">${chips}</ol>${edits}
</li>`
}

// Changed records whose label or quote changed get a full timeline; those where only the
// agency's internal key changed are listed apart, folded, since nothing a reader sees changed.
/** @param {CheckRecord[]} records @param {Context} ctx */
export function changesHtml(records, ctx) {
  const keyOnly = (/** @type {CheckRecord} */ r) => {
    const list = versions(ctx, r)
    return list.every((v) => v.label === list[0].label && v.quote === list[0].quote)
  }
  const shown = records.filter((r) => !keyOnly(r))
  const folded = records.filter(keyOnly)
  const main = shown.length
    ? `<ol class="changes" id="changes">${shown.map((r) => changeHtml(r, ctx)).join('\n')}</ol>`
    : '<p class="changes none" id="changes">Nenhuma checagem mudou de rótulo nem de citação.</p>'
  const rest = folded.length
    ? `<details class="keyonly" id="keyonly"><summary><span class="n">${folded.length}</span> ${folded.length === 1 ? 'checagem só trocou' : 'checagens só trocaram'} o identificador interno, sem mudar rótulo nem citação</summary><ol class="changes">${folded.map((r) => changeHtml(r, ctx)).join('\n')}</ol></details>`
    : ''
  return main + rest
}

// Candidate select and the divergence toggle; counts apply the other filters.
/** @param {Context} ctx @param {Row[]} rows @param {CompareState} state @param {number} shown */
export function compareFiltersHtml(ctx, rows, state, shown) {
  const opts = ctx.candidates
    .map(
      (c) =>
        `<option value="${esc(c.id)}"${state.speaker === c.id ? ' selected' : ''}>${esc(c.short)} (${visibleRows(rows, { ...state, speaker: c.id }).length})</option>`,
    )
    .join('')
  const divergent = visibleRows(rows, { ...state, div: true }).length
  return (
    `<label>Candidato<select data-key="speaker"><option value="">Todos</option>${opts}</select></label>` +
    `<label class="toggle"><input type="checkbox" data-div${state.div ? ' checked' : ''}>Só divergências (${divergent})</label>` +
    `<span class="count"><span class="n">${shown}</span> ${shown === 1 ? 'fala' : 'falas'}</span>`
  )
}

// Records published after the last curation run (CMP-06); nothing when there are none.
export const pendingText = (/** @type {number} */ n) =>
  n === 0
    ? ''
    : n === 1
      ? '1 checagem publicada depois da última revisão ainda não foi agrupada.'
      : `${n} checagens publicadas depois da última revisão ainda não foram agrupadas.`
