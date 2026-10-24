import { describe, expect, it } from 'vitest'
import { lupa } from '../../../src/adapters/lupa.ts'
import type { Doc, Io, ParseNote } from '../../../src/types.ts'

// Hand-written blocks that copy the Lupa page structure (quote block, custom label block, hr).
const quote = (words: string, cite: string) =>
  `<div class="wp-block-seox-seox-quotes seox-block-quote mb-5"><blockquote> <p class="wp-block-paragraph"><strong>${words}</strong></p> <cite><em>${cite}</em></cite></blockquote></div>`
const label = (text: string) =>
  `<div data-block-id="1" class="wp-block-custom-blocks"><div class="custom-block"><div class="block-text"> <strong>${text}</strong> </div></div></div>`
const para = (text: string) => `<p class="wp-block-paragraph">${text}</p>`
const HR = '<hr class="wp-block-separator has-alpha-channel-opacity"/>'
const figure =
  '<figure class="wp-block-image"><img src="x.png"/><figcaption>Captura</figcaption></figure>'

const page = (...blocks: string[]) =>
  `<html><body><div class="post-content">${blocks.join('\n')}</div><footer><p>Todos os direitos reservados.</p></footer></body></html>`
const doc = (body: string): Doc => ({
  url: 'https://lupa.test/p',
  body,
  sha256: 'x',
  fetchedAt: 't',
})

const UM = 'Candidata Um (PA), candidata à reeleição, em debate na TV'
const DOIS = 'Candidato Dois (PB), candidato, em debate na TV'

const SAMPLE = page(
  para('Introdução da cobertura ao vivo.'),
  quote('Plantamos mil árvores na praça central', UM),
  label('VERDADEIRO'),
  para('A prefeitura registrou o plantio.'),
  figure,
  para('O censo arbóreo confirma o número.'),
  HR,
  para('Texto solto entre checagens.'),
  quote('A ponte custou dez vezes o previsto', DOIS),
  label('FALTA CONTEXTO'),
  para('O custo subiu, mas por mudanças no projeto.'),
  HR,
  quote('Uma fala ainda sem selo', DOIS),
  HR,
  quote('O imposto sobre bicicletas é nosso', UM),
  label('FALSO'),
  para('Não existe tal imposto.'),
)

describe('lupa-page parse (INGEST-03)', () => {
  const notes: ParseNote[] = []
  const items = lupa.parse([doc(SAMPLE)], notes)

  it('reads the quote without <cite>, the speaker from <cite> and the label block', () => {
    expect(items[0]).toEqual({
      key: null,
      doc: 0,
      pos: 1,
      anchor: null,
      speakerRaw: UM,
      quote: 'Plantamos mil árvores na praça central',
      label: 'VERDADEIRO',
      explanation: 'A prefeitura registrou o plantio.\nO censo arbóreo confirma o número.',
    })
  })

  it('ends the explanation at the next hr', () => {
    expect(items[0].explanation).not.toContain('Texto solto')
    expect(items[1].explanation).toBe('O custo subiu, mas por mudanças no projeto.')
    expect(items[2].explanation).toBe('Não existe tal imposto.')
  })

  it('keeps FALTA CONTEXTO verbatim', () => {
    expect(items[1]).toMatchObject({ label: 'FALTA CONTEXTO', speakerRaw: DOIS, pos: 2 })
  })

  it('reports a quote without a label and does not emit it', () => {
    expect(items.map((i) => [i.pos, i.label])).toEqual([
      [1, 'VERDADEIRO'],
      [2, 'FALTA CONTEXTO'],
      [3, 'FALSO'],
    ])
    expect(notes).toEqual([
      { kind: 'skipped', detail: 'quote without a label: "Uma fala ainda sem selo"' },
    ])
  })

  it('reports a quote that is too short', () => {
    const short: ParseNote[] = []
    expect(lupa.parse([doc(page(quote('"Sim"', UM), label('FALSO')))], short)).toEqual([])
    expect(short.map((n) => n.kind)).toEqual(['skipped'])
  })

  it('is pure: the same doc gives byte-identical items (DATA-04)', () => {
    expect(JSON.stringify(lupa.parse([doc(SAMPLE)]))).toBe(JSON.stringify(items))
  })
})

describe('lupa-page load', () => {
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
    const source = { id: 's', outlet: 'lupa', adapter: 'lupa-page', url: 'https://lupa.test/p' }
    expect(await lupa.load(source, io)).toHaveLength(1)
    expect(fetched).toEqual(['https://lupa.test/p'])
  })
})
