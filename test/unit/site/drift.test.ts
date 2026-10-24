import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createContext } from '../../../site/core.js'
import {
  changed,
  direction,
  driftCounts,
  previousBand,
  versions,
  wordDiff,
} from '../../../site/drift.js'
import { type Config, loadConfig } from '../../../src/config.ts'
import { bandFor } from '../../../src/pipeline/normalize.ts'
import type { CheckRecord } from '../../../src/types.ts'
import { fixtureRecords } from '../../fixtures/site.ts'

let config: Config
beforeAll(async () => {
  config = await loadConfig(join(import.meta.dirname, '../../../config'))
})

const base = () => fixtureRecords()[4] // g1, Band, Flávio, "#FATO"
const record = (over: Partial<CheckRecord>): CheckRecord => ({ ...base(), history: [], ...over })
const ctxOf = (records: CheckRecord[]) => createContext({ ...config, records })

describe('band of an old label', () => {
  it('maps every label of config/bands.json, written any way, as the ingest does', () => {
    const ctx = ctxOf([])
    for (const [outlet, entries] of Object.entries(config.bands)) {
      for (const { label } of entries) {
        for (const written of [label, label.toUpperCase(), ` ${label.toLowerCase()}!`])
          expect(ctx.bandOf(outlet, written)).toBe(bandFor(config.bands, outlet, written))
      }
    }
    expect(ctx.bandOf('g1', '#NOVO')).toBe('sem faixa')
  })
})

describe('versions (DRIFT-03)', () => {
  it('gives one current version when nothing changed', () => {
    const r = record({ history: undefined })
    expect(versions(ctxOf([r]), r)).toEqual([
      { label: '#FATO', band: 'verdadeiro', quote: r.quote, key: null, since: null, until: null },
    ])
  })

  it('rebuilds the old label, its band today and the old key from one entry', () => {
    const r = record({
      label: '#FAKE',
      band: 'falso',
      key: 'k2',
      history: [{ label: '#NÃOÉBEMASSIM', key: 'k1', until: '2026-10-24' }],
    })
    expect(versions(ctxOf([r]), r)).toEqual([
      {
        label: '#NÃOÉBEMASSIM',
        band: 'impreciso',
        quote: r.quote,
        key: 'k1',
        since: null,
        until: '2026-10-24',
      },
      {
        label: '#FAKE',
        band: 'falso',
        quote: r.quote,
        key: 'k2',
        since: '2026-10-24',
        until: null,
      },
    ])
  })

  it('keeps a missing old key as null', () => {
    const r = record({ key: 'k1', history: [{ key: null, until: '2026-10-24' }] })
    expect(versions(ctxOf([r]), r).map((v) => v.key)).toEqual([null, 'k1'])
  })

  it('keeps the label of a quote-only entry, from two entries', () => {
    const r = record({
      label: '#FAKE',
      band: 'falso',
      quote: 'O desemprego caiu para 5% em 2026',
      history: [
        { label: '#FATO', until: '2026-10-24' },
        { quote: 'O desemprego caiu para 6% em 2025', until: '2026-10-25' },
      ],
    })
    expect(versions(ctxOf([r]), r)).toEqual([
      {
        label: '#FATO',
        band: 'verdadeiro',
        quote: 'O desemprego caiu para 6% em 2025',
        key: null,
        since: null,
        until: '2026-10-24',
      },
      {
        label: '#FAKE',
        band: 'falso',
        quote: 'O desemprego caiu para 6% em 2025',
        key: null,
        since: '2026-10-24',
        until: '2026-10-25',
      },
      {
        label: '#FAKE',
        band: 'falso',
        quote: 'O desemprego caiu para 5% em 2026',
        key: null,
        since: '2026-10-25',
        until: null,
      },
    ])
  })
})

describe('wordDiff (DRIFT-03)', () => {
  it('shows the words removed and added between two quotes', () => {
    expect(
      wordDiff(
        'que seu governo herdou taxa de juros em 13%.',
        'que seu governo herdou taxa de juros de 13%.',
      ),
    ).toEqual([
      { op: '=', text: 'que seu governo herdou taxa de juros' },
      { op: '-', text: 'em' },
      { op: '+', text: 'de' },
      { op: '=', text: '13%.' },
    ])
    expect(wordDiff('a b c', 'x a c d')).toEqual([
      { op: '+', text: 'x' },
      { op: '=', text: 'a' },
      { op: '-', text: 'b' },
      { op: '=', text: 'c' },
      { op: '+', text: 'd' },
    ])
  })
})

