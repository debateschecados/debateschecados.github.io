import { join } from 'node:path'
import { load } from 'cheerio'
import { beforeAll, describe, expect, it } from 'vitest'
import { coverage, createComparison, emptyCompareState, type Row } from '../../../site/compare.js'
import { createContext, emptyState, listed, scoreboard } from '../../../site/core.js'
import {
  axisDomain,
  boardHtml,
  changeHtml,
  changesHtml,
  claimHtml,
  compareFiltersHtml,
  coverageHtml,
  detailHtml,
  driftCountsHtml,
  itemHtml,
  leanHtml,
  matrixHtml,
  pendingText,
} from '../../../site/render.js'
import { type Config, loadConfig } from '../../../src/config.ts'
import type { CheckRecord } from '../../../src/types.ts'
import { fixtureGroupId, fixtureGroups, fixtureRecords, recordId } from '../../fixtures/site.ts'

let config: Config
let records: CheckRecord[]
let ctx: ReturnType<typeof createContext>
beforeAll(async () => {
  config = await loadConfig(join(import.meta.dirname, '../../../config'))
  records = fixtureRecords()
  ctx = createContext({ ...config, records })
})

const byId = (n: number) => records[n - 1]
const item = (r: CheckRecord) => load(itemHtml(r, ctx))('li')
const OUTLETS = ['aosfatos', 'estadao', 'g1', 'lupa']
const rowsOf = () =>
  createComparison(
    ctx,
    fixtureGroups(),
    records.map((r) => r.id),
  ).rows
const rowOf = (letter: string) => rowsOf().find((r) => r.id === fixtureGroupId(letter)) as Row
// Class and text alternative of each dot of a matrix column.
const dots = ($: ReturnType<typeof load>) =>
  $('.dots .dot')
    .map((_, d) => [[d.attribs.class, d.attribs['aria-label']]])
    .get()

describe('itemHtml (SITE-02)', () => {
  it('shows the band as heading, the agency label on hover, outlet, speaker, quote, excerpt and link', () => {
    const r = byId(2) // band, lupa, pos 3: FALSO, lula
    expect(r).toMatchObject({ label: 'FALSO', band: 'falso', speaker: 'lula', outlet: 'lupa' })
    const li = item(r)
    expect(li.attr('data-id')).toBe(r.id)
    expect(li.find('.verdict h3').text()).toBe('Falso')
    expect(li.find('h3')).toHaveLength(1)
    expect(li.find('.verdict').attr('title')).toBe('Rótulo da agência: FALSO')
    expect(li.find('.verdict small').text()).toBe('Lupa')
    expect(li.find('.verdict small img.outlet-logo').attr('src')).toBe('logos/lupa.png')
    expect(li.hasClass('band-falso')).toBe(true)
    expect(li.find('.who').text()).toBe('Lula no debate da Band, 18/10')
    expect(li.find('.quote').text()).toBe(`“${r.quote}”`)
    expect(li.find('.excerpt').text()).toBe(r.excerpt)
    const link = li.find('a.src')
    expect(link).toHaveLength(1)
    expect(link.text()).toBe('Ler a checagem completa')
    expect(link.attr('href')).toBe(r.url)
  })

  it('links the archived copy only when there is one', () => {
    const archived = item(byId(6)).find('a.src')
    expect(archived.map((_, a) => a.attribs.href).get()).toEqual([
      byId(6).url,
      'https://web.archive.org/web/20261024000000id_/https://g1.globo.com/x',
    ])
    expect(archived.eq(1).text()).toBe('Cópia arquivada')
    expect(item(byId(7)).find('a.src')).toHaveLength(1)
  })

  it('tags a removed record with the date it disappeared (HIST-02)', () => {
    const li = item(byId(3))
    expect(li.hasClass('removed')).toBe(true)
    expect(li.find('.gone').text()).toBe('não encontrado na fonte desde 25/10/2026')
    expect(item(byId(4)).find('.gone')).toHaveLength(0)
    expect(item(byId(4)).hasClass('removed')).toBe(false)
  })

  it('escapes markup in agency text and attributes', () => {
    const html = itemHtml({ ...byId(9), url: 'https://x.test/?a="b"&c' }, ctx)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; mais')
    const li = load(html)('li')
    expect(li.find('.quote').text()).toBe(`“${byId(9).quote}”`)
    expect(li.find('.excerpt').text()).toBe('Trecho com <b>negrito</b> & entidade.')
    expect(li.find('a.src').attr('href')).toBe('https://x.test/?a="b"&c')
  })

  it('leaves out the excerpt paragraph when the explanation is empty', () => {
    expect(item({ ...byId(4), excerpt: '' }).find('.excerpt')).toHaveLength(0)
  })
})

