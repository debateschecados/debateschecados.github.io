import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { type Browser, type BrowserContextOptions, chromium, type Page } from 'playwright-core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import pkg from '../../package.json' with { type: 'json' }
import type { CheckRecord } from '../../src/types.ts'
import { buildFixture } from '../fixtures/site.ts'

const REPO = pkg.repository
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
let records: CheckRecord[]
let removed: CheckRecord[]

// Served over HTTP like production, so clipboard permissions and URL state behave the same.
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
  tmp = await mkdtemp(join(tmpdir(), 'site-e2e-'))
  const built = await buildFixture(tmp)
  records = built.records
  removed = records.filter((r) => r.missingSince)
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

async function open(path = '/', options: BrowserContextOptions = {}, init?: () => void) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options })
  if (init) await context.addInitScript(init)
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (r) => requests.push(r.url()))
  await page.goto(`${origin}${path}`)
  await settle(page)
  return page
}

// Waits for the list animations (Web Animations, not the CSS talk loop) to finish.
const settle = (page: Page) =>
  page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.constructor.name !== 'Animation' || a.playState === 'finished'),
  )

const listedIds = (page: Page) =>
  page.$$eval('#list > li.item', (lis) => lis.map((li) => (li as HTMLElement).dataset.id))

const totals = (page: Page) =>
  page.$$eval('#board .cand', (cards) =>
    cards.map((c) => [
      (c as HTMLElement).dataset.speaker,
      (c.querySelector('.total .n') as HTMLElement).dataset.v,
    ]),
  )

// The numbers each candidate card shows, once the count-up tweens reach their targets.
async function boardNumbers(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLElement>('#board .total .n, #board .legend strong')].every(
      (el) => el.textContent === el.dataset.v,
    ),
  )
  return page.$$eval('#board .cand', (cards) =>
    Object.fromEntries(
      cards.map((c) => [
        (c as HTMLElement).dataset.speaker,
        {
          total: Number(c.querySelector('.total .n')?.textContent),
          bands: [...c.querySelectorAll('.legend strong')].map((el) => Number(el.textContent)),
        },
      ]),
    ),
  )
}

// Counted straight from the fixture records, without the site's own filter code.
const expectedBoard = (keep: (r: CheckRecord) => boolean) =>
  Object.fromEntries(
    ['lula', 'flavio'].map((speaker) => {
      const mine = records.filter((r) => !r.missingSince && r.speaker === speaker && keep(r))
      return [
        speaker,
        {
          total: mine.length,
          bands: ['verdadeiro', 'impreciso', 'falso', 'sem faixa'].map(
            (band) => mine.filter((r) => r.band === band).length,
          ),
        },
      ]
    }),
  )

async function choose(page: Page, key: string, value: string) {
  await page.selectOption(`select[data-key="${key}"]`, value)
  await settle(page)
}

