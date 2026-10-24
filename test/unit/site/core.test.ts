import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createContext,
  emptyState,
  listed,
  NOTICE,
  notice,
  optionCount,
  options,
  readState,
  removedCount,
  scoreboard,
  writeState,
} from '../../../site/core.js'
import { type Config, loadConfig } from '../../../src/config.ts'
import type { CheckRecord } from '../../../src/types.ts'
import { fixtureRecords } from '../../fixtures/site.ts'

let config: Config
let records: CheckRecord[]
beforeAll(async () => {
  config = await loadConfig(join(import.meta.dirname, '../../../config'))
  records = fixtureRecords()
})

const context = (recs = records, over: Partial<Config> = {}) =>
  createContext({ ...config, ...over, records: recs })
const state = (over = {}) => ({ ...emptyState(), ...over })
const ids = (items: CheckRecord[]) => items.map((r) => r.id)
const found = (recs: CheckRecord[]) => recs.filter((r) => !r.missingSince)

describe('filters (SITE-03)', () => {
  it('each filter alone keeps only matching records', () => {
    const ctx = context()
    const cases = [
      ['debate', 'globo-2026-10-23'],
      ['outlet', 'lupa'],
      ['speaker', 'lula'],
      ['band', 'sem faixa'],
    ] as const
    for (const [key, value] of cases) {
      const items = listed(ctx, state({ [key]: value }))
      const expected = found(records).filter((r) => r[key] === value)
      expect(items.length).toBeGreaterThan(0)
      expect(new Set(ids(items))).toEqual(new Set(ids(expected)))
    }
  })

  it('combined filters keep only records matching all of them', () => {
    const ctx = context()
    const items = listed(ctx, state({ debate: 'band-2026-10-18', outlet: 'g1', speaker: 'lula' }))
    const expected = found(records).filter(
      (r) => r.debate === 'band-2026-10-18' && r.outlet === 'g1' && r.speaker === 'lula',
    )
    expect(new Set(ids(items))).toEqual(new Set(ids(expected)))
    expect(items).toHaveLength(2)
  })

  it('option counts apply every other filter', () => {
    const ctx = context()
    const s = state({ outlet: 'lupa', speaker: 'flavio' })
    // Counting outlets ignores the outlet filter itself.
    expect(optionCount(ctx, s, 'outlet', 'g1')).toBe(
      found(records).filter((r) => r.outlet === 'g1' && r.speaker === 'flavio').length,
    )
    expect(optionCount(ctx, s, 'band', 'sem faixa')).toBe(
      found(records).filter(
        (r) => r.outlet === 'lupa' && r.speaker === 'flavio' && r.band === 'sem faixa',
      ).length,
    )
  })
})

describe('ordering (SITE-04)', () => {
  it('sorts by debate newest first, outlet name, then position on the page', () => {
    const items = listed(context(), state())
    const outletOrder = ['aosfatos', 'estadao', 'g1', 'lupa']
    const key = (r: CheckRecord) => [
      r.debate === 'globo-2026-10-23' ? 0 : 1,
      outletOrder.indexOf(r.outlet),
      r.pos,
    ]
    const expected = [...items].sort((a, b) => {
      const [x, y] = [key(a), key(b)]
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
    })
    expect(ids(items)).toEqual(ids(expected))
    expect(items[0]).toMatchObject({ debate: 'globo-2026-10-23', outlet: 'aosfatos', pos: 1 })
  })

  it('orders outlet names with the pt-BR collator, not by code point', () => {
    const outlets = {
      z: { name: 'zeta', type: 'fact-checker', url: 'https://z.test' },
      e: { name: 'Écran', type: 'fact-checker', url: 'https://e.test' },
      f: { name: 'Fato', type: 'fact-checker', url: 'https://f.test' },
    }
    const recs = ['z', 'f', 'e'].map((outlet, i) => ({ ...records[0], id: `r${i}`, outlet }))
    const ctx = context(recs, { outlets })
    expect(listed(ctx, state()).map((r) => r.outlet)).toEqual(['e', 'f', 'z'])
    expect(ctx.outletIds).toEqual(['e', 'f', 'z'])
  })
})

