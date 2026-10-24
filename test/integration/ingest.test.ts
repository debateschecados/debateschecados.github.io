import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { loadConfig } from '../../src/config.ts'
import { type Archiver, type IngestOptions, ingest, offlineIo } from '../../src/ingest.ts'
import { type Clock, HttpError } from '../../src/io/http.ts'
import type { Adapter, CheckRecord, ParsedItem, ParseNote, RunReport } from '../../src/types.ts'

const ROOT = join(import.meta.dirname, '../..')

// A page is JSON: the items the fake adapter emits and the notes it reports.
interface Page {
  items: Omit<ParsedItem, 'doc'>[]
  notes?: ParseNote[]
}

const fakePage: Adapter = {
  kind: 'fake-page',
  version: 3,
  configSchema: z.object({ url: z.url() }),
  async load(source, io) {
    return [await io.get(source.url ?? '')]
  },
  parse(docs, notes = []) {
    const page = JSON.parse(docs[0].body) as Page
    notes.push(...(page.notes ?? []))
    return page.items.map((item) => ({ ...item, doc: 0 }))
  },
}
// A page plus a second doc at <page>/api, like Aos Fatos and its Escriba API.
const fakeApi: Adapter = {
  ...fakePage,
  kind: 'fake-api',
  async load(source, io) {
    const page = await io.get(source.url ?? '')
    return [page, await io.get(`${page.url}/api`)]
  },
}
const registry = new Map([
  [fakePage.kind, fakePage],
  [fakeApi.kind, fakeApi],
])

const BAND = 'band-2026-10-18'
const GLOBO = 'globo-2026-10-23'
const url = (id: string) => `https://${id.split('-')[0]}.test/${id}`
const source = (id: string, adapter = 'fake-page') => ({
  id,
  outlet: id.split('-')[0],
  adapter,
  url: url(id),
})
const debate = (id: string, date: string, sources: ReturnType<typeof source>[]) => ({
  id,
  broadcaster: { name: id, logo: 'logos/x.svg' },
  date,
  round: 2,
  candidates: ['lula', 'flavio'],
  sources,
})

const item = (pos: number, over: Partial<Page['items'][number]> = {}) => ({
  key: `k${pos}`,
  pos,
  anchor: `a${pos}`,
  speakerRaw: pos % 2 ? 'LULA (PT)' : 'FLÁVIO BOLSONARO (PL)',
  quote: `“Fala número ${pos} sobre a economia do país”`,
  label: '#FATO',
  explanation: `Explicação ${pos}.`,
  ...over,
})

const fakeClock = (iso = '2026-10-25T09:00:00.000Z'): Clock & { t: number } => {
  const clock = {
    t: Date.parse(iso),
    now: () => clock.t,
    sleep: async (ms: number) => {
      clock.t += ms
    },
  }
  return clock
}

const DAY = 86_400_000

let dir: string
let configDir: string
let docsDir: string
let dataDir: string

const writeJson = (path: string, value: unknown) => writeFile(path, JSON.stringify(value))

const writeConfig = (debates: ReturnType<typeof debate>[]) =>
  Promise.all([
    writeJson(join(configDir, 'candidates.json'), [
      {
        id: 'lula',
        name: 'Luiz Inácio Lula da Silva',
        short: 'Lula',
        party: 'PT',
        number: 13,
        aliases: ['lula'],
        partyLogo: 'logos/pt.svg',
        sprite: 'lula',
      },
      {
        id: 'flavio',
        name: 'Flávio Nantes Bolsonaro',
        short: 'Flávio',
        party: 'PL',
        number: 22,
        aliases: ['flavio bolsonaro'],
        partyLogo: 'logos/pl.svg',
        sprite: 'flavio',
      },
    ]),
    writeJson(join(configDir, 'outlets.json'), {
      alpha: { name: 'Alpha', type: 'fact-checker', url: 'https://alpha.test' },
      beta: { name: 'Beta', type: 'fact-checker', url: 'https://beta.test' },
    }),
    writeJson(join(configDir, 'debates.json'), { debates }),
    writeJson(join(configDir, 'bands.json'), {
      alpha: [{ label: '#FATO', band: 'verdadeiro', definitionUrl: null }],
      beta: [{ label: 'FALSO', band: 'falso', definitionUrl: null }],
    }),
    writeJson(join(configDir, 'id-links.json'), {}),
  ])

const writePage = (sourceId: string, page: Page) =>
  writeJson(join(docsDir, `${sourceId}.html`), page)

