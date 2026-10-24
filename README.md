# Debates Checados

Arquivo público das checagens que quatro agências (Aos Fatos, Estadão Verifica, g1 Fato ou Fake e Lupa) publicaram sobre os debates do 2º turno de 2026 entre Lula e Flávio Bolsonaro, na Band (18/10) e na Globo (23/10).

Um script lê a página de cobertura de cada agência a cada seis horas, grava as checagens em `data/` e publica um site estático no GitHub Pages. Não há servidor nem banco de dados. O histórico do git é o registro de tudo o que mudou.

## O que é e o que não é

- O veredito é sempre da agência. Cada agência tem os próprios rótulos (`#NÃOÉBEMASSIM`, `FALTA CONTEXTO`, `é enganoso`), e o site mostra todos numa escala comum de quatro faixas (verdadeiro, impreciso, falso, sem faixa). A tabela que põe cada rótulo numa faixa é pública, em `config/bands.json`. O rótulo original fica sem alteração nos dados (`label`) e aparece ao passar o mouse sobre o veredito.
- Entra tudo o que a agência publicou na página de cobertura do debate, com qualquer veredito. Não é uma lista de mentiras de ninguém.
- O placar conta checagens, não falas. Cada agência escolhe o que checar, então um candidato com mais "falso" pode simplesmente ter tido mais falas checadas. No placar geral, a mesma fala checada por duas agências conta duas vezes.
- Rótulos sem correspondência clara (`INSUSTENTÁVEL` da Lupa, `é inconclusivo` do Estadão) ficam em "sem faixa", que aparece em todo placar, mesmo zerado.
- A IA só agrupa checagens da mesma alegação, sem saber a agência nem o veredito. Ela nunca define veredito. Os leitores de página (`src/adapters/`) são código comum, o mesmo para os dois candidatos.
- O repositório não guarda o HTML das agências. Cada checagem aponta para a página original e, quando já existe, para uma cópia arquivada na Wayback Machine.
- Uma checagem que some da página da agência continua publicada, marcada com a data em que deixou de ser encontrada. Fica fora dos placares e escondida da lista até alguém ligar "Mostrar removidos".

## Como rodar localmente

Precisa de Node 24 ou mais novo (`.nvmrc` fixa o 24) e do pnpm na versão de `packageManager` do `package.json`.

```sh
pnpm install
pnpm ingest
pnpm build
python3 -m http.server --directory dist 8000
```

`pnpm ingest` acessa as páginas das agências (precisa de rede), junta o que encontrou com o que já está em `data/` e regrava `checks.json`, `checks.csv` e `run-report.json`. O cliente HTTP respeita o `robots.txt` de cada site e espera 5 segundos entre duas requisições ao mesmo domínio. Os detalhes de cada execução (status HTTP, SHA-256 de cada download, tempos, tentativas de arquivamento) vão para `.cache/run-log.json`, fora do git.

Com as variáveis de ambiente `IA_S3_ACCESS` e `IA_S3_SECRET` definidas (chaves do archive.org, veja a configuração do GitHub abaixo), o ingest também pede à Wayback Machine uma cópia de cada página que ainda não tem cópia verificada. Sem elas, só aproveita cópias que já existem.

`pnpm build` monta o site em `dist/` a partir de `site/`, `config/` e `data/`. O comando do Python serve a pasta em http://localhost:8000. Use um servidor em vez de abrir `dist/index.html` direto, porque o `app.js` é um módulo JavaScript e o Chrome não carrega módulos em `file://`.

Para ver todas as opções do ingest:

```sh
node src/ingest.ts --help
```

### Modo offline

O modo offline lê as páginas de uma pasta em vez da rede e não arquiva nada. Serve para mexer nos leitores e no site sem acessar as agências. A pasta `.cache/` precisa ter cada página salva como `<id da fonte>.html`. A fonte do Aos Fatos na Globo também precisa de `aosfatos-globo-2026-10-23.json`, a resposta da API Escriba. Os ids das fontes estão em `config/debates.json`.

`.cache/` não vem no repositório, porque o projeto não redistribui o HTML das agências. Os arquivos esperados e seus SHA-256 estão em `test/golden/fixtures.json`. Este comando confere se os seus batem:

```sh
node test/golden/fetch-fixtures.ts
```