describe('layout (SITE-06)', () => {
  it('has no horizontal scroll at 360 px, with removed items and the panel open', async () => {
    const page = await open('/', { viewport: { width: 360, height: 740 } })
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.click('[data-tab="removed"]')
    await settle(page)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.fill('#q', 'teste')
    await settle(page)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.click('.audit-fab')
    expect(await overflow()).toBeLessThanOrEqual(0)
    const method = await open('/metodologia.html', { viewport: { width: 360, height: 740 } })
    expect(await method.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    // Both candidate columns stay on screen, none hidden behind a horizontal scroll.
    const tables = await method.$$eval('.table-wrap', (els) =>
      els.map((e) => e.scrollWidth - e.clientWidth),
    )
    expect(tables).toEqual([0, 0, 0])
  })
})

describe('list, filters and URL (SITE-01, SITE-03, SHARE-01, SHARE-02)', () => {
  it('shows every record still found at the source on first load', async () => {
    const page = await open()
    const ids = await listedIds(page)
    expect(ids).toHaveLength(records.length - removed.length)
    expect(ids).not.toContain(removed[0].id)
  })

  it('applies filters, writes them to the URL and restores them from it', async () => {
    const page = await open()
    await page.click('[data-debate="band-2026-10-18"]')
    await settle(page)
    await choose(page, 'outlet', 'lupa')
    const expected = records
      .filter((r) => r.debate === 'band-2026-10-18' && r.outlet === 'lupa' && !r.missingSince)
      .sort((a, b) => a.pos - b.pos)
      .map((r) => r.id)
    expect(await listedIds(page)).toEqual(expected)
    expect(await page.textContent('#notice')).toBe('Placar só com as checagens da Lupa.')
    expect(await page.textContent('#board .cand .scope')).toBe(' da Lupa')
    const url = new URL(page.url())
    expect(Object.fromEntries(url.searchParams)).toEqual({
      debate: 'band-2026-10-18',
      outlet: 'lupa',
    })
    const shared = await open(`${url.pathname}${url.search}`)
    expect(await listedIds(shared)).toEqual(expected)
    expect(await shared.getAttribute('[data-debate="band-2026-10-18"]', 'aria-pressed')).toBe(
      'true',
    )
    expect(await shared.inputValue('select[data-key="outlet"]')).toBe('lupa')
  })

  it('shows items again at full opacity when a filter brings them back', async () => {
    const page = await open()
    for (const debate of ['globo-2026-10-23', 'band-2026-10-18', '']) {
      await page.click(`[data-debate="${debate}"]`)
      await settle(page)
    }
    const opacities = await page.$$eval('#list > li.item', (lis) =>
      lis.map((li) => getComputedStyle(li).opacity),
    )
    expect(opacities).toHaveLength(records.length - removed.length)
    expect(opacities.filter((o) => o !== '1')).toEqual([])
  })

  it('shows the empty state and clears every filter from it (SITE-05)', async () => {
    const page = await open()
    await choose(page, 'outlet', 'g1')
    await choose(page, 'band', 'sem faixa')
    expect(await listedIds(page)).toEqual([])
    const empty = page.locator('#list .empty')
    expect(await empty.textContent()).toBe('Nenhuma checagem com esses filtros. Limpar filtros')
    await empty.getByRole('button', { name: 'Limpar filtros' }).click()
    await settle(page)
    expect(await listedIds(page)).toHaveLength(records.length - removed.length)
    expect(new URL(page.url()).search).toBe('')
    expect(await page.inputValue('select[data-key="outlet"]')).toBe('')
  })

  it('keeps keyboard focus on the control in use while the filters re-render', async () => {
    const page = await open()
    const focused = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        return el.dataset.key ?? el.dataset.tab ?? el.tagName
      })
    const outlets = await page.$$eval('select[data-key="outlet"] option', (os) =>
      os.map((o) => (o as HTMLOptionElement).value),
    )
    await page.focus('select[data-key="outlet"]')
    await page.keyboard.press('ArrowDown')
    await settle(page)
    expect(new URL(page.url()).searchParams.get('outlet')).toBe(outlets[1])
    expect(await focused()).toBe('outlet')
    await page.keyboard.press('ArrowDown')
    await settle(page)
    expect(new URL(page.url()).searchParams.get('outlet')).toBe(outlets[2])
    expect(await focused()).toBe('outlet')

    const all = await open()
    await all.focus('[data-tab="removed"]')
    await all.keyboard.press('Space')
    await settle(all)
    expect(new URL(all.url()).searchParams.get('removed')).toBe('1')
    expect(
      await all.evaluate(() =>
        (document.activeElement as HTMLElement).matches('[data-tab="removed"]'),
      ),
    ).toBe(true)

    // Typing in the search box keeps the caret and the focus while the list re-renders.
    const typing = await open()
    await typing.focus('#q')
    await typing.keyboard.type('numero 12,')
    await settle(typing)
    expect(await typing.inputValue('#q')).toBe('numero 12,')
    expect(await typing.evaluate(() => document.activeElement?.id)).toBe('q')

    // The clear button leaves with the empty state; focus moves to the first filter.
    const empty = await open('/?outlet=g1&band=sem+faixa')
    await empty.focus('#list .empty [data-clear]')
    await empty.keyboard.press('Enter')
    await settle(empty)
    expect(new URL(empty.url()).search).toBe('')
    expect(
      await empty.evaluate(() => (document.activeElement as HTMLElement).dataset.key ?? null),
    ).toBe('outlet')
  })
})

