import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type CheerioAPI, load } from 'cheerio'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pkg from '../../../package.json' with { type: 'json' }
import { createComparison } from '../../../site/compare.js'
import { createContext, emptyState, listed } from '../../../site/core.js'
import { B, deviations, headline, lean, MIN_N, sentence } from '../../../site/lean.js'
import { leanHtml } from '../../../site/render.js'
import { type Config, loadConfig } from '../../../src/config.ts'
import type { CheckRecord } from '../../../src/types.ts'
import {
  buildFixture,
  FIXTURE_GROUPS,
  FIXTURE_PENDING,
  fixtureGroupId,
  fixtureGroups,
  fixtureRecords,
  recordId,
} from '../../fixtures/site.ts'

const ROOT = join(import.meta.dirname, '../../..')
const REPO = pkg.repository

let tmp: string
let outDir: string
let dataDir: string
let records: CheckRecord[]
let config: Config
let index: CheerioAPI
let method: CheerioAPI
let compare: CheerioAPI
let indexHtml: string

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'site-build-'))
  ;({ outDir, dataDir, records } = await buildFixture(tmp))
  config = await loadConfig(join(ROOT, 'config'))
  indexHtml = await readFile(join(outDir, 'index.html'), 'utf8')
  index = load(indexHtml)
  method = load(await readFile(join(outDir, 'metodologia.html'), 'utf8'))
  compare = load(await readFile(join(outDir, 'comparar.html'), 'utf8'))
})
afterAll(() => rm(tmp, { recursive: true, force: true }))

const found = () => records.filter((r) => !r.missingSince)

