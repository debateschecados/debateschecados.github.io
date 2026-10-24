// Browser side: adopts the pre-rendered page, then filters, animates and runs the audit panel.

import {
  createContext,
  emptyState,
  listed,
  notice,
  readState,
  scoreboard,
  writeState,
} from './core.js'
import { filtersHtml } from './render.js'

const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (document.querySelector(sel))

const data = JSON.parse($('#data').textContent ?? '{}')
const ctx = createContext(data)
let state = readState(location.search, ctx)

const reduce = matchMedia('(prefers-reduced-motion: reduce)')
const EASE = 'cubic-bezier(.2,.8,.2,1)'

// Counts roll from the value on screen to the new one.
/** @param {HTMLElement & { _raf?: number }} el @param {number} to @param {boolean} animate */
function tween(el, to, animate) {
  const from = el.dataset.v === undefined ? to : Number(el.dataset.v)
  el.dataset.v = String(to)
  cancelAnimationFrame(el._raf ?? 0)
  if (from === to || !animate || reduce.matches) {
    el.textContent = String(to)
    return
  }
  const t0 = performance.now()
  const step = (/** @type {number} */ t) => {
    const k = Math.min(1, (t - t0) / 650)
    el.textContent = String(Math.round(from + (to - from) * (1 - (1 - k) ** 3)))
    if (k < 1) el._raf = requestAnimationFrame(step)
  }
  el._raf = requestAnimationFrame(step)
}

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

const board = $('#board')
/** @param {import('./core.js').CheckRecord[]} items */
function renderBoard(items) {
  const ready = Boolean(board.dataset.ready)
  for (const row of scoreboard(ctx, items)) {
    const card = /** @type {HTMLElement} */ (
      board.querySelector(`[data-speaker="${CSS.escape(row.candidate.id)}"]`)
    )
    const segs = /** @type {NodeListOf<HTMLElement>} */ (card.querySelectorAll('.bar span'))
    const changed = row.bands.some((b, i) => String(b.n) !== segs[i].style.flexGrow)
    const last = row.bands.findLastIndex((b) => b.n)
    segs.forEach((el, i) => {
      const b = row.bands[i]
      el.style.flexGrow = String(b.n)
      el.title = `${b.name}: ${b.n}`
      el.classList.toggle('zero', !b.n)
      el.classList.toggle('end', i === last)
    })
    tween(/** @type {HTMLElement} */ (card.querySelector('.total .n')), row.total, ready)
    const scope = /** @type {HTMLElement} */ (card.querySelector('.scope'))
    scope.textContent = state.outlet ? ` da ${ctx.outlets[state.outlet].name}` : ''
    card.querySelectorAll('.legend strong').forEach((el, i) => {
      tween(/** @type {HTMLElement} */ (el), row.bands[i].n, ready)
    })
    if (changed && ready && !reduce.matches) {
      card
        .querySelector('.shine')
        ?.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(260%)' }], {
          duration: 900,
          delay: 250,
          easing: 'ease-in-out',
        })
    }
  }
  board.dataset.ready = '1'
}

// Every record has a pre-rendered node; nodes are attached or detached, never rebuilt.
const list = $('#list')
/** @type {Map<string, HTMLElement>} */
const nodes = new Map()
for (const li of list.querySelectorAll('li[data-id]')) {
  nodes.set(
    /** @type {string} */ (/** @type {HTMLElement} */ (li).dataset.id),
    /** @type {HTMLElement} */ (li),
  )
}
list.classList.add('show-removed')
/** @type {Set<string>} */
let shown = new Set(nodes.keys())

