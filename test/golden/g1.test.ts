import { describeGolden } from './golden.ts'

describeGolden('g1', {
  'g1-band-2026-10-18': {
    items: 37,
    quotes: 35,
    labels: { '#FATO': 16, '#NÃOÉBEMASSIM': 9, '#FAKE': 12 },
  },
  'g1-globo-2026-10-23': {
    items: 20,
    quotes: 19,
    labels: { '#FATO': 10, '#/FATO': 1, '#NÃOÉBEMASSIM': 7, '#FAKE': 2 },
  },
})