describe('scoreboard numbers (SCORE-01, SCORE-02, SCORE-04)', () => {
  it('counts only the selected agency, all agencies under "Todas", and the chosen debate', async () => {
    const page = await open()
    expect(await boardNumbers(page)).toEqual(expectedBoard(() => true))

    await choose(page, 'outlet', 'lupa')
    const lupa = expectedBoard((r) => r.outlet === 'lupa')
    expect(lupa.flavio.total).toBe(3) // one Lupa record is missing at the source
    expect(await boardNumbers(page)).toEqual(lupa)

    await choose(page, 'outlet', '')
    expect(await boardNumbers(page)).toEqual(expectedBoard(() => true))

    await page.click('[data-debate="globo-2026-10-23"]')
    await settle(page)
    await choose(page, 'outlet', 'estadao')
    const pair = expectedBoard((r) => r.debate === 'globo-2026-10-23' && r.outlet === 'estadao')
    expect(await boardNumbers(page)).toEqual(pair)
    expect(await listedIds(page)).toHaveLength(pair.lula.total + pair.flavio.total)
  })
})

describe('removed records (HIST-02)', () => {
  it('shows tagged removed items on their own tab, outside the scoreboard', async () => {
    const page = await open()
    const before = await totals(page)
    expect(await page.textContent('[data-tab="removed"]')).toBe(`Removidas ${removed.length}`)
    await page.click('[data-tab="removed"]')
    await settle(page)
    const ids = await listedIds(page)
    expect(ids.sort()).toEqual(removed.map((r) => r.id).sort())
    const first = removed.find((r) => r.missingSince === '2026-10-25') as CheckRecord
    expect(await page.textContent(`#list li[data-id="${first.id}"] .gone`)).toBe(
      'não encontrado na fonte desde 25/10/2026',
    )
    expect(await page.isHidden('#board')).toBe(true)
    expect(await page.textContent('#notice')).toContain('tiraram do ar')
    expect(new URL(page.url()).searchParams.get('removed')).toBe('1')
    const shared = await open('/?removed=1')
    expect((await listedIds(shared)).sort()).toEqual(ids)
    expect(await shared.getAttribute('[data-tab="removed"]', 'aria-pressed')).toBe('true')
    await shared.click('[data-tab="live"]')
    await settle(shared)
    expect(await totals(shared)).toEqual(before)
    expect(await shared.isVisible('#board')).toBe(true)
  })

  it('keeps the removed tab, with zero, when the filters match none', async () => {
    const page = await open('/?outlet=aosfatos')
    expect(await page.locator('[data-tab="removed"]').textContent()).toBe('Removidas 0')
  })
})

describe('search', () => {
  it('filters the list and the scoreboard as you type, and lives in the URL', async () => {
    const page = await open()
    await page.fill('#q', 'NUMERO 12,')
    await settle(page)
    expect(await listedIds(page)).toEqual(['00000000000c'])
    expect(new URL(page.url()).searchParams.get('q')).toBe('NUMERO 12,')
    const shared = await open('/?q=n%C3%BAmero+12%2C')
    expect(await shared.inputValue('#q')).toBe('número 12,')
    expect(await listedIds(shared)).toEqual(['00000000000c'])
  })

  it('shows the empty state and clears the box with the filters', async () => {
    const page = await open('/?q=zzzz')
    expect(await page.locator('#list .empty').count()).toBe(1)
    await page.click('#list .empty [data-clear]')
    await settle(page)
    expect(await page.inputValue('#q')).toBe('')
    expect(await listedIds(page)).toHaveLength(records.length - removed.length)
  })
})