describe('boardHtml', () => {
  it('renders candidates in ballot order with four bands and their counts', () => {
    const state = { ...emptyState(), outlet: 'g1' }
    const $ = load(boardHtml(scoreboard(ctx, listed(ctx, state)), state, ctx))
    const cards = $('article.cand')
    expect(cards.map((_, c) => c.attribs['data-speaker']).get()).toEqual(['lula', 'flavio'])
    expect(cards.eq(0).find('h2').text()).toBe('Luiz Inácio Lula da Silva')
    expect(cards.eq(1).find('h2').text()).toBe('Flávio Nantes Bolsonaro')
    expect(cards.eq(0).find('.party').attr('src')).toBe('logos/pt.svg')
    expect(cards.eq(0).find('.face').attr('src')).toBe('sprites/lula.svg')
    const g1 = records.filter((r) => r.outlet === 'g1' && !r.missingSince)
    cards.each((_, card) => {
      const speaker = card.attribs['data-speaker']
      const mine = g1.filter((r) => r.speaker === speaker)
      const legend = $(card).find('.legend div')
      expect(legend.map((_, d) => $(d).find('span').text()).get()).toEqual([
        'Verdadeiro',
        'Impreciso',
        'Falso',
        'Sem faixa',
      ])
      const counts = legend.map((_, d) => Number($(d).find('strong').text())).get()
      expect(counts).toEqual(
        ['verdadeiro', 'impreciso', 'falso', 'sem faixa'].map(
          (b) => mine.filter((r) => r.band === b).length,
        ),
      )
      expect(counts[3]).toBe(0)
      expect($(card).find('.total .n').text()).toBe(String(mine.length))
      expect($(card).find('.scope').text()).toBe(' da g1 Fato ou Fake')
    })
  })
})

describe('claimHtml, the matrix column (CMP-01, CMP-08)', () => {
  it('is a button named by speaker, claim and every agency band, one dot per agency', () => {
    const $ = load(claimHtml(rowOf('A'), ctx))
    const button = $('button.claim')
    expect(button.attr('data-id')).toBe(fixtureGroupId('A'))
    expect(button.hasClass('div')).toBe(true)
    expect(button.attr('aria-expanded')).toBe('false')
    expect(button.attr('aria-controls')).toBe('detail')
    expect(button.attr('aria-label')).toBe(
      'Lula: Alegação de teste A, inventada para a suíte do site. Divergência. Aos Fatos: falso; Estadão Verifica: verdadeiro; g1 Fato ou Fake: verdadeiro; Lupa: verdadeiro.',
    )
    expect($('.txt').text()).toBe(rowOf('A').claim)
    expect(dots($)).toEqual([
      ['dot band-falso', 'Aos Fatos: falso. Alegação de teste A, inventada para a suíte do site'],
      [
        'dot band-verdadeiro',
        'Estadão Verifica: verdadeiro. Alegação de teste A, inventada para a suíte do site',
      ],
      [
        'dot band-verdadeiro',
        'g1 Fato ou Fake: verdadeiro. Alegação de teste A, inventada para a suíte do site',
      ],
      [
        'dot band-verdadeiro',
        'Lupa: verdadeiro. Alegação de teste A, inventada para a suíte do site',
      ],
    ])
  })

  it('draws a hollow dot named "não checou" for an agency with no record, and no mark on agreement', () => {
    const $ = load(claimHtml(rowOf('C'), ctx))
    expect($('button').hasClass('div')).toBe(false)
    expect($('button').attr('aria-label')).not.toContain('Divergência')
    const claim = 'Alegação de teste C, inventada para a suíte do site'
    expect(dots($)).toEqual([
      ['dot band-verdadeiro', `Aos Fatos: verdadeiro. ${claim}`],
      ['dot band-sem-faixa', `Estadão Verifica: sem faixa. ${claim}`],
      ['dot none', `g1 Fato ou Fake: não checou. ${claim}`],
      ['dot band-sem-faixa', `Lupa: sem faixa. ${claim}`],
    ])
    expect($('.dot[role="img"]')).toHaveLength(4)
  })

  it('marks the dot of a record whose band changed and names the band before (DRIFT-05)', () => {
    // I: g1 5 is "#FATO" now and was "#FAKE"; Estadão 11 never changed.
    const $ = load(claimHtml(rowOf('I'), ctx))
    const claim = 'Alegação de teste I, inventada para a suíte do site'
    expect(dots($)).toEqual([
      ['dot none', `Aos Fatos: não checou. ${claim}`],
      ['dot band-impreciso', `Estadão Verifica: impreciso. ${claim}`],
      ['dot band-verdadeiro moved', `g1 Fato ou Fake: verdadeiro, antes falso. ${claim}`],
      ['dot none', `Lupa: não checou. ${claim}`],
    ])
    expect($('button').attr('aria-label')).toContain('g1 Fato ou Fake: verdadeiro, antes falso;')
    // A quote edit or a label written another way is no band change.
    const local = createContext({
      ...config,
      records: records.map((r) =>
        r.id === recordId(5)
          ? { ...r, history: [{ label: '#Fato', quote: 'Outra fala.', until: '2026-10-25' }] }
          : r,
      ),
    })
    const row = createComparison(local, fixtureGroups(), []).rows.find(
      (r) => r.id === fixtureGroupId('I'),
    )
    expect(load(claimHtml(row as Row, local))('.moved')).toHaveLength(0)
  })
})

