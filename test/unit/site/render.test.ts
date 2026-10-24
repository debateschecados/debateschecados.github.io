import { join } from 'node:path'
import { load } from 'cheerio'
import { beforeAll, describe, expect, it } from 'vitest'
import { coverage, createComparison, emptyCompareState, rigor } from '../../../site/compare.js'
import { createContext, emptyState, listed, scoreboard } from '../../../site/core.js'
import {
  boardHtml,
  compareFiltersHtml,
  compareRowHtml,
  coverageHtml,
  itemHtml,
  pendingText,
  rigorHtml,
} from '../../../site/render.js'
import { type Config, loadConfig } from '../../../src/config.ts'
import type { CheckRecord } from '../../../src/types.ts'
import { fixtureGroupId, fixtureGroups, fixtureRecords } from '../../fixtures/site.ts'

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

describe('compareRowHtml (CMP-01, CMP-02)', () => {
  const row = (letter: string) => {
    const rows = createComparison(
      ctx,
      fixtureGroups(),
      records.map((r) => r.id),
    ).rows
    return load(compareRowHtml(rows.find((r) => r.id === fixtureGroupId(letter)) as never, ctx))(
      'li.claim',
    )
  }
  // Agency name and verdict text of each cell, in page order.
  const cells = (li: ReturnType<typeof row>) =>
    li
      .find('.cells > li')
      .toArray()
      .map((c) => [li.find(c).find('.agency').text(), li.find(c).find('.chip, .none').text()])

  it('shows speaker, debate, claim, group id and each agency verdict linked to the agency item', () => {
    const li = row('A')
    expect(li.attr('data-id')).toBe(fixtureGroupId('A'))
    expect(li.find('.who').text()).toBe('Lula no debate da Band, 18/10')
    expect(li.find('.said p').text()).toBe('Alegação de teste A, inventada para a suíte do site.')
    expect(li.find('.gid').text()).toBe(fixtureGroupId('A'))
    expect(cells(li)).toEqual([
      ['Aos Fatos', 'Falso'],
      ['Estadão Verifica', 'Verdadeiro'],
      ['g1 Fato ou Fake', 'Verdadeiro'],
      ['Lupa', 'Verdadeiro'],
    ])
    const chip = li.find('a.chip').first()
    expect(chip.attr('href')).toBe(byId(14).url)
    expect(chip.hasClass('band-falso')).toBe(true)
    expect(
      li
        .find('a.chip')
        .map((_, a) => a.attribs.title)
        .get(),
    ).toEqual([14, 12, 8, 4].map((n) => `Rótulo da agência: ${byId(n).label}`))
  })

  it('writes "não checou" in the cell of an agency with no record in the group', () => {
    const li = row('B')
    expect(cells(li)).toEqual([
      ['Aos Fatos', 'não checou'],
      ['Estadão Verifica', 'não checou'],
      ['g1 Fato ou Fake', 'Falso'],
      ['Lupa', 'Falso'],
    ])
    expect(
      li
        .find('a.chip')
        .map((_, a) => a.attribs.href)
        .get(),
    ).toEqual([byId(6).url, byId(2).url])
  })
})

describe('coverage and rigor tables (RIGOR-03, RIGOR-05)', () => {
  const cmp = () =>
    createComparison(
      ctx,
      fixtureGroups(),
      records.map((r) => r.id),
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
    for (const html of [
      coverageHtml(ctx, coverage(ctx, cmp(), null)),
      rigorHtml(ctx, rigor(ctx, cmp(), null)),
    ]) {
      const $ = load(html)
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
    }
  })

  it('shows coverage and the comparisons of each agency and candidate', () => {
    const band = 'band-2026-10-18'
    expect(cellTexts(coverageHtml(ctx, coverage(ctx, cmp(), band)))[2]).toEqual([
      'g1 Fato ou Fake',
      '2 de 2 alegações | 0 só ela checou',
      '1 de 2 alegações | 1 só ela checou',
    ])
    expect(cellTexts(rigorHtml(ctx, rigor(ctx, cmp(), band)))[0]).toEqual([
      'Aos Fatos',
      '3 mais dura | 0 igual | 0 mais branda',
      '0 mais dura | 0 igual | 0 mais branda',
    ])
  })

  it('marks "amostra pequena" only in cells based on fewer than 10 claims or comparisons', () => {
    const column = (short: string, outlets: unknown[]) => ({ candidate: { short }, outlets })
    const cov = (of: number) => ({ outlet: 'x', n: 1, of, solo: 0 })
    const rig = (n: number) => ({ outlet: 'x', harsher: n, equal: 0, milder: 0, n })
    const four = <T>(f: () => T) => [0, 1, 2, 3].map(f)
    const marks = (html: string) => {
      const $ = load(html)
      return $('tbody td')
        .map((_, td) => $(td).find('.small').text())
        .get()
    }
    expect(
      marks(
        coverageHtml(ctx, [
          column(
            'Lula',
            four(() => cov(9)),
          ),
          column(
            'Flávio',
            four(() => cov(10)),
          ),
        ] as never),
      ),
    ).toEqual(four(() => ['amostra pequena', '']).flat())
    expect(
      marks(
        rigorHtml(ctx, [
          column(
            'Lula',
            four(() => rig(10)),
          ),
          column(
            'Flávio',
            four(() => rig(9)),
          ),
        ] as never),
      ),
    ).toEqual(four(() => ['', 'amostra pequena']).flat())
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
    expect($('.count').text()).toBe('3 alegações')
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
