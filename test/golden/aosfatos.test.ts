import { describe, expect, it } from 'vitest'
import { aosfatos } from '../../src/adapters/aosfatos.ts'
import { loadFixture } from './fixtures.ts'
import { describeGolden } from './golden.ts'

describeGolden('aosfatos', {
  'aosfatos-band-2026-10-18': {
    items: 49,
    labels: { verdadeiro: 18, 'não é bem assim': 15, falso: 16 },
  },
  'aosfatos-globo-2026-10-23': {
    items: 37,
    labels: { verdadeiro: 20, 'não é bem assim': 9, falso: 8 },
    unrated: 24,
  },
})

describe('aosfatos Globo evidence', () => {
  it('reads the same items from the Escriba API doc alone', () => {
    const [page, api] = loadFixture('aosfatos-globo-2026-10-23')
    const both = aosfatos.parse([page, api])
    const alone = aosfatos.parse([api])
    expect(both.every((i) => i.doc === 1)).toBe(true)
    expect(alone.map(({ doc, ...rest }) => rest)).toEqual(both.map(({ doc, ...rest }) => rest))
  })
})
