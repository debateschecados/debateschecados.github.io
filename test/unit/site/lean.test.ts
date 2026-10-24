import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createComparison } from '../../../site/compare.js'
import { createContext } from '../../../site/core.js'
import {
  B,
  deviations,
  headline,
  interval,
  lean,
  MIN_N,
  sentence,
  signed,
} from '../../../site/lean.js'
import { type Config, loadConfig } from '../../../src/config.ts'
import { writeData } from '../../../src/pipeline/write.ts'
import type { Band } from '../../../src/types.ts'
import { LEAN_CLAIMS, leanFixture } from '../../fixtures/lean.ts'
import { fixtureReport } from '../../fixtures/site.ts'

const ROOT = join(import.meta.dirname, '../../..')
const OUTLETS = ['aosfatos', 'estadao', 'g1', 'lupa']

let config: Config
let ctx: ReturnType<typeof createContext>
beforeAll(async () => {
  config = await loadConfig(join(ROOT, 'config'))
  ctx = createContext({ ...config, records: [] })
})

// A row whose cells follow the agency order; null is "não checou".
let next = 0
const row = (speaker: string, bands: (Band | null)[]) => ({
  id: `row${next++}`,
  debate: 'globo-2026-10-23',
  speaker,
  claim: 'x',
  divergent: false,
  pos: next,
  cells: bands.map((band, i) => (band ? { id: `r${next}-${i}`, outlet: OUTLETS[i], band } : null)),
})
type Row = ReturnType<typeof row>
const rows = (n: number, speaker: string, bands: (Band | null)[]) =>
  Array.from({ length: n }, () => row(speaker, bands))
const run = (list: Row[]) => lean(ctx, list as never)
const byOutlet = (list: Row[]) => Object.fromEntries(run(list).map((r) => [r.outlet, r]))

describe('deviations (LEAN-01)', () => {
  it('gives each banded member its score minus the mean score of the other banded members', () => {
    // Scores: falso 2, verdadeiro 0, impreciso 1. Aos Fatos: 2 - (0 + 1) / 2 = 1.5.
    const values = deviations([row('lula', ['falso', 'verdadeiro', 'impreciso', null])] as never)
    expect(values).toEqual([
      { outlet: 'aosfatos', speaker: 'lula', value: 1.5 },
      { outlet: 'estadao', speaker: 'lula', value: -1.5 },
      { outlet: 'g1', speaker: 'lula', value: 0 },
    ])
  })

  it('leaves "sem faixa" out and counts nothing when one banded record remains', () => {
    expect(
      deviations([
        row('flavio', ['sem faixa', 'falso', null, 'sem faixa']),
        row('flavio', ['sem faixa', 'falso', 'verdadeiro', null]),
      ] as never),
    ).toEqual([
      { outlet: 'estadao', speaker: 'flavio', value: 2 },
      { outlet: 'g1', speaker: 'flavio', value: -2 },
    ])
  })
})

