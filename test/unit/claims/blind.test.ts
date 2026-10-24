import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { blindInput } from '../../../src/claims/blind.ts'
import { loadConfig } from '../../../src/config.ts'
import type { CheckRecord } from '../../../src/types.ts'

const ROOT = join(import.meta.dirname, '../../..')
const RUN = join(ROOT, 'data/claim-curation/2026-10-24/input.json')
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const byHash = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const CANDIDATES = [
  { id: 'flavio', number: 22 },
  { id: 'lula', number: 13 },
]

let n = 0
const record = (
  debate: string,
  outlet: string,
  speaker: string,
  missingSince?: string,
): CheckRecord => {
  n++
  return {
    id: `r${String(n).padStart(11, '0')}`,
    sourceId: `${outlet}-${debate}`,
    debate,
    outlet,
    key: `key-${n}`,
    pos: n,
    anchor: `anchor-${n}`,
    speaker,
    quote: `Quote ${n}`,
    label: `LABEL-${outlet.toUpperCase()}-${n}`,
    band: 'impreciso',
    excerpt: `Excerpt ${n}`,
    url: `https://${outlet}.example/item-${n}`,
    adapter: `${outlet}@1`,
    evidence: {
      url: `https://${outlet}.example/api-${n}`,
      fetchedAt: '2026-10-24T08:00:00.000Z',
      archiveUrl: null,
      sha256: null,
    },
    ...(missingSince && { missingSince }),
  }
}

const OUTLETS = ['lupa', 'g1', 'estadao', 'aosfatos']
const RECORDS = ['globo', 'band'].flatMap((debate) =>
  OUTLETS.flatMap((outlet) => [record(debate, outlet, 'flavio'), record(debate, outlet, 'lula')]),
)
const REMOVED = record('band', 'g1', 'lula', '2026-10-24T09:00:00.000Z')

describe('blindInput (CLAIM-03)', () => {
  const input = blindInput([...RECORDS, REMOVED], CANDIDATES)

  it('gives each record only ref, src, quote and excerpt, with no agency, URL, label or band', () => {
    const blind = input.flatMap((d) => d.partitions.flatMap((p) => p.records))
    for (const r of blind) expect(Object.keys(r).sort()).toEqual(['excerpt', 'quote', 'ref', 'src'])
    const text = JSON.stringify(input)
    for (const r of RECORDS) {
      for (const hidden of [r.outlet, r.url, r.label, r.band, r.evidence.url, r.sourceId])
        expect(text).not.toContain(hidden)
    }
  })

  it('assigns letters per debate in sha256(debate + outlet) order', () => {
    for (const debate of input) {
      const letters = OUTLETS.toSorted((a, b) =>
        byHash(sha(debate.debate + a), sha(debate.debate + b)),
      )
      const srcOf = new Map(
        RECORDS.filter((r) => r.debate === debate.debate).map((r) => [
          r.id,
          'ABCD'[letters.indexOf(r.outlet)],
        ]),
      )
      for (const r of debate.partitions.flatMap((p) => p.records))
        expect(r.src).toBe(srcOf.get(r.ref))
    }
  })

  it('orders debates by id, speakers by ballot number and records by sha256(id), without removed records', () => {
    expect(input.map((d) => d.debate)).toEqual(['band', 'globo'])
    for (const debate of input) {
      expect(debate.partitions.map((p) => p.speaker)).toEqual(['lula', 'flavio'])
      for (const p of debate.partitions) {
        const expected = RECORDS.filter(
          (r) => r.debate === debate.debate && r.speaker === p.speaker,
        )
          .map((r) => r.id)
          .sort((a, b) => byHash(sha(a), sha(b)))
        expect(p.records.map((r) => r.ref)).toEqual(expected)
      }
    }
    expect(JSON.stringify(input)).not.toContain(REMOVED.id)
  })

  it('reproduces the committed 2026-10-24 input from data/checks.json', async () => {
    const committed = JSON.parse(await readFile(RUN, 'utf8'))
    const ids = new Set(
      committed.flatMap((d: { partitions: { records: { ref: string }[] }[] }) =>
        d.partitions.flatMap((p) => p.records.map((r) => r.ref)),
      ),
    )
    expect(ids.size).toBe(314)
    const records = JSON.parse(
      await readFile(join(ROOT, 'data/checks.json'), 'utf8'),
    ) as CheckRecord[]
    const { candidates } = await loadConfig(join(ROOT, 'config'))
    expect(
      blindInput(
        records.filter((r) => ids.has(r.id)),
        candidates,
      ),
    ).toEqual(committed)
  })
})

describe('claims:input CLI', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('writes data/claim-curation/<run>/input.json and refuses to overwrite it', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'blind-'))
    dirs.push(dataDir)
    await writeFile(join(dataDir, 'checks.json'), JSON.stringify(RECORDS))
    const run = () =>
      spawnSync(
        process.execPath,
        ['src/claims/blind.ts', '--run', '2026-10-24', '--data-dir', dataDir],
        { cwd: ROOT, encoding: 'utf8' },
      )
    expect(run().status).toBe(0)
    const written = JSON.parse(
      await readFile(join(dataDir, 'claim-curation/2026-10-24/input.json'), 'utf8'),
    )
    expect(written).toEqual(blindInput(RECORDS, CANDIDATES))
    const again = run()
    expect(again.status).toBe(1)
    expect(again.stderr).toContain('already exists')
  })
})