Ele só consegue baixar sozinho os arquivos fixados a partir de uma cópia da Wayback Machine. Os de hoje foram salvos direto das agências em 24/10/2026, então quem não tem a pasta precisa salvar as páginas à mão, com os nomes acima.

Para não misturar o resultado com os dados publicados, grave em outra pasta:

```sh
pnpm ingest --offline .cache --data-dir .cache/data
pnpm build --data-dir .cache/data
pnpm check:labels .cache/data/run-report.json
```

### Verificações

```sh
pnpm typecheck
pnpm lint
pnpm vitest run test/unit/normalize.test.ts
pnpm vitest run test/golden/g1.test.ts
pnpm vitest run test/e2e/site.test.ts
```

Rode os testes um arquivo por vez, como acima. Os testes golden usam as páginas de `.cache/` e conferem a contagem de checagens e de rótulos de cada página. O teste e2e abre o site num Chromium de verdade, o de `CHROMIUM_PATH` (padrão `/usr/bin/chromium`). Se esse arquivo não existir, ele usa o Google Chrome instalado. No GitHub Actions, o workflow roda `pnpm test:unit` (só os testes unitários).

## Como auditar

São os mesmos cinco passos do roteiro que o site oferece para colar numa IA, no botão "Como auditar". Dá para fazer à mão.
1. Leia os parsers em `src/adapters` e veja se algum trata Lula e Flávio Bolsonaro de forma diferente. O nome de quem falou só vira um candidato em `src/pipeline/normalize.ts`, pela lista de apelidos de `config/candidates.json`.
2. Sorteie 10 checagens de `data/checks.csv`. Para cada uma, abra o link da agência (`url`) ou a cópia na Wayback Machine (`archive_url`) e confira se a fala, o candidato e o rótulo batem.
3. Confira se a tabela de faixas (`config/bands.json`) classifica cada rótulo sem depender de quem falou. A página "Como funciona" do site mostra, ao lado da tabela, quantas vezes cada rótulo aparece para cada candidato.
4. Recalcule o placar de cada candidato a partir do CSV e compare com o que o site mostra. Deixe de fora as linhas com `missing_since` preenchido, que são checagens que sumiram da página da agência.
5. Procure no histórico de commits mudanças de rótulo ou remoções e veja se cada uma tem justificativa registrada. Mudanças de rótulo, fala ou candidato também ficam na coluna `history` do CSV, com a data em que foram detectadas.

O `sha256` de cada registro é o hash da cópia arquivada, não da página ao vivo (g1 e Estadão mudam bytes a cada acesso, por causa de anúncios). O `archive_url` já é o endereço `id_` da Wayback Machine, que devolve os bytes originais da página. A Wayback Machine entrega esse arquivo comprimido em gzip, e o hash é do conteúdo já descomprimido. Para conferir:

```sh
curl -s --compressed "<archive_url>" | sha256sum
```

Sem `--compressed` o hash sai diferente. Depois passe o arquivo pelo leitor indicado em `adapter` (`<tipo>@<versão>`), na versão do código daquele commit.

Achou um erro? Abra uma issue dizendo o `id` da checagem e o que está errado. Toda correção vira um commit público, com data.

## Grupos de alegações

A página "Comparar agências" (`comparar.html`) lê `data/claim-groups.json`, que junta as checagens de agências diferentes que avaliam a mesma alegação de um candidato no mesmo debate. Os grupos são propostos por agentes de IA e revisados à mão antes do commit. A curadoria não roda no workflow, só quando alguém a dispara.
1. Gere a entrada cega da rodada, com a data como nome:

   ```sh
   pnpm claims:input --run 2026-10-24
   ```

   O comando grava `data/claim-curation/<data>/input.json` só com o id de cada checagem, uma letra no lugar da agência, a fala e o trecho. Não sobrescreve uma rodada que já existe.
