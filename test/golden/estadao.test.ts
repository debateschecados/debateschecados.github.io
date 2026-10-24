import { describeGolden } from './golden.ts'

describeGolden('estadao', {
  'estadao-band-2026-10-18': {
    items: 28,
    labels: {
      'é verdadeiro': 9,
      'é enganoso': 7,
      'é impreciso': 1,
      'falta contexto': 5,
      'é exagerado': 3,
      'está subestimado': 1,
      'é falso': 2,
    },
  },
  'estadao-globo-2026-10-23': {
    items: 37,
    labels: {
      'é verdadeiro': 12,
      'é enganoso': 5,
      'é impreciso': 4,
      'falta contexto': 9,
      'é exagerado': 1,
      'é subestimado': 1,
      'é falso': 4,
      'é inconclusivo': 1,
    },
  },
})
