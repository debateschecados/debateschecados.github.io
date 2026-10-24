import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type CheerioAPI, load } from 'cheerio'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pkg from '../../../package.json' with { type: 'json' }
import { createContext, emptyState, listed } from '../../../site/core.js'
import { type Config, loadConfig } from '../../../src/config.ts'
import { CSV_COLUMNS } from '../../../src/pipeline/write.ts'
import { AGENT_FILES, auditPrompt } from '../../../src/site/agents.ts'
import type { CheckRecord } from '../../../src/types.ts'
import { buildFixture, fixtureRecords } from '../../fixtures/site.ts'

const ROOT = join(import.meta.dirname, '../../..')
const REPO = pkg.repository
const ORIGIN = pkg.homepage.replace(/\/$/, '')

let tmp: string
let outDir: string
let dataDir: string
let records: CheckRecord[]
let config: Config
let index: CheerioAPI
let method: CheerioAPI
let indexHtml: string

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'site-build-'))
  ;({ outDir, dataDir, records } = await buildFixture(tmp))
  config = await loadConfig(join(ROOT, 'config'))
  indexHtml = await readFile(join(outDir, 'index.html'), 'utf8')
  index = load(indexHtml)
  method = load(await readFile(join(outDir, 'metodologia.html'), 'utf8'))
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

  it('pre-renders the tabs with both counts and an empty search box', () => {
    const tabs = index('#tabs button')
    expect(tabs.map((_, b) => index(b).text().replace(/\s+/g, ' ')).get()).toEqual([
      `Checagens ${found().length}`,
      `Removidas ${records.length - found().length}`,
    ])
    expect(index('#tabs button[aria-pressed="true"]').attr('data-tab')).toBe('live')
    expect(index('input#q[type="search"]').attr('value')).toBeUndefined()
  })

  it('inlines records and config as JSON that a quote cannot break out of', () => {
    const data = JSON.parse(index('script#data[type="application/json"]').text())
    expect(data.records).toEqual(records)
    expect(data.candidates).toEqual(config.candidates)
    expect(data.outlets).toEqual(config.outlets)
    expect(data.debates.map((d: { id: string }) => d.id)).toEqual(config.debates.map((d) => d.id))
    // The data script, the dataset JSON-LD and app.js close a script. The quote's "</script>" stays inert.
    expect(indexHtml.match(/<\/script>/g)).toHaveLength(3)
    expect(index('script')).toHaveLength(3)
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
    expect(prompt).toBe(auditPrompt(REPO))
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
        ...AGENT_FILES,
      ].sort(),
    )
    expect(dist.filter((f) => f.endsWith('.html')).sort()).toEqual([
      'index.html',
      'metodologia.html',
    ])
  })
})

describe('agent files', () => {
  const read = (file: string) => readFile(join(outDir, file), 'utf8')

  it('publishes an llms.txt index whose links resolve, and the same audit prompt', async () => {
    const llms = await read('llms.txt')
    expect(llms.startsWith('# Debates checados\n')).toBe(true)
    expect(llms.split('\n')[2]).toMatch(/^> /)
    const sections = llms.split(/^## /m).slice(1)
    expect(sections.length).toBeGreaterThan(0)
    for (const section of sections) {
      const body = section
        .split('\n')
        .slice(1)
        .filter((line) => line.trim())
      expect(body.every((line) => line.startsWith('- ['))).toBe(true)
    }
    const links = [...llms.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1])
    const local = links.filter((href) => href.startsWith(`${ORIGIN}/`))
    expect(local.length).toBeGreaterThan(0)
    for (const href of local) {
      expect(await read(href.slice(ORIGIN.length + 1)), href).not.toMatch(/\{\{/)
    }
    expect(await read('auditoria.md')).toContain(index('#prompt').text())
    expect(await read('llms-full.txt')).toContain(index('#prompt').text())
    expect(await read('index.html.md')).toBe(await read('index.md'))
    expect(index('link[rel="describedby"]').attr('href')).toBe('llms.txt')
    expect(index('link[rel="alternate"][type="text/markdown"]').attr('href')).toBe('index.md')
    expect(method('link[rel="alternate"][type="text/markdown"]').attr('href')).toBe(
      'metodologia.md',
    )
    expect(index('footer a[href="llms.txt"]')).toHaveLength(1)
  })

  it('lets an agent read the site and refuses training', async () => {
    const robots = await read('robots.txt')
    expect(robots).toContain('Allow: /')
    expect(robots).toContain('Content-Signal: search=yes, ai-input=yes, ai-train=no')
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`)
    expect(robots).not.toMatch(/^Disallow:/m)
    const sitemap = await read('sitemap.xml')
    expect(sitemap).toContain(`${ORIGIN}/llms.txt`)
    expect(sitemap).toContain(`${ORIGIN}/checks.csv`)
    expect(sitemap).toContain(`${ORIGIN}/auditoria.md`)
  })

  it('describes every csv column and the dataset', async () => {
    const meta = JSON.parse(await read('checks.csv-metadata.json')) as {
      tableSchema: { columns: { name: string }[] }
    }
    expect(meta.tableSchema.columns.map((column) => column.name)).toEqual([...CSV_COLUMNS])
    const ld = JSON.parse(index('script[type="application/ld+json"]').text()) as {
      '@graph': { '@type': string }[]
    }
    expect(ld['@graph'].map((node) => node['@type'])).toEqual(['WebSite', 'Dataset'])
    expect(JSON.parse(await read('dataset.json'))).toEqual(ld)
    expect(await read('metodologia.md')).toContain(config.outlets.lupa.name)
  })
})
