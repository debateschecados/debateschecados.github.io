import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { type Browser, type BrowserContextOptions, chromium, type Page } from 'playwright-core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  coverage,
  createComparison,
  emptyCompareState,
  inDebate,
  visibleRows,
} from '../../site/compare.js'
import { createContext } from '../../site/core.js'
import { driftCounts } from '../../site/drift.js'
import { headline, lean } from '../../site/lean.js'
import { coverageHtml, driftCountsHtml, leanHtml } from '../../site/render.js'
import { loadConfig } from '../../src/config.ts'
import {
  buildFixture,
  FIXTURE_PENDING,
  fixtureGroupId,
  fixtureGroups,
  recordId,
} from '../fixtures/site.ts'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

let tmp: string
let server: Server
let origin: string
let browser: Browser
let ctx: ReturnType<typeof createContext>
let comparison: ReturnType<typeof createComparison>

// Served over HTTP like production, so URL state behaves the same.
function serve(root: string) {
  return createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path))
    try {
      if (!file.startsWith(root)) throw new Error('outside root')
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'compare-e2e-'))
  const built = await buildFixture(tmp)
  const config = await loadConfig(join(import.meta.dirname, '../../config'))
  ctx = createContext({ ...config, records: built.records })
  const pending = new Set(FIXTURE_PENDING.map(recordId))
  const curated = built.records
    .filter((r) => !r.missingSince && !pending.has(r.id))
    .map((r) => r.id)
  comparison = createComparison(ctx, fixtureGroups(), curated)
  server = serve(built.outDir)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const local = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'
  browser = await chromium.launch(
    existsSync(local) ? { executablePath: local } : { channel: 'chrome' },
  )
})

afterAll(async () => {
  await browser?.close()
  await new Promise((done) => server?.close(done))
  await rm(tmp, { recursive: true, force: true })
})

// Every page opened by a test records console errors, page errors and every request URL.
let errors: string[] = []
let requests: string[] = []
afterEach(() => {
  expect(errors).toEqual([])
  errors = []
  requests = []
})

async function open(path = '/comparar.html', options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (r) => requests.push(r.url()))
  await page.goto(`${origin}${path}`)
  return page
}

// Read in the page: page.url() can lag behind history.replaceState.
const params = async (page: Page) => new URLSearchParams(await page.evaluate(() => location.search))

// Matrix columns actually on screen, not just buttons without the hidden attribute.
const visibleIds = (page: Page) =>
  page.$$eval('#matrix button.claim', (bs) =>
    bs.filter((b) => b.checkVisibility()).map((b) => (b as HTMLElement).dataset.id),
  )

// The matrix lists rows per debate, then per candidate, each in page order.
const expectedIds = (over: Partial<ReturnType<typeof emptyCompareState>>) => {
  const shown = visibleRows(comparison.rows, { ...emptyCompareState(), ...over })
  return ctx.debates.flatMap((d) =>
    ctx.candidates.flatMap((c) =>
      shown.filter((r) => r.debate === d.id && r.speaker === c.id).map((r) => r.id),
    ),
  )
}

// What the page shows in the parts the debate filter recounts.
const counted = (page: Page) =>
  page.evaluate(() => ({
    answer: document.querySelector('#answer')?.textContent,
    balance: document.querySelector('#balance')?.innerHTML,
    coverage: document.querySelector('#coverage')?.innerHTML,
    drift: document.querySelector('#drift')?.innerHTML,
  }))

// The same parts, computed by lean.js, compare.js and drift.js for the debate filter alone.
const expectedCounts = (debate: string | null) => {
  const distances = lean(ctx, inDebate(comparison.rows, debate))
  return {
    answer: headline(distances, ctx),
    balance: leanHtml(ctx, distances),
    coverage: coverageHtml(ctx, coverage(ctx, comparison, debate)),
    drift: driftCountsHtml(ctx, driftCounts(ctx, debate)),
  }
}