describe('matrixHtml (CMP-01, CMP-04)', () => {
  it('has one block per debate newest first and candidate in ballot order, columns in row order', () => {
    const rows = rowsOf()
    const $ = load(matrixHtml(ctx, rows))
    expect(
      $('.staff')
        .map((_, s) => [[s.attribs['data-debate'], $(s).find('h3').text()]])
        .get(),
    ).toEqual([
      ['globo-2026-10-23', 'Debate da Globo, 23/10'],
      ['band-2026-10-18', 'Debate da Band, 18/10'],
    ])
    $('.staff').each((_, staff) => {
      expect(
        $(staff)
          .find('.lanes span')
          .map((_, s) => $(s).text())
          .get(),
      ).toEqual(['Fala', 'Aos Fatos', 'Estadão Verifica', 'g1 Fato ou Fake', 'Lupa'])
      const blocks = $(staff).find('.seg-block')
      expect(blocks.map((_, b) => b.attribs['data-speaker']).get()).toEqual(['lula', 'flavio'])
      blocks.each((_, block) => {
        const mine = rows.filter(
          (r) =>
            r.debate === staff.attribs['data-debate'] &&
            r.speaker === block.attribs['data-speaker'],
        )
        expect(
          $(block)
            .find('button.claim')
            .map((_, b) => b.attribs['data-id'])
            .get(),
        ).toEqual(mine.map((r) => r.id))
        expect($(block).find('.seg-label .n').text()).toBe(`${mine.length} falas`)
      })
    })
    expect($('button.claim')).toHaveLength(rows.length)
  })
})

describe('detailHtml (CMP-02, DRIFT-05)', () => {
  it('shows speaker, debate, claim, and per agency the band, its label as text and the link', () => {
    const $ = load(detailHtml(rowOf('I'), ctx))
    expect($('.who-line').text()).toBe('Flávio no debate da Band, 18/10')
    expect($('blockquote').text()).toBe('Alegação de teste I, inventada para a suíte do site.')
    expect($('.divnote').text()).toBe('2 agências checaram esta fala e deram faixas diferentes.')
    expect(
      $('.verdicts li')
        .map((_, li) => [
          [
            $(li).find('.ag').text(),
            $(li).find('.band').text(),
            $(li).find('.lab').text(),
            $(li).find('.was').text(),
            $(li).find('a').attr('href') ?? null,
          ],
        ])
        .get(),
    ).toEqual([
      ['Aos Fatos', 'não checou', '', '', null],
      ['Estadão Verifica', 'impreciso', 'rótulo da agência: é enganoso', '', byId(11).url],
      [
        'g1 Fato ou Fake',
        'verdadeiro',
        'rótulo da agência: #FATO',
        'faixa anterior: falso',
        byId(5).url,
      ],
      ['Lupa', 'não checou', '', '', null],
    ])
    expect(
      $('.verdicts .dot')
        .map((_, d) => d.attribs.class)
        .get(),
    ).toEqual(['dot none', 'dot band-impreciso', 'dot band-verdadeiro', 'dot none'])
    expect($('.gid').text()).toBe(fixtureGroupId('I'))
    expect($('button[data-close]').attr('aria-label')).toBe('Fechar')
  })

  it('says when every agency gave the same band', () => {
    expect(load(detailHtml(rowOf('B'), ctx))('.divnote').text()).toBe(
      '2 agências checaram esta fala e deram a mesma faixa.',
    )
    expect(load(detailHtml(rowOf('C'), ctx))('.divnote').text()).toBe(
      '3 agências checaram esta fala.',
    )
  })
})