describe('changed records and counts (DRIFT-03, DRIFT-04)', () => {
  const OUTLETS = ['aosfatos', 'estadao', 'g1', 'lupa']
  // [harsher, milder, gained, lost] per agency, in name order.
  const counts = (records: CheckRecord[], debate: string | null) =>
    Object.fromEntries(
      driftCounts(ctxOf(records), debate).map((c) => [
        c.candidate.id,
        c.outlets.map((o) => [o.harsher, o.milder, o.gained, o.lost]),
      ]),
    )
  const all = fixtureRecords()
  const at = (n: number, over: Partial<CheckRecord>) => ({ ...all[n - 1], ...over })
  // Band debate: Lupa 2 (Lula) "FALSO" was "VERDADEIRO", then "INSUSTENTÁVEL": it lost its
  // band, then gained one. g1 5 (Flávio) "#FATO" was "#FAKE": milder. Globo: Estadão 27 (Lula)
  // "é falso" was "é enganoso": harsher; Aos Fatos 31 (Lula) has a quote edit only; g1 23
  // (Lula, removed) gained a band but no longer counts. g1 8 changed only its speaker.
  const records = [
    at(2, {
      history: [
        { label: 'VERDADEIRO', until: '2026-10-24' },
        { label: 'INSUSTENTÁVEL', until: '2026-10-25' },
      ],
    }),
    at(5, { history: [{ label: '#FAKE', until: '2026-10-25' }] }),
    at(27, {
      label: 'é falso',
      band: 'falso',
      history: [{ label: 'é enganoso', until: '2026-10-25' }],
    }),
    at(31, { history: [{ quote: 'Fala antiga.', until: '2026-10-25' }] }),
    at(23, { history: [{ label: 'VERDADEIRO', until: '2026-10-25' }] }),
    at(8, { history: [{ speaker: 'lula', until: '2026-10-25' }] }),
    at(9, {}),
  ]

  it('lists live records with a label, quote or key change, newest debate first', () => {
    expect(
      records.map((r) => [r.id, r.debate, r.speaker, r.outlet, r.band, r.missingSince]),
    ).toEqual([
      ['000000000002', 'band-2026-10-18', 'lula', 'lupa', 'falso', undefined],
      ['000000000005', 'band-2026-10-18', 'flavio', 'g1', 'verdadeiro', undefined],
      ['00000000001b', 'globo-2026-10-23', 'lula', 'estadao', 'falso', undefined],
      ['00000000001f', 'globo-2026-10-23', 'lula', 'aosfatos', 'impreciso', undefined],
      ['000000000017', 'globo-2026-10-23', 'lula', 'g1', 'impreciso', '2026-10-26'],
      ['000000000008', 'band-2026-10-18', 'lula', 'g1', 'verdadeiro', undefined],
      ['000000000009', 'band-2026-10-18', 'flavio', 'estadao', 'sem faixa', undefined],
    ])
    const ids = (debate: string | null) => changed(ctxOf(records), debate).map((r) => r.id)
    expect(ids(null)).toEqual(['00000000001f', '00000000001b', '000000000005', '000000000002'])
    expect(ids('band-2026-10-18')).toEqual(['000000000005', '000000000002'])
  })

  it('counts band changes per agency and candidate, with and without a debate filter', () => {
    const zero = [0, 0, 0, 0]
    expect(OUTLETS).toEqual(ctxOf([]).outletIds)
    expect(counts(records, null)).toEqual({
      lula: [zero, [1, 0, 0, 0], zero, [0, 0, 1, 1]],
      flavio: [zero, zero, [0, 1, 0, 0], zero],
    })
    expect(counts(records, 'band-2026-10-18')).toEqual({
      lula: [zero, zero, zero, [0, 0, 1, 1]],
      flavio: [zero, zero, [0, 1, 0, 0], zero],
    })
    expect(counts(records, 'globo-2026-10-23')).toEqual({
      lula: [zero, [1, 0, 0, 0], zero, zero],
      flavio: [zero, zero, zero, zero],
    })
  })

  it('names the direction of each band change in the order verdadeiro < impreciso < falso', () => {
    expect(direction('verdadeiro', 'falso')).toBe('harsher')
    expect(direction('impreciso', 'falso')).toBe('harsher')
    expect(direction('falso', 'impreciso')).toBe('milder')
    expect(direction('sem faixa', 'verdadeiro')).toBe('gained')
    expect(direction('falso', 'sem faixa')).toBe('lost')
    expect(direction('falso', 'falso')).toBeNull()
  })
})

describe('previous band (DRIFT-05)', () => {
  it('gives the band before the latest band change, or null when the band never changed', () => {
    const ctx = ctxOf([])
    const twice = record({
      label: '#FAKE',
      band: 'falso',
      history: [
        { label: '#FATO', until: '2026-10-24' },
        { label: '#NÃOÉBEMASSIM', until: '2026-10-25' },
      ],
    })
    expect(previousBand(ctx, twice)).toBe('impreciso')
    const quoteOnly = record({ history: [{ quote: 'Outra fala.', until: '2026-10-25' }] })
    expect(previousBand(ctx, quoteOnly)).toBeNull()
    const sameBand = record({ history: [{ label: '#Fato', until: '2026-10-25' }] })
    expect(previousBand(ctx, sameBand)).toBeNull()
  })
})
