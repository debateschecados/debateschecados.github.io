// String templates shared by the build (pre-rendered page) and the browser.

import { BANDS, optionCount, removedCount } from './core.js'

/** @typedef {import('./core.js').Context} Context */
/** @typedef {import('./core.js').State} State */
/** @typedef {import('../src/types.ts').CheckRecord} CheckRecord */
/** @typedef {ReturnType<typeof import('./core.js').scoreboard>} Board */

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
  <div class="verdict"><h3>${esc(r.label)}</h3><small>${esc(outlet?.name ?? r.outlet)}</small><small class="band">${esc(bandName(r.band))}</small></div>
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

/** @param {Context} ctx @param {State} state @param {string} key @param {string} label @param {string} all @param {[string, string][]} values */
const select = (ctx, state, key, label, all, values) => {
  const opts = values
    .map(
      ([v, t]) =>
        `<option value="${esc(v)}"${state[/** @type {'outlet'} */ (key)] === v ? ' selected' : ''}>${esc(t)} (${optionCount(ctx, state, key, v)})</option>`,
    )
    .join('')
  return `<label>${label}<select data-key="${key}"><option value="">${all}</option>${opts}</select></label>`
}

// Filter bar. The removed toggle shows only when some removed record matches (HIST-02).
/** @param {Context} ctx @param {State} state @param {number} shown */
export function filtersHtml(ctx, state, shown) {
  const removed = removedCount(ctx, state)
  const toggle = removed
    ? `<label class="toggle"><input type="checkbox" data-removed${state.removed ? ' checked' : ''}>Mostrar removidos (${removed})</label>`
    : ''
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
    toggle +
    `<span class="count"><span class="n">${shown}</span> checagens</span>`
  )
}
