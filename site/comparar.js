// Browser side of the comparison page: adopts the pre-rendered matrix and timelines, then
// filters them, and recounts the axes, the coverage and the changed-verdict counts from the rows
// the page lists for the debate filter (RIGOR-06).

import {
  coverage,
  createComparison,
  emptyCompareState,
  inDebate,
  readCompareState,
  visibleRows,
  writeCompareState,
} from './compare.js'
import { createContext } from './core.js'
import { driftCounts } from './drift.js'
import { headline, lean } from './lean.js'
import {
  compareFiltersHtml,
  coverageHtml,
  detailHtml,
  driftCountsHtml,
  leanHtml,
} from './render.js'

const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (document.querySelector(sel))
const all = (/** @type {string} */ sel, /** @type {ParentNode} */ root = document) =>
  /** @type {HTMLElement[]} */ ([...root.querySelectorAll(sel)])

const data = JSON.parse($('#compare-data').textContent ?? '{}')
const ctx = createContext(data)
const comparison = createComparison(ctx, data, data.curated)
const byId = new Map(comparison.rows.map((r) => [r.id, r]))
let state = readCompareState(location.search, ctx)

const seg = $('#debates')
function renderSegmented() {
  let on
  for (const b of seg.querySelectorAll('button')) {
    const pressed = (b.dataset.debate || null) === state.debate
    b.setAttribute('aria-pressed', String(pressed))
    if (pressed) on = b
  }
  if (!on) return
  const thumb = /** @type {HTMLElement} */ (seg.querySelector('.seg-thumb'))
  thumb.style.width = `${on.offsetWidth}px`
  thumb.style.transform = `translateX(${on.offsetLeft}px)`
}

const filters = $('#filters')
const detail = $('#detail')
const narrow = matchMedia('(max-width: 720px)')
/** @type {HTMLElement | null} */
let open = null

// The detail sits under the selected claim in the list layout, under its debate otherwise.
function place() {
  if (!open) return
  if (narrow.matches) open.after(detail)
  else open.closest('.staff')?.append(detail)
}

/** @param {HTMLElement} button */
function show(button) {
  if (open) open.setAttribute('aria-expanded', 'false')
  open = button
  button.setAttribute('aria-expanded', 'true')
  detail.innerHTML = detailHtml(
    /** @type {import('./compare.js').Row} */ (byId.get(button.dataset.id ?? '')),
    ctx,
  )
  place()
  detail.hidden = false
}

function close(focus = true) {
  if (!open) return
  const button = open
  button.setAttribute('aria-expanded', 'false')
  open = null
  detail.hidden = true
  if (focus) button.focus()
}

// Every matrix column and every timeline is pre-rendered; filtering only hides and shows them.
function renderMatrix() {
  const keep = new Set(visibleRows(comparison.rows, state).map((r) => r.id))
  for (const staff of all('#matrix .staff')) {
    let any = false
    for (const block of all('.seg-block', staff)) {
      const buttons = all('button.claim', block)
      for (const b of buttons) b.hidden = !keep.has(/** @type {string} */ (b.dataset.id))
      const n = buttons.filter((b) => !b.hidden).length
      const count = /** @type {HTMLElement} */ (block.querySelector('.seg-label .n'))
      count.textContent = state.div
        ? `${n} de ${buttons.length}`
        : `${buttons.length} ${buttons.length === 1 ? 'fala' : 'falas'}`
      block.hidden = n === 0
      if (n) any = true
    }
    staff.hidden = !any
  }
  $('#empty').hidden = keep.size > 0
  if (open?.hidden || open?.closest('[hidden]')) close(false)
  return keep.size
}

function renderChanges() {
  const items = all('#mudancas li.change')
  for (const li of items) li.hidden = Boolean(state.debate && li.dataset.debate !== state.debate)
  const main = all('#changes > li.change')
  $('#changes-none').hidden = !main.length || main.some((li) => !li.hidden)
  const folded = /** @type {HTMLElement | null} */ (document.querySelector('#keyonly'))
  if (!folded) return
  const n = all('li.change', folded).filter((li) => !li.hidden).length
  const count = /** @type {HTMLElement} */ (folded.querySelector('summary .n'))
  count.textContent = String(n)
  folded.hidden = n === 0
}

function render() {
  const shown = renderMatrix()
  renderSegmented()
  const rows = inDebate(comparison.rows, state.debate)
  const distances = lean(ctx, rows)
  $('#answer').textContent = headline(distances, ctx)
  $('#balance').innerHTML = leanHtml(ctx, distances)
  $('#coverage').innerHTML = coverageHtml(ctx, coverage(ctx, comparison, state.debate))
  $('#drift').innerHTML = driftCountsHtml(ctx, driftCounts(ctx, state.debate))
  renderChanges()
  // The controls are rebuilt, so keyboard focus goes back to the one the visitor was using.
  const focused = /** @type {HTMLElement | null} */ (filters.querySelector(':focus'))
  const again = focused?.dataset.key ? `[data-key="${focused.dataset.key}"]` : '[data-div]'
  filters.innerHTML = compareFiltersHtml(ctx, comparison.rows, state, shown)
  if (focused) /** @type {HTMLElement | null} */ (filters.querySelector(again))?.focus()
}

function update() {
  history.replaceState(null, '', writeCompareState(state) || location.pathname)
  render()
}

document.addEventListener('click', (e) => {
  const target = /** @type {HTMLElement} */ (e.target)
  const debate = /** @type {HTMLElement | null} */ (target.closest('[data-debate]'))
  if (debate?.closest('#debates')) {
    state.debate = debate.dataset.debate || null
    update()
  }
  if (target.closest('[data-clear]')) {
    state = emptyCompareState()
    update()
    // The button left with the empty state; focus moves to the first filter.
    filters.querySelector('select')?.focus()
  }
  const claim = /** @type {HTMLElement | null} */ (target.closest('#matrix button.claim'))
  if (claim) {
    if (claim === open) close()
    else show(claim)
  }
  if (target.closest('[data-close]')) close()
})
document.addEventListener('change', (e) => {
  const target = /** @type {HTMLInputElement} */ (e.target)
  if (target.matches('select[data-key="speaker"]')) {
    state.speaker = target.value || null
    update()
  }
  if (target.matches('[data-div]')) {
    state.div = target.checked
    update()
  }
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close()
})
narrow.addEventListener('change', place)

render()
// Turn on the pill transition only after the first paint, so it does not slide in on load.
requestAnimationFrame(() => seg.classList.add('ready'))
addEventListener('resize', renderSegmented)
document.fonts?.ready.then(renderSegmented)