describe('escaping in the comparison page', () => {
  const CLAIM = 'Disse <script>alert("x")</script> & "aspas"'
  const LABEL = '<b>"FALSO"</b> & cia'
  const hostile = () => {
    const recs = records.map((r) =>
      r.id === recordId(14)
        ? { ...r, label: LABEL, quote: CLAIM, history: [{ label: LABEL, until: '2026-10-24' }] }
        : r,
    )
    const local = createContext({ ...config, records: recs })
    const groups = fixtureGroups()
    for (const g of groups.groups) if (g.id === fixtureGroupId('A')) g.claim = CLAIM
    const row = createComparison(local, groups, []).rows.find((r) => r.id === fixtureGroupId('A'))
    return { local, row: row as Row, record: recs[13] }
  }

  it('shows a claim and a label with <, & and " as text in the matrix, the detail and the timeline', () => {
    const { local, row, record } = hostile()
    for (const html of [claimHtml(row, local), detailHtml(row, local), changeHtml(record, local)]) {
      const $ = load(html)
      expect($('script, b')).toHaveLength(0)
      expect(html).not.toContain('<script>')
    }
    const button = load(claimHtml(row, local))('button')
    expect(button.find('.txt').text()).toBe(CLAIM)
    expect(button.attr('aria-label')).toContain(`Lula: ${CLAIM}. Divergência.`)
    // The old label is in no band table, so it counts as "sem faixa".
    expect(button.find('.dot').first().attr('aria-label')).toBe(
      `Aos Fatos: falso, antes sem faixa. ${CLAIM}`,
    )
    const detail = load(detailHtml(row, local))
    expect(detail('blockquote').text()).toBe(CLAIM)
    expect(detail('.lab q').first().text()).toBe(LABEL)
    const change = load(changeHtml(record, local))
    expect(change('.q').text()).toBe(`Lula: “${CLAIM}”`)
    expect(
      change('.ver .v')
        .map((_, v) => change(v).text())
        .get(),
    ).toEqual([LABEL, LABEL])
  })

  it('shows the words of a quote edit with <, & and " as text (DRIFT-03)', () => {
    const OLD = 'a <b>x</b> & "y"'
    const record = {
      ...records[13],
      quote: 'a <i>z</i> & "y"',
      history: [{ quote: OLD, until: '2026-10-24' }],
    }
    const local = createContext({ ...config, records: [record] })
    const $ = load(changeHtml(record, local))
    expect($('.qdiff b, .qdiff i')).toHaveLength(0)
    expect($('.qdiff del').text()).toContain('<b>x</b>')
    expect($('.qdiff ins').text()).toContain('<i>z</i>')
  })
})