2. Rode a curadoria no Claude Code com o roteiro `data/claim-curation/<data>/workflow.js` (o da rodada anterior serve de ponto de partida): três curadores por debate, um juiz só onde eles discordam, um editor das frases e um revisor de neutralidade. A saída de cada um vai para a mesma pasta, como `curator-<debate>-<n>.json`, `judge-<debate>.json`, `editor.json` e `review.json`. O roteiro entra no mesmo commit.
3. Monte o arquivo de grupos:

   ```sh
   pnpm claims:assemble
   ```

   Sem argumento, usa a rodada mais recente. `pnpm claims:assemble <data>` escolhe outra. O comando falha se algum grupo quebrar uma regra, e o build também: checagem que não existe, debate ou candidato misturados, agência repetida, menos de duas checagens, checagem em dois grupos, frase vazia ou com mais de 120 caracteres.
4. Confira que o arquivo bate com as saídas commitadas:

   ```sh
   pnpm check:claims
   ```

   O comando refaz os grupos, sai com erro se `data/claim-groups.json` estiver diferente e lista cada mudança feita à mão, com o motivo. O workflow do GitHub roda essa conferência depois de `check:labels`.

Mudança à mão vai em `data/claim-curation/<data>/manual.json`, nunca direto no arquivo de grupos:

```json
{
  "edits": [
    {
      "from": ["92e3caa21ac1", "df250d7b4df0"],
      "to": {
        "records": ["5434697c0611", "92e3caa21ac1", "df250d7b4df0"],
        "claim": "O governo Lula abriu 700 novos mercados"
      },
      "reason": "A checagem do g1 (5434697c0611) também avalia os 700 novos mercados; incluída na revisão do mantenedor em 2026-10-24."
    }
  ]
}
```

`from` lista as checagens do grupo que sai (`null` para só criar um grupo), `to` traz as checagens e a frase do grupo que entra (`null` para só remover) e `reason` é obrigatório. As edições valem na ordem do arquivo, e o grupo criado assim fica com origem `manual`. Um `from` que não bate com nenhum grupo faz o `claims:assemble` falhar.

## Como adicionar um debate

Se as agências usam um formato de página que já tem leitor, não precisa mexer em código.
1. Em `config/debates.json`, acrescente um item em `debates` com `id` (por exemplo `sbt-2028-10-20`), `broadcaster` (nome e caminho do logo), `date`, `round`, `candidates` (ids de `config/candidates.json`) e `sources`. Cada fonte tem um `id` estável (por convenção `<agência>-<id do debate>`), o `outlet` (chave de `config/outlets.json`), o `adapter` e a `url` da página de cobertura.
2. Ponha o logo da emissora em `site/logos/`.
3. Candidato novo vai em `config/candidates.json`, com `aliases` (nome do jeito que as agências escrevem, sem acento e em minúsculas), `partyLogo` e `sprite`. Os bonecos são pixel art definida em `site/sprites/render.py`. Um candidato novo precisa ser desenhado lá, com o mesmo corpo e o mesmo número de quadros de boca dos outros, e o script gera `<sprite>.svg` e `<sprite>-talk.svg`.
4. Agência nova vai em `config/outlets.json`. Os rótulos dela vão em `config/bands.json`, cada um com sua faixa.
5. Rode `pnpm ingest`. O próximo ciclo do workflow faz o mesmo sozinho.

Os leitores disponíveis estão em `src/adapters/index.ts`: `g1-page`, `lupa-page`, `estadao-page` e `aosfatos`. Uma fonte com `adapter` desconhecido falha e aparece no `run-report.json`, sem derrubar as outras. O config é validado antes de qualquer acesso à rede, e o erro diz qual campo está errado.

Um formato de página novo pede um leitor novo em `src/adapters/`, uma linha no registro de `src/adapters/index.ts` e testes. Cada leitor tem um `version`. Aumente esse número em qualquer mudança que altere o que ele extrai. Cada registro guarda em `adapter` o `<tipo>@<versão>` que produziu o conteúdo atual dele, e é por isso que dá para refazer a leitura de uma cópia antiga com o código certo.

Um rótulo que não está em `config/bands.json` é publicado como "sem faixa", aparece no `run-report.json` e deixa a execução do workflow vermelha no último passo (`pnpm check:labels`), depois que o site já foi publicado. O vermelho é o aviso para incluir o rótulo na tabela.

## Configuração no GitHub

