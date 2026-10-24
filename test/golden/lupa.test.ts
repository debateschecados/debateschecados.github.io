import { describeGolden } from './golden.ts'

describeGolden('lupa', {
  'lupa-band-2026-10-18': {
    items: 41,
    labels: {
      VERDADEIRO: 11,
      EXAGERADO: 6,
      SUBESTIMADO: 2,
      'FALTA CONTEXTO': 7,
      FALSO: 11,
      INSUSTENTÁVEL: 4,
    },
  },
  'lupa-globo-2026-10-23': {
    items: 43,
    labels: {
      VERDADEIRO: 13,
      EXAGERADO: 6,
      SUBESTIMADO: 2,
      'FALTA CONTEXTO': 11,
      FALSO: 8,
      INSUSTENTÁVEL: 3,
    },
  },
})