describe('leanHtml, the axes (LEAN-03, LEAN-04, LEAN-06)', () => {
  const candidates = (n1: number, m1: number | null, n2: number, m2: number | null) => [
    { id: 'lula', n: n1, mean: m1 },
    { id: 'flavio', n: n2, mean: m2 },
  ]
  // Distances on purpose out of numeric order, so a sort by number would show.
  const result = [
    {
      outlet: 'aosfatos',
      candidates: candidates(12, -0.1, 11, 0.15),
      distance: 0.25,
      interval: [0.1, 0.4],
      verdict: 'c2',
    },
    {
      outlet: 'estadao',
      candidates: candidates(20, 0.05, 20, 0),
      distance: -0.05,
      interval: [-0.2, 0.1],
      verdict: 'none',
    },
    {
      outlet: 'g1',
      candidates: candidates(12, 0.1, 9, 0),
      distance: -0.1,
      interval: null,
      verdict: 'small',
    },
    {
      outlet: 'lupa',
      candidates: candidates(0, null, 3, 0.2),
      distance: null,
      interval: null,
      verdict: 'small',
    },
  ]
  const html = () => leanHtml(ctx, result as never)

  it('draws one axis per agency in name order, with the sentence of the rule or "amostra pequena"', () => {
    const $ = load(html())
    const rows = $('li.lean-row')
    expect(rows.map((_, li) => li.attribs['data-outlet']).get()).toEqual(OUTLETS)
    expect(rows.map((_, li) => $(li).find('.who strong').text()).get()).toEqual([
      'Aos Fatos',
      'Estadão Verifica',
      'g1 Fato ou Fake',
      'Lupa',
    ])
    expect(rows.map((_, li) => $(li).find('.rule').text()).get()).toEqual([
      'Mais dura com Flávio Bolsonaro do que as outras agências.',
      'Sem diferença clara entre os candidatos.',
      'Amostra pequena.',
      'Amostra pequena.',
    ])
    expect(rows.map((_, li) => $(li).find('.nums').text()).get()).toEqual([
      'Distância +0,25, intervalo de 97,5% de +0,10 a +0,40.',
      'Distância −0,05, intervalo de 97,5% de −0,20 a +0,10.',
      'Distância −0,10. Menos de 10 falas de um dos candidatos, sem intervalo.',
      'Sem falas em comum para medir.',
    ])
    expect(
      rows
        .eq(0)
        .find('.sub span')
        .map((_, s) => $(s).text())
        .get(),
    ).toEqual(['com Lula −0,10, 12 falas', 'com Flávio +0,15, 11 falas'])
    expect(rows.eq(3).find('.sub span').first().text()).toBe('com Lula sem dados, 0 falas')
    expect(rows.eq(0).find('svg').attr('aria-label')).toBe(
      'Aos Fatos: mais dura com Flávio Bolsonaro do que as outras agências. Distância +0,25, intervalo de 97,5% de +0,10 a +0,40.',
    )
    expect(
      $('.ends .end')
        .map((_, e) => $(e).text())
        .get(),
    ).toEqual(['Mais dura com Lula do que as outras', 'Mais dura com Flávio do que as outras'])
    expect($('.axis .cap').text()).toBe(
      'Zero: igual às outras agências. Escala: verdadeiro 0, impreciso 1, falso 2.',
    )
  })

  it('places point and bar on the scale, the zero line over the bar, and no shaded zone', () => {
    const $ = load(html())
    // Largest value 0.4, so each side reaches 0.5: 0 sits at 50%, 0.25 at 75%.
    expect(axisDomain(result as never)).toBe(0.5)
    const svg = $('li.lean-row').eq(0).find('svg')
    expect(
      svg
        .children()
        .map((_, e) => e.attribs.class)
        .get(),
    ).toEqual([
      'grid',
      'grid',
      'grid',
      'grid',
      'base',
      'ci',
      'ci-end',
      'ci-end',
      'end',
      'end',
      'zero',
      'pt',
      'pt-label',
    ])
    expect(svg.find('rect.ci').attr('x')).toBe('60%')
    expect(svg.find('rect.ci').attr('width')).toBe('30%')
    expect(svg.find('line.zero').attr('x1')).toBe('50%')
    expect(svg.find('circle.pt').attr('cx')).toBe('75%')
    // The bar is at least as thick as the point is wide (LEAN-06).
    expect(Number(svg.find('rect.ci').attr('height'))).toBeGreaterThanOrEqual(
      2 * Number(svg.find('circle.pt').attr('r')),
    )
    expect(svg.find('.pt-label').text()).toBe('+0,25')
    expect(
      svg
        .find('text.end')
        .map((_, t) => $(t).text())
        .get(),
    ).toEqual(['+0,10', '+0,40'])
    // Only interval bars are rectangles: nothing shades the area around zero.
    expect($('rect').not('.ci')).toHaveLength(0)
    expect($('rect.ci')).toHaveLength(2)
    // Under "amostra pequena" the axis has neither point nor bar; the numbers stay as text.
    const g1 = $('li.lean-row').eq(2)
    expect(g1.find('svg .pt, svg .pt-label, svg .ci, svg .ci-end, svg .end')).toHaveLength(0)
    expect(
      g1
        .find('.sub span')
        .map((_, s) => $(s).text())
        .get(),
    ).toEqual(['com Lula +0,10, 12 falas', 'com Flávio 0,00, 9 falas'])
    expect(g1.find('.rule').text()).toBe('Amostra pequena.')
    expect(g1.find('.nums').text()).toBe(
      'Distância −0,10. Menos de 10 falas de um dos candidatos, sem intervalo.',
    )
    expect($('li.lean-row').eq(3).find('svg .pt, svg .ci')).toHaveLength(0)
    expect(
      $('.axis text')
        .map((_, t) => $(t).text())
        .get(),
    ).toEqual(['−0,50', '−0,25', '0', '+0,25', '+0,50'])
  })

  it('widens the scale in steps of 0.25 up to 1 and of 0.5 past it, never under 0.5', () => {
    const wide = [{ ...result[0], interval: [0.3, 1.1], distance: 0.7 }]
    expect(axisDomain(wide as never)).toBe(1.5)
    expect(axisDomain([{ ...result[0], interval: [-0.02, 0.03], distance: 0 }] as never)).toBe(0.5)
    expect(axisDomain([{ ...result[0], interval: [-0.7, 0.1], distance: -0.3 }] as never)).toBe(
      0.75,
    )
    // A small sample draws nothing, so its distance does not widen the scale.
    expect(axisDomain([result[1], { ...result[2], distance: -1.8 }] as never)).toBe(0.5)
  })

  it('always has a "0" tick, every 0.25 up to 1 and every 0.5 past it', () => {
    const ticks = (lo: number, hi: number) => {
      const one = [{ ...result[0], interval: [lo, hi], distance: (lo + hi) / 2 }]
      const $ = load(leanHtml(ctx, one as never))
      return $('.axis text')
        .map((_, t) => $(t).text())
        .get()
    }
    // Largest end 0.9: each side reaches 1.
    expect(ticks(-0.2, 0.9)).toEqual([
      '−1,00',
      '−0,75',
      '−0,50',
      '−0,25',
      '0',
      '+0,25',
      '+0,50',
      '+0,75',
      '+1,00',
    ])
    // Largest end 1.1 would reach 1.25; past 1 it rounds up to 1.5.
    expect(ticks(-0.2, 1.1)).toEqual(['−1,50', '−1,00', '−0,50', '0', '+0,50', '+1,00', '+1,50'])
    // Largest end 1.6 would reach 1.75; it rounds up to 2.
    expect(ticks(-1.6, 0.2)).toEqual([
      '−2,00',
      '−1,50',
      '−1,00',
      '−0,50',
      '0',
      '+0,50',
      '+1,00',
      '+1,50',
      '+2,00',
    ])
  })
})

