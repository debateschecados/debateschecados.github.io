import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Config, loadConfig } from '../../src/config.ts'
import {
  bandFor,
  cleanQuote,
  excerpt,
  labelKey,
  mappedBand,
  nameKey,
  quoteKey,
  resolveSpeaker,
  tokens,
} from '../../src/pipeline/normalize.ts'

let config: Config
beforeAll(async () => {
  config = await loadConfig(join(import.meta.dirname, '../../config'))
})

describe('nameKey', () => {
  it('drops the party group and the text after the first comma, folds case and accents', () => {
    expect(nameKey('FLÁVIO BOLSONARO (PL)')).toBe('flavio bolsonaro')
    expect(nameKey('Luiz Inácio Lula da Silva (PT), presidente e candidato')).toBe(
      'luiz inacio lula da silva',
    )
  })
})

describe('resolveSpeaker (INGEST-05)', () => {
  it.each([
    ['FLÁVIO BOLSONARO (PL)', 'flavio'],
    ['LULA (PT)', 'lula'],
    ['Luiz Inácio Lula da Silva (PT), presidente e candidato à reeleição', 'lula'],
    ['Flávio', 'flavio'],
    ['Lula', 'lula'],
    ['Flávio Bolsonaro', 'flavio'],
  ])('resolves %s to %s', (raw, id) => {
    expect(resolveSpeaker(raw, config.candidates)).toBe(id)
  })

  it.each(['Jornalista', 'César Tralli'])('returns null for %s', (raw) => {
    expect(resolveSpeaker(raw, config.candidates)).toBeNull()
  })

  it('only resolves candidates of the given debate', () => {
    const onlyLula = config.candidates.filter((c) => c.id === 'lula')
    expect(resolveSpeaker('Flávio', onlyLula)).toBeNull()
  })
})

describe('labels and bands (DATA-03)', () => {
  it('gives #/FATO and #FATO the same key', () => {
    expect(labelKey('#/FATO')).toBe('fato')
    expect(labelKey('#FATO')).toBe('fato')
    expect(labelKey('#NÃOÉBEMASSIM')).toBe('naoebemassim')
  })

  it('keeps é subestimado and está subestimado apart', () => {
    expect(labelKey('é subestimado')).toBe('esubestimado')
    expect(labelKey('está subestimado')).toBe('estasubestimado')
  })

  it('maps a label through its matching key, per outlet', () => {
    expect(bandFor(config.bands, 'g1', '#/FATO')).toBe('verdadeiro')
    expect(bandFor(config.bands, 'estadao', 'É ENGANOSO')).toBe('impreciso')
    expect(bandFor(config.bands, 'estadao', 'está subestimado')).toBe('impreciso')
  })

  it('gives an unknown label the band "sem faixa" and no mapped band', () => {
    expect(bandFor(config.bands, 'lupa', 'AINDA É CEDO PARA DIZER')).toBe('sem faixa')
    expect(mappedBand(config.bands, 'lupa', 'AINDA É CEDO PARA DIZER')).toBeNull()
  })

  it('does not borrow a label from another outlet', () => {
    expect(mappedBand(config.bands, 'g1', 'VERDADEIRO')).toBeNull()
    expect(mappedBand(config.bands, 'unknown-outlet', '#FATO')).toBeNull()
  })

  it('tells a label mapped to "sem faixa" from an unmapped one', () => {
    expect(mappedBand(config.bands, 'lupa', 'INSUSTENTÁVEL')).toBe('sem faixa')
  })
})

