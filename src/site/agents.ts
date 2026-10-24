// Files an agent can fetch without running the page. GitHub Pages cannot negotiate
// Accept: text/markdown, so every representation is its own URL.
import { BANDS, type createContext } from '../../site/core.js'
import { fullDate } from '../../site/render.js'
import type { Config } from '../config.ts'
import { labelKey } from '../pipeline/normalize.ts'
import { CSV_COLUMNS } from '../pipeline/write.ts'

type Context = ReturnType<typeof createContext>

export interface AgentInput {
  origin: string // site origin, no trailing slash
  repo: string
  config: Config
  ctx: Context
}

// Both URL forms from llms.txt v2: extension replaced (page.md) and appended (page.html.md).
const MARKDOWN_TWINS = [
  ['index.md', 'index.html.md'],
  ['metodologia.md', 'metodologia.html.md'],
] as const

export const AGENT_FILES = [
  'llms.txt',
  'llms-full.txt',
  'auditoria.md',
  'robots.txt',
  'sitemap.xml',
  'checks.csv-metadata.json',
  'dataset.json',
  ...MARKDOWN_TWINS.flat(),
] as const

const abs = (origin: string, path: string) => `${origin}/${path}`

const cell = (value: string) =>
  value.replaceAll('|', '\\|').replaceAll('\r', '').replaceAll('\n', ' ')

