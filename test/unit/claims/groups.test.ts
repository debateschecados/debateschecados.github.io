import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type ClaimGroup,
  type ClaimGroupsFile,
  checkGroups,
  groupId,
  loadGroups,
} from '../../../src/claims/groups.ts'
import type { CheckRecord } from '../../../src/types.ts'

const record = (id: string, outlet: string, debate = 'band', speaker = 'lula') =>
  ({ id, outlet, debate, speaker }) as CheckRecord

const RECORDS = [
  record('a1', 'lupa'),
  record('a2', 'g1'),
  record('a3', 'estadao'),
  record('a4', 'lupa'),
  record('b1', 'lupa', 'band', 'flavio'),
  record('c1', 'g1', 'globo'),
]

const group = (records: string[], over: Partial<ClaimGroup> = {}): ClaimGroup => ({
  id: groupId(records),
  debate: 'band',
  speaker: 'lula',
  claim: 'O governo criou 10 mil vagas',
  records,
  origin: 'unanimous',
  ...over,
})

const file = (...groups: ClaimGroup[]): ClaimGroupsFile => ({ run: '2026-10-24', groups })

describe('groupId', () => {
  it('is "c" plus the first 8 hex chars of sha256 over the sorted ids joined by commas', () => {
    const expected = `c${createHash('sha256').update('a1,a2,a3').digest('hex').slice(0, 8)}`
    expect(groupId(['a3', 'a1', 'a2'])).toBe(expected)
    expect(groupId(['a1', 'a2', 'a3'])).toBe(expected)
  })
})

describe('checkGroups (CLAIM-01, CLAIM-02)', () => {
  it('accepts a valid file with two groups', () => {
    const valid = file(group(['a1', 'a2']), group(['a3', 'a4'], { origin: 'manual' }))
    expect(checkGroups(valid, RECORDS)).toEqual([])
  })

  it('names an unknown record', () => {
    const g = group(['a1', 'zz'])
    expect(checkGroups(file(g), RECORDS)).toEqual([`${g.id}: unknown record "zz"`])
  })

  it('names a record from another debate', () => {
    const g = group(['a1', 'c1'])
    expect(checkGroups(file(g), RECORDS)).toEqual([
      `${g.id}: record "c1" is from debate "globo", not "band"`,
    ])
  })

  it('names a record from another speaker', () => {
    const g = group(['a2', 'b1'])
    expect(checkGroups(file(g), RECORDS)).toEqual([
      `${g.id}: record "b1" is from speaker "flavio", not "lula"`,
    ])
  })

  it('names a repeated agency', () => {
    const g = group(['a1', 'a2', 'a4'])
    expect(checkGroups(file(g), RECORDS)).toEqual([`${g.id}: agency "lupa" appears more than once`])
  })

  it('rejects a group with fewer than two records', () => {
    const g = group(['a1'])
    expect(checkGroups(file(g), RECORDS)).toEqual([`${g.id}: fewer than 2 records`])
  })

  it('names a record shared with another group', () => {
    const first = group(['a1', 'a2'])
    const second = group(['a2', 'a3'])
    expect(checkGroups(file(first, second), RECORDS)).toEqual([
      `${second.id}: record "a2" is also in group ${first.id}`,
    ])
  })

  it('rejects an empty claim', () => {
    const g = group(['a1', 'a2'], { claim: '  ' })
    expect(checkGroups(file(g), RECORDS)).toEqual([`${g.id}: claim is empty`])
  })

  it('rejects a claim over 120 characters and accepts one of exactly 120', () => {
    const long = group(['a1', 'a2'], { claim: 'x'.repeat(121) })
    expect(checkGroups(file(long), RECORDS)).toEqual([
      `${long.id}: claim has 121 characters, more than 120`,
    ])
    expect(checkGroups(file(group(['a1', 'a2'], { claim: 'x'.repeat(120) })), RECORDS)).toEqual([])
  })

  it('rejects an id that does not match the records', () => {
    const g = group(['a1', 'a2'], { id: 'c00000000' })
    expect(checkGroups(file(g), RECORDS)).toEqual([
      `c00000000: id does not match its records, expected ${groupId(['a1', 'a2'])}`,
    ])
  })

  it('collects every broken rule instead of stopping at the first', () => {
    const unknown = group(['a1', 'zz'])
    const empty = group(['a3', 'a4'], { claim: '' })
    expect(checkGroups(file(unknown, empty), RECORDS)).toEqual([
      `${unknown.id}: unknown record "zz"`,
      `${empty.id}: claim is empty`,
    ])
  })
})

describe('loadGroups', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })
  const dataDir = async (json?: unknown) => {
    const dir = await mkdtemp(join(tmpdir(), 'groups-'))
    dirs.push(dir)
    if (json !== undefined) await writeFile(join(dir, 'claim-groups.json'), JSON.stringify(json))
    return dir
  }

  it('treats a missing file as no groups and no run', async () => {
    expect(await loadGroups(await dataDir(), RECORDS)).toEqual({ run: null, groups: [] })
  })

  it('returns a valid file', async () => {
    const valid = file(group(['a1', 'a2']))
    expect(await loadGroups(await dataDir(valid), RECORDS)).toEqual(valid)
  })

  it('throws a ClaimsError naming the group id and the rule', async () => {
    const g = group(['a1', 'a4'])
    const promise = loadGroups(await dataDir(file(g)), RECORDS)
    await expect(promise).rejects.toMatchObject({ name: 'ClaimsError' })
    await expect(promise).rejects.toThrow(`${g.id}: agency "lupa" appears more than once`)
  })

  it('throws a ClaimsError naming the field when the schema does not match', async () => {
    const bad = { run: '2026-10-24', groups: [{ ...group(['a1', 'a2']), origin: 'guess' }] }
    const promise = loadGroups(await dataDir(bad), RECORDS)
    await expect(promise).rejects.toMatchObject({ name: 'ClaimsError' })
    await expect(promise).rejects.toThrow(/^claim-groups\.json: groups\.0\.origin: /)
  })
})
