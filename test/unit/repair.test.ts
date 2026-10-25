import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assemble } from '../../src/claims/assemble.ts'
import { checkGroups } from '../../src/claims/groups.ts'
import { loadConfig } from '../../src/config.ts'
import { checksJson } from '../../src/pipeline/write.ts'
import { RepairError, repair, SOURCE } from '../../src/repair/estadao-2026-10-24.ts'
import type { CheckRecord } from '../../src/types.ts'

const ROOT = join(import.meta.dirname, '../..')
// data/checks.json of e13bac2 (before the run) and the source's records of bc3a25d (after it).
const BEFORE = join(ROOT, 'test/fixtures/claim-records-2026-10-24.json')
const AFTER = join(ROOT, 'test/fixtures/estadao-globo-after-2026-10-24.json')
const HUNGER = 'que o Brasil acabou com a fome em 2012'

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as CheckRecord[]

async function pinned() {
  const before = await read(BEFORE)
  const after = await read(AFTER)
  // Other sources as they stood before the run, the source as the run wrote it.
  const current = [...before.filter((r) => r.sourceId !== SOURCE), ...after]
  const config = await loadConfig(join(ROOT, 'config'))
  return { before, after, current, config }
}

describe('repair of the 2026-10-24 Estadão run (DRIFT-02)', () => {
  it('rebuilds every record published before the run and lists the merged ids', async () => {
    const { before, after, current, config } = await pinned()
    const { records, report } = repair(before, after, current, config)
    const own = records.filter((r) => r.sourceId === SOURCE)
    const ids = new Set(own.map((r) => r.id))

    expect(before.filter((r) => r.sourceId === SOURCE).every((r) => ids.has(r.id))).toBe(true)
    expect(own.filter((r) => r.missingSince !== undefined)).toEqual([])
    expect(own).toHaveLength(after.filter((r) => r.missingSince === undefined).length)

    const hunger = own.find((r) => r.id === 'd5bca87d832d')
    expect(hunger?.speaker).toBe('lula')
    expect(hunger?.quote.startsWith(HUNGER)).toBe(true)

    // The run gave new ids to the 19 records it marked missing and moved d5bca87d832d.
    const lost = after.filter((r) => r.missingSince !== undefined).map((r) => r.id)
    expect(lost).toHaveLength(19)
    expect(report.merged.map((m) => m.into).sort()).toEqual([...lost, 'd5bca87d832d'].sort())
    expect(report.merged).toContainEqual({ from: '6952385310a6', into: 'd5bca87d832d' })
    // Ids the run invented are gone; d5bca87d832d is back on the check it always named.
    const into = new Set(report.merged.map((m) => m.into))
    for (const { from } of report.merged) expect(ids.has(from)).toBe(into.has(from))
    expect(report).toMatchObject({ source: SOURCE, before: 'e13bac2', after: 'bc3a25d' })
    expect(report.missing).toEqual([])
    // New: live checks the run published for the first time, neither before it nor merged away.
    const known = new Set([...before.map((r) => r.id), ...report.merged.map((m) => m.from)])
    const fresh = after
      .filter((r) => r.missingSince === undefined && !known.has(r.id))
      .map((r) => r.id)
    expect(fresh).toHaveLength(7)
    expect([...report.new].sort()).toEqual(fresh.sort())
  })

  it('keeps the label, quote and key changes in history and never moves a speaker', async () => {
    const { before, after, current, config } = await pinned()
    const own = repair(before, after, current, config).records.filter((r) => r.sourceId === SOURCE)
    const changed = (field: 'label' | 'quote' | 'speaker') =>
      own.filter((r) => r.history?.some((h) => field in h)).map((r) => r.id)

    expect(changed('label').sort()).toEqual(['26eca3528f77', '5f7a88d195d1', '97dd907ad475'])
    expect(changed('quote').sort()).toEqual(['30c683088488', '383bd641adab'])
    expect(changed('speaker')).toEqual([])
    const old = new Map(before.map((r) => [r.id, r]))
    for (const record of own.filter((r) => r.history)) {
      const [entry] = record.history ?? []
      const was = old.get(record.id)
      if (was?.key !== record.key) expect(entry.key).toBe(was?.key)
      else expect(entry).not.toHaveProperty('key')
    }
  })

  it('leaves every other source byte-identical', async () => {
    const { before, after, current, config } = await pinned()
    const { records } = repair(before, after, current, config)
    const others = (list: CheckRecord[]) => checksJson(list.filter((r) => r.sourceId !== SOURCE))
    expect(others(records)).toBe(others(current))
  })

  it('gives records the 2026-10-24 claim groups accept (CLAIM-02)', async () => {
    const { before, after, current, config } = await pinned()
    const { records } = repair(before, after, current, config)
    const { file } = await assemble(join(ROOT, 'data/claim-curation/2026-10-24'))
    expect(checkGroups(file, records)).toEqual([])
    expect(checkGroups(file, current)).not.toEqual([])
  })

  it('says the repair is already applied on a second run, and changes nothing', async () => {
    const { before, after, current, config } = await pinned()
    const first = repair(before, after, current, config)
    expect(first.applied).toBe(false)
    const second = repair(before, after, first.records, config)
    expect(second.applied).toBe(true)
    expect(checksJson(second.records)).toBe(checksJson(first.records))
    // Any other edit of the repaired source is still refused.
    const edited = first.records.map((r) =>
      r.id === 'd5bca87d832d' ? { ...r, label: 'é verdadeiro' } : r,
    )
    expect(() => repair(before, after, edited, config)).toThrow(`${SOURCE} changed since`)
  })

  it('refuses when the source changed since the run', async () => {
    const { before, after, current, config } = await pinned()
    const edited = current.map((r) => (r.id === after[0].id ? { ...r, label: 'é falso' } : r))
    expect(() => repair(before, after, edited, config)).toThrow(RepairError)
    expect(() => repair(before, after, edited, config)).toThrow(`${SOURCE} changed since`)
  })
})
