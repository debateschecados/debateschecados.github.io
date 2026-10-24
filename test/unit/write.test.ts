import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checksCsv, checksJson, reportJson, writeData } from '../../src/pipeline/write.ts'
import type { CheckRecord, RunReport, SourceReport } from '../../src/types.ts'

const record = (over: Partial<CheckRecord> = {}): CheckRecord => ({
  id: '0a1b2c3d4e5f',
  sourceId: 'lupa-band-2026-10-18',
  debate: 'band-2026-10-18',
  outlet: 'lupa',
  key: null,
  pos: 3,
  anchor: null,
  speaker: 'lula',
  quote: 'O desemprego caiu para 6%, o menor da série',
  label: 'VERDADEIRO',
  band: 'verdadeiro',
  excerpt: 'Segundo o IBGE, a taxa ficou em 6,1%.',
  url: 'https://www.agencialupa.org/checagem/x/',
  adapter: 'lupa-page@1',
  evidence: {
    url: 'https://www.agencialupa.org/checagem/x/',
    fetchedAt: '2026-10-24T10:00:00.000Z',
    archiveUrl: null,
    sha256: null,
  },
  ...over,
})

const source = (over: Partial<SourceReport> = {}): SourceReport => ({
  debate: 'band-2026-10-18',
  outlet: 'lupa',
  adapter: 'lupa-page@1',
  status: 'ok',
  reason: null,
  httpStatus: 200,
  items: 41,
  excluded: [{ url: 'https://www.agencialupa.org/checagem/x/', pos: 7, reason: 'speaker' }],
  duplicates: [],
  unmappedLabels: [],
  unratedComments: 0,
  awaitingArchive: ['0a1b2c3d4e5f'],
  ...over,
})

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'write-'))
  dirs.push(dir)
  return dir
}

const reversedKeys = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).reverse()) as T

describe('dataset files (DATA-01, DATA-04)', () => {
  it('writes byte-identical files for the same records on two writes', async () => {
    const records = [record(), record({ id: 'ffeeddccbbaa', pos: 4, missingSince: '2026-10-25' })]
    const report: RunReport = { sources: { 'lupa-band-2026-10-18': source() } }
    const [a, b] = [await tempDir(), await tempDir()]
    await writeData(a, records, report)
    await writeData(b, records, report)
    for (const file of ['checks.json', 'checks.csv', 'run-report.json']) {
      const bytes = await readFile(join(a, file))
      expect(bytes.length).toBeGreaterThan(0)
      expect(bytes.equals(await readFile(join(b, file)))).toBe(true)
    }
    expect(JSON.parse(await readFile(join(a, 'checks.json'), 'utf8'))).toEqual(records)
  })

  it('writes keys in a fixed order whatever the order the objects were built in', () => {
    const history = [{ until: '2026-10-25', label: 'FALSO' }]
    const shuffled = reversedKeys({
      ...record({ history }),
      evidence: reversedKeys(record().evidence),
    })
    expect(checksJson([shuffled])).toBe(
      checksJson([record({ history: [{ label: 'FALSO', until: '2026-10-25' }] })]),
    )
    expect(Object.keys(JSON.parse(checksJson([shuffled]))[0])).toEqual([
      'id',
      'sourceId',
      'debate',
      'outlet',
      'key',
      'pos',
      'anchor',
      'speaker',
      'quote',
      'label',
      'band',
      'excerpt',
      'url',
      'adapter',
      'evidence',
      'history',
    ])
  })

  it('omits missingSince and history when absent and ends with a newline', () => {
    const text = checksJson([record()])
    expect(text.endsWith(']\n')).toBe(true)
    expect(text).not.toContain('missingSince')
    expect(text).not.toContain('history')
    expect(text).toContain('"key": null')
  })
})

describe('CSV (DATA-01)', () => {
  it('has the design header: record fields with evidence flattened and history as JSON', () => {
    const [header] = checksCsv([]).split('\r\n')
    expect(header).toBe(
      'id,source_id,debate,outlet,key,pos,anchor,speaker,quote,label,band,excerpt,url,adapter,' +
        'evidence_url,fetched_at,archive_url,sha256,missing_since,history',
    )
  })

  it('quotes fields with commas, quotes and line breaks (RFC 4180)', () => {
    const csv = checksCsv([
      record({ quote: 'Ele disse "não", e saiu', excerpt: 'linha 1\nlinha 2', label: 'FALSO' }),
    ])
    const row = csv.split('\r\n')[1]
    expect(row).toBe(
      '0a1b2c3d4e5f,lupa-band-2026-10-18,band-2026-10-18,lupa,,3,,lula,' +
        '"Ele disse ""não"", e saiu",FALSO,verdadeiro,"linha 1\nlinha 2",' +
        'https://www.agencialupa.org/checagem/x/,lupa-page@1,https://www.agencialupa.org/checagem/x/,' +
        '2026-10-24T10:00:00.000Z,,,,',
    )
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('writes history as a JSON text column and missing_since when set', () => {
    const history = [{ label: 'FALSO', until: '2026-10-25' }]
    const row = checksCsv([record({ history, missingSince: '2026-10-26' })]).split('\r\n')[1]
    expect(row.endsWith(',2026-10-26,"[{""label"":""FALSO"",""until"":""2026-10-25""}]"')).toBe(
      true,
    )
  })
})

describe('run report (INGEST-09)', () => {
  it('has per-source status, counts and lists, and no timestamp or hash fields', () => {
    const report: RunReport = {
      sources: {
        'lupa-band-2026-10-18': source(),
        'g1-band-2026-10-18': source({
          outlet: 'g1',
          adapter: 'g1-page@1',
          status: 'failed',
          reason: 'HTTP 503',
          httpStatus: 503,
          items: 0,
          unmappedLabels: ['#INSUSTENTAVEL'],
        }),
      },
    }
    const parsed = JSON.parse(reportJson(report))
    expect(Object.keys(parsed.sources)).toEqual(['g1-band-2026-10-18', 'lupa-band-2026-10-18'])
    expect(parsed.sources['g1-band-2026-10-18']).toEqual(report.sources['g1-band-2026-10-18'])
    const keys = JSON.stringify(parsed).match(/"[A-Za-z]+":/g) ?? []
    expect(keys.filter((k) => /time|date|at"|sha|hash/i.test(k))).toEqual([])
    expect(reportJson(report)).toBe(reportJson({ sources: reversedKeys(report.sources) }))
  })
})
