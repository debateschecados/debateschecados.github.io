// Popup buttons drawn by render.js: a button opens a listbox, keyboard and pointer pick a value.
// Listeners sit on the root, so they survive the filters being rebuilt with innerHTML.

/** @param {HTMLElement} root @param {(key: string, value: string) => void} onPick */
export function combos(root, onPick) {
  /** @type {HTMLButtonElement | null} */
  let btn = null
  /** @type {HTMLElement | null} */
  let list = null

  const options = () => /** @type {HTMLElement[]} */ ([...(list?.children ?? [])])
  const active = () => options().findIndex((o) => o.classList.contains('active'))

  /** @param {number} i */
  function activate(i) {
    const all = options()
    const next = all[Math.max(0, Math.min(all.length - 1, i))]
    for (const o of all) o.classList.toggle('active', o === next)
    list?.setAttribute('aria-activedescendant', next.id)
    next.scrollIntoView({ block: 'nearest' })
  }

  /** @param {HTMLButtonElement} b */
  function open(b) {
    close(false)
    btn = b
    list = /** @type {HTMLElement} */ (b.nextElementSibling)
    b.setAttribute('aria-expanded', 'true')
    // Near the right edge the popup opens leftwards, so it never causes a horizontal scroll.
    list.classList.remove('end')
    if (list.getBoundingClientRect().right > document.documentElement.clientWidth - 8) {
      list.classList.add('end')
    }
    activate(options().findIndex((o) => o.getAttribute('aria-selected') === 'true'))
    list.focus()
  }

  /** @param {boolean} refocus */
  function close(refocus) {
    if (!btn) return
    btn.setAttribute('aria-expanded', 'false')
    list?.removeAttribute('aria-activedescendant')
    if (refocus) btn.focus()
    btn = list = null
  }

  /** @param {HTMLElement} option */
  function pick(option) {
    const b = /** @type {HTMLButtonElement} */ (btn)
    const value = option.dataset.value ?? ''
    close(true)
    if (value !== b.dataset.value) onPick(/** @type {string} */ (b.dataset.key), value)
  }

  root.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target)
    const b = /** @type {HTMLButtonElement | null} */ (target.closest('.combo-btn'))
    const option = /** @type {HTMLElement | null} */ (target.closest('[role="option"]'))
    if (b) b === btn ? close(true) : open(b)
    if (option && btn) pick(option)
  })

  root.addEventListener('pointermove', (e) => {
    const option = /** @type {HTMLElement | null} */ (
      /** @type {HTMLElement} */ (e.target).closest('[role="option"]')
    )
    if (option && btn) activate(options().indexOf(option))
  })

  root.addEventListener('keydown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target)
    if (target.matches('.combo-btn') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      open(/** @type {HTMLButtonElement} */ (target))
    }
    if (target !== list) return
    const i = active()
    const last = options().length - 1
    const moves = /** @type {Record<string, number>} */ ({
      ArrowDown: i + 1,
      ArrowUp: i - 1,
      Home: 0,
      End: last,
      PageDown: last,
      PageUp: 0,
    })
    if (e.key in moves) {
      e.preventDefault()
      activate(moves[e.key])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(options()[i])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'Tab') {
      close(false)
    } else if (e.key.length === 1) {
      // Typing a letter jumps to the next option that starts with it, like the native select.
      const all = options()
      const key = e.key.toLocaleLowerCase('pt-BR')
      const hit = [...all.slice(i + 1), ...all.slice(0, i + 1)].find((o) =>
        (o.textContent ?? '').toLocaleLowerCase('pt-BR').startsWith(key),
      )
      if (hit) activate(all.indexOf(hit))
    }
  })

  // A press anywhere outside the open combo closes it; focus leaving it does too.
  document.addEventListener('pointerdown', (e) => {
    if (btn && !btn.parentElement?.contains(/** @type {Node} */ (e.target))) close(false)
  })
  root.addEventListener('focusout', (e) => {
    const to = /** @type {Node | null} */ (e.relatedTarget)
    if (btn && to && !btn.parentElement?.contains(to)) close(false)
  })
}