const run = async (
  clock: Clock,
  over: {
    ioFor?: IngestOptions['ioFor']
    acceptDrop?: string[]
    archive?: Archiver
    offline?: boolean
  } = {},
) =>
  ingest({
    config: await loadConfig(configDir, registry),
    dataDir,
    registry,
    ioFor: over.ioFor ?? offlineIo(docsDir, clock),
    clock,
    acceptDrop: new Set(over.acceptDrop ?? []),
    archive: over.archive ?? null,
    offline: over.offline ?? true,
  })

const files = async () =>
  Object.fromEntries(
    await Promise.all(
      ['checks.json', 'checks.csv', 'run-report.json'].map(
        async (f) => [f, await readFile(join(dataDir, f), 'utf8')] as const,
      ),
    ),
  )
const published = async () =>
  JSON.parse(await readFile(join(dataDir, 'checks.json'), 'utf8')) as CheckRecord[]
const reported = async () =>
  JSON.parse(await readFile(join(dataDir, 'run-report.json'), 'utf8')) as RunReport

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ingest-'))
  configDir = join(dir, 'config')
  docsDir = join(dir, 'docs')
  dataDir = join(dir, 'data')
  await Promise.all([mkdir(configDir), mkdir(docsDir)])
  await writeConfig([debate(BAND, '2026-10-18', [source(`alpha-${BAND}`), source(`beta-${BAND}`)])])
  await writePage(`alpha-${BAND}`, {
    items: [1, 2, 3, 4, 5].map((n) => item(n)),
  })
  await writePage(`beta-${BAND}`, {
    items: [
      item(1, { key: null, anchor: null, label: 'FALSO' }),
      item(2, { key: null, anchor: null, label: 'INSUSTENTÁVEL' }),
      item(3, { key: null, anchor: null, label: 'FALSO', quote: item(1).quote }),
      item(4, { key: null, anchor: null, speakerRaw: 'César Tralli, mediador' }),
      item(5, { key: null, anchor: null, quote: '")"' }),
    ],
    notes: [
      { kind: 'skipped', detail: 'quote without a label: "Uma fala sem selo"' },
      { kind: 'unrated', detail: 'c1: "ainda não checada"' },
      { kind: 'unrated', detail: 'c2: "outra"' },
    ],
  })
})

