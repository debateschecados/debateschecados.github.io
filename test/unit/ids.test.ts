import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { keylessIds, recordId } from '../../src/pipeline/ids.ts'

const sha12 = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12)

describe('recordId (INGEST-04)', () => {
  it('is the first 12 hex chars of SHA-256("<sourceId>|<key>") and stable across calls', () => {
    const id = recordId('g1-band-2026-10-18', 'chunk-7f3a')
    expect(id).toMatch(/^[0-9a-f]{12}$/)
    expect(id).toBe(sha12('g1-band-2026-10-18|chunk-7f3a'))
    expect(recordId('g1-band-2026-10-18', 'chunk-7f3a')).toBe(id)
  })

  it('differs for the same key under another source id', () => {
    expect(recordId('g1-globo-2026-10-23', 'chunk-7f3a')).not.toBe(
      recordId('g1-band-2026-10-18', 'chunk-7f3a'),
    )
  })
})

describe('keylessIds (Lupa)', () => {
  const source = 'lupa-band-2026-10-18'

  it('hashes "<quoteKey>#1" for a quote seen once', () => {
    const { ids, duplicates } = keylessIds(source, [
      { pos: 1, quote: 'O Brasil gerou 2 milhões de empregos.' },
    ])
    expect(ids).toEqual([sha12(`${source}|o brasil gerou 2 milhoes de empregos#1`)])
    expect(duplicates).toEqual([])
  })

  it('numbers two identical quotes #1 and #2 and reports one duplicate', () => {
    const quote = 'A inflação caiu pela metade no meu governo.'
    const { ids, duplicates } = keylessIds(source, [
      { pos: 3, quote },
      { pos: 4, quote: 'Outra fala qualquer do debate.' },
      { pos: 9, quote },
    ])
    expect(ids[0]).toBe(sha12(`${source}|a inflacao caiu pela metade no meu governo#1`))
    expect(ids[2]).toBe(sha12(`${source}|a inflacao caiu pela metade no meu governo#2`))
    expect(new Set(ids).size).toBe(3)
    expect(duplicates).toEqual([{ pos: 9, quote, n: 2 }])
  })

  it('treats quotes that differ only in case, accents or punctuation as the same quote', () => {
    const { ids, duplicates } = keylessIds(source, [
      { pos: 1, quote: 'A inflação caiu.' },
      { pos: 2, quote: 'a inflacao caiu' },
    ])
    expect(ids[1]).toBe(sha12(`${source}|a inflacao caiu#2`))
    expect(duplicates).toEqual([{ pos: 2, quote: 'a inflacao caiu', n: 2 }])
  })

  it('gives the same ids for the same input', () => {
    const items = [
      { pos: 1, quote: 'Primeira fala do candidato.' },
      { pos: 2, quote: 'Segunda fala do candidato.' },
    ]
    expect(keylessIds(source, items)).toEqual(keylessIds(source, items))
  })
})
