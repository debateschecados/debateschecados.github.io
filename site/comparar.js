// Browser side of the comparison page: adopts the pre-rendered rows, then filters them and
// recounts both tables from the rows the page lists for the debate filter (RIGOR-06).

import {
  coverage,
  createComparison,
  emptyCompareState,
  readCompareState,
  visibleRows,
  writeCompareState,
} from './compare.js'
import { createContext } from './core.js'
import { compareFiltersHtml, coverageHtml } from './render.js'

const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (document.querySelector(sel))

const data = JSON.parse($('#compare-data').textContent ?? '{}')
const ctx = createContext(data)
const comparison = createComparison(ctx, data, data.curated)
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

// Every row is pre-rendered; filtering only hides and shows them.
const rows = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#matrix .claim'))
const filters = $('#filters')

function render() {
  const shown = visibleRows(comparison.rows, state)
  const keep = new Set(shown.map((r) => r.id))
  for (const li of rows) li.hidden = !keep.has(/** @type {string} */ (li.dataset.id))
  $('#empty').hidden = shown.length > 0
  renderSegmented()
  $('#coverage').innerHTML = coverageHtml(ctx, coverage(ctx, comparison, state.debate))
  // The controls are rebuilt, so keyboard focus goes back to the one the visitor was using.
  const focused = /** @type {HTMLElement | null} */ (filters.querySelector(':focus'))
  const again = focused?.dataset.key ? `[data-key="${focused.dataset.key}"]` : '[data-div]'
  filters.innerHTML = compareFiltersHtml(ctx, comparison.rows, state, shown.length)
  if (focused) /** @type {HTMLElement | null} */ (filters.querySelector(again))?.focus()
}

function update() {
  history.replaceState(null, '', writeCompareState(state) || location.pathname)
  render()
}

document.addEventListener('click', (e) => {
  const target = /** @type {HTMLElement} */ (e.target)
  const debate = /** @type {HTMLElement | null} */ (target.closest('[data-debate]'))
  if (debate) {
    state.debate = debate.dataset.debate || null
    update()
  }
  if (target.closest('[data-clear]')) {
    state = emptyCompareState()
    update()
    // The button left with the empty state; focus moves to the first filter.
    filters.querySelector('select')?.focus()
  }
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

render()
// Turn on the pill transition only after the first paint, so it does not slide in on load.
requestAnimationFrame(() => seg.classList.add('ready'))
addEventListener('resize', renderSegmented)
document.fonts?.ready.then(renderSegmented)