describe('scoreboard', () => {
  it('per-agency board counts only that agency per candidate and band (SCORE-01)', () => {
    const ctx = context()
    const s = state({ outlet: 'estadao' })
    const board = scoreboard(ctx, listed(ctx, s))
    for (const row of board) {
      for (const band of row.bands) {
        const n = found(records).filter(
          (r) => r.outlet === 'estadao' && r.speaker === row.candidate.id && r.band === band.id,
        ).length
        expect(band.n).toBe(n)
      }
    }
    expect(board.map((r) => r.total)).toEqual([4, 4])
  })

  it('general board sums all agencies per candidate and band (SCORE-02)', () => {
    const ctx = context()
    const board = scoreboard(ctx, listed(ctx, state()))
    const lula = found(records).filter((r) => r.speaker === 'lula')
    expect(board[0].total).toBe(lula.length)
    expect(board[0].bands.find((b) => b.id === 'falso')?.n).toBe(
      lula.filter((r) => r.band === 'falso').length,
    )
    expect(new Set(lula.map((r) => r.outlet)).size).toBe(4)
  })

  it('shows the double-counting notice only on the general board (SCORE-03)', () => {
    const ctx = context()
    expect(notice(ctx, state())).toBe(
      'Cada agência escolhe o que checar. A mesma fala pode aparecer uma vez por agência, então este placar soma checagens, não falas.',
    )
    expect(NOTICE).toBe(notice(ctx, state({ debate: 'band-2026-10-18' })))
    expect(notice(ctx, state({ outlet: 'lupa' }))).toBe('Placar só com as checagens da Lupa.')
  })

  it('total equals the listed records still found, for random filter combos (SCORE-04)', () => {
    const ctx = context()
    let seed = 7
    const pick = <T>(xs: readonly T[]) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return xs[seed % xs.length]
    }
    for (let i = 0; i < 200; i++) {
      const s = state({
        debate: pick([null, ...options(ctx, 'debate')]),
        outlet: pick([null, ...options(ctx, 'outlet')]),
        speaker: pick([null, ...options(ctx, 'speaker')]),
        band: pick([null, ...options(ctx, 'band')]),
        removed: pick([false, true]),
      })
      const items = listed(ctx, s)
      const total = scoreboard(ctx, items).reduce((sum, row) => sum + row.total, 0)
      const bandSum = scoreboard(ctx, items)
        .flatMap((row) => row.bands)
        .reduce((sum, b) => sum + b.n, 0)
      expect(total).toBe(found(items).length)
      expect(bandSum).toBe(total)
    }
  })

  it('lists candidates by ballot number with all four bands, zero included (SCORE-05)', () => {
    const reversed = [...config.candidates].reverse()
    const ctx = context(records, { candidates: reversed })
    const board = scoreboard(ctx, listed(ctx, state({ outlet: 'g1' })))
    expect(board.map((r) => [r.candidate.id, r.candidate.number])).toEqual([
      ['lula', 13],
      ['flavio', 22],
    ])
    for (const row of board) {
      expect(row.bands.map((b) => b.id)).toEqual(['verdadeiro', 'impreciso', 'falso', 'sem faixa'])
      expect(row.bands[3].n).toBe(0)
    }
  })
})

describe('removed records (HIST-02)', () => {
  it('hides them from the list unless the toggle is on', () => {
    const ctx = context()
    const removed = records.filter((r) => r.missingSince).map((r) => r.id)
    expect(removed).toHaveLength(2)
    expect(ids(listed(ctx, state()))).not.toContain(removed[0])
    expect(listed(ctx, state())).toHaveLength(records.length - 2)
    const shown = ids(listed(ctx, state({ removed: true })))
    expect(shown).toEqual(expect.arrayContaining(removed))
    expect(shown).toHaveLength(records.length)
  })

  it('leaves them out of every scoreboard, even when shown', () => {
    const ctx = context()
    const off = scoreboard(ctx, listed(ctx, state()))
    const on = scoreboard(ctx, listed(ctx, state({ removed: true })))
    expect(on).toEqual(off)
    expect(off.reduce((s, r) => s + r.total, 0)).toBe(records.length - 2)
  })

  it('counts removed records under the current filters', () => {
    const ctx = context()
    expect(removedCount(ctx, state())).toBe(2)
    expect(removedCount(ctx, state({ debate: 'globo-2026-10-23' }))).toBe(1)
    expect(removedCount(ctx, state({ outlet: 'aosfatos' }))).toBe(0)
  })
})

describe('URL state', () => {
  it('writes every active filter and the toggle to the query (SHARE-01)', () => {
    const qs = writeState(
      state({ debate: 'band-2026-10-18', outlet: 'lupa', speaker: 'flavio', band: 'sem faixa' }),
    )
    const params = new URLSearchParams(qs)
    expect(Object.fromEntries(params)).toEqual({
      debate: 'band-2026-10-18',
      outlet: 'lupa',
      speaker: 'flavio',
      band: 'sem faixa',
    })
    expect(writeState(state({ removed: true }))).toBe('?removed=1')
    expect(writeState(state())).toBe('')
  })

  it('reads a shared URL back into the same view (SHARE-02)', () => {
    const ctx = context()
    const original = state({ debate: 'globo-2026-10-23', band: 'falso', removed: true })
    const restored = readState(writeState(original), ctx)
    expect(restored).toEqual(original)
    expect(ids(listed(ctx, restored))).toEqual(ids(listed(ctx, original)))
  })

  it('ignores unknown values in a shared URL', () => {
    const ctx = context()
    expect(readState('?outlet=nope&speaker=lula&removed=yes', ctx)).toEqual(
      state({ speaker: 'lula' }),
    )
  })
})
