import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Candidate } from '../../src/config.ts'
import { type Clock, createHttp } from '../../src/io/http.ts'
import {
  type ArchiveKeys,
  archive,
  CAPTURE_SPACING_MS,
  POLL_LIMIT_MS,
} from '../../src/pipeline/archive.ts'
import type { Adapter, CheckRecord, ParsedItem } from '../../src/types.ts'

const PAGE = 'https://www.agency.test/debate'
const OTHER = 'https://www.agency.test/other'
const KEYS: ArchiveKeys = { access: 'ACCESSKEY123', secret: 'SECRETKEY456' }

const candidates: Candidate[] = [
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
]

// A page is a JSON list of parsed items, so a test can say exactly what a snapshot holds.
const fake: Pick<Adapter, 'parse'> = {
  parse: (docs) => JSON.parse(docs[0].body) as ParsedItem[],
}
const adapters = new Map([['fake-page', fake]])

const record = (n: number, over: Partial<CheckRecord> = {}): CheckRecord => ({
  id: `id${n}`,
  sourceId: 'fake-band',
  debate: 'band',
  outlet: 'fake',
  key: `k${n}`,
  pos: n,
  anchor: null,
  speaker: 'lula',
  quote: `Fala número ${n} sobre a economia`,
  label: 'FATO',
  band: 'verdadeiro',
  excerpt: '',
  url: PAGE,
  adapter: 'fake-page@1',
  evidence: { url: PAGE, fetchedAt: '2026-10-24T10:00:00.000Z', archiveUrl: null, sha256: null },
  ...over,
})

const page = (...records: CheckRecord[]) =>
  JSON.stringify(
    records.map<ParsedItem>((r) => ({
      key: r.key,
      doc: 0,
      pos: r.pos,
      anchor: null,
      speakerRaw: 'LULA (PT)',
      quote: `“${r.quote}”`,
      label: r.label,
      explanation: '',
    })),
  )

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const lookupUrl = (url: string) =>
  `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`
const idUrl = (ts: string, url = PAGE) => `https://web.archive.org/web/${ts}id_/${url}`
const available = (timestamp: string, status = '200') =>
  JSON.stringify({ archived_snapshots: { closest: { available: true, status, timestamp } } })

interface Call {
  url: string
  at: number
  method: string
  headers: Headers
  body: string | null
}

type Route = string | number | ((call: Call) => Response)

function setup(routes: Record<string, Route>, keys: ArchiveKeys | null = KEYS) {
  const clock: Clock & { t: number } = {
    t: 1_000_000,
    now: () => clock.t,
    sleep: async (ms) => {
      clock.t += ms
    },
  }
  const calls: Call[] = []
  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      at: clock.now(),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body ? String(init.body) : null,
    }
    calls.push(call)
    const route = routes[call.url]
    if (route === undefined) return new Response('', { status: 404 })
    if (typeof route === 'string') return new Response(route, { status: 200 })
    if (typeof route === 'number') return new Response('', { status: route })
    return route(call)
  }
  const http = createHttp({
    hosts: [],
    repoUrl: 'https://example.org/repo',
    clock,
    fetch: fetchFn as typeof fetch,
  })
  const run = (records: CheckRecord[]) =>
    archive(records, {
      http,
      clock,
      adapters,
      candidates,
      keys,
      fetch: fetchFn as typeof fetch,
      userAgent: 'debates-checados/test',
    })
  const urls = () => calls.map((c) => c.url).filter((u) => !u.endsWith('/robots.txt'))
  return { run, calls, clock, urls }
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

// SPN2 routes: the save request answers a job id; the status poll answers `statuses` in turn,
// then repeats the last one.
const spn = (statuses: object[], job = 'job-1') => {
  let poll = 0
  return {
    'https://web.archive.org/save': () => json({ url: PAGE, job_id: job }),
    [`https://web.archive.org/save/status/${job}`]: () =>
      json(statuses[Math.min(poll++, statuses.length - 1)]),
  }
}

