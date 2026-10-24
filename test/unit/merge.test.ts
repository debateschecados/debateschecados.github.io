import { describe, expect, it } from 'vitest'
import type { Bands } from '../../src/config.ts'
import { recordId } from '../../src/pipeline/ids.ts'
import {
  type FreshItem,
  type MergeContext,
  merge,
  type SourceResult,
} from '../../src/pipeline/merge.ts'
import { quoteKey, tokens } from '../../src/pipeline/normalize.ts'
import type { CheckRecord } from '../../src/types.ts'

const entry = (label: string, band: Bands[string][number]['band']) => ({
  label,
  band,
  definitionUrl: null,
})
const bands: Bands = {
  aosfatos: [entry('verdadeiro', 'verdadeiro')],
  estadao: [entry('é verdadeiro', 'verdadeiro')],
  g1: [entry('#FATO', 'verdadeiro'), entry('#FAKE', 'falso')],
  lupa: [entry('VERDADEIRO', 'verdadeiro'), entry('FALSO', 'falso')],
}

const ctx = (over: Partial<MergeContext> = {}): MergeContext => ({
  date: '2026-10-25',
  bands,
  outlets: {
    aosfatos: { name: 'Aos Fatos' },
    estadao: { name: 'Estadão Verifica' },
    g1: { name: 'g1 Fato ou Fake' },
    lupa: { name: 'Lupa' },
  },
  debates: [
    { id: 'band-2026-10-18', date: '2026-10-18' },
    { id: 'globo-2026-10-23', date: '2026-10-23' },
  ],
  idLinks: {},
  acceptDrop: new Set(),
  ...over,
})

const G1 = 'g1-band-2026-10-18'
const LUPA = 'lupa-band-2026-10-18'
const PAGE = 'https://g1.example/band'

const g1Item = (pos: number, over: Partial<FreshItem> = {}): FreshItem => ({
  key: `chunk-${pos}`,
  pos,
  anchor: null,
  speaker: 'lula',
  quote: `Fala ${pos} do candidato sobre a economia do país`,
  label: '#FATO',
  excerpt: `Explicação ${pos}.`,
  url: PAGE,
  evidenceUrl: PAGE,
  fetchedAt: '2026-10-24T10:00:00Z',
  ...over,
})

const lupaItem = (pos: number, quote: string, over: Partial<FreshItem> = {}): FreshItem =>
  g1Item(pos, { key: null, quote, label: 'VERDADEIRO', ...over })

const g1 = (items: FreshItem[], over: Partial<SourceResult> = {}): SourceResult => ({
  sourceId: G1,
  debate: 'band-2026-10-18',
  outlet: 'g1',
  adapter: 'g1-page@1',
  status: 'ok',
  items,
  ...over,
})

const lupa = (items: FreshItem[], over: Partial<SourceResult> = {}): SourceResult =>
  g1(items, { sourceId: LUPA, outlet: 'lupa', adapter: 'lupa-page@1', ...over })

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
const first = (results: SourceResult[]) => merge([], results, ctx()).records
const byId = (records: CheckRecord[], id: string) => records.find((r) => r.id === id)

const jaccard = (a: string, b: string) => {
  const [x, y] = [tokens(a), tokens(b)]
  const shared = [...x].filter((w) => y.has(w)).length
  return shared / (x.size + y.size - shared)
}

describe('new records', () => {
  it('creates records from a first run with ids, band and empty archive evidence', () => {
    const { records, events } = merge([], [g1([g1Item(1, { label: '#FAKE' })])], ctx())
    expect(records).toEqual([
      {
        id: recordId(G1, 'chunk-1'),
        sourceId: G1,
        debate: 'band-2026-10-18',
        outlet: 'g1',
        key: 'chunk-1',
        pos: 1,
        anchor: null,
        speaker: 'lula',
        quote: 'Fala 1 do candidato sobre a economia do país',
        label: '#FAKE',
        band: 'falso',
        excerpt: 'Explicação 1.',
        url: PAGE,
        adapter: 'g1-page@1',
        evidence: { url: PAGE, fetchedAt: '2026-10-24T10:00:00Z', archiveUrl: null, sha256: null },
      },
    ])
    expect(events).toEqual([
      { type: 'source', sourceId: G1, status: 'ok', reason: null },
      { type: 'new', sourceId: G1, id: recordId(G1, 'chunk-1') },
    ])
  })
})