describe('lean (LEAN-01, LEAN-02)', () => {
  it('shows n and the mean deviation per candidate and the distance Flávio minus Lula', () => {
    const list = [
      ...rows(MIN_N, 'lula', ['verdadeiro', 'impreciso', null, null]),
      ...rows(MIN_N, 'flavio', ['falso', 'impreciso', null, null]),
      row('flavio', ['verdadeiro', 'impreciso', null, null]),
    ]
    const r = byOutlet(list)
    // Aos Fatos: Lula 10 × (0 - 1) = -1; Flávio (10 × 1 + 1 × -1) / 11 = 9/11.
    expect(r.aosfatos.candidates).toEqual([
      { id: 'lula', n: 10, mean: -1 },
      { id: 'flavio', n: 11, mean: 9 / 11 },
    ])
    expect(r.aosfatos.distance).toBeCloseTo(9 / 11 + 1, 12)
    expect(r.estadao.distance).toBeCloseTo(-9 / 11 - 1, 12)
    expect(r.g1).toMatchObject({
      candidates: [
        { n: 0, mean: null },
        { n: 0, mean: null },
      ],
    })
    expect(r.g1.distance).toBeNull()
  })

  it('draws the 90% interval with the fixed generator, the same on every call', () => {
    const c1 = [-1, 0.5, -0.5, 1, 0, -2, 1.5, 0.25, -0.75, 2, 0.5]
    const c2 = [1, -0.5, 0.5, 2, -1, 0, 1.5, -0.25, 0.75, 1, -1.5, 0.5]
    // The generator of the design, written out again: LCG from 42, u = s / 2^32.
    let s = 42
    const pick = (xs: number[]) => {
      s = (s * 1664525 + 1013904223) % 2 ** 32
      return xs[Math.floor((s / 2 ** 32) * xs.length)]
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const stats: number[] = []
    for (let b = 0; b < 5000; b++) {
      const m2 = avg(c2.map(() => pick(c2)))
      stats.push(m2 - avg(c1.map(() => pick(c1))))
    }
    stats.sort((a, b) => a - b)
    expect(B).toBe(5000)
    expect(interval(c1, c2)).toEqual([stats[250], stats[4749]])
    expect(interval(c1, c2)).toEqual(interval(c1, c2))
  })
})

describe('sentence rule (LEAN-03, LEAN-04)', () => {
  it('says "mais dura com Flávio Bolsonaro" when the interval is entirely above 0', () => {
    const r = byOutlet([
      ...rows(MIN_N, 'lula', ['verdadeiro', 'falso', null, null]),
      ...rows(MIN_N, 'flavio', ['falso', 'verdadeiro', null, null]),
    ])
    expect(r.aosfatos.interval?.[0]).toBeGreaterThan(0)
    expect(r.aosfatos.verdict).toBe('c2')
    expect(sentence(r.aosfatos.verdict, ctx)).toBe(
      'mais dura com Flávio Bolsonaro do que as outras agências',
    )
    expect(r.estadao.interval?.[1]).toBeLessThan(0)
    expect(sentence(r.estadao.verdict, ctx)).toBe('mais dura com Lula do que as outras agências')
  })

  it('says "sem diferença clara" when the interval contains 0', () => {
    const swing = (speaker: string) =>
      Array.from({ length: MIN_N }, (_, i) =>
        row(
          speaker,
          i % 2 ? ['falso', 'verdadeiro', null, null] : ['verdadeiro', 'falso', null, null],
        ),
      )
    const r = byOutlet([...swing('lula'), ...swing('flavio')])
    const [lo, hi] = r.aosfatos.interval ?? [Number.NaN, Number.NaN]
    expect(lo).toBeLessThanOrEqual(0)
    expect(hi).toBeGreaterThanOrEqual(0)
    expect(sentence(r.aosfatos.verdict, ctx)).toBe('sem diferença clara entre os candidatos')
  })

  it('counts an interval that starts or ends exactly at 0 as containing 0', () => {
    // Flávio: 19 deviations of 0 and one of 2, so most resamples have a mean of exactly 0.
    const r = byOutlet([
      ...rows(MIN_N, 'lula', ['verdadeiro', 'verdadeiro', null, null]),
      ...rows(19, 'flavio', ['verdadeiro', 'verdadeiro', null, null]),
      row('flavio', ['falso', 'verdadeiro', null, null]),
    ])
    expect(r.aosfatos.interval?.[0]).toBe(0)
    expect(r.aosfatos.interval?.[1]).toBeGreaterThan(0)
    expect(r.aosfatos.verdict).toBe('none')
    // The mirror case: the same data on Lula's side ends the interval exactly at 0.
    const m = byOutlet([
      ...rows(19, 'lula', ['verdadeiro', 'verdadeiro', null, null]),
      row('lula', ['falso', 'verdadeiro', null, null]),
      ...rows(MIN_N, 'flavio', ['verdadeiro', 'verdadeiro', null, null]),
    ])
    expect(m.aosfatos.interval?.[0]).toBeLessThan(0)
    expect(m.aosfatos.interval?.[1]).toBe(0)
    expect(m.aosfatos.verdict).toBe('none')
  })

  it('shows "amostra pequena" instead of interval and sentence under 10 deviations', () => {
    const r = byOutlet([
      ...rows(MIN_N, 'lula', ['verdadeiro', 'falso', null, null]),
      ...rows(MIN_N - 1, 'flavio', ['falso', 'verdadeiro', null, null]),
    ])
    expect(r.aosfatos.candidates.map((c) => c.n)).toEqual([10, 9])
    expect(r.aosfatos.interval).toBeNull()
    expect(r.aosfatos.verdict).toBe('small')
    expect(sentence(r.aosfatos.verdict, ctx)).toBe('amostra pequena')
  })
})

describe('headline (LEAN-05)', () => {
  it('says no agency differs when every sentence is "sem diferença clara"', () => {
    const none = OUTLETS.map((outlet) => ({ outlet, verdict: 'none' }))
    expect(headline(none as never, ctx)).toBe(
      'Pelos dados de hoje, nenhuma das quatro mostra diferença clara entre os candidatos.',
    )
  })

  it('names each agency with a clear difference, in agency order', () => {
    const verdicts = { aosfatos: 'c2', estadao: 'none', g1: 'c1', lupa: 'small' }
    const result = OUTLETS.map((outlet) => ({ outlet, verdict: verdicts[outlet as 'g1'] }))
    expect(headline(result as never, ctx)).toBe(
      'Aos Fatos foi mais dura com Flávio Bolsonaro do que as outras agências. g1 Fato ou Fake foi mais dura com Lula do que as outras agências.',
    )
  })
})

describe('pnpm lean (LEAN-07)', () => {
  const dirs: string[] = []
  afterAll(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))))

  it('prints the numbers, intervals and sentences of lean() and the headline', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lean-'))
    dirs.push(dir)
    const { records, groups } = leanFixture()
    await writeData(dir, records, fixtureReport(records))
    await writeFile(join(dir, 'claim-groups.json'), JSON.stringify(groups))

    const local = createContext({ ...config, records })
    const result = lean(local, createComparison(local, groups, []).rows)
    expect(result[0]).toMatchObject({ outlet: 'aosfatos', verdict: 'c2' })
    expect(result[0].candidates.map((c) => c.n)).toEqual([LEAN_CLAIMS, LEAN_CLAIMS])

    const cli = spawnSync('node', ['src/lean.ts', '--data-dir', dir], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    expect(cli.status).toBe(0)
    const lines = cli.stdout.trim().split('\n')
    expect(lines).toHaveLength(OUTLETS.length + 2)
    result.forEach((r, i) => {
      const [c1, c2] = r.candidates
      const [lo, hi] = r.interval ?? [0, 0]
      expect(lines[i]).toBe(
        `${config.outlets[r.outlet].name}: Lula ${signed(c1.mean ?? 0)} (n=${c1.n}), Flávio ${signed(c2.mean ?? 0)} (n=${c2.n}); distância ${signed(r.distance ?? 0)}, intervalo de 90% de ${signed(lo)} a ${signed(hi)}; ${sentence(r.verdict, local)}`,
      )
    })
    expect(lines.at(-1)).toBe(headline(result, local))
    expect(lines.at(-1)).toMatch(
      /^Aos Fatos foi mais dura com Flávio Bolsonaro do que as outras agências\./,
    )
  })
})