describe('filters, axes, matrix and counts (CMP-03, RIGOR-06, LEAN-06)', () => {
  it('the debate filter recomputes the axes, the coverage and the change counts', async () => {
    const page = await open()
    expect(await counted(page)).toEqual(expectedCounts(null))
    expect(await visibleIds(page)).toEqual(expectedIds({}))

    // The fixture is too small for a clear verdict, so the headline reads the same for every
    // debate: blank it to see the filter write it again.
    await page.$eval('#answer', (p) => {
      p.textContent = ''
    })
    await page.click('#debates [data-debate="band-2026-10-18"]')
    expect(await counted(page)).toEqual(expectedCounts('band-2026-10-18'))
    expect(await counted(page)).not.toEqual(expectedCounts(null))
    expect(await visibleIds(page)).toEqual(['A', 'B', 'I', 'C'].map(fixtureGroupId))
    expect(await page.isVisible('.staff[data-debate="globo-2026-10-23"]')).toBe(false)
    // g1 5 (Band, Flávio) went from "#FAKE" to "#FATO".
    expect(await page.textContent('#drift tbody tr:nth-child(3) td:nth-of-type(2)')).toBe(
      '1 ficou mais branda',
    )

    await page.click('#debates [data-debate="globo-2026-10-23"]')
    expect(await counted(page)).toEqual(expectedCounts('globo-2026-10-23'))
    expect(await page.$$eval('#drift td', (tds) => tds.map((td) => td.textContent))).toEqual(
      Array(8).fill('nenhuma mudança'),
    )
    // The only change is from the other debate: its timeline hides and a note says so.
    expect(await page.isVisible(`#changes li[data-id="${recordId(5)}"]`)).toBe(false)
    expect(await page.textContent('#changes-none')).toBe(
      'Nenhuma checagem deste debate mudou de rótulo nem de citação.',
    )
    expect(await page.isVisible('#changes-none')).toBe(true)
    expect(Object.fromEntries(await params(page))).toEqual({ debate: 'globo-2026-10-23' })
  })

  it('the candidate and divergence filters change the matrix and its counts, not the axes', async () => {
    const page = await open('/comparar.html?debate=band-2026-10-18')
    const before = await counted(page)
    await page.selectOption('select[data-key="speaker"]', 'flavio')
    expect(await visibleIds(page)).toEqual(
      expectedIds({ debate: 'band-2026-10-18', speaker: 'flavio' }),
    )
    expect(await page.textContent('#filters .count')).toBe('2 falas')
    await page.check('[data-div]')
    expect(await visibleIds(page)).toEqual([fixtureGroupId('I')])
    expect(await page.textContent('#filters .count')).toBe('1 fala')
    expect(
      await page.textContent('.staff[data-debate="band-2026-10-18"] [data-speaker="flavio"] .n'),
    ).toBe('1 de 2')
    expect(
      await page.isVisible('.staff[data-debate="band-2026-10-18"] [data-speaker="lula"]'),
    ).toBe(false)
    expect(await counted(page)).toEqual(before)
    expect(Object.fromEntries(await params(page))).toEqual({
      debate: 'band-2026-10-18',
      speaker: 'flavio',
      div: '1',
    })
  })

  it('restores the view from a shared URL on reload', async () => {
    const page = await open('/comparar.html?debate=globo-2026-10-23&div=1')
    await page.reload()
    expect(await visibleIds(page)).toEqual([fixtureGroupId('G')])
    expect(
      await page.getAttribute('#debates [data-debate="globo-2026-10-23"]', 'aria-pressed'),
    ).toBe('true')
    expect(await page.isChecked('[data-div]')).toBe(true)
    expect(await page.inputValue('select[data-key="speaker"]')).toBe('')
    expect(await counted(page)).toEqual(expectedCounts('globo-2026-10-23'))
  })

  it('shows the empty state and clears every filter from it, focus on the first filter', async () => {
    const page = await open('/comparar.html?debate=globo-2026-10-23&speaker=lula&div=1')
    expect(await visibleIds(page)).toEqual([])
    const empty = page.locator('#empty')
    expect(await empty.textContent()).toBe('Nenhuma fala com esses filtros. Limpar filtros')
    expect(await empty.isVisible()).toBe(true)
    await empty.getByRole('button', { name: 'Limpar filtros' }).focus()
    await page.keyboard.press('Enter')
    expect(await visibleIds(page)).toEqual(expectedIds({}))
    expect(await empty.isVisible()).toBe(false)
    expect(await page.evaluate(() => location.search)).toBe('')
    expect(
      await page.evaluate(() => (document.activeElement as HTMLElement).dataset.key ?? null),
    ).toBe('speaker')
  })

  it('keeps keyboard focus on the control in use while the filters re-render', async () => {
    const page = await open()
    await page.focus('select[data-key="speaker"]')
    await page.keyboard.press('ArrowDown')
    expect((await params(page)).get('speaker')).toBe('lula')
    expect(
      await page.evaluate(() => (document.activeElement as HTMLElement).dataset.key ?? null),
    ).toBe('speaker')

    const fresh = await open()
    await fresh.focus('[data-div]')
    await fresh.keyboard.press('Space')
    expect((await params(fresh)).get('div')).toBe('1')
    expect(
      await fresh.evaluate(() => (document.activeElement as HTMLElement).matches('[data-div]')),
    ).toBe(true)
  })
})