describe('step 1: failed source (INGEST-06)', () => {
  it('passes the previous records of a failed source through unchanged', () => {
    const previous = first([g1(range(3).map((p) => g1Item(p)))])
    const { records, events } = merge(
      previous,
      [g1([], { status: 'failed', reason: 'HTTP 503' })],
      ctx(),
    )
    expect(records).toEqual(previous)
    expect(events).toEqual([{ type: 'source', sourceId: G1, status: 'failed', reason: 'HTTP 503' }])
  })

  it('treats a source that yields zero items as failed', () => {
    const previous = first([g1(range(3).map((p) => g1Item(p)))])
    const { records, events } = merge(previous, [g1([])], ctx())
    expect(records).toEqual(previous)
    expect(records.some((r) => r.missingSince)).toBe(false)
    expect(events[0]).toMatchObject({ type: 'source', status: 'failed' })
  })
})

describe('step 2: partial parse guard (INGEST-06)', () => {
  const ten = () => first([g1(range(10).map((p) => g1Item(p)))])

  it('keeps previous records when a source yields fewer than 80% of them', () => {
    const previous = ten()
    const { records, events } = merge(previous, [g1(range(7).map((p) => g1Item(p)))], ctx())
    expect(records).toEqual(previous)
    expect(events).toEqual([
      { type: 'source', sourceId: G1, status: 'partial', reason: '7 items, 10 published' },
    ])
  })

  it('accepts the drop for a source named in acceptDrop and marks the rest missing', () => {
    const previous = ten()
    const { records, events } = merge(
      previous,
      [g1(range(7).map((p) => g1Item(p)))],
      ctx({ acceptDrop: new Set([G1]) }),
    )
    expect(events[0]).toEqual({ type: 'source', sourceId: G1, status: 'ok', reason: null })
    expect(records.filter((r) => r.missingSince === '2026-10-25').map((r) => r.key)).toEqual([
      'chunk-8',
      'chunk-9',
      'chunk-10',
    ])
  })

  it('accepts exactly 80% and ignores the guard below 5 previous records', () => {
    const at80 = merge(ten(), [g1(range(8).map((p) => g1Item(p)))], ctx())
    expect(at80.events[0]).toMatchObject({ status: 'ok' })
    const four = first([g1(range(4).map((p) => g1Item(p)))])
    const small = merge(four, [g1([g1Item(1)])], ctx())
    expect(small.events[0]).toMatchObject({ status: 'ok' })
    expect(small.records.filter((r) => r.missingSince)).toHaveLength(3)
  })

  it('counts only records not already missing', () => {
    const missing = merge(
      ten(),
      [g1(range(5).map((p) => g1Item(p)))],
      ctx({ acceptDrop: new Set([G1]) }),
    )
    const { events } = merge(missing.records, [g1(range(4).map((p) => g1Item(p)))], ctx())
    expect(events[0]).toMatchObject({ status: 'ok' }) // 4 of 5 active = 80%
  })
})