describe('excerpt (edge cases: 280 chars, empty explanation)', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i % 10}xx`).join(' ')

  it('keeps a 280-char text whole', () => {
    const text = `${words(56)}a`
    expect(text).toHaveLength(280)
    expect(excerpt(text)).toBe(text)
  })

  it('cuts a longer text at the last word boundary before 280 chars and appends "…"', () => {
    const text = words(60) // 299 chars, words of 4 chars
    const result = excerpt(text)
    expect(result.endsWith('…')).toBe(true)
    const body = result.slice(0, -1)
    expect(body.length).toBeLessThanOrEqual(280)
    expect(body).toBe(words(56)) // 56 words = 279 chars; the 57th would end at 284
    expect(text.startsWith(`${body} `)).toBe(true)
  })

  it('cuts at the space when a word ends exactly at char 280', () => {
    const text = `${'a'.repeat(279)}b ccc`
    expect(excerpt(text)).toBe(`${'a'.repeat(279)}b…`)
  })

  it('collapses whitespace', () => {
    expect(excerpt('  Segundo   o\n\nIBGE,\t a taxa caiu. ')).toBe('Segundo o IBGE, a taxa caiu.')
  })

  it('returns an empty string for an empty explanation', () => {
    expect(excerpt('')).toBe('')
    expect(excerpt(' \n ')).toBe('')
  })
})

describe('quote keys', () => {
  it('quoteKey folds accents and case, drops punctuation, collapses whitespace', () => {
    expect(quoteKey('  Eu NÃO disse,   "isso"! R$ 1,5 bi. ')).toBe('eu nao disse isso r 15 bi')
  })

  it('tokens keeps the distinct quoteKey words with 3 or more letters', () => {
    expect(tokens('O Brasil é o país que mais cresceu, o Brasil!')).toEqual(
      new Set(['brasil', 'pais', 'que', 'mais', 'cresceu']),
    )
  })
})

describe('cleanQuote', () => {
  it('rejects ")" left by a broken extraction', () => {
    expect(cleanQuote('")"')).toBeNull()
  })

  it('strips stray quote marks at the edges and collapses whitespace', () => {
    expect(cleanQuote(' “  O Brasil\n  cresceu 3% no ano ” ')).toBe('O Brasil cresceu 3% no ano')
    expect(cleanQuote('"O "Bolsa Família" voltou"')).toBe('O "Bolsa Família" voltou')
  })

  it('keeps an edge mark that pairs with a mark inside the quote', () => {
    expect(cleanQuote('Ele chamou o programa de “bolsa-farelo”')).toBe(
      'Ele chamou o programa de “bolsa-farelo”',
    )
    expect(cleanQuote('“Bolsa-farelo” foi o nome usado')).toBe('“Bolsa-farelo” foi o nome usado')
    expect(cleanQuote('“Ele chamou de “bolsa-farelo””')).toBe('Ele chamou de “bolsa-farelo”')
    expect(cleanQuote('Chamou de "bolsa-farelo"')).toBe('Chamou de "bolsa-farelo"')
    expect(cleanQuote('"Bolsa" e "Auxílio" acabaram')).toBe('"Bolsa" e "Auxílio" acabaram')
    expect(cleanQuote('"Bolsa" e "Auxílio"')).toBe('"Bolsa" e "Auxílio"')
  })

  it('strips an edge mark without a pair', () => {
    expect(cleanQuote('“Uma fala sem fechamento')).toBe('Uma fala sem fechamento')
    expect(cleanQuote('Uma fala sem abertura”')).toBe('Uma fala sem abertura')
    expect(cleanQuote('”Marca trocada no começo')).toBe('Marca trocada no começo')
    expect(cleanQuote('Ele chamou de “bolsa-farelo”””')).toBe('Ele chamou de “bolsa-farelo”')
    expect(cleanQuote('Uma fala cortada"')).toBe('Uma fala cortada')
    expect(cleanQuote('"Uma fala cortada')).toBe('Uma fala cortada')
    expect(cleanQuote('"O "Bolsa" acabou')).toBe('O "Bolsa" acabou')
  })

  it('accepts 10 characters and rejects 9', () => {
    expect(cleanQuote('"abcdefghij"')).toBe('abcdefghij')
    expect(cleanQuote('"abcdefghi"')).toBeNull()
  })
})