O workflow `.github/workflows/update.yml` roda a cada seis horas (minuto 17), a cada push em `main` e quando alguém dispara pela aba Actions. Ele testa, coleta, faz commit de `data/` só quando algo mudou, monta o site e publica no Pages, tudo no mesmo job. Antes da primeira execução:
- [ ] Repositório público, com o código em `main`.
- [ ] Em Settings > Pages, Source em "GitHub Actions".
- [ ] Uma conta gratuita no archive.org. As chaves ficam em https://archive.org/account/s3.php.
- [ ] Em Settings > Secrets and variables > Actions, os secrets `IA_S3_ACCESS` (a access key) e `IA_S3_SECRET` (a secret key). Sem eles, as checagens novas saem sem cópia arquivada nem hash.
- [ ] O workflow precisa conseguir dar push em `main`. Ele pede `contents: write` sozinho. Se houver proteção de branch ou ruleset em `main`, libere o `github-actions[bot]`.
- [ ] Rode o workflow uma vez pela aba Actions (`update` > Run workflow) e confira o resumo da execução.

O campo `accept_drop` do disparo manual existe para quando uma agência apaga muitas checagens de verdade. Se uma fonte devolve menos de 80% dos registros publicados, o ingest marca a fonte como `partial` e mantém os registros antigos. Para aceitar a queda, dispare o workflow com o id da fonte nesse campo. Localmente, o equivalente é `pnpm ingest --accept-drop=<id da fonte>`.

Se o GitHub Actions for bloqueado por alguma agência (a Lupa fica atrás do Cloudflare), rode `pnpm ingest` na sua máquina e dê push. O push em `main` dispara o workflow, que monta e publica o site.

O GitHub desliga workflows agendados depois de 60 dias sem atividade no repositório. O disparo manual continua funcionando.

## Arquivos de dados

Todos em `data/`, gerados pelo ingest. Não edite à mão.
- `checks.json` tem uma entrada por checagem, com `id` (fixo desde a primeira coleta), `sourceId`, `debate`, `outlet`, `speaker` (id do candidato), `quote` (a fala), `label` (o rótulo da agência, sem alteração), `band` (a faixa), `excerpt` (até 280 caracteres da explicação da agência), `url` (onde conferir), `adapter`, `evidence` (página lida, data da coleta, cópia arquivada e SHA-256 da cópia), além de `missingSince` e `history` quando for o caso.
- `checks.csv` tem as mesmas checagens, uma por linha, com `evidence` aberto nas colunas `evidence_url`, `fetched_at`, `archive_url` e `sha256`, e `history` como texto JSON. UTF-8, aspas no padrão RFC 4180.
- `run-report.json` resume a última execução por fonte: status (`ok`, `failed` ou `partial`), motivo da falha, versão do leitor, quantidade de checagens, itens excluídos (com o motivo), duplicados, rótulos sem faixa, comentários do Aos Fatos ainda sem selo e checagens esperando cópia arquivada. Não tem data nem hash por execução, então só muda quando algo de fato mudou.

O site serve os três arquivos na raiz, junto com `bands.json`.

## Licenças e créditos

- Código: GNU Affero General Public License, versão 3 apenas (AGPL-3.0-only). Veja `LICENSE`.
- Dados (`data/checks.json`, `data/checks.csv`, `data/run-report.json`) e a tabela de faixas (`config/bands.json`): Creative Commons Atribuição 4.0 (CC BY 4.0).
- As falas citadas, os rótulos e os trechos das explicações continuam sendo das agências que os publicaram (g1 Fato ou Fake, Agência Lupa, Aos Fatos, Estadão Verifica). Aparecem com link para a página original e não estão cobertos pelas licenças acima.
- Logos dos partidos e das emissoras (`site/logos/`): marcas dos seus donos, tiradas do Wikimedia Commons, usadas só para identificar. Também não estão cobertos pelas licenças acima.
- Ilustrações dos candidatos (`site/sprites/`): desenhadas pelo projeto a partir dos retratos oficiais. Lula: Palácio do Planalto, CC BY 2.0. Flávio Bolsonaro: Agência Senado. Os dois retratos estão no Wikimedia Commons.
- Fontes (`site/fonts/`): Inter e Inter Tight, de Rasmus Andersson e The Inter Project Authors, SIL Open Font License 1.1, tiradas dos pacotes npm `@fontsource/inter` 5.3.0 e `@fontsource/inter-tight` 5.3.0.

Os detalhes estão em `NOTICE`.
