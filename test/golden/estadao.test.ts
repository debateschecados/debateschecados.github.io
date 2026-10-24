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
    pinned: [
      {
        key: 'TI7NVILDIBAGZDXI2Z5DCYAWPM',
        doc: 0,
        pos: 1,
        anchor: null,
        speakerRaw: 'Lula',
        quote:
          'que foi o primeiro presidente da República a conseguir dois graus de investimento para o Brasil',
        label: 'é verdadeiro',
        explanation:
          'Em 2008, durante o segundo mandato de Lula, o Brasil recebeu, pela primeira vez, o selo de grau de investimento das agências internacionais Fitch Ratings e S&P. Em 2009, o selo foi concedido pela agência Moody’s. O grau de investimento é uma espécie de atestado de bom pagador, que dá maior segurança para que investidores apliquem recursos em um País.',
      },
      {
        key: 'MBZVR57GBJGHFKOOLTLQJFJVJQ',
        doc: 0,
        pos: 28,
        anchor: null,
        speakerRaw: 'Flávio',
        quote:
          'que o simples fato de ter chegado na frente no primeiro turno fez a taxa de juros futura cair 2%.',
        label: 'é verdadeiro',
        explanation:
          'No dia seguinte ao primeiro turno, foi iniciado um movimento forte e rápido de queda nas taxas futuras negociadas no mercado. Esse movimento se estendeu nos dias seguintes. A queda chegou a ultrapassar os 2%, como noticiado pela Veja Negócios. Segundo a imprensa especializada, isso se deu em decorrência da inesperada liderança de Flávio no primeiro turno. Os investidores avaliam que a eventual vitória dele pode resultar em um ajuste fiscal mais forte.',
      },
    ],
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
    pinned: [
      {
        key: 'DLNBOZ2VVJGVNKQMTY7OE5LVR4',
        doc: 0,
        pos: 1,
        anchor: null,
        speakerRaw: 'Lula',
        quote: 'que, quando assumiu o governo em 2023, encontrou 6 mil obras paralisadas.',
        label: 'é subestimado',
        explanation:
          'O Tribunal de Contas da União (TCU) faz o acompanhamento periódico de obras paralisadas no País. Não há um dado específico para janeiro de 2023, e sim para abril daquele ano, quando o número de obras paralisadas era de 8.603, de um total de 21.005 obras em andamento. A maior parte das obras paralisadas naquele momento era na área da Educação (3.580) e de Infraestrutura e Mobilidade Urbana (1.854). O levantamento anterior, de agosto de 2022, tinha um número ainda maior de obras paralisadas: 8.674. Os números subiram para 11.944 em abril de 2024 e 11.469 em abril de 2025. O levantamento mais recente, de abril de 2026, mostra os menores números: 4.215 obras paralisadas, de um total de 22.414 em andamento.',
      },
      {
        key: 'DRQRN3EAMZCQHBWPHYUS5OQQPE',
        doc: 0,
        pos: 13,
        anchor: null,
        speakerRaw: 'Lula',
        quote: 'que Flávio Bolsonaro chamou o Bolsa Família de “bolsa-farelo”',
        label: 'é verdadeiro',
        explanation:
          'Em junho deste ano, o Estadão mostrou que um levantamento da AP Exata Inteligência a partir de publicações de Flávio no X (antigo Twitter) indicou que o parlamentar mudou suas manifestações sobre o Bolsa Família após a chegada do pai, Jair Bolsonaro (PL), à Presidência. Em 2013, o senador fez uma postagem em que afirmou que o PT “perpetua a pobreza com o bolsa-farelo, mantendo as pessoas nessa dependência para não perder seus votos”. O candidato apagou suas publicações que criticavam o programa.',
      },
      {
        key: '3XSD5WVXSNBVDEK45RAYPQ2BNU',
        doc: 0,
        pos: 37,
        anchor: null,
        speakerRaw: 'Lula',
        quote: 'que há fotos de Flávio com Daniel Vorcaro.',
        label: 'é falso',
        explanation:
          'Não há registro de fotos de Flávio Bolsonaro com o ex-banqueiro Daniel Vorcaro. Em julho deste ano, o site ICL Notícias publicou uma foto de Flávio ao lado de Luiz Phillipi Machado de Moraes Mourão, o “Sicário” de Daniel Vorcaro. A foto teria sido feita em um hotel no Rio de Janeiro, em 2022. Primeiro, Flávio disse não saber se a foto era verdadeira; depois, alegou que a imagem tinha sido feita com inteligência artificial. Apesar de não serem conhecidas imagens do senador e candidato à Presidência ao lado de Daniel Vorcaro, as mensagens obtidas pela Polícia Federal no celular do ex-banqueiro registraram três meses de conversas com Flávio Bolsonaro e menções a seis encontros entre eles.',
      },
    ],
  },
})