describe('ingest (INGEST-01, INGEST-02, INGEST-05, INGEST-09)', () => {
  it('writes checks.json, checks.csv and run-report.json for every configured source', async () => {
    await run(fakeClock())
    const records = await published()
    expect(records).toHaveLength(8)
    const alpha1 = records.find((r) => r.sourceId === `alpha-${BAND}` && r.pos === 1)
    expect(alpha1).toMatchObject({
      debate: BAND,
      outlet: 'alpha',
      key: 'k1',
      anchor: 'a1',
      speaker: 'lula',
      quote: 'Fala número 1 sobre a economia do país',
      label: '#FATO',
      band: 'verdadeiro',
      excerpt: 'Explicação 1.',
      url: `${url(`alpha-${BAND}`)}#a1`,
      adapter: 'fake-page@3',
      evidence: {
        url: url(`alpha-${BAND}`),
        fetchedAt: '2026-10-25T09:00:00.000Z',
        archiveUrl: null,
        sha256: null,
      },
    })
    expect(records.find((r) => r.sourceId === `alpha-${BAND}` && r.pos === 2)?.speaker).toBe(
      'flavio',
    )
    const csv = (await readFile(join(dataDir, 'checks.csv'), 'utf8')).split('\r\n')
    expect(csv[0]).toMatch(/^id,source_id,debate,outlet,/)
    expect(csv.filter(Boolean)).toHaveLength(9)
  })

  it('reports exclusions, duplicates, unrated comments and unmapped labels per source', async () => {
    await run(fakeClock())
    const { sources } = await reported()
    const beta = url(`beta-${BAND}`)
    expect(sources[`beta-${BAND}`]).toMatchObject({
      debate: BAND,
      outlet: 'beta',
      adapter: 'fake-page@3',
      status: 'ok',
      reason: null,
      httpStatus: null,
      items: 3,
      excluded: [
        { url: beta, pos: 4, reason: 'speaker not resolved: "César Tralli, mediador"' },
        { url: beta, pos: 5, reason: 'quote shorter than 10 characters: "")""' },
        { url: beta, pos: null, reason: 'quote without a label: "Uma fala sem selo"' },
      ],
      duplicates: [{ pos: 3, quote: 'Fala número 1 sobre a economia do país', n: 2 }],
      unmappedLabels: ['INSUSTENTÁVEL'],
      unratedComments: 2,
    })
    const ids = (await published()).filter((r) => r.sourceId === `beta-${BAND}`).map((r) => r.id)
    expect(sources[`beta-${BAND}`].awaitingArchive).toEqual(ids.sort())
    expect(sources[`alpha-${BAND}`]).toMatchObject({ status: 'ok', items: 5, unmappedLabels: [] })
  })

  it('keeps the old records of a source that fails and reports the failure (INGEST-06)', async () => {
    await run(fakeClock())
    const before = (await published()).filter((r) => r.sourceId === `alpha-${BAND}`)
    await writePage(`beta-${BAND}`, {
      items: [item(1, { key: null, anchor: null, label: 'FALSO' })],
    })
    const clock = fakeClock('2026-10-26T09:00:00.000Z')
    const offline = offlineIo(docsDir, clock)
    await run(clock, {
      ioFor: (s) =>
        s.id === `alpha-${BAND}`
          ? {
              get: async (u) => {
                throw new HttpError('status', u, 'HTTP 503', 503)
              },
              readFile: async () => {
                throw new Error('unused')
              },
            }
          : offline(s),
    })
    const after = (await published()).filter((r) => r.sourceId === `alpha-${BAND}`)
    expect(after).toEqual(before)
    const { sources } = await reported()
    expect(sources[`alpha-${BAND}`]).toMatchObject({
      status: 'failed',
      reason: `HTTP 503: ${url(`alpha-${BAND}`)}`,
      httpStatus: 503,
      items: 5,
    })
    expect(sources[`beta-${BAND}`].status).toBe('ok')
  })

  it('reports no page status when robots.txt fails, keeping the cause in reason', async () => {
    const robots = 'https://alpha.test/robots.txt'
    const offline = offlineIo(docsDir, fakeClock())
    await run(fakeClock(), {
      offline: false,
      ioFor: (s) =>
        s.id === `alpha-${BAND}`
          ? {
              get: async () => {
                throw new HttpError('robots', robots, 'robots.txt unavailable', 503)
              },
              readFile: async () => {
                throw new Error('unused')
              },
            }
          : offline(s),
    })
    expect((await reported()).sources[`alpha-${BAND}`]).toMatchObject({
      status: 'failed',
      reason: `robots.txt unavailable: ${robots}`,
      httpStatus: null,
    })
  })

  it('reports the source page status, not the status of its second doc', async () => {
    await writeConfig([
      debate(BAND, '2026-10-18', [source(`alpha-${BAND}`, 'fake-api'), source(`beta-${BAND}`)]),
    ])
    const api = `${url(`alpha-${BAND}`)}/api`
    const offline = offlineIo(docsDir, fakeClock())
    await run(fakeClock(), {
      offline: false,
      ioFor: (s) => ({
        get: async (u) => {
          if (u === api) throw new HttpError('status', u, 'HTTP 404', 404)
          return offline(s).get(u)
        },
        readFile: async () => {
          throw new Error('unused')
        },
      }),
    })
    const { sources } = await reported()
    expect(sources[`alpha-${BAND}`]).toMatchObject({
      status: 'failed',
      reason: `HTTP 404: ${api}`,
      httpStatus: 200,
    })
    expect(sources[`beta-${BAND}`]).toMatchObject({ status: 'ok', httpStatus: 200 })
  })

  it('treats a source that shrinks by more than 20% as partial until the drop is accepted', async () => {
    await run(fakeClock())
    const before = await files()
    await writePage(`alpha-${BAND}`, { items: [1, 2, 3].map((n) => item(n)) })
    await run(fakeClock('2026-10-26T09:00:00.000Z'))
    expect((await reported()).sources[`alpha-${BAND}`]).toMatchObject({
      status: 'partial',
      reason: '3 items, 5 published',
    })
    expect((await files())['checks.json']).toBe(before['checks.json'])

    await run(fakeClock('2026-10-26T09:00:00.000Z'), { acceptDrop: [`alpha-${BAND}`] })
    const alpha = (await published()).filter((r) => r.sourceId === `alpha-${BAND}`)
    expect(alpha.filter((r) => r.missingSince === '2026-10-26').map((r) => r.key)).toEqual([
      'k4',
      'k5',
    ])
    expect((await reported()).sources[`alpha-${BAND}`]).toMatchObject({ status: 'ok', items: 3 })
  })

  it('fails only the source with an unknown adapter and names it (CONF-02)', async () => {
    await writeConfig([
      debate(BAND, '2026-10-18', [
        source(`alpha-${BAND}`),
        source(`beta-${BAND}`),
        { ...source(`gamma-${BAND}`, 'nope-page'), outlet: 'beta' },
      ]),
    ])
    await run(fakeClock())
    const { sources } = await reported()
    expect(sources[`gamma-${BAND}`]).toMatchObject({
      outlet: 'beta',
      adapter: 'nope-page',
      status: 'failed',
      reason: 'unknown adapter "nope-page"',
      items: 0,
    })
    expect(sources[`alpha-${BAND}`].status).toBe('ok')
    expect(sources[`beta-${BAND}`].status).toBe('ok')
  })

  it('ingests a debate added to the config without code changes (CONF-01)', async () => {
    await run(fakeClock())
    const band = await published()
    await writeConfig([
      debate(BAND, '2026-10-18', [source(`alpha-${BAND}`), source(`beta-${BAND}`)]),
      debate(GLOBO, '2026-10-23', [source(`alpha-${GLOBO}`)]),
    ])
    await writePage(`alpha-${GLOBO}`, { items: [item(1), item(2)] })
    await run(fakeClock('2026-10-26T09:00:00.000Z'))
    const records = await published()
    expect(records.filter((r) => r.debate === GLOBO).map((r) => r.key)).toEqual(['k1', 'k2'])
    expect(records.filter((r) => r.debate === BAND)).toEqual(band)
    expect((await reported()).sources[`alpha-${GLOBO}`]).toMatchObject({ status: 'ok', items: 2 })
  })

  it('leaves all three files byte-identical on a second run with the same docs', async () => {
    await run(fakeClock())
    const first = await files()
    await run(fakeClock(new Date(Date.parse('2026-10-25T09:00:00.000Z') + DAY).toISOString()))
    expect(await files()).toEqual(first)
  })

  it('stores verified snapshots from the archive step and lists the rest as waiting', async () => {
    const archive: Archiver = async (records) => ({
      records: records.map((r) =>
        r.sourceId === `alpha-${BAND}`
          ? {
              ...r,
              evidence: {
                ...r.evidence,
                archiveUrl: `https://web.archive.org/x/${r.id}`,
                sha256: 'f'.repeat(64),
              },
            }
          : r,
      ),
      attempts: [
        { url: url(`alpha-${BAND}`), records: 5, outcome: 'verified', archiveUrl: 'x', steps: [] },
      ],
    })
    const { log } = await run(fakeClock(), { archive })
    const { sources } = await reported()
    expect(sources[`alpha-${BAND}`].awaitingArchive).toEqual([])
    expect(sources[`beta-${BAND}`].awaitingArchive).toHaveLength(3)
    const alpha = (await published()).filter((r) => r.sourceId === `alpha-${BAND}`)
    expect(alpha.every((r) => r.evidence.archiveUrl === `https://web.archive.org/x/${r.id}`)).toBe(
      true,
    )
    expect(log.archive).toMatchObject([{ outcome: 'verified', records: 5 }])
  })
})

