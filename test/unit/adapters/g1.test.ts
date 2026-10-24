import { describe, expect, it } from 'vitest'
import { g1 } from '../../../src/adapters/g1.ts'
import type { Doc, Io, ParseNote } from '../../../src/types.ts'

// Hand-written blocks that copy the g1 page structure (chunk divs, intertitles, blockquotes).
const text = (id: string, inner: string, type = 'raw') =>
  `<div id="${id}"><div class="mc-column content-text" data-block-type="${type}"><p class="content-text__container">${inner}</p></div></div>`
const heading = (id: string, title: string) =>
  text(id, `<div class="content-intertitle"><h2>${title}</h2></div>`)
const quote = (id: string, words: string) =>
  text(id, `<blockquote class="content-blockquote theme-border">&quot;${words}&quot;</blockquote>`)
const label = (id: string, words: string) => text(id, `<strong>${words}</strong>`, 'unstyled')
const list = (id: string, ...items: string[]) =>
  text(id, `<ul class="content-unordered-list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`)
const photo = (id: string) =>
  `<div id="${id}"><div class="row content-media" data-block-type="backstage-photo"><figure>Selo. Foto: g1</figure></div></div>`
const ad = (id: string) =>
  `<div id="${id}"><div class="content-ads" data-block-type="ads"><glb-ad></glb-ad></div></div>`

const page = (...blocks: string[]) =>
  `<html><body><article>${blocks.join('\n')}</article></body></html>`
const doc = (body: string): Doc => ({ url: 'https://g1.test/p', body, sha256: 'x', fetchedAt: 't' })

const SAMPLE = page(
  text('chunk-intro', 'A equipe checou as principais declarações. Clique nos nomes:'),
  heading('chunk-h1', 'CANDIDATA UM (PA)'),
  quote('chunk-q1', 'Plantamos mil árvores na praça central no ano passado.'),
  photo('chunk-p1'),
  label('chunk-l1', 'A declaração é #FATO. Veja por quê:'),
  list('chunk-e1', 'A prefeitura registrou o plantio.', 'O censo arbóreo confirma.'),
  ad('chunk-ad1'),
  quote('chunk-q2', 'A ponte custou dez vezes o previsto e nunca foi usada.'),
  list('chunk-s2', 'A declaração sobre o custo é #FATO.', 'A declaração sobre o uso é #FAKE.'),
  label('chunk-l2a', 'Veja por que a primeira delas é #FATO:'),
  list('chunk-e2a', 'O custo final foi dez vezes maior.'),
  label('chunk-l2b', 'Veja por que a segunda delas é #FAKE:'),
  list('chunk-e2b', 'A ponte recebe tráfego desde a inauguração.'),
  heading('chunk-h2', 'CANDIDATO DOIS (PB)'),
  quote('chunk-q3', 'O outro lado criou o imposto sobre bicicletas.'),
  label('chunk-l3', '#NÃOÉBEMASSIM. Veja por quê:'),
  list(
    'chunk-e3',
    'O imposto foi proposto antes.',
    'A resposta a essa fala também foi checada e recebeu o selo de #FAKE (leia mais abaixo).',
  ),
  quote('chunk-q4', 'Abrimos cem escolas novas no interior do estado.'),
  label('chunk-l4', 'A declaração é #/FATO. Veja por quê:'),
  list('chunk-e4', 'O painel de obras lista as escolas.'),
  heading('chunk-more', 'Veja também'),
  quote('chunk-q5', 'Uma citação de outra reportagem que não é checagem.'),
  label('chunk-l5', 'A declaração é #FAKE. Veja por quê:'),
)

describe('g1-page parse (INGEST-03)', () => {
  const items = g1.parse([doc(SAMPLE)])

  it('emits one item per verdict, stopping at "Veja também"', () => {
    expect(items.map((i) => [i.pos, i.key, i.label])).toEqual([
      [1, 'chunk-q1', '#FATO'],
      [2, 'chunk-q2', '#FATO'],
      [3, 'chunk-q2.2', '#FAKE'],
      [4, 'chunk-q3', '#NÃOÉBEMASSIM'],
      [5, 'chunk-q4', '#/FATO'],
    ])
  })

  it('reads a single verdict with quote, speaker, anchor and explanation', () => {
    expect(items[0]).toEqual({
      key: 'chunk-q1',
      doc: 0,
      pos: 1,
      anchor: 'chunk-q1',
      speakerRaw: 'CANDIDATA UM (PA)',
      quote: 'Plantamos mil árvores na praça central no ano passado.',
      label: '#FATO',
      explanation: 'A prefeitura registrou o plantio.\nO censo arbóreo confirma.',
    })
  })

  it('skips the double-verdict summary and splits the explanations', () => {
    expect(items[1]).toMatchObject({
      key: 'chunk-q2',
      anchor: 'chunk-q2',
      quote: 'A ponte custou dez vezes o previsto e nunca foi usada.',
      label: '#FATO',
      explanation: 'O custo final foi dez vezes maior.',
    })
    expect(items[2]).toMatchObject({
      key: 'chunk-q2.2',
      anchor: 'chunk-q2',
      label: '#FAKE',
      explanation: 'A ponte recebe tráfego desde a inauguração.',
    })
  })

  it('does not take "selo de #FAKE" inside an explanation as a label', () => {
    expect(items[3].label).toBe('#NÃOÉBEMASSIM')
    expect(items[3].explanation).toContain('recebeu o selo de #FAKE')
    expect(items.filter((i) => i.key?.startsWith('chunk-q3'))).toHaveLength(1)
  })

  it('keeps the #/FATO typo verbatim', () => {
    expect(items[4].label).toBe('#/FATO')
  })

  it('takes the speaker from the section intertitle', () => {
    expect(items.map((i) => i.speakerRaw)).toEqual([
      'CANDIDATA UM (PA)',
      'CANDIDATA UM (PA)',
      'CANDIDATA UM (PA)',
      'CANDIDATO DOIS (PB)',
      'CANDIDATO DOIS (PB)',
    ])
  })

  it('reports a quote that is too short or has no verdict instead of emitting it', () => {
    const notes: ParseNote[] = []
    const out = g1.parse(
      [
        doc(
          page(
            heading('chunk-h', 'CANDIDATA UM (PA)'),
            quote('chunk-a', ')'),
            label('chunk-la', 'A declaração é #FATO. Veja por quê:'),
            quote('chunk-b', 'Uma fala que ninguém classificou ainda.'),
          ),
        ),
      ],
      notes,
    )
    expect(out).toEqual([])
    expect(notes.map((n) => [n.kind, n.detail.split(':')[0]])).toEqual([
      ['skipped', 'chunk-a'],
      ['skipped', 'chunk-b'],
    ])
  })

  it('is pure: the same doc gives byte-identical items (DATA-04)', () => {
    expect(JSON.stringify(g1.parse([doc(SAMPLE)]))).toBe(JSON.stringify(items))
  })
})

describe('g1-page load', () => {
  it('fetches the configured page as its only doc', async () => {
    const fetched: string[] = []
    const io: Io = {
      get: async (url) => {
        fetched.push(url)
        return doc(SAMPLE)
      },
      readFile: async () => {
        throw new Error('unused')
      },
    }
    const docs = await g1.load(
      { id: 's', outlet: 'g1', adapter: 'g1-page', url: 'https://g1.test/p' },
      io,
    )
    expect(fetched).toEqual(['https://g1.test/p'])
    expect(docs).toHaveLength(1)
    expect(g1.configSchema.safeParse({ id: 's' }).success).toBe(false)
  })
})