const mdTable = (head: string[], rows: string[][]) => {
  const line = (values: string[]) => `| ${values.map(cell).join(' | ')} |`
  return [line(head), `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n')
}

const bandName = (band: string) => BANDS.find((item) => item.id === band)?.name ?? band

const foundRecords = (ctx: Context) => ctx.records.filter((record) => !record.missingSince)

// Same five steps as the button on the site.
export function auditPrompt(repo: string) {
  return `Quero que você faça uma auditoria independente do site Debates Checados, que reúne as checagens de quatro agências (Aos Fatos, Estadão Verifica, g1 Fato ou Fake e Lupa) sobre os debates do 2º turno de 2026 entre Lula e Flávio Bolsonaro.

Código e dados: ${repo}
Todas as checagens: ${repo}/blob/main/data/checks.csv

A coleta não usa modelo de linguagem.

Faça cada passo abaixo e mostre a evidência de cada um (arquivo e linha, ou link):

1. Leia os parsers em src/adapters e diga se algum trata Lula e Flávio Bolsonaro de forma diferente.
2. Sorteie 10 checagens do CSV. Para cada uma, abra o link da agência ou a cópia na Wayback Machine e confira se a fala, o candidato e o rótulo batem.
3. Confira se a tabela de faixas (config/bands.json) classifica cada rótulo sem depender de quem falou.
4. Recalcule o placar de cada candidato a partir do CSV e compare com o que o site mostra. Deixe de fora as linhas com missing_since preenchido.
5. Procure no histórico de commits mudanças de rótulo ou remoções e diga se cada uma tem justificativa registrada.

Aponte qualquer sinal de viés ou erro, mesmo pequeno. Se não conseguir verificar algum ponto, diga que não conseguiu, em vez de supor.`
}

const COLUMN_NOTES: Record<(typeof CSV_COLUMNS)[number], string> = {
  id: 'Identificador fixo da checagem, 12 hex, atribuído na primeira coleta.',
  source_id: 'Id da fonte em config/debates.json.',
  debate: 'Id do debate, por exemplo globo-2026-10-23.',
  outlet: 'Chave da agência em config/outlets.json.',
  key: 'Id do item na própria agência, quando existe.',
  pos: 'Posição na página da agência, começando em 1.',
  anchor: 'Âncora na página da agência, quando existe.',
  speaker: 'Id do candidato em config/candidates.json.',
  quote: 'Fala checada, como a agência publicou.',
  label: 'Rótulo da agência, sem alteração.',
  band: 'Faixa comum: verdadeiro, impreciso, falso ou sem faixa.',
  excerpt: 'Trecho da explicação da agência, até 280 caracteres.',
  url: 'Onde conferir: página da agência, com âncora quando existe.',
  adapter: 'Leitor que produziu o conteúdo atual, no formato tipo@versão.',
  evidence_url: 'Página ou API que o leitor leu.',
  fetched_at: 'Data da coleta que gravou o conteúdo atual, em ISO 8601.',
  archive_url: 'Cópia na Wayback Machine no endereço id_, ou vazio.',
  sha256: 'SHA-256 dos bytes descomprimidos dessa cópia, ou vazio. Não é o hash da página ao vivo.',
  missing_since:
    'Data em que a checagem deixou de aparecer na página. Vazio se ainda está lá. Fora do placar quando preenchido.',
  history:
    'JSON com rótulo, fala ou candidato anteriores, e a data until em que mudaram. Vazio se nunca mudou.',
}

function sourcesTable(config: Config, ctx: Context) {
  const rows = ctx.debates.flatMap((debate) => {
    const sources = config.debates.find((item) => item.id === debate.id)?.sources ?? []
    return [...sources]
      .sort((a, b) => ctx.outletIds.indexOf(a.outlet) - ctx.outletIds.indexOf(b.outlet))
      .map((source) => [
        `${debate.broadcaster.name}, ${fullDate(debate.date)}`,
        config.outlets[source.outlet].name,
        source.url ?? source.file ?? '',
        source.adapter,
      ])
  })
  return mdTable(['Debate', 'Agência', 'Página', 'Leitor'], rows)
}

function bandsTable(config: Config, ctx: Context) {
  const rows = ctx.outletIds.flatMap((outlet) =>
    (config.bands[outlet] ?? []).map((entry) => [
      config.outlets[outlet].name,
      entry.label,
      bandName(entry.band),
    ]),
  )
  return mdTable(['Agência', 'Rótulo', 'Faixa'], rows)
}

function countsTable(config: Config, ctx: Context) {
  const found = foundRecords(ctx)
  const rows = ctx.outletIds.flatMap((outlet) => {
    const entries = (config.bands[outlet] ?? []).map((entry) => ({
      label: entry.label,
      band: entry.band,
    }))
    const known = new Set(entries.map((entry) => labelKey(entry.label)))
    for (const record of ctx.records) {
      if (record.outlet !== outlet || known.has(labelKey(record.label))) continue
      known.add(labelKey(record.label))
      entries.push({ label: record.label, band: 'sem faixa' })
    }
    return entries.map((entry) => [
      config.outlets[outlet].name,
      entry.label,
      bandName(entry.band),
      ...ctx.candidates.map((candidate) =>
        String(
          found.filter(
            (record) =>
              record.outlet === outlet &&
              record.speaker === candidate.id &&
              labelKey(record.label) === labelKey(entry.label),
          ).length,
        ),
      ),
    ])
  })
  return mdTable(
    ['Agência', 'Rótulo', 'Faixa', ...ctx.candidates.map((candidate) => candidate.short)],
    rows,
  )
}

function indexMd(input: AgentInput) {
  const { origin, repo, ctx } = input
  const order = ctx.candidates
    .map((candidate) => `${candidate.number}, ${candidate.name}`)
    .join('; ')
  return `Índice para agentes: ${abs(origin, 'llms.txt')}

# Debates checados

Arquivo público das checagens que Aos Fatos, Estadão Verifica, g1 Fato ou Fake e Lupa publicaram sobre os debates do 2º turno de 2026 entre Lula e Flávio Bolsonaro, na Band (18/10) e na Globo (23/10).

O veredito é sempre da agência. Este site não muda o rótulo, não escolhe uma checagem e não emite veredito próprio. Entra o que as quatro publicaram na página de cobertura de cada debate.

## O que o placar conta

O placar conta checagens, não falas. Cada agência escolhe o que checar. Um candidato com mais itens em "falso" pode ter tido mais falas checadas. No placar geral, a mesma fala checada por duas agências conta duas vezes.

Uma linha com \`missing_since\` preenchido saiu da página da agência. Fica de fora dos placares.

Os candidatos aparecem em ordem crescente do número de urna: ${order}.

## Licença

Falas, rótulos e trechos continuam sendo das agências. A compilação (\`checks.csv\`, \`checks.json\`, \`run-report.json\`) e a tabela de faixas estão em CC BY 4.0. O código está em AGPL-3.0. \`robots.txt\` libera leitura e recusa treino de modelo.

## Onde ler

- [Como funciona](${abs(origin, 'metodologia.md')})
- [Como auditar](${abs(origin, 'auditoria.md')})
- [Checagens](${abs(origin, 'checks.csv')})
- [Código](${repo})
`
}

function methodMd(input: AgentInput) {
  const { origin, repo, config, ctx } = input
  return `Índice para agentes: ${abs(origin, 'llms.txt')}

# Como funciona

Este site reúne, sem alterar, as checagens que quatro agências publicaram sobre os debates do 2º turno de 2026. A coleta não usa modelo de linguagem. O mesmo leitor vale para os dois candidatos. A versão do leitor fica em \`adapter\`, no formato \`tipo@versão\`.

## Fontes e leitores

Entra tudo o que cada agência publicou na página de cobertura de cada debate, inclusive as falas que ela classificou como verdadeiras.

${sourcesTable(config, ctx)}

## Rótulos e faixas

Cada agência usa os próprios rótulos. A escala comum tem quatro faixas: ${BANDS.map((band) => band.name).join(', ')}. O rótulo original continua em \`label\`. Um rótulo ausente de \`bands.json\`, ou que não cabe em verdadeiro, impreciso ou falso, entra como "Sem faixa".

${bandsTable(config, ctx)}

A tabela publicada no site é [bands.json](${abs(origin, 'bands.json')}). A fonte no repositório é [config/bands.json](${repo}/blob/main/config/bands.json).

## Rótulos por candidato

A contagem abaixo usa as mesmas checagens do placar. Linhas com \`missing_since\` ficam de fora.

${countsTable(config, ctx)}

## Placares

Com uma agência escolhida, o placar conta só as checagens dela. Sem agência escolhida, soma todas. A mesma fala pode aparecer uma vez por agência.

## Dados

[checks.csv](${abs(origin, 'checks.csv')}) e [checks.json](${abs(origin, 'checks.json')}) têm as mesmas checagens. O significado de cada coluna do CSV está em [checks.csv-metadata.json](${abs(origin, 'checks.csv-metadata.json')}). Cada registro traz o link da agência, a cópia na Wayback Machine quando já foi conferida, o SHA-256 dessa cópia, a data da coleta e a versão do leitor.

O \`sha256\` é o hash dos bytes descomprimidos da cópia arquivada, não da página ao vivo. g1 e Estadão mudam bytes a cada acesso. Para conferir: \`curl -s --compressed "<archive_url>" | sha256sum\`. Sem \`--compressed\` o hash sai diferente.

Achou um erro? Abra uma issue em ${repo}/issues com o \`id\` da checagem. Toda correção vira um commit público, com data.
`
}

function auditMd(input: AgentInput) {
  const { origin, repo } = input
  return `Índice para agentes: ${abs(origin, 'llms.txt')}

# Como auditar

O texto abaixo é o mesmo do botão "Como auditar" no site. Siga os cinco passos. Mostre arquivo e linha, ou link. Se não conseguir verificar um passo, diga isso.

\`\`\`
${auditPrompt(repo)}
\`\`\`

## Conferir o hash

O \`sha256\` é o hash da cópia arquivada, não da página ao vivo. O \`archive_url\` é o endereço \`id_\` da Wayback Machine, que devolve os bytes originais. A resposta vem em gzip, e o hash é do conteúdo já descomprimido.

\`\`\`sh
curl -s --compressed "<archive_url>" | sha256sum
\`\`\`

Sem \`--compressed\` o hash sai diferente. Depois passe o arquivo pelo leitor indicado em \`adapter\` (\`tipo@versão\`), na versão do código daquele commit.

O nome de quem falou só vira um candidato em \`src/pipeline/normalize.ts\`, pela lista de apelidos de \`config/candidates.json\`.
`
}

function llmsTxt(input: AgentInput) {
  const { origin, repo } = input
  const link = (path: string, title: string, note: string) =>
    `- [${title}](${abs(origin, path)}): ${note}`
  return `# Debates checados

> Arquivo público das checagens de Aos Fatos, Estadão Verifica, g1 Fato ou Fake e Lupa sobre os debates do 2º turno de 2026 entre Lula e Flávio Bolsonaro (Band em 18/10 e Globo em 23/10). O veredito é sempre da agência. Este site reúne e organiza. Não emite veredito.

O placar conta checagens, não falas. Cada agência escolhe o que checar, e a mesma fala checada por duas agências conta duas vezes no placar geral. Uma linha com \`missing_since\` preenchido saiu da página da agência e fica fora dos placares.

A coleta, nos leitores em \`src/adapters\`, não usa modelo de linguagem e é a mesma para os dois candidatos.

Falas, rótulos e trechos são das agências. A compilação está em CC BY 4.0. O código está em AGPL-3.0. \`robots.txt\` libera a leitura (\`search\` e \`ai-input\`) e recusa treino de modelo (\`ai-train=no\`).

Para auditar, siga o roteiro e mostre arquivo e linha, ou link, em cada passo. Se não conseguir verificar um passo, diga isso em vez de supor.

## Ler

${link('index.md', 'O que é este site', 'o que entra no arquivo, o que o placar conta, e o que a licença não cobre')}
${link('metodologia.md', 'Como funciona', 'fontes, leitores, faixas e a contagem de cada rótulo por candidato')}
${link('auditoria.md', 'Como auditar', 'os cinco passos, mais a conferência do SHA-256 da cópia arquivada')}

## Dados

${link('checks.csv', 'Checagens (CSV)', 'uma checagem por linha, UTF-8, aspas no padrão RFC 4180')}
${link('checks.csv-metadata.json', 'Colunas do CSV', 'o que cada coluna significa, no formato CSVW')}
${link('checks.json', 'Checagens (JSON)', 'os mesmos registros do CSV')}
${link('bands.json', 'Tabela de faixas', 'em qual faixa cai cada rótulo de cada agência')}
${link('run-report.json', 'Relatório da última coleta', 'status de cada fonte, sem data nem hash por execução')}
${link('dataset.json', 'Ficha do conjunto', 'Dataset em schema.org, com as distribuições e as agências de origem')}

## Código

- [Repositório](${repo}): código, configuração e o histórico de toda correção
- [Leitores](${repo}/tree/main/src/adapters): um leitor por formato de página, o mesmo para os dois candidatos
- [Faixas no código](${repo}/blob/main/config/bands.json): a tabela que o site publica em bands.json
- [Checagens no repositório](${repo}/blob/main/data/checks.csv): o mesmo CSV, com o histórico do git
`
}

function robotsTxt(origin: string) {
  // ai-train=no because quotes, labels and excerpts belong to the outlets.
  // search and ai-input stay open: an agent may read the site to answer a person.
  return `# Content-Signal: https://blog.cloudflare.com/content-signals-policy/
# search: index this site and show links.
# ai-input: an agent may read the site to answer a person, including an audit.
# ai-train: no. Quotes, labels and excerpts belong to the outlets.

User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /

Sitemap: ${abs(origin, 'sitemap.xml')}
`
}

function sitemapXml(origin: string) {
  const paths = [
    '',
    'metodologia.html',
    ...AGENT_FILES.filter((file) => file !== 'robots.txt' && file !== 'sitemap.xml'),
    'checks.csv',
    'checks.json',
    'bands.json',
    'run-report.json',
  ]
  const urls = paths
    .map((path) => `  <url><loc>${path ? abs(origin, path) : `${origin}/`}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

function csvMetadata(origin: string) {
  return `${JSON.stringify(
    {
      '@context': 'http://www.w3.org/ns/csvw',
      url: abs(origin, 'checks.csv'),
      'dc:title': 'Checagens dos debates do 2º turno de 2026',
      'dc:description':
        'Checagens de Aos Fatos, Estadão Verifica, g1 Fato ou Fake e Lupa sobre os debates entre Lula e Flávio Bolsonaro. A compilação está em CC BY 4.0. Falas, rótulos e trechos continuam sendo das agências.',
      'dc:license': 'https://creativecommons.org/licenses/by/4.0/',
      dialect: { encoding: 'utf-8', lineTerminators: ['\r\n'], quoteChar: '"', header: true },
      tableSchema: {
        columns: CSV_COLUMNS.map((name) => ({
          name,
          datatype: name === 'pos' ? 'integer' : 'string',
          'dc:description': COLUMN_NOTES[name],
        })),
      },
    },
    null,
    2,
  )}\n`
}

function datasetJson(input: AgentInput) {
  const { origin, config, ctx } = input
  const dates = config.debates.map((debate) => debate.date).sort()
  const download = (path: string, encodingFormat: string) => ({
    '@type': 'DataDownload',
    encodingFormat,
    contentUrl: abs(origin, path),
  })
  return `${JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          name: 'Debates checados',
          url: `${origin}/`,
          inLanguage: 'pt-BR',
          description:
            'Checagens de quatro agências sobre os debates do 2º turno de 2026, com o veredito de cada uma numa escala comum.',
        },
        {
          '@type': 'Dataset',
          name: 'Checagens dos debates do 2º turno de 2026',
          description:
            'Cada registro é uma checagem publicada por Aos Fatos, Estadão Verifica, g1 Fato ou Fake ou Lupa. O veredito é o da agência. A compilação não cobre as falas, os rótulos nem os trechos.',
          url: `${origin}/`,
          inLanguage: 'pt-BR',
          license: 'https://creativecommons.org/licenses/by/4.0/',
          isAccessibleForFree: true,
          temporalCoverage: `${dates[0]}/${dates[dates.length - 1]}`,
          usageInfo: abs(origin, 'auditoria.md'),
          isBasedOn: ctx.outletIds.map((outlet) => ({
            '@type': 'CreativeWork',
            name: config.outlets[outlet].name,
            url: config.outlets[outlet].url,
          })),
          distribution: [
            download('checks.csv', 'text/csv'),
            download('checks.json', 'application/json'),
            download('checks.csv-metadata.json', 'application/json'),
            download('bands.json', 'application/json'),
          ],
        },
      ],
    },
    null,
    2,
  )}\n`
}

export function agentBundle(input: AgentInput) {
  const pages = {
    'index.md': indexMd(input),
    'metodologia.md': methodMd(input),
    'auditoria.md': auditMd(input),
  }
  const files: Record<string, string> = {
    ...pages,
    'llms.txt': llmsTxt(input),
    'llms-full.txt': `# Debates checados

> Texto das páginas ligadas em llms.txt. As checagens em si não estão aqui. Leia checks.csv.

${Object.values(pages).join('\n---\n\n')}`,
    'robots.txt': robotsTxt(input.origin),
    'sitemap.xml': sitemapXml(input.origin),
    'checks.csv-metadata.json': csvMetadata(input.origin),
    'dataset.json': datasetJson(input),
  }
  for (const [page, alias] of MARKDOWN_TWINS) files[alias] = files[page]
  const missing = AGENT_FILES.find((name) => files[name] === undefined)
  if (missing) throw new Error(`agent file ${missing} was not built`)
  return {
    auditPrompt: auditPrompt(input.repo),
    jsonLd: files['dataset.json'],
    files,
  }
}