// FLIP: items that stay glide to their new place, items that leave fade out
// where they were, new ones rise in. Only rows near the viewport animate.
/** @param {import('./core.js').CheckRecord[]} items */
function renderList(items) {
  const animate = Boolean(list.dataset.ready) && !reduce.matches
  const near = (/** @type {DOMRect} */ r) => r.bottom > -innerHeight && r.top < 2 * innerHeight
  /** @type {Map<string, DOMRect>} */
  const before = new Map()
  if (animate) {
    for (const id of shown) {
      const r = nodes.get(id)?.getBoundingClientRect()
      if (r && near(r)) before.set(id, r)
    }
  }

  const box = list.getBoundingClientRect()
  const keep = new Set(items.map((r) => r.id))
  for (const id of shown) {
    const el = nodes.get(id)
    if (keep.has(id) || !el) continue
    const r = before.get(id)
    if (!r) {
      el.remove()
      continue
    }
    Object.assign(el.style, {
      position: 'absolute',
      top: `${r.top - box.top}px`,
      left: `${r.left - box.left}px`,
      width: `${r.width}px`,
      pointerEvents: 'none',
    })
    el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], {
      duration: 160,
      easing: 'ease-in',
      fill: 'forwards',
    }).finished.then(
      () => {
        if (!shown.has(id)) el.remove()
      },
      () => {},
    )
  }

  list.querySelector('.empty')?.remove()
  for (const r of items) {
    const el = /** @type {HTMLElement} */ (nodes.get(r.id))
    if (!shown.has(r.id) || el.style.position) {
      for (const a of el.getAnimations()) a.cancel()
      el.removeAttribute('style')
    }
    list.append(el)
  }
  shown = keep
  if (!items.length) {
    list.insertAdjacentHTML(
      'beforeend',
      '<li class="empty">Nenhuma checagem com esses filtros. <button type="button" data-clear>Limpar filtros</button></li>',
    )
  }

  if (animate) {
    let entering = 0
    for (const item of items) {
      const el = /** @type {HTMLElement} */ (nodes.get(item.id))
      const r = el.getBoundingClientRect()
      if (!near(r)) continue
      const old = before.get(item.id)
      if (old) {
        const dy = old.top - r.top
        if (Math.abs(dy) > 1) {
          el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
            duration: 560,
            easing: EASE,
          })
        }
      } else {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(18px)' },
            { opacity: 1, transform: 'none' },
          ],
          {
            duration: 460,
            delay: 170 + Math.min(entering++, 8) * 45,
            easing: EASE,
            fill: 'backwards',
          },
        )
      }
    }
  }
  list.dataset.ready = '1'
}

const filters = $('#filters')
let shownCount = Number(filters.querySelector('.count .n')?.textContent ?? 0)

function render() {
  const items = listed(ctx, state)
  renderSegmented()
  renderBoard(items)
  $('#notice').textContent = notice(ctx, state)
  // The controls are rebuilt, so keyboard focus goes back to the one the visitor was using.
  const focused = /** @type {HTMLElement | null} */ (filters.querySelector(':focus'))
  const again = focused?.dataset.key ? `[data-key="${focused.dataset.key}"]` : '[data-removed]'
  filters.innerHTML = filtersHtml(ctx, state, items.length)
  if (focused) /** @type {HTMLElement | null} */ (filters.querySelector(again))?.focus()
  const count = /** @type {HTMLElement} */ (filters.querySelector('.count .n'))
  count.dataset.v = String(shownCount)
  tween(count, items.length, Boolean(list.dataset.ready))
  shownCount = items.length
  renderList(items)
}

function update() {
  history.replaceState(null, '', writeState(state) || location.pathname)
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
    state = emptyState()
    update()
    // The button left with the empty state; focus moves to the first filter.
    filters.querySelector('select')?.focus()
  }
})
document.addEventListener('change', (e) => {
  const target = /** @type {HTMLInputElement} */ (e.target)
  if (target.matches('select[data-key]')) {
    state[/** @type {'outlet'} */ (target.dataset.key)] = target.value || null
    update()
  }
  if (target.matches('[data-removed]')) {
    state.removed = target.checked
    update()
  }
})

render()
// Turn on the pill transition only after the first paint, so it does not slide in on load.
requestAnimationFrame(() => seg.classList.add('ready'))
addEventListener('resize', renderSegmented)
document.fonts?.ready.then(renderSegmented)

// Both candidates talk together. The markup never changes; only the class replays it.
const duel = $('#duel')
function talk() {
  duel.classList.remove('talking')
  void duel.offsetWidth
  duel.classList.add('talking')
}
duel.addEventListener('click', talk)
talk()

const dialog = /** @type {HTMLDialogElement} */ ($('#audit'))
const prompt = /** @type {HTMLTextAreaElement} */ ($('#prompt'))
const status = $('#copied')
/** @type {HTMLElement | null} */
let opener = null
for (const b of document.querySelectorAll('[data-open-audit]')) {
  b.addEventListener('click', () => {
    opener = /** @type {HTMLElement} */ (b)
    status.textContent = ''
    dialog.showModal()
  })
}
dialog.addEventListener('close', () => opener?.focus())
$('[data-close-audit]').addEventListener('click', () => dialog.close())
// A click on the backdrop lands on the dialog itself, outside its box.
dialog.addEventListener('click', (e) => {
  const r = dialog.getBoundingClientRect()
  const outside =
    e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  if (e.target === dialog && outside) dialog.close()
})
$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(prompt.value)
    status.textContent = 'Prompt copiado'
  } catch {
    prompt.focus()
    prompt.select()
    status.textContent = 'Texto selecionado. Use Ctrl+C para copiar.'
  }
})
if (location.hash === '#auditar') dialog.showModal()
