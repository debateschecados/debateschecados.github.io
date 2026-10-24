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
    pinned: [
      {
        key: null,
        doc: 0,
        pos: 1,
        anchor: null,
        speakerRaw:
          'Luiz Inácio Lula da Silva (PT), presidente e candidato à reeleição, em debate no dia 18 de outubro de 2026 na Band',
        quote: 'É importante lembrar que este país cresceu 7,5% em 2010',
        label: 'VERDADEIRO',
        explanation:
          'Segundo dados da série histórica do Instituto Brasileiro de Geografia e Estatística (IBGE), que trata do crescimento ou retração da economia brasileira, o Brasil encerrou o ano de 2010 — o último do segundo mandato de Lula — com um crescimento de 7,5%.',
      },
      {
        key: null,
        doc: 0,
        pos: 41,
        anchor: null,
        speakerRaw:
          'Flávio Bolsonaro (PL), candidato à Presidência, em debate no dia 18 de outubro de 2026 na Band',
        quote:
          'Você foi condenado no STJ, você foi condenado no STF, você foi condenado em todas as instâncias, Lula. E foi descondenado pelos seus amigos',
        label: 'FALSO',
        explanation:
          'Lula recebeu duas condenações na Lava Jato: no caso do sítio de Atibaia e do triplex do Guarujá. Nenhuma delas, porém, foi confirmada pelo Supremo Tribunal Federal (STF). Ambas foram posteriormente anuladas pela Corte.\nNo caso do tríplex do Guarujá, o petista foi condenado em primeira instância pelo então juiz Sergio Moro por corrupção passiva e lavagem de dinheiro. A acusação era de que ele teria recebido vantagens indevidas da empreiteira OAS, incluindo a reserva e a reforma do apartamento, em contrapartida a contratos da empresa com a Petrobras. A condenação foi confirmada pelo Tribunal Regional Federal da 4ª Região (TRF4). Em abril de 2019, o Superior Tribunal de Justiça (STJ) manteve a condenação, mas reduziu a pena para oito anos, dez meses e 20 dias. O STJ e o STF são tribunais distintos.\nNo caso sítio de Atibaia, Lula também foi condenado por corrupção passiva e lavagem de dinheiro, sob a acusação de ter sido beneficiado por reformas custeadas pelas empreiteiras OAS e Odebrecht como pagamento de propina relacionada a contratos com a Petrobras. A condenação foi proferida em primeira instância pela juíza Gabriela Hardt e confirmada pelo TRF-4, que aumentou a pena para 17 anos, um mês e dez dias. Nesse processo, a condenação não chegou a ser confirmada pelo STJ.\nEm 2018, o STF negou um habeas corpus com o qual a defesa tentava impedir a prisão de Lula no caso do tríplex antes do encerramento dos recursos. Essa decisão tratava da possibilidade de execução provisória da pena, não de um julgamento sobre a culpa do petista. Portanto, não equivale a uma condenação pelo Supremo.\nEm março de 2021, o ministro Edson Fachin anulou as decisões da Justiça Federal de Curitiba nos processos contra Lula por reconhecer que aquele juízo não tinha competência para julgá-los. O plenário do STF confirmou a decisão por oito votos a três, em abril daquele ano. Com isso, as ações retornaram à primeira instância, mas, quando foram reiniciadas, já estavam prescritas.\nTambém é falso alegar que Lula foi “descondenado”. O que ocorreu foi a anulação das condenações, sem julgamento sobre o mérito das acusações, ou seja, a decisão do STF não concluiu se Lula cometeu ou não os crimes.',
      },
    ],
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
    pinned: [
      {
        key: null,
        doc: 0,
        pos: 1,
        anchor: null,
        speakerRaw:
          'Luiz Inácio Lula da Silva (PT), presidente e candidato à reeleição, em debate no dia 23 de outubro de 2026 na Globo',
        quote: 'Nós herdamos 6.000 obras paradas.',
        label: 'SUBESTIMADO',
        explanation:
          'Painel do Tribunal de Contas da União indica que havia 8,6 mil obras paralisadas e 22,5 mil obras ativas em agosto de 2022, último ano do mandato de Jair Bolsonaro (PL) na Presidência. O número é 26% maior do que o indicado pelo candidato.\nEm abril de 2026, eram 4,2 mil obras paradas – 2 mil a menos do que em 2022 – e 22,4 mil obras em andamento.',
      },
      {
        key: null,
        doc: 0,
        pos: 43,
        anchor: null,
        speakerRaw:
          'Luiz Inácio Lula da Silva (PT), presidente e candidato à reeleição, em debate no dia 23 de outubro de 2026 na Globo',
        quote:
          'No túnel de Santos, quem tá colocando dinheiro para fazer somos nós, tanto do orçamento quanto o financiamento do BNDES.',
        label: 'FALTA CONTEXTO',
        explanation:
          'O túnel Santos-Guarujá tem investimentos de R$ 6,8 bilhões. Desse total, R$ 5,14 bilhões são de aporte público, divididos igualmente entre o governo de São Paulo e o governo federal. O restante é parte da iniciativa privada.\nA parte que coube ao governo de São Paulo virá de um empréstimo feito pelo Banco do Brasil.\nA ligação entre Santos e Guarujá, atualmente feita por balsas ou por um trajeto de 40 quilômetros de estrada, será substituída por um túnel de 900 metros de extensão e 18 metros de profundidade no estuário de Santos. As obras devem ser iniciadas em 2027.',
      },
    ],
  },
})