describe('index.html (SITE-01)', () => {
  it('pre-renders one <li data-id> per record, in display order, without JavaScript', () => {
    const items = index('#list > li[data-id]')
    expect(items).toHaveLength(records.length)
    const ctx = createContext({ ...config, records })
    expect(items.map((_, li) => li.attribs['data-id']).get()).toEqual(ctx.records.map((r) => r.id))
    const removed = index('#list > li.removed')
    expect(
      removed
        .map((_, li) => li.attribs['data-id'])
        .get()
        .sort(),
    ).toEqual(
      records
        .filter((r) => r.missingSince)
        .map((r) => r.id)
        .sort(),
    )
    expect(index('#list li[data-id="000000000012"] .verdict').attr('title')).toBe(
      `Rótulo da agência: ${records[17].label}`,
    )
  })

  it('inlines records and config as JSON that a quote cannot break out of', () => {
    const data = JSON.parse(index('script#data[type="application/json"]').text())
    expect(data.records).toEqual(records)
    expect(data.candidates).toEqual(config.candidates)
    expect(data.outlets).toEqual(config.outlets)
    expect(data.debates.map((d: { id: string }) => d.id)).toEqual(config.debates.map((d) => d.id))
    // Only the data script and app.js close a script; the quote's "</script>" stays inert.
    expect(indexHtml.match(/<\/script>/g)).toHaveLength(2)
    expect(index('script')).toHaveLength(2)
  })

  it('pre-renders the general scoreboard, notice and both sprites in ballot order', () => {
    const totals = index('#board .cand')
      .map((_, c) => [[c.attribs['data-speaker'], index(c).find('.total .n').text()]])
      .get()
    expect(totals).toEqual([
      ['lula', String(found().filter((r) => r.speaker === 'lula').length)],
      ['flavio', String(found().filter((r) => r.speaker === 'flavio').length)],
    ])
    expect(index('#notice').text()).toBe(
      'Cada agência escolhe o que checar. A mesma fala pode aparecer uma vez por agência, então este placar soma checagens, não falas.',
    )
    const fighters = index('#duel .fighter')
    expect(fighters.map((_, f) => `${f.attribs['data-sprite']}:${f.attribs.class}`).get()).toEqual([
      'lula:fighter left',
      'flavio:fighter right',
    ])
    expect(fighters.find('g.m-a')).toHaveLength(2)
    expect(index('#filters .count .n').text()).toBe(
      String(listed(createContext({ ...config, records }), emptyState()).length),
    )
  })

  it('links the audit panel to the repository, data, band table and history', () => {
    const links = index('dialog#audit .links a')
      .map((_, a) => a.attribs.href)
      .get()
    expect(links).toEqual([
      REPO,
      `${REPO}/tree/main/data`,
      `${REPO}/blob/main/config/bands.json`,
      `${REPO}/commits/main`,
    ])
    const prompt = index('#prompt').text()
    expect(prompt).toContain(`Código e dados: ${REPO}\n`)
    expect(prompt).toContain(`Todas as checagens: ${REPO}/blob/main/data/checks.csv\n`)
    expect(prompt.match(/^\d\. /gm)).toEqual(['1. ', '2. ', '3. ', '4. ', '5. '])
    expect(indexHtml).not.toMatch(/\{\{|<!--[a-z]+-->/)
    expect(index('footer a[href="checks.csv"]')).toHaveLength(1)
    expect(index('footer a[href="metodologia.html"]')).toHaveLength(1)
  })

  it('puts the trust line and the audit control right below the subtitle (AUDIT-01)', () => {
    const trust = index('.hero > h1 + p + p.trust')
    expect(trust).toHaveLength(1)
    expect(trust.text().replace(/\s+/g, ' ').trim()).toBe(
      'O veredito é sempre da agência. Código e dados são abertos. Veja como auditar',
    )
    expect(trust.children().last().is('button[data-open-audit]')).toBe(true)
  })

  it('shows agency text that looks like a template slot as plain text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'site-build-'))
    try {
      const quote = 'usou o termo {{fake}}, {{data}} e {{repo}} no debate'
      const odd = { ...fixtureRecords()[0], quote, label: '{{list}}' }
      const built = await buildFixture(dir, [odd, ...fixtureRecords().slice(1)])
      const $ = load(await readFile(join(built.outDir, 'index.html'), 'utf8'))
      const li = $(`#list li[data-id="${odd.id}"]`)
      expect(li.find('.quote').text()).toBe(`“${quote}”`)
      expect(li.find('.verdict').attr('title')).toBe('Rótulo da agência: {{list}}')
      expect(JSON.parse($('script#data').text()).records[0]).toEqual(odd)
      expect($('#list > li[data-id]')).toHaveLength(records.length)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('metodologia.html (DATA-03, DATA-07, AUDIT-08)', () => {
  const tables = () => method('table')

  it('lists all 21 labels of config/bands.json with their bands', () => {
    const rows = tables()
      .eq(1)
      .find('tbody tr')
      .map((_, tr) => [
        method(tr)
          .find('td')
          .map((_, td) => method(td).text())
          .get(),
      ])
      .get()
    const expected = Object.entries(config.bands).flatMap(([outlet, entries]) =>
      entries.map((e) => [
        config.outlets[outlet].name,
        e.label,
        {
          verdadeiro: 'Verdadeiro',
          impreciso: 'Impreciso',
          falso: 'Falso',
          'sem faixa': 'Sem faixa',
        }[e.band],
      ]),
    )
    expect(rows).toHaveLength(21)
    expect(new Set(rows.map((r) => r.join('|')))).toEqual(new Set(expected.map((r) => r.join('|'))))
  })

  it('counts each label per candidate from the data, leaving removed records out', () => {
    const head = tables()
      .eq(2)
      .find('thead th')
      .map((_, th) => method(th).text())
      .get()
    expect(head).toEqual(['Agência', 'Rótulo', 'Faixa', 'Lula', 'Flávio'])
    const rows = tables()
      .eq(2)
      .find('tbody tr')
      .map((_, tr) => [
        method(tr)
          .find('td')
          .map((_, td) => method(td).text())
          .get(),
      ])
      .get() as string[][]
    expect(rows).toHaveLength(21)
    for (const [outletName, label, , lula, flavio] of rows) {
      const outlet = Object.keys(config.outlets).find((o) => config.outlets[o].name === outletName)
      const count = (speaker: string) =>
        found().filter((r) => r.outlet === outlet && r.label === label && r.speaker === speaker)
          .length
      expect([label, Number(lula), Number(flavio)]).toEqual([label, count('lula'), count('flavio')])
    }
    const lupaFalta = rows.find((r) => r[0] === 'Lupa' && r[1] === 'FALTA CONTEXTO')
    // Fixture: one FALTA CONTEXTO for Lula, one for Flávio that was removed.
    expect(lupaFalta?.slice(3)).toEqual(['1', '0'])
    expect(rows.find((r) => r[1] === 'é subestimado')?.slice(3)).toEqual(['0', '0'])
  })

  it('adds a label found in the data but missing from the table as Sem faixa', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'site-build-'))
    try {
      const extra = {
        ...fixtureRecords()[0],
        id: 'ffffffffffff',
        label: 'AINDA É CEDO',
        band: 'sem faixa' as const,
      }
      const built = await buildFixture(dir, [...fixtureRecords(), extra])
      const $ = load(await readFile(join(built.outDir, 'metodologia.html'), 'utf8'))
      const row = $('table')
        .eq(2)
        .find('tbody tr')
        .filter((_, tr) => $(tr).find('td').eq(1).text() === 'AINDA É CEDO')
      expect(
        row
          .find('td')
          .map((_, td) => $(td).text())
          .get(),
      ).toEqual(['Lupa', 'AINDA É CEDO', 'Sem faixa', '0', '1'])
      expect($('table').eq(1).find('tbody tr')).toHaveLength(21)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('states the candidate order rule, how to report an error and the credits', () => {
    const text = method('main').text().replace(/\s+/g, ' ')
    expect(text).toContain(
      'ordem crescente do número de urna: 13, Luiz Inácio Lula da Silva; 22, Flávio Nantes Bolsonaro.',
    )
    expect(method(`a[href="${REPO}/issues"]`)).toHaveLength(1)
    expect(text).toContain('Abra uma issue')
    expect(text).toContain('Palácio do Planalto (CC BY 2.0)')
    expect(text).toContain('Agência Senado')
    expect(text).toContain('Wikimedia Commons')
    expect(text).toContain('SIL Open Font License')
    const sources = tables().eq(0).find('tbody tr')
    expect(sources).toHaveLength(8)
    expect(
      sources
        .first()
        .find('td')
        .map((_, td) => method(td).text())
        .get(),
    ).toEqual(['Globo, 23/10/2026', 'Aos Fatos', 'página da agência', 'aosfatos'])
  })
})

describe('metodologia.html, distance and changed verdicts (LEAN-08)', () => {
  // The text from an h2 up to the next one, with whitespace collapsed.
  const section = (title: string) => {
    const h2 = method('h2').filter((_, h) => method(h).text() === title)
    expect(h2).toHaveLength(1)
    const body = h2.nextUntil('h2')
    return { h2, body, text: body.text().replace(/\s+/g, ' ') }
  }

  it('explains the formula, scale, interval, sentence rule and limits, and links the spec', () => {
    const { h2, body, text } = section('Distância das outras agências')
    // The comparison page's method note points here.
    expect(h2.attr('id')).toBe('distancia')
    expect(compare('#method-note a').attr('href')).toBe(`metodologia.html#${h2.attr('id')}`)
    expect(text).toContain('verdadeiro 0, impreciso 1, falso 2')
    expect(text).toContain('Checagens em “Sem faixa” ficam de fora.')
    expect(text).toContain('o número dela menos a média do número das outras')
    // The worked example gives what lean.js computes for falso, verdadeiro, impreciso.
    expect(text).toContain('o desvio da Lupa é 2 − 0,5 = +1,5')
    const [lupa] = deviations([
      {
        speaker: 'lula',
        cells: [
          { outlet: 'lupa', band: 'falso' },
          { outlet: 'g1', band: 'verdadeiro' },
          { outlet: 'estadao', band: 'impreciso' },
        ],
      },
    ] as never)
    expect(lupa.value).toBe(1.5)
    expect(text).toContain(
      'A distância é a média nas falas de Flávio Bolsonaro menos a média nas falas de Lula.',
    )
    expect(text).toContain(`recalcula a distância ${B} vezes`)
    expect(text).toContain('entre o 5º e o 95º percentil')
    expect(text).toContain('gerador fixo, então os mesmos dados dão sempre os mesmos números')
    const ctx = createContext({ ...config, records: [] })
    for (const [rule, verdict] of [
      ['intervalo que contém o zero', 'none'],
      ['intervalo todo acima de zero', 'c2'],
      ['intervalo todo abaixo de zero', 'c1'],
    ] as const) {
      expect(text).toContain(`${rule}: “${sentence(verdict, ctx)}”`)
    }
    expect(text).toContain(`menos de ${MIN_N} desvios para algum dos candidatos: “amostra pequena”`)
    expect(text).toContain(
      'A regra olha as pontas do intervalo arredondadas para duas casas, como a página mostra: uma ponta que aparece como 0,00 conta como zero.',
    )
    expect(sentence('small', ctx)).toBe('amostra pequena')
    expect(text).toContain(
      'Uma agência com amostra pequena nunca conta como “sem diferença clara”: a frase diz à parte quais têm amostra pequena e, se todas têm, que nenhuma agência tem falas suficientes para medir a diferença.',
    )
    for (const limit of [
      'a conta só usa falas que duas ou mais agências checaram',
      'o que cada agência escolheu checar, e o que deixou de checar, não entra',
      'não quem acertou, e não prova favorecimento',
    ]) {
      expect(text).toContain(limit)
    }
    const spec = '.specs/features/agency-comparator/spec.md'
    expect(body.find('a').attr('href')).toBe(`${REPO}/blob/main/${spec}`)
    expect(existsSync(join(ROOT, spec))).toBe(true)
  })

  it('explains how changed verdicts are kept, counted and marked, with the repair report', async () => {
    const { body, text } = section('Vereditos que mudaram')
    expect(text).toContain('Quando o rótulo, a citação ou o identificador interno')
    expect(text).toContain('com a data em que a coleta percebeu a mudança')
    expect(text).toContain('A faixa de um rótulo antigo é a que ele tem hoje na tabela de faixas.')
    expect(text).toContain('mostra as palavras tiradas e as acrescentadas')
    expect(text).toContain(
      'as mudanças de faixa na ordem verdadeiro < impreciso < falso: mais dura, mais branda, ganhou faixa (saiu de “Sem faixa”) ou perdeu a faixa',
    )
    expect(text).toContain('o detalhe da fala mostra a faixa anterior')
    const report = 'data/repairs/2026-10-24-estadao.json'
    const links = body
      .find('a')
      .map((_, a) => a.attribs.href)
      .get()
    expect(links).toEqual(['comparar.html#mudancas', `${REPO}/blob/main/${report}`])
    expect(compare('section#mudancas')).toHaveLength(1)
    expect(existsSync(join(ROOT, report))).toBe(true)

    const readme = await readFile(join(ROOT, 'README.md'), 'utf8')
    const comparator = readme.slice(readme.indexOf('\n## Comparador\n'))
    expect(comparator.slice(0, comparator.indexOf('\n## ', 1))).toMatch(
      /```sh\npnpm lean\n```[\s\S]*`src\/repair\/estadao-2026-10-24\.ts`[\s\S]*`data\/repairs\/2026-10-24-estadao\.json`/,
    )
  })
})

describe('credits (AUDIT-08)', () => {
  const credits = [
    'Ilustrações feitas a partir de retratos oficiais: Palácio do Planalto (CC BY 2.0) e Agência Senado.',
    'Logos dos partidos e das emissoras: Wikimedia Commons.',
  ]

  it.each(['index.html', 'metodologia.html'])(
    'credits portraits and logos in the %s footer',
    (file) => {
      const page = file === 'index.html' ? index : method
      const text = page('footer').text().replace(/\s+/g, ' ')
      for (const credit of credits) expect(text).toContain(credit)
    },
  )

  it('names each portrait source, the logo source and the font license on the methodology page', () => {
    const items = method('main li')
      .map((_, li) => method(li).text().replace(/\s+/g, ' ').trim())
      .get()
    expect(items).toContain(
      'Ilustrações desenhadas a partir dos retratos oficiais: Luiz Inácio Lula da Silva, por Palácio do Planalto (CC BY 2.0); Flávio Bolsonaro, por Agência Senado. Os dois retratos estão no Wikimedia Commons.',
    )
    expect(items).toContain(
      'Logos dos partidos e das emissoras: Wikimedia Commons. São marcas dos seus donos, usadas só para identificar.',
    )
    expect(items).toContain('Fontes Inter e Inter Tight, licença SIL Open Font License 1.1.')
  })
})

describe('dist layout (DATA-01, DATA-05)', () => {
  it('holds the dataset files and the band table, and nothing else besides site/', async () => {
    for (const [file, source] of [
      ['checks.json', join(dataDir, 'checks.json')],
      ['checks.csv', join(dataDir, 'checks.csv')],
      ['run-report.json', join(dataDir, 'run-report.json')],
      ['bands.json', join(ROOT, 'config/bands.json')],
      ['claim-groups.json', join(dataDir, 'claim-groups.json')],
    ]) {
      expect(await readFile(join(outDir, file), 'utf8'), file).toBe(await readFile(source, 'utf8'))
    }
    const site = (await readdir(join(ROOT, 'site'), { recursive: true, withFileTypes: true }))
      .filter((d) => d.isFile() && !d.name.endsWith('.py'))
      .map((d) => join(d.parentPath, d.name).slice(join(ROOT, 'site').length + 1))
    const dist = (await readdir(outDir, { recursive: true, withFileTypes: true }))
      .filter((d) => d.isFile())
      .map((d) => join(d.parentPath, d.name).slice(outDir.length + 1))
    expect(dist.sort()).toEqual(
      [
        ...site,
        'checks.json',
        'checks.csv',
        'run-report.json',
        'bands.json',
        'claim-groups.json',
      ].sort(),
    )
    expect(dist.filter((f) => f.endsWith('.html')).sort()).toEqual([
      'comparar.html',
      'index.html',
      'metodologia.html',
    ])
  })
})

describe('comparar.html (CMP-01, CMP-06, CMP-08, LEAN-06, DRIFT-03)', () => {
  const OUTLETS = ['aosfatos', 'estadao', 'g1', 'lupa']
  const text = (sel: string) => compare(sel).text().replace(/\s+/g, ' ').trim()

  it('pre-renders the matrix: per debate and candidate, one button per group with two or more live records', () => {
    // D lost its Lupa record (removed at the source) and has one record left.
    // Globo: Lula F, E; Flávio G, H. Band: Lula A, B; Flávio I, C.
    const buttons = compare('#matrix button.claim')
    expect(buttons.map((_, b) => b.attribs['data-id']).get()).toEqual(
      ['F', 'E', 'G', 'H', 'A', 'B', 'I', 'C'].map(fixtureGroupId),
    )
    buttons.each((_, b) => {
      const letter = Object.keys(FIXTURE_GROUPS).find(
        (l) => fixtureGroupId(l) === b.attribs['data-id'],
      )
      const members = FIXTURE_GROUPS[letter as string]
        .map((n) => records[n - 1])
        .filter((r) => !r.missingSince)
      const dots = compare(b).find('.dots .dot')
      expect(dots).toHaveLength(4)
      OUTLETS.forEach((outlet, i) => {
        const record = members.find((r) => r.outlet === outlet)
        const name = config.outlets[outlet].name
        const dot = dots.eq(i)
        expect(dot.attr('role')).toBe('img')
        if (!record) {
          expect(dot.attr('class')).toBe('dot none')
          expect(dot.attr('aria-label')).toMatch(
            new RegExp(`^${name}: não checou\\. Alegação de teste ${letter},`),
          )
          return
        }
        expect(dot.hasClass(`band-${record.band.replace(' ', '-')}`)).toBe(true)
        expect(dot.attr('aria-label')).toContain(`${name}: ${record.band}`)
        expect(dot.attr('aria-label')).toContain(`Alegação de teste ${letter},`)
      })
      expect(compare(b).find('.txt').text()).toBe(
        `Alegação de teste ${letter}, inventada para a suíte do site.`,
      )
    })
    expect(compare('#matrix .dot.none')).toHaveLength(10)
    // g1 5 in I changed from "#FAKE" to "#FATO": its dot is marked (DRIFT-05).
    expect(
      compare('#matrix .dot.moved')
        .map((_, d) => d.attribs['aria-label'])
        .get(),
    ).toEqual([
      'g1 Fato ou Fake: verdadeiro, antes falso. Alegação de teste I, inventada para a suíte do site',
    ])
    expect(compare('#matrix').attr('style')).toBe('--agencies: 4')
    expect(compare('#detail').attr('hidden')).toBe('hidden')
    // A section with a name is a region landmark.
    expect(compare('#detail').prop('tagName')).toBe('SECTION')
    expect(compare('#detail').attr('aria-label')).toBe('Detalhe da fala')
    expect(compare('#detail').children()).toHaveLength(0)
  })

  it('has the four sections in order, linked from the page nav', () => {
    expect(
      compare('main > section')
        .map((_, s) => [[s.attribs.id, compare(s).children('h1, h2').text()]])
        .get(),
    ).toEqual([
      ['pende', 'As agências pendem para um lado?'],
      ['falas', 'Fala por fala'],
      ['cobertura', 'Quem checou o quê'],
      ['mudancas', 'Vereditos que mudaram'],
    ])
    expect(
      compare('nav.toc a')
        .map((_, a) => [[a.attribs.href, compare(a).text()]])
        .get(),
    ).toEqual([
      ['#pende', 'Pendem?'],
      ['#falas', 'Fala por fala'],
      ['#cobertura', 'Quem checou o quê'],
      ['#mudancas', 'Vereditos que mudaram'],
    ])
    // Every band by color and shape in the legend, with "não checou", a band change and divergence.
    expect(
      compare('#legend li')
        .map((_, li) => [[compare(li).find('i').attr('class'), compare(li).text()]])
        .get(),
    ).toEqual([
      ['dot band-verdadeiro', 'verdadeiro'],
      ['dot band-impreciso', 'impreciso'],
      ['dot band-falso', 'falso'],
      ['dot band-sem-faixa', 'sem faixa'],
      ['dot none', 'não checou'],
      ['dot band-impreciso moved', 'mudou de faixa depois de publicada'],
      ['divmark', 'divergência'],
    ])
  })

  it('opens with the headline and one axis per agency as lean.js computes them (LEAN-05, LEAN-06)', () => {
    const ctx = createContext({ ...config, records })
    const result = lean(ctx, createComparison(ctx, fixtureGroups(), []).rows)
    expect(text('#answer')).toBe(headline(result, ctx))
    expect(compare('#balance').html()).toBe(leanHtml(ctx, result))
    expect(
      compare('#balance li.lean-row')
        .map((_, li) => li.attribs['data-outlet'])
        .get(),
    ).toEqual(OUTLETS)
    expect(compare('#balance .lean-row svg[role="img"]')).toHaveLength(4)
    // The fixture is small: every agency has fewer than 10 deviations per candidate.
    expect(
      compare('#balance .rule')
        .map((_, r) => compare(r).text())
        .get(),
    ).toEqual(Array(4).fill('Amostra pequena.'))
    expect(text('#answer')).toBe(
      'Pelos dados de hoje, nenhuma agência tem falas suficientes para medir a diferença.',
    )
  })

  it('states the caveat and the method note next to the axes, above both tables (RIGOR-04, LEAN-06)', () => {
    expect(compare('#caveat').text()).toBe(
      'Cada agência escolhe o que checar e pode checar partes diferentes da mesma fala. Estes números mostram diferenças, não provam favorecimento.',
    )
    expect(compare('#caveat').closest('section').attr('id')).toBe('pende')
    const note = text('#method-note')
    for (const part of [
      'A conta só usa falas checadas por duas ou mais agências.',
      'A referência são as outras agências, não a verdade',
      'O que cada agência escolheu checar não entra na conta.',
    ])
      expect(note).toContain(part)
    expect(compare('#method-note a').attr('href')).toBe('metodologia.html#distancia')
    // Document order: the caveat comes before every table.
    expect(compare('#caveat, table').first().attr('id')).toBe('caveat')
    expect(compare('table')).toHaveLength(2)
    for (const id of ['#coverage', '#drift']) {
      expect(
        compare(`${id} thead th`)
          .map((_, th) => compare(th).text())
          .get(),
      ).toEqual(['Agência', 'Lula', 'Flávio'])
      expect(
        compare(`${id} tbody th`)
          .map((_, th) => compare(th).text())
          .get(),
      ).toEqual(OUTLETS.map((o) => config.outlets[o].name))
    }
    // Lupa, both debates: Lula in A, B, E, F; Flávio in C and G.
    const lupa = compare('#coverage tbody tr').eq(3).find('td').first()
    expect(lupa.find('.line').first().text()).toBe('4 de 4 falas')
    expect(lupa.find('.marks i.on')).toHaveLength(4)
    expect(compare('#pending').closest('section').attr('id')).toBe('cobertura')
  })

  it('lists the changed verdicts with their counts and timelines (DRIFT-03, DRIFT-04)', () => {
    // g1 5 (Band, Flávio) is "#FATO" now and was "#FAKE": one milder change.
    expect(
      compare('#drift tbody tr')
        .map((_, tr) => [
          compare(tr)
            .find('td')
            .map((_, td) => compare(td).text())
            .get(),
        ])
        .get(),
    ).toEqual([
      ['nenhuma mudança', 'nenhuma mudança'],
      ['nenhuma mudança', 'nenhuma mudança'],
      ['nenhuma mudança', '1 ficou mais branda'],
      ['nenhuma mudança', 'nenhuma mudança'],
    ])
    expect(
      compare('#changes > li.change')
        .map((_, li) => li.attribs['data-id'])
        .get(),
    ).toEqual([recordId(5)])
    expect(
      compare('#changes .tl > li')
        .map((_, li) => compare(li).find('.v').text())
        .get(),
    ).toEqual(['#FAKE', '#FATO'])
    expect(compare('details#keyonly')).toHaveLength(0)
  })

  it('escapes <, & and " in a claim and a label, and keeps exactly two </script>', async () => {
    const CLAIM = 'Disse <script>alert("x")</script> & "aspas"'
    const LABEL = '</script><b>"FALSO"</b> & cia'
    const dir = await mkdtemp(join(tmpdir(), 'site-build-'))
    try {
      const recs = fixtureRecords()
      Object.assign(recs[13], {
        label: LABEL,
        history: [{ label: 'verdadeiro', until: '2026-10-24' }],
      })
      const groups = fixtureGroups()
      const a = groups.groups.find((g) => g.id === fixtureGroupId('A'))
      Object.assign(a as object, { claim: CLAIM })
      const built = await buildFixture(dir, recs, groups)
      const html = await readFile(join(built.outDir, 'comparar.html'), 'utf8')
      const $ = load(html)
      expect(html.split('</script>')).toHaveLength(3)
      expect($('script')).toHaveLength(2)
      expect($('main script, #matrix b, #changes b')).toHaveLength(0)
      const button = $(`#matrix button[data-id="${fixtureGroupId('A')}"]`)
      expect(button.find('.txt').text()).toBe(CLAIM)
      expect(button.attr('aria-label')).toContain(`Lula: ${CLAIM}. Divergência.`)
      expect(button.find('.dot').first().attr('aria-label')).toBe(
        `Aos Fatos: falso, antes verdadeiro. ${CLAIM}`,
      )
      const change = $(`#changes li[data-id="${recordId(14)}"]`)
      expect(
        change
          .find('.tl > li .v')
          .map((_, v) => $(v).text())
          .get(),
      ).toEqual(['verdadeiro', LABEL])
      const data = JSON.parse($('script#compare-data').text())
      expect(data.groups.find((g: { id: string }) => g.id === fixtureGroupId('A')).claim).toBe(
        CLAIM,
      )
      expect(data.records.find((r: CheckRecord) => r.id === recordId(14)).label).toBe(LABEL)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('shows how many published records are not grouped yet', () => {
    expect(text('#pending')).toBe(
      `${FIXTURE_PENDING.length} checagens publicadas depois da última revisão ainda não foram agrupadas.`,
    )
  })

  it('explains how the groups were made and how to contest one (DISC-02, DISC-03)', () => {
    const section = compare('h2')
      .filter((_, h) => compare(h).text() === 'Como os grupos foram feitos')
      .nextUntil('h2')
    const how = section.text().replace(/\s+/g, ' ')
    for (const step of [
      'com a agência trocada por uma letra. Não veem o nome da agência, o rótulo nem o veredito.',
      'Três agentes agrupam as checagens de cada debate',
      'um juiz decide só aqueles casos',
      'um revisor lê cada frase',
      'O mantenedor revisa o resultado antes de publicar.',
      'A IA nunca define veredito.',
    ]) {
      expect(how).toContain(step)
    }
    expect(
      section
        .find('a')
        .map((_, a) => a.attribs.href)
        .get(),
    ).toEqual(['claim-groups.json', `${REPO}/tree/main/data/claim-curation`])
    const contest = compare('h2')
      .filter((_, h) => compare(h).text() === 'Contestar um grupo')
      .next('p')
    expect(contest.text()).toContain('abra uma issue em')
    expect(contest.text()).toContain('com o código do grupo')
    expect(contest.find('a').attr('href')).toBe(`${REPO}/issues`)
  })

  it('is linked from the main page and the methodology page', () => {
    expect(index('a[href="comparar.html"]')).toHaveLength(2)
    expect(index('#notice + p a[href="comparar.html"]')).toHaveLength(1)
    expect(index('footer a[href="comparar.html"]')).toHaveLength(1)
    expect(method('a[href="comparar.html"]').length).toBeGreaterThan(0)
  })

  it('inlines the groups and the curated record ids for the browser', () => {
    const data = JSON.parse(compare('script#compare-data[type="application/json"]').text())
    expect(data.groups).toEqual(fixtureGroups().groups)
    const pending = new Set(FIXTURE_PENDING.map(recordId))
    expect(new Set(data.curated)).toEqual(
      new Set(records.filter((r) => !r.missingSince && !pending.has(r.id)).map((r) => r.id)),
    )
    expect(data.records.map((r: CheckRecord) => r.id)).toEqual(records.map((r) => r.id))
    expect(data.candidates).toEqual(config.candidates)
    // The band table and the history rebuild old bands in the browser (DRIFT-04, DRIFT-05).
    expect(data.bands).toEqual(config.bands)
    expect(data.records[4].history).toEqual(records[4].history)
    expect(data.records[3].history).toBeUndefined()
  })

  it('fails the build on a broken claim group and names it (CLAIM-02)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'site-build-'))
    try {
      const groups = fixtureGroups()
      groups.groups[1] = { ...groups.groups[1], claim: '' }
      await expect(buildFixture(dir, fixtureRecords(), groups)).rejects.toThrow(
        `${groups.groups[1].id}: claim is empty`,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('AI disclosure (DISC-01, DISC-02, DISC-04)', () => {
  const DISC =
    'A IA só agrupa checagens da mesma alegação, sem saber a agência nem o veredito. Ela nunca define veredito.'
  const text = ($: CheerioAPI) => $('body').text().replace(/\s+/g, ' ')

  it('states the new rule in the audit panel, and no page keeps the old one (DISC-01)', () => {
    const rules = index('dialog#audit .rules li')
    expect(rules).toHaveLength(5)
    const ai = rules.filter((_, li) => index(li).text().includes('IA'))
    expect(ai).toHaveLength(1)
    expect(ai.text().replace(/\s+/g, ' ')).toContain(DISC)
    for (const page of [index, method, compare]) {
      expect(text(page)).not.toContain('Nenhum texto passa por inteligência artificial')
    }
  })

  it('explains on the methodology page how the groups are made, with both links (DISC-02)', () => {
    const section = method('h2')
      .filter((_, h) => method(h).text() === 'Comparação entre agências')
      .nextUntil('h2')
    const how = section.text().replace(/\s+/g, ' ')
    expect(how).toContain(DISC)
    for (const step of [
      'com a agência trocada por uma letra',
      'Três agentes agrupam as checagens de cada debate',
      'um juiz decide só aqueles casos',
      'Um revisor lê a frase de cada fala',
      'O mantenedor revisa o resultado antes de publicar',
    ]) {
      expect(how).toContain(step)
    }
    expect(
      section
        .find('a')
        .map((_, a) => a.attribs.href)
        .get(),
    ).toEqual(['comparar.html', 'claim-groups.json', `${REPO}/tree/main/data/claim-curation`])
  })

  it('puts the same sentence in the README impartiality rules (DISC-04)', async () => {
    const readme = await readFile(join(ROOT, 'README.md'), 'utf8')
    expect(readme).toContain(`- ${DISC}`)
    expect(readme).not.toContain('Nenhum texto das agências passa por IA')
  })
})
