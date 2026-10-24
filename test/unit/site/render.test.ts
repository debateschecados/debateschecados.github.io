import { join } from 'node:path'
import { load } from 'cheerio'
import { beforeAll, describe, expect, it } from 'vitest'
import { createContext, emptyState, listed, scoreboard } from '../../../site/core.js'
import { boardHtml, itemHtml } from '../../../site/render.js'
import { type Config, loadConfig } from '../../../src/config.ts'
import type { CheckRecord } from '../../../src/types.ts'
import { fixtureRecords } from '../../fixtures/site.ts'

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
