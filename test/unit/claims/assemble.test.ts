import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assemble } from '../../../src/claims/assemble.ts'
import { checkGroups, groupId } from '../../../src/claims/groups.ts'
import type { CheckRecord } from '../../../src/types.ts'
import workflow from '../../fixtures/claim-curation-2026-10-24-result.json' with { type: 'json' }

const ROOT = join(import.meta.dirname, '../../..')
const DATA = join(ROOT, 'data')
const RUN = join(DATA, 'claim-curation/2026-10-24')
const MARKETS = ['92e3caa21ac1', 'df250d7b4df0']
const MARKETS_G1 = '5434697c0611'
const REASON =
  'A checagem do g1 (5434697c0611) também avalia os 700 novos mercados; incluída na revisão do mantenedor em 2026-10-24.'

const key = (refs: readonly string[]) => refs.toSorted().join(',')
const records = async () =>
  JSON.parse(await readFile(join(DATA, 'checks.json'), 'utf8')) as CheckRecord[]

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

// A data dir with checks.json, the committed run and claim-groups.json, for edits.
async function dataCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'claims-'))
  dirs.push(dir)
  await cp(join(DATA, 'checks.json'), join(dir, 'checks.json'))
  await cp(join(DATA, 'claim-groups.json'), join(dir, 'claim-groups.json'))
  await cp(RUN, join(dir, 'claim-curation/2026-10-24'), { recursive: true })
  return dir
}

describe('assemble the committed 2026-10-24 run (CLAIM-04, CLAIM-05, CLAIM-06)', () => {
  it('yields 81 valid groups: 78 unanimous, 2 adjudicated, 1 manual 700-markets group', async () => {
    const { file } = await assemble(RUN)
    const origins = Object.groupBy(file.groups, (g) => g.origin)
    expect(file.run).toBe('2026-10-24')
    expect(file.groups).toHaveLength(81)
    expect(origins.unanimous).toHaveLength(78)
    expect(origins.adjudicated?.map((g) => key(g.records)).sort()).toEqual([
      '78fc2ef28ae7,b0c13289fb42',
      'ab219f5a267e,d9d2cea5305a',
    ])
    expect(origins.manual?.map((g) => g.records)).toEqual([[MARKETS_G1, ...MARKETS]])
    expect(checkGroups(file, await records())).toEqual([])
  })

  it('keeps every claim and origin of the workflow result, reviewer rewrites included', async () => {
    const { file } = await assemble(RUN)
    const expected = new Map(workflow.groups.map((g) => [key(g.refs), g]))
    const actual = new Map(file.groups.map((g) => [key(g.records), g]))
    expect([...actual.keys()].sort()).toEqual(
      [...expected.keys()]
        .map((k) => (k === key(MARKETS) ? key([...MARKETS, MARKETS_G1]) : k))
        .sort(),
    )
    for (const [refs, group] of expected) {
      const mine = actual.get(refs === key(MARKETS) ? key([...MARKETS, MARKETS_G1]) : refs)
      expect(mine?.claim).toBe(group.claim)
      expect(mine?.debate).toBe(group.debate)
      expect(mine?.speaker).toBe(group.speaker)
      if (refs !== key(MARKETS)) expect(mine?.origin).toBe(group.origin)
    }
    // The two reviewer rewrites differ from the editor's sentence.
    expect(actual.get('0281621a9164,18ef0c5fb37f')?.claim).toBe(
      'Os governos Lula fizeram US$ 270 bilhões de reservas internacionais',
    )
  })

  it('gives each group the id of its records and sorts by debate, speaker and id', async () => {
    const { file } = await assemble(RUN)
    for (const g of file.groups) expect(g.id).toBe(groupId(g.records))
    const order = (g: (typeof file.groups)[number]) => `${g.debate} ${g.speaker} ${g.id}`
    expect(file.groups.map(order)).toEqual(file.groups.map(order).sort())
  })

  it('matches the committed data/claim-groups.json (REPRO-01)', async () => {
    const committed = JSON.parse(await readFile(join(DATA, 'claim-groups.json'), 'utf8'))
    expect(committed).toEqual((await assemble(RUN)).file)
  })

  it('leaves a disputed component ungrouped when its judge output is missing (edge case)', async () => {
    const dir = await dataCopy()
    const run = join(dir, 'claim-curation/2026-10-24')
    await rm(join(run, 'judge-globo-2026-10-23.json'))
    const { file } = await assemble(run)
    expect(file.groups).toHaveLength(80)
    expect(file.groups.map((g) => key(g.records))).not.toContain('ab219f5a267e,d9d2cea5305a')
  })

  it('throws when a manual edit names a group that does not exist', async () => {
    const dir = await dataCopy()
    const run = join(dir, 'claim-curation/2026-10-24')
    const edit = { from: ['000000000001', '000000000002'], to: null, reason: 'teste' }
    await writeFile(join(run, 'manual.json'), JSON.stringify({ edits: [edit] }))
    await expect(assemble(run)).rejects.toThrow(
      'manual.json: edit 0: no group has the records 000000000001,000000000002',
    )
  })
})

describe('check:claims (REPRO-01, REPRO-02)', () => {
  const check = (dataDir: string) =>
    spawnSync(process.execPath, ['src/claims/assemble.ts', '--check', '--data-dir', dataDir], {
      cwd: ROOT,
      encoding: 'utf8',
    })
  const manualId = groupId([MARKETS_G1, ...MARKETS])

  it('passes on the committed files and lists the manual group with its reason', async () => {
    const result = check(await dataCopy())
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`${manualId}: ${REASON}`)
  })

  it('fails naming the group when an adjudicated group was edited by hand', async () => {
    const dir = await dataCopy()
    const path = join(dir, 'claim-groups.json')
    const file = JSON.parse(await readFile(path, 'utf8'))
    const edited = file.groups.find((g: { origin: string }) => g.origin === 'adjudicated')
    edited.claim = 'Outra frase'
    await writeFile(path, JSON.stringify(file))
    const result = check(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(edited.id)
    expect(result.stderr).not.toContain(manualId)
    expect(result.stdout).toContain(`${manualId}: ${REASON}`)
  })
})
