import { describe, expect, it } from 'vitest'
import { aosfatos } from '../../../src/adapters/aosfatos.ts'
import type { Doc, Io, ParseNote } from '../../../src/types.ts'

const U = (n: number) => `0000000${n}-aaaa-4bbb-8ccc-dddddddddddd`

// Hand-written page that copies the Aos Fatos server HTML (transcript headings, p[id], stamps).
const speaker = (name: string) => `<p class="text-xl font-bold font-sans uppercase">${name}</p>`
const said = (id: string, words: string) =>
  `<p id="${id}"><span class="inline box-decoration-clone">${words}</span></p>`
const stamp = (code: string, words: string) =>
  `<blockquote data-stamp="${code}" class="not-prose"><div class="grid gap-4"><p>${words}</p><div class="flex"><a href="https://x.test">Fonte</a></div></div></blockquote>`
const page = (...blocks: string[]) =>
  `<html><body><article><p>Introdução.</p>${blocks.join('')}</article></body></html>`
const doc = (url: string, body: string): Doc => ({ url, body, sha256: 'x', fetchedAt: 't' })

const HTML = page(
  speaker('Jornalista'),
  '<p>Pergunta sobre árvores.</p>',
  speaker('Candidata Um'),
  '<p>Boa noite a todos.</p>',
  said(U(1), 'Plantamos mil árvores na praça central.'),
  stamp('verdadeiro', 'A prefeitura registrou o plantio.'),
  '<p>Seguimos.</p>',
  said(U(2), 'A ponte custou dez vezes o previsto.'),
  stamp('nao_e_bem_assim', 'O custo subiu por mudanças no projeto.'),
  speaker('Candidato Dois'),
  said(U(3), 'O outro lado criou o imposto sobre bicicletas.'),
  stamp('falso', 'Não existe tal imposto.'),
  said(U(4), 'Abrimos cem escolas novas no interior.'),
  stamp('impreciso', 'Foram oitenta escolas.'),
)

// Hand-written Escriba transcript: blocks with an optional speaker and comment nodes.
const comment = (id: string, words: string, selo: string | null, explanation: string) => ({
  type: 'comment',
  id,
  children: [{ text: words, start: 1, end: 2 }],
  data: {
    content: {
      children: [
        { type: 'paragraph', children: [{ text: explanation }] },
        { type: 'paragraph', children: [{ text: 'segundo parágrafo' }] },
      ],
    },
    'p-1': { key: 'ref', value: '' },
    'p-2': { key: 'display', value: selo ? 'block' : '' },
    ...(selo === null ? {} : { 'p-3': { key: 'selo', value: selo } }),
  },
})
const ESCRIBA = JSON.stringify([
  { speaker: 'Mediador', approved: true, children: [{ text: 'Boa noite.' }] },
  {
    speaker: 'Candidata Um',
    approved: true,
    children: [
      { text: 'Começo.' },
      comment(U(5), 'Plantamos mil árvores na praça central.', 'verdadeiro', 'Registro confirma.'),
    ],
  },
  {
    approved: true,
    children: [comment(U(6), 'A ponte custou dez vezes o previsto.', 'falso', 'Custo menor.')],
  },
  {
    speaker: 'Candidato Dois',
    approved: true,
    children: [
      comment(U(7), 'Uma fala que ainda não recebeu selo.', null, ''),
      comment(U(8), 'O imposto sobre bicicletas é de vocês.', 'nao_e_bem_assim', 'Em parte.'),
    ],
  },
])

const PAGE_URL = 'https://af.test/noticias/x/'
const API_URL = `https://af.test/api/escriba/${U(9)}/`
const GLOBO_PAGE = page(
  '<p>A transcrição é feita pelo Escriba.</p>',
  `<script>self.__next_f.push([1,"70:[\\"$\\",\\"$L7d\\",null,{\\"escribaId\\":\\"${U(9)}\\"}]"])</script>`,
)

describe('aosfatos parse, server HTML (INGEST-03)', () => {
  const notes: ParseNote[] = []
  const items = aosfatos.parse([doc(PAGE_URL, HTML)], notes)

  it('reads p[id] + blockquote[data-stamp] with the nearest speaker heading', () => {
    expect(items[0]).toEqual({
      key: U(1),
      doc: 0,
      pos: 1,
      anchor: U(1),
      speakerRaw: 'Candidata Um',
      quote: 'Plantamos mil árvores na praça central.',
      label: 'verdadeiro',
      explanation: 'A prefeitura registrou o plantio.',
    })
    expect(items.map((i) => i.speakerRaw)).toEqual([
      'Candidata Um',
      'Candidata Um',
      'Candidato Dois',
      'Candidato Dois',
    ])
  })

  it('maps the three stamp codes to their display text', () => {
    expect(items.slice(0, 3).map((i) => i.label)).toEqual([
      'verdadeiro',
      'não é bem assim',
      'falso',
    ])
  })

  it('keeps an unknown stamp code verbatim and reports it', () => {
    expect(items[3]).toMatchObject({ key: U(4), label: 'impreciso' })
    expect(notes).toEqual([{ kind: 'unknown-label', detail: `${U(4)}: stamp "impreciso"` }])
  })
})

