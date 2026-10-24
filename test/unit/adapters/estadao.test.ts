import { describe, expect, it } from 'vitest'
import { estadao } from '../../../src/adapters/estadao.ts'
import type { Doc, Io, ParseNote } from '../../../src/types.ts'

// Hand-written page that copies the Estadão structure: Arc Fusion JSON embedded in a script.
const text = (_id: string, content: string) => ({ _id, type: 'text', content })
const header = (_id: string, content: string) => ({ _id, type: 'header', level: 3, content })
const page = (elements: object[]) =>
  `<html><head><script id="fusion-metadata" type="application/javascript">window.Fusion=window.Fusion||{};Fusion.arcSite="x";Fusion.globalContent=${JSON.stringify(
    { _id: 'PAGE', content_elements: elements },
  )};Fusion.globalContentConfig={"source":"context"};</script></head><body></body></html>`
const doc = (body: string): Doc => ({
  url: 'https://est.test/p',
  body,
  sha256: 'x',
  fetchedAt: 't',
})

const SAMPLE = page([
  text('INTRO', 'As assessorias foram contatadas.'),
  header('H1', '<b>Árvores</b>'),
  text('SAID1', '<b>O que Candidata disse:</b> que plantou mil árvores na praça. '),
  text(
    'CONC1',
    '<b>O Estadão Verifica checou e concluiu que: </b>é verdadeiro. A prefeitura <a href="https://x.test/?a={b}" target="_blank">registrou</a> o plantio. O censo confirma.',
  ),
  header('H2', '<b>Ponte</b>'),
  text('SAID2', '<b>O que disse Candidato Dois:</b> que a ponte custou dez vezes o previsto.'),
  text(
    'CONC2',
    '<b>O Estadão Verifica investigou e concluiu que</b>: é enganoso. O custo subiu por mudanças no projeto.',
  ),
  text('ORPHAN', '<b>O Estadão Verifica checou e concluiu que:</b> é falso. Sem fala antes.'),
  { _id: 'VID', type: 'video' },
])

describe('estadao-page parse (INGEST-03)', () => {
  const notes: ParseNote[] = []
  const items = estadao.parse([doc(SAMPLE)], notes)

  it('pairs each "O que" element with the conclusion right after it', () => {
    expect(items).toEqual([
      {
        key: 'SAID1',
        doc: 0,
        pos: 1,
        anchor: null,
        speakerRaw: 'Candidata',
        quote: 'que plantou mil árvores na praça.',
        label: 'é verdadeiro',
        explanation: 'A prefeitura registrou o plantio. O censo confirma.',
      },
      {
        key: 'SAID2',
        doc: 0,
        pos: 2,
        anchor: null,
        speakerRaw: 'Candidato Dois',
        quote: 'que a ponte custou dez vezes o previsto.',
        label: 'é enganoso',
        explanation: 'O custo subiu por mudanças no projeto.',
      },
    ])
  })

  it('accepts "checou" and "investigou", "O que X disse:" and "O que disse X:"', () => {
    expect(items.map((i) => [i.speakerRaw, i.label])).toEqual([
      ['Candidata', 'é verdadeiro'],
      ['Candidato Dois', 'é enganoso'],
    ])
  })

  it('cuts the label at the first period and keeps the rest as explanation', () => {
    expect(items[0].label).toBe('é verdadeiro')
    expect(items[0].explanation).toBe('A prefeitura registrou o plantio. O censo confirma.')
  })

  it('uses the _id of the "O que" element as key', () => {
    expect(items.map((i) => i.key)).toEqual(['SAID1', 'SAID2'])
  })

  it('reports a conclusion without a preceding "O que" element', () => {
    expect(notes).toEqual([
      {
        kind: 'skipped',
        detail:
          'ORPHAN: conclusion without "O que": O Estadão Verifica checou e concluiu que: é falso. Sem fala antes.',
      },
    ])
  })

  it('fails when the page has no embedded content JSON', () => {
    expect(() => estadao.parse([doc('<html><body>vazio</body></html>')])).toThrow(
      'Fusion.globalContent not found',
    )
  })

  it('is pure: the same doc gives byte-identical items (DATA-04)', () => {
    expect(JSON.stringify(estadao.parse([doc(SAMPLE)]))).toBe(JSON.stringify(items))
  })
})

describe('estadao-page load', () => {
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
    const source = {
      id: 's',
      outlet: 'estadao',
      adapter: 'estadao-page',
      url: 'https://est.test/p',
    }
    expect(await estadao.load(source, io)).toHaveLength(1)
    expect(fetched).toEqual(['https://est.test/p'])
  })
})