describe('coverage table (RIGOR-01, RIGOR-03, RIGOR-05)', () => {
  const cov = (debate: string | null) =>
    coverage(
      ctx,
      createComparison(
        ctx,
        fixtureGroups(),
        records.map((r) => r.id),
      ),
      debate,
    )
  const cellTexts = (html: string) => {
    const $ = load(html)
    return $('tbody tr')
      .map((_, tr) => [
        [
          $(tr).find('th').text(),
          ...$(tr)
            .find('td')
            .map((_, td) =>
              $(td)
                .find('.line')
                .map((_, l) => $(l).text())
                .get()
                .join(' | '),
            )
            .get(),
        ],
      ])
      .get()
  }

  it('lists agencies by name and candidates in ballot order, with no total per agency', () => {
    const $ = load(coverageHtml(ctx, cov(null)))
    expect(
      $('thead th')
        .map((_, th) => $(th).text())
        .get(),
    ).toEqual(['Agência', 'Lula', 'Flávio'])
    expect(
      $('tbody th')
        .map((_, th) => $(th).text())
        .get(),
    ).toEqual(['Aos Fatos', 'Estadão Verifica', 'g1 Fato ou Fake', 'Lupa'])
    expect($('tbody tr td')).toHaveLength(8)
    expect($.text()).not.toMatch(/total/i)
  })

  it('shows one mark per claim, filled where the agency checked it, with the counts', () => {
    const band = 'band-2026-10-18'
    expect(cellTexts(coverageHtml(ctx, cov(band)))[2]).toEqual([
      'g1 Fato ou Fake',
      '2 de 2 falas | 0 só ela checou',
      '1 de 2 falas | 1 só ela checou',
    ])
    const $ = load(coverageHtml(ctx, cov(band)))
    const cell = $('tbody tr').eq(2).find('td').eq(1).find('.marks')
    expect(cell.attr('role')).toBe('img')
    expect(cell.attr('aria-label')).toBe('g1 Fato ou Fake checou 1 de 2 falas de Flávio')
    expect(
      cell
        .find('i')
        .map((_, i) => $(i).hasClass('on'))
        .get(),
    ).toEqual(cov(band)[1].outlets[2].marks)
    expect(cell.find('i')).toHaveLength(2)
  })

  it('marks "amostra pequena" only in cells based on fewer than 10 claims', () => {
    const column = (short: string, outlets: unknown[]) => ({ candidate: { short }, outlets })
    const cell = (of: number) => ({ outlet: 'g1', n: 1, of, marks: [], solo: 0 })
    const four = <T>(f: () => T) => [0, 1, 2, 3].map(f)
    const $ = load(
      coverageHtml(ctx, [
        column(
          'Lula',
          four(() => cell(9)),
        ),
        column(
          'Flávio',
          four(() => cell(10)),
        ),
      ] as never),
    )
    expect(
      $('tbody td')
        .map((_, td) => $(td).find('.small').text())
        .get(),
    ).toEqual(four(() => ['amostra pequena', '']).flat())
  })
})