describe('audit panel (AUDIT-01, AUDIT-02, AUDIT-04, AUDIT-05)', () => {
  it('opens from the inline link below the subtitle and returns focus on close', async () => {
    const page = await open()
    const trust = page.locator('.hero .trust')
    expect(await trust.textContent()).toContain(
      'O veredito é sempre da agência. Código e dados são abertos.',
    )
    await trust.getByRole('button', { name: 'Veja como auditar' }).click()
    expect(await page.locator('dialog#audit').evaluate((d) => (d as HTMLDialogElement).open)).toBe(
      true,
    )
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true)
    expect(await page.locator('.rules li').count()).toBe(5)
    await page.click('[data-close-audit]')
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Veja como auditar')
  })

  it('shows the trust line and its control in the first screen on mobile and desktop', async () => {
    for (const width of [360, 1280]) {
      const page = await open('/', { viewport: { width, height: 740 } })
      const box = await page.getByRole('button', { name: 'Veja como auditar' }).boundingBox()
      expect(box).not.toBeNull()
      expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(740)
      expect(await page.evaluate(() => scrollY)).toBe(0)
    }
  })

  it('opens from the fixed "Como auditar" button on mobile and desktop', async () => {
    for (const width of [360, 1280]) {
      const page = await open('/', { viewport: { width, height: 740 } })
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
      const fab = page.getByRole('button', { name: 'Como auditar', exact: true })
      expect(await fab.evaluate((b) => getComputedStyle(b).position)).toBe('fixed')
      await fab.click()
      expect(
        await page.locator('dialog#audit').evaluate((d) => (d as HTMLDialogElement).open),
      ).toBe(true)
      await page.keyboard.press('Escape')
      expect(
        await page.locator('dialog#audit').evaluate((d) => (d as HTMLDialogElement).open),
      ).toBe(false)
    }
  })

  it('copies the audit prompt to the clipboard', async () => {
    const page = await open('/', { permissions: ['clipboard-read', 'clipboard-write'] })
    await page.click('.audit-fab')
    await page.click('#copy')
    await page.waitForFunction(() => document.getElementById('copied')?.textContent !== '')
    expect(await page.textContent('#copied')).toBe('Prompt copiado')
    const text = await page.evaluate(() => navigator.clipboard.readText())
    expect(text).toContain(`Código e dados: ${REPO}`)
    expect(text).toContain(`Todas as checagens: ${REPO}/blob/main/data/checks.csv`)
    expect(text.match(/^\d\. /gm)).toEqual(['1. ', '2. ', '3. ', '4. ', '5. '])
  })

  it('selects the prompt text when the clipboard API is missing', async () => {
    const page = await open('/', {}, () => {
      Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => undefined })
    })
    await page.click('.audit-fab')
    await page.click('#copy')
    expect(await page.textContent('#copied')).toBe('Texto selecionado. Use Ctrl+C para copiar.')
    const selection = await page.evaluate(() => {
      const t = document.activeElement as HTMLTextAreaElement
      return [t.id, t.selectionStart, t.selectionEnd, t.value.length]
    })
    expect(selection).toEqual(['prompt', 0, selection[3], selection[3]])
    expect(selection[3]).toBeGreaterThan(500)
  })
})

describe('illustrations (AUDIT-06, AUDIT-07)', () => {
  it('keep the same markup whatever the filters show', async () => {
    const page = await open()
    const duel = () => page.innerHTML('#duel')
    const before = await duel()
    const board = await totals(page)
    await page.click('[data-debate="globo-2026-10-23"]')
    await choose(page, 'outlet', 'estadao')
    await choose(page, 'speaker', 'flavio')
    await choose(page, 'band', 'falso')
    expect(await totals(page)).not.toEqual(board)
    expect(await duel()).toBe(before)
  })

  it('talk for the same length and stop under reduced motion', async () => {
    const page = await open()
    const timing = () =>
      page.$$eval('#duel [class^="m-"]', (gs) =>
        gs.map((g) => {
          const s = getComputedStyle(g)
          return `${s.animationName === 'none' ? 'none' : 'on'} ${s.animationDuration} ${s.animationIterationCount}`
        }),
      )
    expect(await timing()).toEqual(Array(4).fill('on 5s 2'))
    const still = await open('/', { reducedMotion: 'reduce' })
    expect(
      await still.$$eval('#duel [class^="m-"]', (gs) =>
        gs.map((g) => getComputedStyle(g).animationName),
      ),
    ).toEqual(Array(4).fill('none'))
    // No entrance slide either: both illustrations stand still from the first frame.
    expect(
      await still.$$eval('#duel .fighter', (fs) =>
        fs.map((f) => `${(f as HTMLElement).dataset.sprite} ${getComputedStyle(f).animationName}`),
      ),
    ).toEqual(['lula none', 'flavio none'])
  })
})

describe('privacy (SITE-07)', () => {
  it('requests nothing from another origin and uses the self-hosted fonts', async () => {
    const page = await open()
    await page.click('[data-debate="band-2026-10-18"]')
    await choose(page, 'outlet', 'g1')
    await page.click('.audit-fab')
    await page.evaluate(() => document.fonts.ready)
    expect(requests.length).toBeGreaterThan(5)
    expect(requests.filter((u) => !u.startsWith(`${origin}/`) && !u.startsWith('data:'))).toEqual(
      [],
    )
    expect(requests.some((u) => u.endsWith('.woff2'))).toBe(true)
    expect(await page.evaluate(() => document.fonts.check('600 24px "Inter Tight"'))).toBe(true)
    expect(await page.evaluate(() => document.cookie)).toBe('')
  })
})
