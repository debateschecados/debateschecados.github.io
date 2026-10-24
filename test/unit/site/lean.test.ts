import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  verdictOf,
} from '../../../site/lean.js'
import { assemble } from '../../../src/claims/assemble.ts'
import { type Config, loadConfig } from '../../../src/config.ts'
import { writeData } from '../../../src/pipeline/write.ts'
import { repair, SOURCE } from '../../../src/repair/estadao-2026-10-24.ts'
import type { Band, CheckRecord } from '../../../src/types.ts'
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

  it('draws the 97.5% interval with the fixed generator, the same on every call', () => {
    const c1 = [-1, 0.5, -0.5, 1, 0, -2, 1.5, 0.25, -0.75, 2, 0.5]
    const c2 = [1, -0.5, 0.5, 2, -1, 0, 1.5, -0.25, 0.75, 1, -1.5, 0.5]
    // Pinned: -401/528 and 595/528, the 63rd and 4938th of 5000 sorted resamples.
    expect(B).toBe(5000)
    expect(interval(c1, c2)).toEqual([-0.759469696969697, 1.1268939393939394])
    expect(interval(c1, c2)).toEqual(interval(c1, c2))
  })

  it('gives the pinned numbers on the frozen 2026-10-24 data', async () => {
    // The records and groups of the 2026-10-24 run, repaired, so data updates leave this alone.
    const read = async (path: string) =>
      JSON.parse(await readFile(join(ROOT, path), 'utf8')) as CheckRecord[]
    const before = await read('test/fixtures/claim-records-2026-10-24.json')
    const after = await read('test/fixtures/estadao-globo-after-2026-10-24.json')
    const current = [...before.filter((r) => r.sourceId !== SOURCE), ...after]
    const { records } = repair(before, after, current, config)
    const { file } = await assemble(join(ROOT, 'data/claim-curation/2026-10-24'))
    const local = createContext({ ...config, records })
    const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)
    expect(
      lean(local, createComparison(local, file, []).rows).map((r) => ({
        outlet: r.outlet,
        n: r.candidates.map((c) => c.n),
        distance: round(r.distance),
        interval: r.interval?.map(round),
        verdict: r.verdict,
      })),
    ).toEqual([
      { outlet: 'aosfatos', n: [28, 27], distance: 0.14, interval: [-0.15, 0.43], verdict: 'none' },
      { outlet: 'estadao', n: [21, 20], distance: -0.2, interval: [-0.57, 0.15], verdict: 'none' },
      { outlet: 'g1', n: [29, 30], distance: -0.04, interval: [-0.35, 0.26], verdict: 'none' },
      { outlet: 'lupa', n: [23, 28], distance: 0.05, interval: [-0.22, 0.32], verdict: 'none' },
    ])
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

  it('applies the rule to the interval ends rounded to two decimals, as the page prints them', () => {
    // An end printed as "0,00" counts as 0; one printed as "−0,01" does not.
    expect(signed(-0.004)).toBe('0,00')
    expect(verdictOf([-0.3, -0.004])).toBe('none')
    expect(sentence(verdictOf([-0.3, -0.004]), ctx)).toBe('sem diferença clara entre os candidatos')
    expect(signed(-0.006)).toBe('−0,01')
    expect(verdictOf([-0.3, -0.006])).toBe('c1')
    expect(sentence(verdictOf([-0.3, -0.006]), ctx)).toBe(
      'mais dura com Lula do que as outras agências',
    )
    expect(signed(0.004)).toBe('0,00')
    expect(verdictOf([0.004, 0.3])).toBe('none')
    expect(signed(0.006)).toBe('+0,01')
    expect(verdictOf([0.006, 0.3])).toBe('c2')
  })

  it('never prints "−0,00"', () => {
    for (const v of [-0, -0.001, -0.004, -0.0049]) expect(signed(v)).toBe('0,00')
    expect(signed(0)).toBe('0,00')
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
  // Verdicts in agency order: Aos Fatos, Estadão Verifica, g1 Fato ou Fake, Lupa.
  const say = (...verdicts: string[]) =>
    headline(OUTLETS.map((outlet, i) => ({ outlet, verdict: verdicts[i] })) as never, ctx)

  it('says none of the four differs when every agency has the sentence "sem diferença clara"', () => {
    expect(say('none', 'none', 'none', 'none')).toBe(
      'Pelos dados de hoje, nenhuma das quatro mostra diferença clara entre os candidatos.',
    )
  })

  it('names each agency with a clear difference, in agency order', () => {
    expect(say('c2', 'none', 'c1', 'none')).toBe(
      'Aos Fatos foi mais dura com Flávio Bolsonaro do que as outras agências. g1 Fato ou Fake foi mais dura com Lula do que as outras agências.',
    )
  })

  it('adds the agencies with a small sample after the clear differences', () => {
    expect(say('c2', 'none', 'c1', 'small')).toBe(
      'Aos Fatos foi mais dura com Flávio Bolsonaro do que as outras agências. g1 Fato ou Fake foi mais dura com Lula do que as outras agências. Lupa tem amostra pequena.',
    )
    expect(say('small', 'c1', 'small', 'none')).toBe(
      'Estadão Verifica foi mais dura com Lula do que as outras agências. Aos Fatos e g1 Fato ou Fake têm amostra pequena.',
    )
  })

  it('names only the agencies with enough claims when none differs and some have a small sample', () => {
    expect(say('none', 'small', 'none', 'none')).toBe(
      'Pelos dados de hoje, Aos Fatos, g1 Fato ou Fake e Lupa não mostram diferença clara entre os candidatos. Estadão Verifica tem amostra pequena.',
    )
    expect(say('small', 'small', 'none', 'small')).toBe(
      'Pelos dados de hoje, g1 Fato ou Fake não mostra diferença clara entre os candidatos. Aos Fatos, Estadão Verifica e Lupa têm amostra pequena.',
    )
  })

  it('says no agency has enough claims when every agency has a small sample', () => {
    expect(say('small', 'small', 'small', 'small')).toBe(
      'Pelos dados de hoje, nenhuma agência tem falas suficientes para medir a diferença.',
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
        `${config.outlets[r.outlet].name}: Lula ${signed(c1.mean ?? 0)} (n=${c1.n}), Flávio ${signed(c2.mean ?? 0)} (n=${c2.n}); distância ${signed(r.distance ?? 0)}, intervalo de 97,5% de ${signed(lo)} a ${signed(hi)}; ${sentence(r.verdict, local)}`,
      )
    })
    expect(lines.at(-1)).toBe(headline(result, local))
    expect(lines.at(-1)).toMatch(
      /^Aos Fatos foi mais dura com Flávio Bolsonaro do que as outras agências\./,
    )
  })
})