describe('ingest command', () => {
  it('prints usage and exits 0 with --help', () => {
    const result = spawnSync(process.execPath, ['src/ingest.ts', '--help'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--offline <dir>')
  })

  it('writes the run log and appends the job summary, failing sources without docs', async () => {
    const summaryFile = join(dir, 'summary.md')
    await writeFile(summaryFile, '# earlier step\n')
    const result = spawnSync(
      process.execPath,
      [
        'src/ingest.ts',
        '--offline',
        docsDir, // has no file for any real source
        '--data-dir',
        dataDir,
        '--run-log',
        join(dir, 'log', 'run-log.json'),
      ],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile } },
    )
    expect(result.status).toBe(0)
    const log = JSON.parse(await readFile(join(dir, 'log', 'run-log.json'), 'utf8'))
    const g1 = log.sources['g1-band-2026-10-18']
    expect(g1.status).toBe('failed')
    expect(g1.fetches[0]).toMatchObject({ status: null, sha256: null })
    expect(g1.fetches[0].error).toContain('offline: no g1-band-2026-10-18.html')
    expect(log.archive).toBe('skipped')
    const summary = await readFile(summaryFile, 'utf8')
    expect(summary).toMatch(/^# earlier step\n## Ingest\n/)
    expect(summary).toContain('| g1-band-2026-10-18 | failed')
    expect(Object.keys((await reported()).sources)).toHaveLength(8)
  })
})