describe('driftCountsHtml (DRIFT-04)', () => {
  it('writes each kind of band change per agency and candidate, or "nenhuma mudança"', () => {
    const cell = (outlet: string, harsher = 0, milder = 0, gained = 0, lost = 0) => ({
      outlet,
      harsher,
      milder,
      gained,
      lost,
    })
    const counts = [
      {
        candidate: { short: 'Lula' },
        outlets: [cell('aosfatos'), cell('estadao', 2, 1), cell('g1', 0, 0, 1, 2), cell('lupa')],
      },
      {
        candidate: { short: 'Flávio' },
        outlets: [cell('aosfatos', 1), cell('estadao'), cell('g1'), cell('lupa', 0, 2, 2, 1)],
      },
    ]
    const $ = load(driftCountsHtml(ctx, counts as never))
    expect(
      $('tbody tr')
        .map((_, tr) => [
          [
            $(tr).find('th').text(),
            ...$(tr)
              .find('td')
              .map((_, td) =>
                $(td)
                  .find('.line')
                  .map((_, l) => $(l).text())
                  .get()
                  .join(' | '),
              )
              .get(),
          ],
        ])
        .get(),
    ).toEqual([
      ['Aos Fatos', 'nenhuma mudança', '1 ficou mais dura'],
      ['Estadão Verifica', '2 ficaram mais duras | 1 ficou mais branda', 'nenhuma mudança'],
      ['g1 Fato ou Fake', '1 ganhou faixa | 2 perderam a faixa', 'nenhuma mudança'],
      ['Lupa', 'nenhuma mudança', '2 ficaram mais brandas | 2 ganharam faixa | 1 perdeu a faixa'],
    ])
    expect(
      $('thead th')
        .map((_, th) => $(th).text())
        .get(),
    ).toEqual(['Agência', 'Lula', 'Flávio'])
  })
})

