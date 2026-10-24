import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { load } from 'cheerio'
import { type Browser, type BrowserContextOptions, chromium, type Page } from 'playwright-core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { coverage, createComparison, emptyCompareState, visibleRows } from '../../site/compare.js'
import { createContext } from '../../site/core.js'
import { coverageHtml } from '../../site/render.js'
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

// Rows actually on screen, not just rows without the hidden attribute.
const visibleIds = (page: Page) =>
  page.$$eval('#rows > li.claim', (lis) =>
    lis.filter((li) => li.checkVisibility()).map((li) => (li as HTMLElement).dataset.id),
  )

// Cell texts of the coverage table, as the page shows them.
const tables = (page: Page) => page.$$eval('#coverage td', (tds) => tds.map((td) => td.textContent))

// The same cells, rendered from compare.js for the debate filter alone (RIGOR-06).
const expectedTables = (debate: string | null) => {
  const $ = load(coverageHtml(ctx, coverage(ctx, comparison, debate)))
  return $('td')
    .map((_, td) => $(td).text())
    .get()
}

const expectedIds = (over: Partial<ReturnType<typeof emptyCompareState>>) =>
  visibleRows(comparison.rows, { ...emptyCompareState(), ...over }).map((r) => r.id)

describe('filters, tables and URL (CMP-03, RIGOR-06)', () => {
  it('each filter changes the visible rows, and the debate filter the table numbers', async () => {
    const page = await open()
    expect(await visibleIds(page)).toEqual(expectedIds({}))
    expect(await tables(page)).toEqual(expectedTables(null))

    await page.click('[data-debate="band-2026-10-18"]')
    expect(await visibleIds(page)).toEqual(['A', 'I', 'B', 'C'].map(fixtureGroupId))
    expect(await tables(page)).toEqual(expectedTables('band-2026-10-18'))
    // Aos Fatos, Lula, Band: harsher than the three others on A.
    expect(await page.textContent('#rigor tbody tr:first-child td:nth-of-type(1) .line')).toBe(
      '3 mais dura',
    )

    await page.selectOption('select[data-key="speaker"]', 'flavio')
    expect(await visibleIds(page)).toEqual(
      expectedIds({ debate: 'band-2026-10-18', speaker: 'flavio' }),
    )
    expect(await tables(page)).toEqual(expectedTables('band-2026-10-18'))

    await page.check('[data-div]')
    expect(await visibleIds(page)).toEqual([fixtureGroupId('I')])
    expect(await page.textContent('#filters .count')).toBe('1 alegação')
    expect(await tables(page)).toEqual(expectedTables('band-2026-10-18'))

    expect(Object.fromEntries(await params(page))).toEqual({
      debate: 'band-2026-10-18',
      speaker: 'flavio',
      div: '1',
    })
  })

  it('restores the view from a shared URL', async () => {
    const page = await open('/comparar.html?debate=globo-2026-10-23&div=1')
    expect(await visibleIds(page)).toEqual([fixtureGroupId('G')])
    expect(await page.getAttribute('[data-debate="globo-2026-10-23"]', 'aria-pressed')).toBe('true')
    expect(await page.isChecked('[data-div]')).toBe(true)
    expect(await page.inputValue('select[data-key="speaker"]')).toBe('')
    expect(await tables(page)).toEqual(expectedTables('globo-2026-10-23'))
  })

  it('shows the empty state and clears every filter from it, focus on the first filter', async () => {
    const page = await open('/comparar.html?debate=globo-2026-10-23&speaker=lula&div=1')
    expect(await visibleIds(page)).toEqual([])
    const empty = page.locator('#rows .empty')
    expect(await empty.textContent()).toBe('Nenhuma alegação com esses filtros. Limpar filtros')
    await empty.getByRole('button', { name: 'Limpar filtros' }).focus()
    await page.keyboard.press('Enter')
    expect(await visibleIds(page)).toEqual(expectedIds({}))
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

describe('layout (CMP-07)', () => {
  it('has no horizontal scroll at 360 px, with rows stacked, and a grid on desktop', async () => {
    const page = await open('/comparar.html', { viewport: { width: 360, height: 740 } })
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    const wraps = await page.$$eval('.table-wrap', (els) =>
      els.map((e) => e.scrollWidth - e.clientWidth),
    )
    expect(wraps).toEqual([0, 0])
    expect(await page.$eval('.claims-head', (h) => getComputedStyle(h).display)).toBe('none')
    expect(await page.isVisible('#rows > li.claim .cells .agency')).toBe(true)
    await page.check('[data-div]')
    expect(await overflow()).toBeLessThanOrEqual(0)

    const wide = await open()
    expect(await wide.$eval('.claims-head', (h) => getComputedStyle(h).display)).toBe('grid')
    // The four verdicts of a row sit on one line, under the four agency heads.
    const tops = await wide.$$eval('#rows > li.claim:first-child .cells > li', (lis) =>
      lis.map((li) => Math.round(li.getBoundingClientRect().top)),
    )
    expect(new Set(tops).size).toBe(1)
    const heads = await wide.$$eval('.claims-head span', (ss) =>
      ss.slice(1).map((s) => Math.round(s.getBoundingClientRect().left)),
    )
    const cells = await wide.$$eval('#rows > li.claim:first-child .cells > li', (lis) =>
      lis.map((li) => Math.round(li.getBoundingClientRect().left)),
    )
    expect(cells).toEqual(heads)
  })
})

describe('privacy (SITE-07)', () => {
  it('requests nothing from another origin', async () => {
    const page = await open()
    await page.click('[data-debate="globo-2026-10-23"]')
    await page.check('[data-div]')
    await page.evaluate(() => document.fonts.ready)
    expect(requests.length).toBeGreaterThan(3)
    expect(requests.filter((u) => !u.startsWith(`${origin}/`) && !u.startsWith('data:'))).toEqual(
      [],
    )
  })
})