describe('step 3: matching (INGEST-04)', () => {
  it('matches by the source key even when the quote changed', () => {
    const previous = first([g1([g1Item(1)])])
    const { records } = merge(
      previous,
      [g1([g1Item(1, { quote: 'Fala reescrita por completo agora' })])],
      ctx(),
    )
    expect(records).toHaveLength(1)
    expect(records[0].id).toBe(previous[0].id)
  })

  it('matches a keyless item by the same quoteKey', () => {
    const previous = first([lupa([lupaItem(1, 'O desemprego caiu para 6%, o menor da série.')])])
    const { records } = merge(
      previous,
      [lupa([lupaItem(4, 'O desemprego caiu para 6% o menor da série')])],
      ctx(),
    )
    expect(records.map((r) => [r.id, r.pos])).toEqual([[previous[0].id, 4]])
  })

  it('keeps the id of a Lupa quote edited by one word and records the old quote', () => {
    const before = 'O salário mínimo subiu acima da inflação em todos os anos do meu governo'
    const after = 'O salário mínimo subiu acima da inflação em quase os anos do meu governo'
    expect(jaccard(before, after)).toBeGreaterThanOrEqual(0.6)
    const previous = first([lupa([lupaItem(1, before)])])
    const { records, events } = merge(previous, [lupa([lupaItem(1, after)])], ctx())
    expect(records).toHaveLength(1)
    expect(records[0].id).toBe(previous[0].id)
    expect(records[0].quote).toBe(after)
    expect(records[0].history).toEqual([{ quote: before, until: '2026-10-25' }])
    expect(events).toContainEqual({ type: 'changed', sourceId: LUPA, id: previous[0].id })
  })

  it('does not match two distinct quotes with Jaccard 0.35', () => {
    const shared = 'governo inflacao salario minimo emprego renda brasil'
    const a = `${shared} ontem disse pais cresceu muito forte`
    const b = `${shared} amanha quero escola publica saude hospital estrada`
    expect(jaccard(a, b)).toBeCloseTo(0.35, 10)
    const previous = first([lupa([lupaItem(1, a)])])
    const { records } = merge(previous, [lupa([lupaItem(1, b)])], ctx())
    expect(records).toHaveLength(2)
    expect(byId(records, previous[0].id)?.missingSince).toBe('2026-10-25')
    expect(records.find((r) => r.quote === b)?.id).not.toBe(previous[0].id)
  })

  it('requires the same speaker for a similar-quote match', () => {
    const before = 'O salário mínimo subiu acima da inflação em todos os anos do meu governo'
    const after = 'O salário mínimo subiu acima da inflação em quase os anos do meu governo'
    const previous = first([lupa([lupaItem(1, before)])])
    const { records } = merge(previous, [lupa([lupaItem(1, after, { speaker: 'flavio' })])], ctx())
    expect(records).toHaveLength(2)
    expect(byId(records, previous[0].id)?.missingSince).toBe('2026-10-25')
  })

  it('assigns similar quotes best score first, each previous record once', () => {
    const w = [
      'casa',
      'bola',
      'fogo',
      'agua',
      'vento',
      'terra',
      'pedra',
      'livro',
      'porta',
      'janela',
      'cadeira',
      'mesa',
      'sol',
      'lua',
    ]
    const words = (...n: number[]) => n.map((i) => w[i - 1]).join(' ')
    const p1 = words(1, 2, 3, 4, 5, 6, 7, 12, 13, 14)
    const p2 = words(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    const f1 = words(1, 2, 3, 4, 5, 6, 7, 8, 9, 12)
    const f2 = words(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)
    // f1 prefers p2, but f2 matches p2 better; f1 must settle for p1.
    expect(jaccard(f1, p2)).toBeGreaterThan(jaccard(f1, p1))
    expect(jaccard(f2, p2)).toBeGreaterThan(jaccard(f1, p2))
    expect(jaccard(f1, p1)).toBeGreaterThanOrEqual(0.6)
    // p2 comes first on the page, so an in-order greedy match would give it to f1.
    const previous = first([lupa([lupaItem(1, p2), lupaItem(2, p1)])])
    const idOf = (quote: string) => previous.find((r) => r.quote === quote)?.id
    const { records } = merge(previous, [lupa([lupaItem(1, f1), lupaItem(2, f2)])], ctx())
    expect(records).toHaveLength(2)
    expect(records.find((r) => r.quote === f1)?.id).toBe(idOf(p1))
    expect(records.find((r) => r.quote === f2)?.id).toBe(idOf(p2))
  })

  it('matches a rewritten quote through config/id-links.json', () => {
    const before = 'Nós construímos mais escolas técnicas que todos os governos anteriores juntos'
    const after = 'Foram 400 institutos federais abertos nos meus mandatos'
    const previous = first([lupa([lupaItem(1, before)])])
    const idLinks = { [LUPA]: { [quoteKey(after)]: previous[0].id } }
    const { records } = merge(previous, [lupa([lupaItem(1, after)])], ctx({ idLinks }))
    expect(records).toHaveLength(1)
    expect(records[0].id).toBe(previous[0].id)
    expect(records[0].history).toEqual([{ quote: before, until: '2026-10-25' }])
  })
})

describe('step 4: matched records (HIST-01)', () => {
  it('keeps a changed label in history with the detection date and resets the archived copy', () => {
    const [record] = first([g1([g1Item(1)])])
    const archived = {
      ...record,
      evidence: {
        ...record.evidence,
        archiveUrl: 'https://web.archive.org/web/1id_/x',
        sha256: 'ab',
      },
    }
    const { records } = merge(
      [archived],
      [
        g1([g1Item(1, { label: '#FAKE', speaker: 'flavio', fetchedAt: '2026-10-25T10:00:00Z' })], {
          adapter: 'g1-page@2',
        }),
      ],
      ctx(),
    )
    expect(records[0]).toMatchObject({
      id: record.id,
      label: '#FAKE',
      speaker: 'flavio',
      band: 'falso',
      adapter: 'g1-page@2',
      history: [{ label: '#FATO', speaker: 'lula', until: '2026-10-25' }],
      evidence: { url: PAGE, fetchedAt: '2026-10-25T10:00:00Z', archiveUrl: null, sha256: null },
    })
  })

  it('appends to existing history on a second change', () => {
    const previous = first([g1([g1Item(1)])])
    const second = merge(previous, [g1([g1Item(1, { label: '#FAKE' })])], ctx()).records
    const third = merge(second, [g1([g1Item(1, { label: '#FATO' })])], ctx({ date: '2026-10-26' }))
    expect(third.records[0].history).toEqual([
      { label: '#FATO', until: '2026-10-25' },
      { label: '#FAKE', until: '2026-10-26' },
    ])
  })

  it('overwrites pos, anchor, excerpt and url without history and keeps the archived copy', () => {
    const [record] = first([g1([g1Item(1)])])
    const archived = {
      ...record,
      evidence: {
        ...record.evidence,
        archiveUrl: 'https://web.archive.org/web/1id_/x',
        sha256: 'ab',
      },
    }
    const { records } = merge(
      [archived],
      [
        g1([
          { ...g1Item(1), pos: 5, anchor: 'c1', excerpt: 'Nova explicação.', url: `${PAGE}#c1` },
        ]),
      ],
      ctx(),
    )
    expect(records[0]).toMatchObject({
      pos: 5,
      anchor: 'c1',
      excerpt: 'Nova explicação.',
      url: `${PAGE}#c1`,
    })
    expect(records[0].history).toBeUndefined()
    expect(records[0].evidence).toMatchObject({
      archiveUrl: 'https://web.archive.org/web/1id_/x',
      sha256: 'ab',
    })
  })

  it('keeps an unchanged record byte-for-byte, including evidence and adapter', () => {
    const previous = first([g1(range(3).map((p) => g1Item(p)))])
    const { records, events } = merge(
      previous,
      [
        g1(
          range(3).map((p) => g1Item(p, { fetchedAt: '2026-10-25T16:00:00Z' })),
          { adapter: 'g1-page@2' },
        ),
      ],
      ctx(),
    )
    expect(JSON.stringify(records)).toBe(JSON.stringify(previous))
    expect(events.filter((e) => e.type !== 'source')).toEqual([])
  })
})

describe('step 5: records not found again (HIST-02)', () => {
  it('sets missingSince, keeps the first date on later runs, and clears it when the item returns', () => {
    const previous = first([g1([g1Item(1), g1Item(2)])])
    const gone = merge(previous, [g1([g1Item(1)])], ctx())
    const id2 = recordId(G1, 'chunk-2')
    expect(gone.records).toHaveLength(2)
    expect(byId(gone.records, id2)?.missingSince).toBe('2026-10-25')
    expect(gone.events).toContainEqual({ type: 'missing', sourceId: G1, id: id2 })

    const still = merge(gone.records, [g1([g1Item(1)])], ctx({ date: '2026-10-26' }))
    expect(byId(still.records, id2)?.missingSince).toBe('2026-10-25')

    const back = merge(still.records, [g1([g1Item(1), g1Item(2)])], ctx({ date: '2026-10-27' }))
    expect(byId(back.records, id2)).toEqual(previous[1])
    expect(back.events).toContainEqual({ type: 'returned', sourceId: G1, id: id2 })
  })
})

describe('step 6: band recompute', () => {
  it('recomputes bands from the current table, also for a failed source', () => {
    const previous = first([g1([g1Item(1)]), lupa([lupaItem(1, 'Uma fala qualquer da Lupa aqui')])])
    const edited: Bands = {
      ...bands,
      g1: [entry('#FATO', 'impreciso')],
      lupa: [entry('VERDADEIRO', 'impreciso')],
    }
    const { records } = merge(
      previous,
      [g1([g1Item(1)]), lupa([], { status: 'failed', reason: 'timeout' })],
      ctx({ bands: edited }),
    )
    expect(records.map((r) => [r.sourceId, r.band])).toEqual([
      [G1, 'impreciso'],
      [LUPA, 'impreciso'],
    ])
  })

  it('gives an unmapped label the band "sem faixa"', () => {
    const [record] = first([g1([g1Item(1, { label: '#INSUSTENTAVEL' })])])
    expect(record.band).toBe('sem faixa')
  })
})

describe('step 7: order', () => {
  it('sorts by debate date desc, outlet name with pt-BR collation, then pos', () => {
    const results = (debate: string) =>
      (['lupa', 'g1', 'estadao', 'aosfatos'] as const).map((outlet) =>
        g1([g1Item(2), g1Item(1)], { sourceId: `${outlet}-${debate}`, outlet, debate }),
      )
    const { records } = merge(
      [],
      [...results('band-2026-10-18'), ...results('globo-2026-10-23')],
      ctx(),
    )
    expect(records.map((r) => `${r.debate} ${r.outlet} ${r.pos}`)).toEqual([
      'globo-2026-10-23 aosfatos 1',
      'globo-2026-10-23 aosfatos 2',
      'globo-2026-10-23 estadao 1',
      'globo-2026-10-23 estadao 2',
      'globo-2026-10-23 g1 1',
      'globo-2026-10-23 g1 2',
      'globo-2026-10-23 lupa 1',
      'globo-2026-10-23 lupa 2',
      'band-2026-10-18 aosfatos 1',
      'band-2026-10-18 aosfatos 2',
      'band-2026-10-18 estadao 1',
      'band-2026-10-18 estadao 2',
      'band-2026-10-18 g1 1',
      'band-2026-10-18 g1 2',
      'band-2026-10-18 lupa 1',
      'band-2026-10-18 lupa 2',
    ])
  })

  it('returns deep-equal records in the same order for unchanged input', () => {
    const fresh = [
      g1(range(4).map((p) => g1Item(p))),
      lupa([
        lupaItem(1, 'Primeira fala checada pela Lupa'),
        lupaItem(2, 'Segunda fala checada pela Lupa'),
      ]),
    ]
    const previous = first(fresh)
    const { records } = merge(previous, fresh, ctx())
    expect(records).toEqual(previous)
    expect(records.map((r) => r.id)).toEqual(previous.map((r) => r.id))
  })

  it('keeps records of a source that is not in this run', () => {
    const previous = first([g1([g1Item(1)]), lupa([lupaItem(1, 'Uma fala qualquer da Lupa aqui')])])
    const { records } = merge(previous, [g1([g1Item(1)])], ctx())
    expect(records).toEqual(previous)
  })
})