describe('changeHtml and changesHtml (DRIFT-03)', () => {
  // g1 5: "#FATO" until 24/10, "#FAKE" since; the quote edited on 25/10; the key changed on 26/10.
  const record = () => ({
    ...byId(5),
    label: '#FAKE',
    band: 'falso' as const,
    quote: 'O desemprego caiu para 5% em 2026',
    key: 'k2',
    history: [
      { label: '#FATO', until: '2026-10-24' },
      { quote: 'O desemprego caiu para 6% em 2025', until: '2026-10-25' },
      { key: 'k1', until: '2026-10-26' },
    ],
  })

  it('shows every version with its label, band, dates and what changed, and the quote diff', () => {
    const $ = load(changeHtml(record(), ctx))
    expect($('li.change').attr('data-debate')).toBe('band-2026-10-18')
    expect($('.meta').text()).toBe('g1 Fato ou Fake, debate da Band, 18/10, ler a checagem')
    expect($('.meta a').attr('href')).toBe(byId(5).url)
    expect($('.q').text()).toBe('Flávio: “O desemprego caiu para 5% em 2026”')
    expect(
      $('.tl > li')
        .map((_, li) => [
          [
            $(li).find('.v').text(),
            $(li).find('.v .dot').attr('class'),
            $(li).find('.b').text(),
            $(li).find('.dir').text(),
            $(li).find('.d').text(),
          ],
        ])
        .get(),
    ).toEqual([
      ['#FATO', 'dot band-verdadeiro', 'verdadeiro', '', 'até 24/10'],
      ['#FAKE', 'dot band-falso', 'falso', 'ficou mais dura', 'de 24/10 a 25/10'],
      ['#FAKE', 'dot band-falso', 'falso', 'editou a citação', 'de 25/10 a 26/10'],
      [
        '#FAKE',
        'dot band-falso',
        'falso',
        'a agência trocou o identificador interno',
        'desde 26/10, versão atual',
      ],
    ])
    expect($('.tl > li.now')).toHaveLength(1)
    expect($('.qdiff').text()).toBe(
      'Citação editada em 25/10: O desemprego caiu para 6% 5% em 2025 2026',
    )
    expect(
      $('.qdiff del')
        .map((_, d) => $(d).text())
        .get(),
    ).toEqual(['6%', '2025'])
    expect(
      $('.qdiff ins')
        .map((_, d) => $(d).text())
        .get(),
    ).toEqual(['5%', '2026'])
    // A quote-only entry keeps the label: no version without one, no band gained.
    expect($.text()).not.toMatch(/sem selo|ganhou faixa/)
  })

  it('folds records whose only change is the internal key, and keeps the given order', () => {
    const keyOnly = { ...byId(8), key: 'k2', history: [{ key: 'k1', until: '2026-10-24' }] }
    const labelled = record()
    const $ = load(changesHtml([keyOnly, labelled], ctx))
    expect(
      $('#changes > li')
        .map((_, li) => li.attribs['data-id'])
        .get(),
    ).toEqual([labelled.id])
    const folded = $('details#keyonly')
    expect(folded.find('summary').text()).toBe(
      '1 checagem só trocou o identificador interno, sem mudar rótulo nem citação',
    )
    expect(
      folded
        .find('li.change')
        .map((_, li) => li.attribs['data-id'])
        .get(),
    ).toEqual([keyOnly.id])
    expect(folded.find('.tl > li .dir').text()).toBe('a agência trocou o identificador interno')
    const none = load(changesHtml([], ctx))
    expect(none('#changes').text()).toBe('Nenhuma checagem mudou de rótulo nem de citação.')
    expect(none('details')).toHaveLength(0)
  })
})

describe('compareFiltersHtml (CMP-03)', () => {
  it('offers the candidates in ballot order and the divergence toggle, with row counts', () => {
    const rows = createComparison(
      ctx,
      fixtureGroups(),
      records.map((r) => r.id),
    ).rows
    const state = { ...emptyCompareState(), div: true }
    const $ = load(compareFiltersHtml(ctx, rows, state, 3))
    expect(
      $('select[data-key="speaker"] option')
        .map((_, o) => $(o).text())
        .get(),
    ).toEqual(['Todos', 'Lula (1)', 'Flávio (2)'])
    expect($('input[data-div]').is(':checked')).toBe(true)
    expect($('label.toggle').text()).toBe('Só divergências (3)')
    expect($('.count').text()).toBe('3 falas')
  })
})

describe('pendingText (CMP-06)', () => {
  it('states how many published records are not grouped yet, and nothing when none', () => {
    expect(pendingText(2)).toBe(
      '2 checagens publicadas depois da última revisão ainda não foram agrupadas.',
    )
    expect(pendingText(0)).toBe('')
  })
})