describe('archive (DATA-02, DATA-06)', () => {
  it('verifies an old snapshot that holds the records and stores its id_ URL and hash', async () => {
    const records = [record(1), record(2, { key: null })]
    const body = page(...records)
    const { run, urls } = setup({
      [lookupUrl(PAGE)]: available('20261019120000'),
      [idUrl('20261019120000')]: body,
    })
    const result = await run(records)
    expect(result.records.map((r) => r.evidence)).toEqual([
      { ...records[0].evidence, archiveUrl: idUrl('20261019120000'), sha256: sha256(body) },
      { ...records[1].evidence, archiveUrl: idUrl('20261019120000'), sha256: sha256(body) },
    ])
    expect(result.attempts).toMatchObject([{ url: PAGE, records: 2, outcome: 'verified' }])
    expect(urls()).toEqual([lookupUrl(PAGE), idUrl('20261019120000')])
  })

  it('rejects a snapshot missing a record, captures the page and verifies the capture', async () => {
    const records = [record(1), record(2)]
    const { run, calls } = setup({
      [lookupUrl(PAGE)]: available('20261018230000'),
      [idUrl('20261018230000')]: page(records[0]), // taken on debate night, before item 2
      ...spn([{ status: 'pending' }, { status: 'success', timestamp: '20261025090000' }]),
      [idUrl('20261025090000')]: page(...records),
    })
    const result = await run(records)
    expect(result.records.map((r) => r.evidence.archiveUrl)).toEqual([
      idUrl('20261025090000'),
      idUrl('20261025090000'),
    ])
    expect(result.attempts[0].outcome).toBe('captured')
    expect(result.attempts[0].steps).toContain('snapshot 20261018230000: 1 of 2 records, rejected')
    const save = calls.find((c) => c.url === 'https://web.archive.org/save')
    expect(save?.method).toBe('POST')
    expect(save?.headers.get('authorization')).toBe('LOW ACCESSKEY123:SECRETKEY456')
    expect(save?.headers.get('accept')).toBe('application/json')
    expect(save?.headers.get('content-type')).toContain('application/x-www-form-urlencoded')
    expect(Object.fromEntries(new URLSearchParams(save?.body ?? ''))).toEqual({
      url: PAGE,
      if_not_archived_within: '1h',
    })
  })

  it('ignores a snapshot whose archived status is not 200', async () => {
    const records = [record(1)]
    const { run, urls } = setup(
      {
        [lookupUrl(PAGE)]: available('20261020000000', '403'),
        [idUrl('20261020000000')]: page(...records),
      },
      null,
    )
    const result = await run(records)
    expect(result.records).toEqual(records)
    expect(urls()).toEqual([lookupUrl(PAGE)])
  })

  it('treats a rate-limited lookup as no snapshot and still captures', async () => {
    const records = [record(1)]
    const { run } = setup({
      [lookupUrl(PAGE)]: 429,
      ...spn([{ status: 'success', timestamp: '20261025090000' }]),
      [idUrl('20261025090000')]: page(...records),
    })
    const result = await run(records)
    expect(result.records[0].evidence.archiveUrl).toBe(idUrl('20261025090000'))
    expect(result.attempts[0].steps[0]).toContain('HTTP 429')
  })

  it('without keys requests no capture, leaves the record waiting and says why', async () => {
    const records = [record(1)]
    const { run, calls } = setup({ [lookupUrl(PAGE)]: available('20261018230000') }, null)
    const result = await run(records)
    expect(result.records).toEqual(records)
    expect(calls.filter((c) => c.url.startsWith('https://web.archive.org/save'))).toEqual([])
    expect(result.attempts).toMatchObject([{ url: PAGE, outcome: 'waiting', archiveUrl: null }])
    expect(result.attempts[0].steps).toContain('capture: skipped, no IA_S3_ACCESS / IA_S3_SECRET')
  })

  it('gives up after polling for 3 minutes and leaves the record waiting', async () => {
    const records = [record(1)]
    const { run, calls, clock } = setup({
      [lookupUrl(PAGE)]: available('20261018230000'),
      ...spn([{ status: 'pending' }]),
    })
    const start = clock.now()
    const result = await run(records)
    expect(result.records).toEqual(records)
    expect(result.attempts[0]).toMatchObject({ outcome: 'waiting', archiveUrl: null })
    expect(result.attempts[0].steps.at(-1)).toBe('capture: no result after 180 s')
    const saved = calls.find((c) => c.url === 'https://web.archive.org/save')?.at ?? start
    const polls = calls.filter((c) => c.url.includes('/save/status/'))
    expect(polls.length).toBeGreaterThan(1)
    expect(polls.at(-1)?.at).toBeLessThanOrEqual(saved + POLL_LIMIT_MS)
    expect(clock.now() - saved).toBeGreaterThanOrEqual(POLL_LIMIT_MS)
  })

  it('leaves the record waiting when the capture job fails', async () => {
    const records = [record(1)]
    const { run } = setup({
      ...spn([{ status: 'error', status_ext: 'error:blocked-url', message: 'Blocked.' }]),
    })
    const result = await run(records)
    expect(result.records).toEqual(records)
    expect(result.attempts[0].steps).toContain('capture: error:blocked-url, Blocked.')
  })

  it('skips records already archived and records gone from their source', async () => {
    const archived = record(1, {
      evidence: {
        url: PAGE,
        fetchedAt: '2026-10-24T10:00:00.000Z',
        archiveUrl: idUrl('20261019120000'),
        sha256: 'ab'.repeat(32),
      },
    })
    const gone = record(2, { missingSince: '2026-10-25' })
    const { run, calls } = setup({})
    const result = await run([archived, gone])
    expect(result.records).toEqual([archived, gone])
    expect(result.attempts).toEqual([])
    expect(calls).toEqual([])
  })

  it('checks one snapshot per evidence doc and spaces captures 20 s apart', async () => {
    const a = [record(1), record(2)]
    const b = [record(3, { evidence: { ...record(3).evidence, url: OTHER } })]
    let job = 0
    const { run, calls } = setup({
      'https://web.archive.org/save': () => json({ job_id: `job-${++job}` }),
      'https://web.archive.org/save/status/job-1': () =>
        json({ status: 'success', timestamp: '20261025090000' }),
      'https://web.archive.org/save/status/job-2': () =>
        json({ status: 'success', timestamp: '20261025090100' }),
      [idUrl('20261025090000')]: page(...a),
      [idUrl('20261025090100', OTHER)]: page(...b),
    })
    const result = await run([...a, ...b])
    expect(result.attempts.map((x) => [x.url, x.records, x.outcome])).toEqual([
      [PAGE, 2, 'captured'],
      [OTHER, 1, 'captured'],
    ])
    expect(calls.filter((c) => c.url.startsWith('https://archive.org/wayback'))).toHaveLength(2)
    const saves = calls.filter((c) => c.url === 'https://web.archive.org/save')
    expect(saves).toHaveLength(2)
    expect(saves[1].at - saves[0].at).toBeGreaterThanOrEqual(CAPTURE_SPACING_MS)
  })

  it('rejects a snapshot whose label or speaker differs from the record', async () => {
    const records = [record(1)]
    const relabeled = page({ ...records[0], label: 'FAKE' })
    const { run } = setup(
      { [lookupUrl(PAGE)]: available('20261019120000'), [idUrl('20261019120000')]: relabeled },
      null,
    )
    const result = await run(records)
    expect(result.records).toEqual(records)
    expect(result.attempts[0].steps).toContain('snapshot 20261019120000: 0 of 1 records, rejected')
  })

  describe('identical keyless quotes (the "#2" duplicate)', () => {
    const repeat = (n: number, over: Partial<CheckRecord> = {}) =>
      record(n, { key: null, quote: 'A mesma fala repetida na página', ...over })
    const archivedEvidence = {
      url: PAGE,
      fetchedAt: '2026-10-24T10:00:00.000Z',
      archiveUrl: idUrl('20261019120000'),
      sha256: 'ab'.repeat(32),
    }

    it('rejects a snapshot holding one occurrence for two new records', async () => {
      const records = [repeat(1), repeat(2)]
      const { run } = setup(
        {
          [lookupUrl(PAGE)]: available('20261019120000'),
          [idUrl('20261019120000')]: page(records[0]),
        },
        null,
      )
      const result = await run(records)
      expect(result.records).toEqual(records)
      expect(result.attempts).toMatchObject([{ outcome: 'waiting', archiveUrl: null }])
    })

    it('does not give a new repeat the snapshot of an archived one taken before it', async () => {
      const old = repeat(1, { evidence: archivedEvidence })
      const added = repeat(2)
      const { run } = setup(
        {
          [lookupUrl(PAGE)]: available('20261019120000'),
          [idUrl('20261019120000')]: page(old), // taken before the repeat was added
          ...spn([{ status: 'success', timestamp: '20261025090000' }]),
          [idUrl('20261025090000')]: page(old, added),
        },
        KEYS,
      )
      const result = await run([old, added])
      expect(result.records.map((r) => r.evidence.archiveUrl)).toEqual([
        idUrl('20261019120000'),
        idUrl('20261025090000'),
      ])
      expect(result.attempts).toMatchObject([{ records: 1, outcome: 'captured' }])
    })

    it('does not count a repeat gone from its source', async () => {
      const gone = repeat(1, { missingSince: '2026-10-25' })
      const kept = repeat(2)
      const { run } = setup(
        {
          [lookupUrl(PAGE)]: available('20261019120000'),
          [idUrl('20261019120000')]: page(kept),
        },
        null,
      )
      const result = await run([gone, kept])
      expect(result.records[1].evidence.archiveUrl).toBe(idUrl('20261019120000'))
    })
  })

  it('never writes the keys into the attempts', async () => {
    const records = [record(1)]
    const { run } = setup({
      'https://web.archive.org/save': () => json({ message: 'You have 0 captures left' }, 429),
    })
    const result = await run(records)
    const text = JSON.stringify(result)
    expect(result.attempts[0].steps).toContain('capture: HTTP 429, You have 0 captures left')
    expect(text).not.toContain(KEYS.access)
    expect(text).not.toContain(KEYS.secret)
  })
})
