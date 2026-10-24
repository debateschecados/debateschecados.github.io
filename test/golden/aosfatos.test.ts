import { describe, expect, it } from 'vitest'
import { aosfatos } from '../../src/adapters/aosfatos.ts'
import { loadFixture } from './fixtures.ts'
import { describeGolden } from './golden.ts'

describeGolden('aosfatos', {
  'aosfatos-band-2026-10-18': {
    items: 49,
    labels: { verdadeiro: 18, 'não é bem assim': 15, falso: 16 },
    pinned: [
      {
        key: 'ae98f6ac-9518-41a1-ba91-5de7b9a7857c',
        doc: 0,
        pos: 1,
        anchor: 'ae98f6ac-9518-41a1-ba91-5de7b9a7857c',
        speakerRaw: 'Flávio Bolsonaro',
        quote:
          'como tem no atual governo, que faz uma política de desencarceramento, que coloca nas ruas marginais perigosos, alegando que não tem vagas no sistema penitenciário.',
        label: 'não é bem assim',
        explanation:
          'O governo federal adotou, em parceria com o CNJ (Conselho Nacional de Justiça), uma política para reduzir a superlotação dos presídios, mas ela não determina a soltura indiscriminada de criminosos perigosos por falta de vagas. Elaborado pelo Ministério da Justiça e pelo CNJ por determinação do STF, o plano Pena Justa prevê, entre outras medidas, a aplicação de penas alternativas nos casos permitidos por lei. A substituição da prisão por medidas como prestação de serviços à comunidade é permitida, em regra, para condenações de até quatro anos por crimes cometidos sem violência ou grave ameaça, desde que o juiz considere a medida adequada. Já a possibilidade de saída antecipada por falta de vagas no regime prisional adequado decorre de entendimento do STF de 2016, anterior ao governo Lula, e também depende de decisão judicial.',
      },
      {
        key: '3e41fa21-03b6-49e7-9a52-2759f1def7aa',
        doc: 0,
        pos: 49,
        anchor: '3e41fa21-03b6-49e7-9a52-2759f1def7aa',
        speakerRaw: 'Flávio Bolsonaro',
        quote:
          'Bom, você está vendo as propostas que ele fala que são para te proteger, até agora não fizeram efeito, né? Vocês estão vendo a redução aí de roubo de celular?',
        label: 'falso',
        explanation:
          'Flávio sugere que o número de registros de roubo de celulares não teria caído durante o governo Lula, mas eles diminuíram, sim. Segundo os dados mais recentes do Fórum Brasileiro de Segurança Pública, foram registrados 308,7 mil roubos de celulares (cerca de 144,7 casos para cada 100 mil habitantes) em 2025. Esse número é o menor registrado no terceiro mandato de Lula e é bem menor do que o registrado em 2022, último ano de Bolsonaro no poder: 492,9 mil roubos (cerca de 242,7 casos para cada 100 mil habitantes). O número de 2025 continua menor do que 2022 mesmo se levarmos em conta os furtos: em 2025, foram 483,5 mil furtos (226,6 para cada 100 mil habitantes); enquanto em 2022 foram 490,7 mil (241,7 para cada 100 mil habitantes). Dos 27 estados, apenas Rio de Janeiro (+22,7%) e Paraíba (+21,1%) apresentaram crescimento no número de ocorrências.',
      },
    ],
  },
  'aosfatos-globo-2026-10-23': {
    items: 37,
    labels: { verdadeiro: 20, 'não é bem assim': 9, falso: 8 },
    pinned: [
      {
        key: 'a4b43b35-457f-4eb8-82cf-2cf54c34aba8',
        doc: 1,
        pos: 1,
        anchor: 'a4b43b35-457f-4eb8-82cf-2cf54c34aba8',
        speakerRaw: 'Flávio Bolsonaro',
        quote:
          'O TCU, o Tribunal de Contas da União, acaba de soltar um relatório que existem mais de 11.500 obras paralisadas do atual governo.',
        label: 'falso',
        explanation:
          'Atualmente, 4.215 obras estão paralisadas, de acordo com o Painel de Obras Paralisadas do TCU (Tribunal de Contas da União). Ao todo, há 22.414 obras com orçamento da União. O número citado por Flávio Bolsonaro — de 11.469 obras paralisadas — era de 2025.',
      },
      {
        key: '061b5afd-03bf-4b68-86c8-0561b782b2cb',
        doc: 1,
        pos: 37,
        anchor: '061b5afd-03bf-4b68-86c8-0561b782b2cb',
        speakerRaw: 'Flávio Bolsonaro',
        quote: 'eu nunca fui investigado por causa de envolvimento com milícia.',
        label: 'não é bem assim',
        explanation:
          'Por mais que Flávio nunca tenha sido investigado por participação direta em esquemas de milicianos, o senador tem um histórico de relações com criminosos desse tipo. Levantamento da revista "piauí", por exemplo, revelou que, como deputado estadual na Alerj (Assembleia Legislativa do Estado do Rio de Janeiro), Flávio homenageou ao menos 23 militares e policiais declarados culpados ou condenados por crimes. Um exemplo é Adriano da Nóbrega, do Escritório do Crime, condecorado quando ele estava preso por suspeita de assassinar um guardador de carros. Flávio também empregou a mãe e a ex-esposa do miliciano em seu gabinete, com indícios de que eram funcionárias fantasmas e participavam de um esquema de desvio de salários no gabinete de Flávio, prática conhecida como rachadinha. Segundo a investigação, o responsável por coordenar saques em dinheiro era o então assessor parlamentar Fabrício Queiroz — ele, também, suspeito de ligação com grupos milicianos. Flávio Bolsonaro também homenageou o major Ronald, também do Escritório do Crime, depois que ele já estava sendo investigado pela participação na Chacina da Via Show, em 2003. Em 2008, quando a Alerj debatia a abertura da CPI das Milícias, Flávio se posicionou publicamente em favor desse grupos porque “eles se organizam para que o tráfico não impere nessas regiões”, nas palavras dele. Por fim, reportagem do "Estadão" revelou que o senador, em 2024, enviou uma emenda de cerca de R$ 200 mil após um pedido de Robson Calixto, conhecido como Peixe e condenado por envolvimento no assassinato da vereadora Marielle Franco (PSOL). A PF encontrou diálogos entre Calixto e uma assessora de Flávio Bolsonaro antes da liberação do dinheiro.',
      },
    ],
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
