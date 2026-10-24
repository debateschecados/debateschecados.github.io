import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  coverage,
  createComparison,
  emptyCompareState,
  pendingCount,
  readCompareState,
  rigor,
  visibleRows,
  writeCompareState,
} from '../../../site/compare.js'
import { createContext } from '../../../site/core.js'
import { groupId } from '../../../src/claims/groups.ts'
import { type Config, loadConfig } from '../../../src/config.ts'
import type { CheckRecord } from '../../../src/types.ts'
import {
  FIXTURE_PENDING,
  fixtureGroupId,
  fixtureGroups,
  fixtureRecords,
  recordId,
} from '../../fixtures/site.ts'

let config: Config
let records: CheckRecord[]
let ctx: ReturnType<typeof createContext>
let curated: string[]
beforeAll(async () => {
  config = await loadConfig(join(import.meta.dirname, '../../../config'))
  records = fixtureRecords()
  ctx = createContext({ ...config, records })
  const pending = new Set(FIXTURE_PENDING.map(recordId))
  curated = records.filter((r) => !r.missingSince && !pending.has(r.id)).map((r) => r.id)
})

const comparison = () => createComparison(ctx, fixtureGroups(), curated)
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)
const letters = (...ls: string[]) => ls.map(fixtureGroupId)
const state = (over = {}) => ({ ...emptyCompareState(), ...over })
const OUTLETS = ['aosfatos', 'estadao', 'g1', 'lupa']

// Per agency in alphabetical order: [n, of, solo] for coverage, [harsher, equal, milder] for rigor.
const coverageOf = (debate: string | null) =>
  Object.fromEntries(
    coverage(ctx, comparison(), debate).map((c) => [
      c.candidate.id,
      c.outlets.map((o) => [o.n, o.of, o.solo]),
    ]),
  )
const rigorOf = (debate: string | null) =>
  Object.fromEntries(
    rigor(ctx, comparison(), debate).map((c) => [
      c.candidate.id,
      c.outlets.map((o) => [o.harsher, o.equal, o.milder]),
    ]),
  )

describe('rows (CMP-04, CMP-05)', () => {
  it('orders rows by debate newest first, then the smallest page position, then id', () => {
    // Globo: G (pos 1), F (2), H (3), E (4). Band: A (1), I (2), B (3), C (4). D is hidden.
    expect(ids(comparison().rows)).toEqual(letters('G', 'F', 'H', 'E', 'A', 'I', 'B', 'C'))
  })

  it('puts one cell per agency in name order, empty where the agency has no record', () => {
    const rows = comparison().rows
    const cells = (letter: string) =>
      rows.find((r) => r.id === fixtureGroupId(letter))?.cells.map((c) => c?.id ?? null)
    expect(cells('A')).toEqual([14, 12, 8, 4].map(recordId))
    expect(cells('B')).toEqual([null, null, recordId(6), recordId(2)])
    const row = rows.find((r) => r.id === fixtureGroupId('E'))
    expect(row).toMatchObject({
      debate: 'globo-2026-10-23',
      speaker: 'lula',
      claim: 'Alegação de teste E, inventada para a suíte do site.',
    })
    expect(row?.cells.map((c) => c?.outlet ?? null)).toEqual(['aosfatos', null, 'g1', 'lupa'])
  })

  it('leaves removed records out of a row and hides a group left with fewer than two', () => {
    // D = Lupa 3 (removed) + g1 7. A copy of F gains g1 23, also removed.
    const f = [19, 23, 27].map(recordId)
    const { groups } = fixtureGroups()
    const old = groups.find((g) => g.id === fixtureGroupId('F'))
    const file = {
      groups: [
        ...groups.filter((g) => g !== old),
        { ...(old as (typeof groups)[number]), id: groupId(f), records: f },
      ],
    }
    const rows = createComparison(ctx, file, curated).rows
    expect(ids(rows)).not.toContain(fixtureGroupId('D'))
    expect(rows.find((r) => r.id === groupId(f))?.cells.map((c) => c?.id ?? null)).toEqual([
      null,
      recordId(27),
      null,
      recordId(19),
    ])
  })
})

describe('filters and URL (CMP-03)', () => {
  it('marks a row divergent only with two different bands among verdadeiro, impreciso, falso', () => {
    const divergent = comparison()
      .rows.filter((r) => r.divergent)
      .map((r) => r.id)
    // C has "sem faixa" twice and one verdadeiro: not a divergence.
    expect(divergent).toEqual(letters('G', 'A', 'I'))
  })

  it('keeps only rows matching every selected filter', () => {
    const rows = comparison().rows
    expect(ids(visibleRows(rows, state()))).toEqual(ids(rows))
    expect(ids(visibleRows(rows, state({ debate: 'globo-2026-10-23' })))).toEqual(
      letters('G', 'F', 'H', 'E'),
    )
    expect(ids(visibleRows(rows, state({ speaker: 'lula' })))).toEqual(letters('F', 'E', 'A', 'B'))
    expect(ids(visibleRows(rows, state({ div: true })))).toEqual(letters('G', 'A', 'I'))
    expect(
      ids(visibleRows(rows, state({ debate: 'band-2026-10-18', speaker: 'flavio', div: true }))),
    ).toEqual(letters('I'))
  })

  it('writes the filters to the URL and reads them back, ignoring unknown values', () => {
    const original = state({ debate: 'band-2026-10-18', speaker: 'flavio', div: true })
    const qs = writeCompareState(original)
    expect(Object.fromEntries(new URLSearchParams(qs))).toEqual({
      debate: 'band-2026-10-18',
      speaker: 'flavio',
      div: '1',
    })
    expect(readCompareState(qs, ctx)).toEqual(original)
    expect(writeCompareState(state())).toBe('')
    expect(readCompareState('?debate=nope&speaker=lula&div=yes', ctx)).toEqual(
      state({ speaker: 'lula' }),
    )
  })
})