describe('claim detail (CMP-02, DRIFT-05)', () => {
  it('opens with Enter, shows each agency label as text, and closes with Escape', async () => {
    const page = await open()
    const button = `#matrix button[data-id="${fixtureGroupId('I')}"]`
    expect(await page.isVisible('#detail')).toBe(false)
    await page.focus(button)
    await page.keyboard.press('Enter')
    expect(await page.getAttribute(button, 'aria-expanded')).toBe('true')
    expect(await page.isVisible('#detail')).toBe(true)
    expect(await page.textContent('#detail blockquote')).toBe(
      'Alegação de teste I, inventada para a suíte do site.',
    )
    expect(
      await page.$$eval('#detail .verdicts li', (lis) =>
        // biome-ignore lint/performance/useDomNodeTextContent: the text as read, with the gaps between parts.
        lis.map((li) => (li as HTMLElement).innerText.replace(/\s+/g, ' ').trim()),
      ),
    ).toEqual([
      'Aos Fatos não checou',
      'Estadão Verifica impreciso rótulo da agência: é enganoso Ler a checagem',
      'g1 Fato ou Fake verdadeiro rótulo da agência: #FATO faixa anterior: falso Ler a checagem',
      'Lupa não checou',
    ])
    // Under the debate it belongs to, on desktop.
    expect(
      await page.$eval('#detail', (d) => d.closest('.staff')?.getAttribute('data-debate')),
    ).toBe('band-2026-10-18')

    await page.keyboard.press('Escape')
    expect(await page.isVisible('#detail')).toBe(false)
    expect(await page.getAttribute(button, 'aria-expanded')).toBe('false')
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.id)).toBe(
      fixtureGroupId('I'),
    )

    // A click on another column switches the detail; the close button closes it.
    await page.click(`#matrix button[data-id="${fixtureGroupId('A')}"]`)
    expect(await page.textContent('#detail .gid')).toBe(fixtureGroupId('A'))
    await page.click('#detail [data-close]')
    expect(await page.isVisible('#detail')).toBe(false)
  })

  it('closes when a filter hides the selected claim', async () => {
    const page = await open()
    await page.click(`#matrix button[data-id="${fixtureGroupId('B')}"]`)
    expect(await page.isVisible('#detail')).toBe(true)
    await page.check('[data-div]')
    expect(await page.isVisible('#detail')).toBe(false)
  })
})

describe('layout (CMP-07)', () => {
  it('has no horizontal scroll at 360 px, with the matrix as a list, and columns on desktop', async () => {
    const page = await open('/comparar.html', { viewport: { width: 360, height: 740 } })
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    const wraps = await page.$$eval('.table-wrap', (els) =>
      els.map((e) => e.scrollWidth - e.clientWidth),
    )
    expect(wraps).toEqual([0, 0])
    // One claim per line, its text visible, the dots of the four agencies on that line.
    const first = page.locator('#matrix button.claim').first()
    expect(await first.locator('.txt').isVisible()).toBe(true)
    const box = await first.boundingBox()
    expect(box?.width).toBeGreaterThan(300)
    const tops = await first
      .locator('.dot')
      .evaluateAll((ds) => ds.map((d) => Math.round(d.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
    await first.click()
    expect(
      await page.$eval('#detail', (d) => d.previousElementSibling?.classList.contains('claim')),
    ).toBe(true)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.check('[data-div]')
    expect(await overflow()).toBeLessThanOrEqual(0)

    const wide = await open()
    const column = wide.locator('#matrix button.claim').first()
    expect(await column.locator('.txt').isVisible()).toBe(false)
    // The dots of one column stand one above the other, one lane per agency.
    const lefts = await column
      .locator('.dot')
      .evaluateAll((ds) => ds.map((d) => Math.round(d.getBoundingClientRect().left)))
    expect(new Set(lefts).size).toBe(1)
    expect(await wide.$$eval('.staff:first-child .lanes span', (ss) => ss.length)).toBe(5)
  })
})

describe('verdict shapes (CMP-08)', () => {
  it('draws each band and "não checou" with its own shape, not only its own color', async () => {
    const page = await open()
    const shapes = await page.$$eval('#legend li > .dot:not(.moved)', (dots) =>
      dots.map((d) => {
        const s = getComputedStyle(d, '::before')
        return [s.borderRadius, s.clipPath, s.boxShadow === 'none' ? 'filled' : 'hollow'].join('|')
      }),
    )
    expect(shapes).toHaveLength(5)
    expect(new Set(shapes).size).toBe(5)
  })
})

describe('privacy (SITE-07)', () => {
  it('requests nothing from another origin', async () => {
    const page = await open()
    await page.click('#debates [data-debate="globo-2026-10-23"]')
    await page.check('[data-div]')
    await page.click('#matrix button.claim >> visible=true')
    await page.evaluate(() => document.fonts.ready)
    expect(requests.length).toBeGreaterThan(3)
    expect(requests.filter((u) => !u.startsWith(`${origin}/`) && !u.startsWith('data:'))).toEqual(
      [],
    )
  })
})
