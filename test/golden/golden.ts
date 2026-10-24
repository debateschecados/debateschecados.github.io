import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { registry } from '../../src/adapters/index.ts'
import { type Config, loadConfig } from '../../src/config.ts'
import { mappedBand, resolveSpeaker } from '../../src/pipeline/normalize.ts'
import type { ParsedItem, ParseNote } from '../../src/types.ts'
import { loadFixture } from './fixtures.ts'

export interface Expected {
  items: number
  quotes?: number // distinct quotes, when a quote can carry several verdicts
  labels: Record<string, number>
  unrated?: number
  // Whole items checked by hand against the page; must include the first and the last.
  pinned: ParsedItem[]
}

const countBy = (values: string[]) => {
  const counts: Record<string, number> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return counts
}

// Golden checks for real pages of one outlet: counts and labels from the design table, unique
// keys, hand-checked items, every item resolvable, and two parses byte-identical (INGEST-03, DATA-04).
export function describeGolden(outlet: string, expected: Record<string, Expected>) {
  let config: Config
  beforeAll(async () => {
    config = await loadConfig(join(import.meta.dirname, '../../config'), registry)
  })

  const source = (id: string) => {
    const found = config.debates.flatMap((d) => d.sources).find((s) => s.id === id)
    if (!found) throw new Error(`source ${id} not in config/debates.json`)
    const adapter = registry.get(found.adapter)
    if (!adapter) throw new Error(`no adapter ${found.adapter}`)
    return { config: found, adapter }
  }

  describe.each(Object.entries(expected))(`${outlet} %s`, (id, want) => {
    it('matches the item count and label distribution', () => {
      const { config: sourceConfig, adapter } = source(id)
      expect(sourceConfig.outlet).toBe(outlet)
      const notes: ParseNote[] = []
      const items = adapter.parse(loadFixture(id), notes)
      expect(items).toHaveLength(want.items)
      expect(countBy(items.map((i) => i.label))).toEqual(want.labels)
      if (want.quotes !== undefined)
        expect(new Set(items.map((i) => i.quote)).size).toBe(want.quotes)
      expect(items.map((i) => i.pos)).toEqual(items.map((_, n) => n + 1))
      expect(notes.filter((n) => n.kind !== 'unrated')).toEqual([])
      expect(notes.filter((n) => n.kind === 'unrated')).toHaveLength(want.unrated ?? 0)
    })

    it('gives every keyed item a unique key', () => {
      const { adapter } = source(id)
      const keys = adapter.parse(loadFixture(id)).flatMap((i) => (i.key === null ? [] : [i.key]))
      expect(new Set(keys).size).toBe(keys.length)
    })

    it('reads the pinned items field by field', () => {
      const { adapter } = source(id)
      const items = adapter.parse(loadFixture(id))
      expect(want.pinned.map((p) => p.pos)).toEqual(expect.arrayContaining([1, want.items]))
      for (const pinned of want.pinned) expect(items[pinned.pos - 1]).toEqual(pinned)
    })

    it('resolves every speaker to a candidate and every label to a band', () => {
      const { adapter } = source(id)
      const items = adapter.parse(loadFixture(id))
      const debate = config.debates.find((d) => d.sources.some((s) => s.id === id))
      const candidates = config.candidates.filter((c) => debate?.candidates.includes(c.id))
      const unresolved = items.filter((i) => resolveSpeaker(i.speakerRaw, candidates) === null)
      const unmapped = items.filter((i) => mappedBand(config.bands, outlet, i.label) === null)
      expect(unresolved.map((i) => i.speakerRaw)).toEqual([])
      expect(unmapped.map((i) => i.label)).toEqual([])
    })

    it('gives byte-identical items when the same docs are parsed twice', () => {
      const { adapter } = source(id)
      const first = JSON.stringify(adapter.parse(loadFixture(id)))
      expect(JSON.stringify(adapter.parse(loadFixture(id)))).toBe(first)
    })
  })
}