describe('coverage (RIGOR-01, RIGOR-06)', () => {
  it('counts rows with the agency out of the candidate rows, and records in no row', () => {
    expect(ctx.outletIds).toEqual(OUTLETS)
    expect(coverageOf(null)).toEqual({
      lula: [
        [2, 4, 2],
        [2, 4, 2],
        [3, 4, 0],
        [4, 4, 0],
      ],
      flavio: [
        [2, 4, 0],
        [4, 4, 0],
        [3, 4, 1],
        [2, 4, 1],
      ],
    })
  })

  it('counts only the selected debate, from the rows the page lists for it', () => {
    expect(coverageOf('band-2026-10-18')).toEqual({
      lula: [
        [1, 2, 1],
        [1, 2, 1],
        [2, 2, 0],
        [2, 2, 0],
      ],
      flavio: [
        [1, 2, 0],
        [2, 2, 0],
        [1, 2, 1],
        [1, 2, 0],
      ],
    })
    expect(coverageOf('globo-2026-10-23')).toEqual({
      lula: [
        [1, 2, 1],
        [1, 2, 1],
        [1, 2, 0],
        [2, 2, 0],
      ],
      flavio: [
        [1, 2, 0],
        [2, 2, 0],
        [2, 2, 0],
        [1, 2, 1],
      ],
    })
    const rows = comparison().rows
    for (const c of coverage(ctx, comparison(), 'globo-2026-10-23')) {
      const listed = visibleRows(
        rows,
        state({ debate: 'globo-2026-10-23', speaker: c.candidate.id }),
      )
      expect(c.outlets.map((o) => o.of)).toEqual(Array(4).fill(listed.length))
    }
  })

  it('counts the record left alone by a hidden group as solo, never a removed one', () => {
    // g1 7 stays from D after Lupa 3 was removed; it is the only solo g1 record of Flávio.
    const g1 = coverage(ctx, comparison(), 'band-2026-10-18')[1].outlets[2]
    expect(g1).toEqual({ outlet: 'g1', n: 1, of: 2, solo: 1 })
    const lupa = coverage(ctx, comparison(), 'band-2026-10-18')[1].outlets[3]
    expect(lupa.solo).toBe(0)
  })
})

describe('rigor (RIGOR-02, RIGOR-06)', () => {
  it('counts harsher, equal and milder comparisons per agency and candidate', () => {
    expect(rigorOf(null)).toEqual({
      lula: [
        [3, 1, 0],
        [0, 3, 1],
        [0, 4, 1],
        [0, 4, 1],
      ],
      flavio: [
        [0, 2, 0],
        [1, 3, 1],
        [0, 3, 2],
        [2, 0, 0],
      ],
    })
    for (const c of rigor(ctx, comparison(), null)) {
      for (const o of c.outlets) expect(o.n).toBe(o.harsher + o.equal + o.milder)
    }
  })

  it('counts only the selected debate and skips "sem faixa" records', () => {
    expect(rigorOf('band-2026-10-18')).toEqual({
      lula: [
        [3, 0, 0],
        [0, 2, 1],
        [0, 3, 1],
        [0, 3, 1],
      ],
      // Row C (two "sem faixa" and Aos Fatos verdadeiro) counts no comparison.
      flavio: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 0, 1],
        [0, 0, 0],
      ],
    })
    expect(rigorOf('globo-2026-10-23')).toEqual({
      lula: [
        [0, 1, 0],
        [0, 1, 0],
        [0, 1, 0],
        [0, 1, 0],
      ],
      flavio: [
        [0, 2, 0],
        [0, 3, 1],
        [0, 3, 1],
        [2, 0, 0],
      ],
    })
  })

  it('orders bands verdadeiro < impreciso < falso', () => {
    const base = records[3] // Band, Lupa, Lula
    const recs = [
      { ...base, id: 'r1', outlet: 'aosfatos', band: 'falso' as const },
      { ...base, id: 'r2', outlet: 'estadao', band: 'impreciso' as const },
      { ...base, id: 'r3', outlet: 'g1', band: 'verdadeiro' as const },
    ]
    const local = createContext({ ...config, records: recs })
    const group = {
      id: groupId(['r1', 'r2', 'r3']),
      debate: base.debate,
      speaker: base.speaker,
      claim: 'x',
      records: ['r1', 'r2', 'r3'],
      origin: 'manual' as const,
    }
    const cmp = createComparison(local, { groups: [group] }, ['r1', 'r2', 'r3'])
    const lula = rigor(local, cmp, null)[0].outlets.map((o) => [o.harsher, o.equal, o.milder])
    expect(lula).toEqual([
      [2, 0, 0],
      [1, 0, 1],
      [0, 0, 2],
      [0, 0, 0],
    ])
  })
})

describe('pending records (CMP-06)', () => {
  it('counts live records missing from the curation input', () => {
    expect(pendingCount(ctx, comparison().curated)).toBe(2)
    // Without a curation run, every record still found at the source is pending.
    expect(pendingCount(ctx, new Set())).toBe(records.length - 2)
  })

  it('leaves pending records out of the solo count', () => {
    // Aos Fatos 15 (Band, Flávio) is pending; its only other Band record for Flávio is in C.
    expect(coverage(ctx, comparison(), 'band-2026-10-18')[1].outlets[0].solo).toBe(0)
    const all = createComparison(ctx, fixtureGroups(), [
      ...curated,
      ...FIXTURE_PENDING.map(recordId),
    ])
    expect(coverage(ctx, all, 'band-2026-10-18')[1].outlets[0].solo).toBe(1)
  })
})