describe('aosfatos parse, Escriba API (INGEST-03)', () => {
  const notes: ParseNote[] = []
  const items = aosfatos.parse([doc(API_URL, ESCRIBA)], notes)

  it('reads stamped comments with label, quote and the first explanation paragraph', () => {
    expect(items.map((i) => [i.pos, i.key, i.label, i.explanation])).toEqual([
      [1, U(5), 'verdadeiro', 'Registro confirma.'],
      [2, U(6), 'falso', 'Custo menor.'],
      [3, U(8), 'não é bem assim', 'Em parte.'],
    ])
    expect(items[0]).toMatchObject({
      doc: 0,
      quote: 'Plantamos mil árvores na praça central.',
    })
  })

  it('lets a block without speaker inherit the previous one', () => {
    expect(items.map((i) => i.speakerRaw)).toEqual([
      'Candidata Um',
      'Candidata Um',
      'Candidato Dois',
    ])
  })

  it('skips a comment without selo and counts it as unrated', () => {
    expect(items.some((i) => i.key === U(7))).toBe(false)
    expect(notes).toEqual([
      { kind: 'unrated', detail: `${U(7)}: "Uma fala que ainda não recebeu selo."` },
    ])
  })

  it('points items at the API doc when the page comes first, and the page adds nothing', () => {
    const both = aosfatos.parse([doc(PAGE_URL, GLOBO_PAGE), doc(API_URL, ESCRIBA)])
    expect(both.map((i) => i.doc)).toEqual([1, 1, 1])
    expect(both.map(({ doc, ...rest }) => rest)).toEqual(items.map(({ doc, ...rest }) => rest))
  })

  it('anchors each item at the comment id, which the page uses as <p id>', () => {
    expect(items.map((i) => i.anchor)).toEqual([U(5), U(6), U(8)])
  })

  it('ignores stamps in a rendered page when the transcript is present', () => {
    const rendered = page(
      speaker('Candidata Um'),
      said(U(5), 'Plantamos mil árvores na praça central.'),
      stamp('verdadeiro', 'Registro confirma.'),
      said(U(6), 'A ponte custou dez vezes o previsto.'),
      stamp('falso', 'Custo menor.'),
    )
    const both = aosfatos.parse([doc(PAGE_URL, rendered), doc(API_URL, ESCRIBA)])
    expect(both.map((i) => [i.key, i.doc])).toEqual([
      [U(5), 1],
      [U(6), 1],
      [U(8), 1],
    ])
    expect(aosfatos.parse([doc(PAGE_URL, rendered)])).toHaveLength(2)
  })

  it('is pure: the same docs give byte-identical items (DATA-04)', () => {
    expect(JSON.stringify(aosfatos.parse([doc(API_URL, ESCRIBA)]))).toBe(JSON.stringify(items))
    expect(JSON.stringify(aosfatos.parse([doc(PAGE_URL, HTML)]))).toBe(
      JSON.stringify(aosfatos.parse([doc(PAGE_URL, HTML)])),
    )
  })
})

describe('aosfatos load', () => {
  const ioFor = (pages: Record<string, string>) => {
    const fetched: string[] = []
    const io: Io = {
      get: async (url) => {
        fetched.push(url)
        return doc(url, pages[url])
      },
      readFile: async () => {
        throw new Error('unused')
      },
    }
    return { io, fetched }
  }
  const source = { id: 's', outlet: 'aosfatos', adapter: 'aosfatos', url: PAGE_URL }

  it('fetches the Escriba API when the page payload has an escribaId', async () => {
    const { io, fetched } = ioFor({ [PAGE_URL]: GLOBO_PAGE, [API_URL]: ESCRIBA })
    const docs = await aosfatos.load(source, io)
    expect(fetched).toEqual([PAGE_URL, API_URL])
    expect(docs.map((d) => d.url)).toEqual([PAGE_URL, API_URL])
  })

  it('reads only the page when there is no escribaId', async () => {
    const { io, fetched } = ioFor({ [PAGE_URL]: HTML })
    expect(await aosfatos.load(source, io)).toHaveLength(1)
    expect(fetched).toEqual([PAGE_URL])
  })
})
