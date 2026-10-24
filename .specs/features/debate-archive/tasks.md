# Debate Archive Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/debate-archive/design.md`
**Status**: Draft

Local commits only. `git push`, creating the GitHub repo, setting secrets and deploying need the user's explicit go-ahead.

---

## Test Coverage Matrix

> Generated from project guidelines and spec; the repo has no code yet, so test types come from the approved design (vitest, playwright-core). Guidelines found: `~/AGENTS.md`, `~/.claude/CLAUDE.md` (never run the whole suite; always scope by file or `-t`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pipeline pure modules (config, normalize, ids, merge, write, check-labels) | unit | All branches; 1:1 to spec ACs; every listed edge case | `test/unit/<module>.test.ts` | `pnpm vitest run test/unit/<module>.test.ts` |
| Adapters, parse on hand-written docs | unit | Every shape in the design adapter table, every trap listed there, short-quote and unknown-label paths | `test/unit/adapters/<kind>.test.ts` | `pnpm vitest run test/unit/adapters/<kind>.test.ts` |
| Adapters on real pages | integration (golden) | Item count and label distribution per page equal the design table; two parses of the same doc are byte-identical | `test/golden/<kind>.test.ts` | `pnpm vitest run test/golden/<kind>.test.ts` |
| HTTP client, archiver | unit (fake fetch and clock) | Spacing, robots, timeout, host allowlist; snapshot found, verified, rejected, captured, no secrets | `test/unit/io/*.test.ts`, `test/unit/archive.test.ts` | `pnpm vitest run <file>` |
| Ingest CLI orchestration | integration (fake registry, temp dir) | OK run, failed source, partial source, unknown adapter, new debate by config, second run without diff | `test/integration/ingest.test.ts` | `pnpm vitest run test/integration/ingest.test.ts` |
| Site logic and templates (`core.js`, `render.js`, build) | unit | 1:1 to SITE, SCORE, SHARE, HIST-02 display ACs | `test/unit/site/*.test.ts` | `pnpm vitest run test/unit/site/<file>` |
| Site UI | e2e (playwright-core inside vitest) | 360 px, audit panel from both entry points, clipboard fallback, empty state, removed toggle, no cross-origin requests, sprites unchanged by filters | `test/e2e/site.test.ts` | `pnpm vitest run test/e2e/site.test.ts` |
| Types, config files, static markup, workflow, docs | none | Build gate only | - | build gate only |

## Gate Check Commands

> Scoped by file every time. Never `pnpm vitest run` without a path.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `pnpm vitest run <test files touched by the task>` |
| Full | After tasks with integration or e2e tests | Quick, then `pnpm vitest run <the task's golden, integration or e2e file>` |
| Build | After phase completion or config-only tasks | `pnpm typecheck && pnpm lint`, then the phase's test directories one at a time (e.g. `pnpm vitest run test/unit/adapters`) |

---

## Execution Plan

Phases run in order; tasks inside a phase run in order.

### Phase 1: Foundation

```
T1 → T2 → T3
```

### Phase 2: Pure pipeline

```
T4 → T5 → T6
T4 → T6
T7
```

### Phase 3: Sources

```
T8 → T13
T9 → T13
T10 → T13
T11 → T13
T12 → T13
```

### Phase 4: Orchestration

```
T14 → T15
T16
```

### Phase 5: Site

```
T17 → T18 → T20 → T21
T19 → T20
T17 → T21
T18 → T21
```

### Phase 6: Delivery

```
T22 → T23
T22 → T24
```

---

## Task Breakdown

### Phase 1: Foundation

### T1: Scaffold the repository and tooling

**What**: `git init`; `package.json` (`type: module`, `engines`, `#src/*` imports, scripts `ingest`, `build`, `typecheck`, `lint`, `test:unit`, `check:labels`), `tsconfig.json` per design, `biome.json`, `vitest.config.ts` with projects `unit`, `golden`, `integration`, `e2e`, `.nvmrc`, `.gitignore` (`node_modules`, `dist`, `.cache`), `LICENSE` (AGPL-3.0), `NOTICE` (CC BY 4.0 data, logos, fonts).
**Where**: `package.json` (plus the root config files listed)
**Depends on**: None
**Reuses**: design "Stack" and "TypeScript and module setup"
**Requirement**: DATA-05 (`.cache` ignored)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `pnpm install` succeeds with exact versions pinned; `typescript` is 7.x
- [ ] `pnpm typecheck` and `pnpm lint` pass on a placeholder `src/ingest.ts`
- [ ] `node src/ingest.ts --help` runs under Node 24 type stripping
- [ ] `git check-ignore .cache/x` matches

**Tests**: none
**Gate**: build

**Commit**: `build(repo): Scaffold Node 24, TypeScript 7, vitest and Biome`

**Status**: ✅ Complete

---

### T2: Define shared types

**What**: `Doc`, `ParsedItem`, `Adapter`, `Io`, `SourceConfig`, `CheckRecord`, `Band`, run-report types exactly as in the design.
**Where**: `src/types.ts`
**Depends on**: T1
**Reuses**: design "Adapter contract" and "Data Models"
**Requirement**: INGEST-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Every field in the design's interfaces exists with the same name and type
- [ ] Only `import type` / erasable syntax; `pnpm typecheck` passes

**Tests**: none
**Gate**: build

**Commit**: `feat(core): Add shared pipeline and record types`

**Status**: ✅ Complete

---

### T3: Load and validate the config files

**What**: zod schemas and `loadConfig(dir)` for `candidates.json`, `outlets.json`, `debates.json`, `bands.json`, `id-links.json`; real 2026 config files (8 sources with ids, 21 labels with bands from the design table, two candidates with aliases, numbers 13 and 22).
**Where**: `src/config.ts` (plus `config/*.json`)
**Depends on**: T2
**Reuses**: design "Configuration"
**Requirement**: CONF-01, DATA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Invalid files fail with an error naming file and field (missing source `id`, duplicate source `id`, unknown outlet, unknown candidate in a debate, band outside the four)
- [ ] Duplicate label keys for one outlet are rejected (`é subestimado` and `está subestimado` stay distinct)
- [ ] The real config loads and has 8 sources and 21 labels
- [ ] Gate check passes: `pnpm vitest run test/unit/config.test.ts`
- [ ] Test count: at least 8 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(config): Validate candidates, outlets, debates and bands`

**Status**: ✅ Complete

---

### Phase 2: Pure pipeline

### T4: Implement the normalizer

**What**: `nameKey`, `resolveSpeaker`, `labelKey`, `bandFor`, `excerpt`, `quoteKey`, `tokens`, `cleanQuote` (edge quote marks, whitespace, 10-char minimum).
**Where**: `src/pipeline/normalize.ts`
**Depends on**: T3
**Reuses**: design "Normalizer"
**Requirement**: INGEST-05, DATA-03, edge cases (unknown label, empty explanation, 280-char excerpt)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `FLÁVIO BOLSONARO (PL)`, `LULA (PT)`, `Luiz Inácio Lula da Silva (PT), presidente e candidato`, `Flávio`, `Lula` resolve; `Jornalista` and `César Tralli` return null
- [ ] `#/FATO` and `#FATO` share a key; unknown label → `sem faixa`
- [ ] Excerpt: 280-char boundary, last word boundary, "…", empty input → empty string
- [ ] `cleanQuote('")"')` is rejected
- [ ] Gate check passes: `pnpm vitest run test/unit/normalize.test.ts`
- [ ] Test count: at least 14 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pipeline): Normalize speakers, labels, quotes and excerpts`

**Status**: ✅ Complete

---

### T5: Assign record IDs

**What**: `recordId(sourceId, key)` and `keylessIds(sourceId, items)` with `#n` numbering for duplicate quotes, reporting duplicates.
**Where**: `src/pipeline/ids.ts`
**Depends on**: T4
**Reuses**: design "Record IDs"
**Requirement**: INGEST-04, duplicate edge case

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Same input → same 12-hex id; different source id → different id
- [ ] Two identical Lupa quotes in one source get `#1` and `#2` ids and one duplicate entry
- [ ] Gate check passes: `pnpm vitest run test/unit/ids.test.ts`
- [ ] Test count: at least 4 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pipeline): Assign stable record ids from source keys`

**Status**: ✅ Complete

---

### T6: Merge fresh items with published records

**What**: `merge()` per design steps 1 to 7: failed passthrough, 80% partial guard with `acceptDrop`, matching (key, quoteKey, Jaccard ≥ 0.6 same speaker, id-links), history for label/quote/speaker, silent overwrite of pos/anchor/excerpt/url, `missingSince` set and cleared, band recompute, stable sort with pt-BR collator.
**Where**: `src/pipeline/merge.ts`
**Depends on**: T4, T5
**Reuses**: design "Merger"
**Requirement**: INGEST-04, INGEST-06, HIST-01, HIST-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each of the 7 design steps has at least one test, plus: Lupa quote edited by one word keeps its id and adds a `history.quote` entry; two distinct quotes with Jaccard 0.35 do not match; unchanged input returns records deep-equal and in the same order
- [ ] Gate check passes: `pnpm vitest run test/unit/merge.test.ts`
- [ ] Test count: at least 14 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pipeline): Merge runs with history, missing items and drop guard`

**Status**: ✅ Complete

---

### T7: Write the dataset files

**What**: stable-key JSON writer for `checks.json` and `run-report.json`, RFC 4180 CSV writer with the design's columns.
**Where**: `src/pipeline/write.ts`
**Depends on**: T3
**Reuses**: design "Data Models" and "Run report"
**Requirement**: DATA-01, DATA-04, INGEST-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Same records → byte-identical files on two writes
- [ ] CSV quotes commas, quotes and newlines; `history` is a JSON column; header matches design
- [ ] Run report has no timestamp or hash fields
- [ ] Gate check passes: `pnpm vitest run test/unit/write.test.ts`
- [ ] Test count: at least 6 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pipeline): Write checks JSON, CSV and run report`

**Status**: ✅ Complete

---

### Phase 3: Sources

### T8: Build the polite HTTP client

**What**: `createHttp({ hosts, clock })` with 30 s timeout, user agent, 5 s per-domain spacing, robots check per domain, typed errors, and a host allowlist (agency hosts from config plus `archive.org` hosts).
**Where**: `src/io/http.ts`
**Depends on**: T3
**Reuses**: design "Polite HTTP client"
**Requirement**: INGEST-07, INGEST-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Two requests to one domain are ≥ 5 s apart on the fake clock; different domains are not delayed
- [ ] Disallowed path refused; Estadão rules (`Disallow: /estadao`, `Allow: /estadao-verifica`) allow both debate URLs
- [ ] Non-200 and timeout throw typed errors; a host outside the allowlist is refused before any request
- [ ] Gate check passes: `pnpm vitest run test/unit/io/http.test.ts`
- [ ] Test count: at least 7 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(io): Add rate-limited, robots-aware HTTP client`

**Status**: ✅ Complete

---

### T9: Parse g1 debate pages

**What**: `g1-page` adapter per the design table and g1 traps.
**Where**: `src/adapters/g1.ts`
**Depends on**: None
**Reuses**: design "MVP adapters"; T4 `cleanQuote`
**Requirement**: INGEST-02, INGEST-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Hand-written doc covers: single verdict, double verdict (summary skipped, two items with keys `chunk-x` and `chunk-x.2`), "selo de #FAKE" inside an explanation, `#/FATO`, content after "Veja também" ignored, speaker from the section intertitle
- [ ] Gate check passes: `pnpm vitest run test/unit/adapters/g1.test.ts`
- [ ] Test count: at least 6 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(adapters): Parse g1 Fato ou Fake debate pages`

**Status**: ✅ Complete

---

### T10: Parse Lupa debate pages

**What**: `lupa-page` adapter per the design table (key null).
**Where**: `src/adapters/lupa.ts`
**Depends on**: None
**Reuses**: design "MVP adapters"
**Requirement**: INGEST-02, INGEST-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Hand-written doc covers: quote with `<cite>`, label block, explanation up to `hr`, quote without label (reported, not emitted), `FALTA CONTEXTO`
- [ ] Gate check passes: `pnpm vitest run test/unit/adapters/lupa.test.ts`
- [ ] Test count: at least 5 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(adapters): Parse Lupa debate pages`

**Status**: ✅ Complete

---

### T11: Parse Estadão debate pages

**What**: `estadao-page` adapter reading `Fusion.globalContent.content_elements`.
**Where**: `src/adapters/estadao.ts`
**Depends on**: None
**Reuses**: design "MVP adapters"
**Requirement**: INGEST-02, INGEST-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Hand-written doc covers: `checou` and `investigou`, `O que Lula disse:` and `O que disse Lula:`, label cut at the first `.`, explanation is the rest, key is the "O que" element `_id`, conclusion without a preceding "O que" element reported
- [ ] Gate check passes: `pnpm vitest run test/unit/adapters/estadao.test.ts`
- [ ] Test count: at least 6 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(adapters): Parse Estadão Verifica pages from embedded JSON`

**Status**: ✅ Complete

---

### T12: Parse Aos Fatos pages and the Escriba API

**What**: `aosfatos` adapter: server HTML path, `escribaId` detection, API path with speaker inheritance, stamp display map, unrated comment count; `parse` works on the API doc alone.
**Where**: `src/adapters/aosfatos.ts`
**Depends on**: None
**Reuses**: design "MVP adapters"
**Requirement**: INGEST-02, INGEST-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Hand-written HTML and JSON docs cover: three stamp codes, unknown code kept verbatim, comment without `selo` skipped and counted, block without `speaker` inherits the previous one, `load` fetches the API only when `escribaId` exists
- [ ] Gate check passes: `pnpm vitest run test/unit/adapters/aosfatos.test.ts`
- [ ] Test count: at least 7 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(adapters): Parse Aos Fatos HTML and Escriba transcripts`

---

### T13: Register adapters and pin golden counts

**What**: `registry` map, plus golden tests that load pinned copies of the 8 real sources into `.cache/` (Wayback `id_` copies; fixture fetch helper uses T8) and assert counts and label distributions.
**Where**: `src/adapters/index.ts` (plus `test/golden/*.test.ts`)
**Depends on**: T8, T9, T10, T11, T12
**Reuses**: design label table counts
**Requirement**: INGEST-03, DATA-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Golden counts equal the design table: g1 37 / 20, Lupa 41 / 43, Aos Fatos 49 / 37, Estadão 28 / 37, with matching per-label counts
- [ ] Every golden item resolves a speaker and maps to a known label
- [ ] Parsing the same doc twice gives byte-identical JSON
- [ ] Gate check passes: `pnpm vitest run test/golden/g1.test.ts`, then lupa, estadao, aosfatos, one at a time
- [ ] Test count: at least 8 golden tests pass

**Tests**: integration
**Gate**: full

**Commit**: `test(adapters): Pin golden counts for the eight debate sources`

---

### Phase 4: Orchestration

### T14: Archive and verify evidence

**What**: `archive()` per design: availability lookup, `id_` download, parse-and-match verification, SPN2 capture with polling and 20 s spacing when secrets exist, null + report otherwise.
**Where**: `src/pipeline/archive.ts`
**Depends on**: T13
**Reuses**: T8 client, T13 registry
**Requirement**: DATA-02, DATA-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Fake-io tests: old snapshot that contains the record verifies; snapshot without the record is rejected and triggers a capture; non-200 snapshot ignored; no secrets → no capture and a report entry; poll timeout → null; records already archived and unchanged are skipped
- [ ] The SPN2 request shape is checked against the current Save Page Now 2 docs and the doc URL noted in a code comment
- [ ] Gate check passes: `pnpm vitest run test/unit/archive.test.ts`
- [ ] Test count: at least 7 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(pipeline): Archive and verify evidence on the Wayback Machine`

---

### T15: Wire the ingest command

**What**: `src/ingest.ts`: load config, run each source through its adapter, normalize, exclude unresolved speakers and short quotes into the report, merge, archive, write `data/`; flags `--help`, `--accept-drop`, `--data-dir`, `--offline <dir>`; per-run log to `run-log.json` and the job summary when `GITHUB_STEP_SUMMARY` is set.
**Where**: `src/ingest.ts`
**Depends on**: T14
**Reuses**: T3, T6, T7, T13, T14
**Requirement**: INGEST-01, INGEST-02, INGEST-05, INGEST-06, INGEST-09, CONF-01, CONF-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Integration tests with a fake registry and temp dir: full run writes the three files; failed source keeps old records; unknown adapter fails only its source and is named; a new debate added to config is ingested; second run with the same docs leaves the files byte-identical
- [ ] `node src/ingest.ts --help` exits 0
- [ ] Gate check passes: `pnpm vitest run test/integration/ingest.test.ts`
- [ ] Test count: at least 6 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(ingest): Wire sources, merge, archive and writers into one command`

---

### T16: Fail on unmapped labels

**What**: `check:labels` script that reads `data/run-report.json` and exits 1 listing every unmapped label.
**Where**: `src/check-labels.ts`
**Depends on**: None
**Reuses**: T7 report types
**Requirement**: DATA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Exit 0 with no unmapped labels, exit 1 naming outlet and label otherwise
- [ ] Gate check passes: `pnpm vitest run test/unit/check-labels.test.ts`
- [ ] Test count: at least 2 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ci): Fail the run when a label has no band`

---

### Phase 5: Site

### T17: Port the site state logic

**What**: `site/core.js` as an ES module: single-select filters, removed toggle, ordering with `Intl.Collator('pt-BR')`, scoreboard in ballot order with four bands and missing records excluded, general vs per-agency notice, URL read/write.
**Where**: `site/core.js`
**Depends on**: None
**Reuses**: `mocks/core.js`
**Requirement**: SITE-03, SITE-04, SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05, SHARE-01, SHARE-02, HIST-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tests 1:1 to each listed AC, plus: scoreboard total equals listed non-removed records for random filter combos on a fixture dataset; `sem faixa` present at zero; URL round-trip includes the toggle
- [ ] Gate check passes: `pnpm vitest run test/unit/site/core.test.ts`
- [ ] Test count: at least 14 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(site): Port filters, ordering and scoreboards to a module`

---

### T18: Share item and scoreboard templates

**What**: `itemHtml(record, ctx)` and `boardHtml(...)` string templates used by build and browser, with escaping.
**Where**: `site/render.js`
**Depends on**: T17
**Reuses**: render functions in `mocks/a-vitrine.html`
**Requirement**: SITE-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Item shows speaker, quote, verbatim label as the heading, band, outlet name, excerpt, agency link and, when present, archived copy link and "não encontrado na fonte desde" tag
- [ ] HTML in quotes is escaped
- [ ] Gate check passes: `pnpm vitest run test/unit/site/render.test.ts`
- [ ] Test count: at least 5 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(site): Add shared item and scoreboard templates`

---

### T19: Move the page shell and assets out of the mock

**What**: `site/index.html` (markup, CSS, audit panel text with the five rules, footer credits), self-hosted Inter and Inter Tight woff2, sprites and logos copied; sprite parity test.
**Where**: `site/index.html` (plus `site/fonts/`, `site/sprites/`, `site/logos/`)
**Depends on**: None
**Reuses**: `mocks/a-vitrine.html`, `mocks/sprites/`, `mocks/logos/`
**Requirement**: AUDIT-03, AUDIT-06, AUDIT-08, SITE-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] No `fonts.googleapis.com` or other absolute asset URL in `site/`
- [ ] Sprite test: both SVGs share viewBox and body rows, each has exactly two mouth frame groups, and the two talk animations have the same duration and 12 open-mouth beats
- [ ] Gate check passes: `pnpm vitest run test/unit/site/sprites.test.ts`
- [ ] Test count: at least 3 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(site): Add page shell, self-hosted fonts and sprites`

---

### T20: Build the static site

**What**: `src/site/build.ts`: copy `site/` and `data/` to `dist/`, inline data and config as JSON scripts, pre-render the list, render `metodologia.html` with the band table, label × candidate counts, candidate order rule, error-report instructions and credits.
**Where**: `src/site/build.ts`
**Depends on**: T18, T19
**Reuses**: T7 output, T18 templates
**Requirement**: SITE-01, DATA-01, DATA-03, DATA-05, DATA-07, AUDIT-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Built `index.html` contains one `<li data-id>` per record without running JS
- [ ] `metodologia.html` lists all 21 labels with bands and the per-candidate counts computed from the fixture data
- [ ] `dist/` holds `checks.json`, `checks.csv`, `bands.json` and nothing from `.cache/`
- [ ] Gate check passes: `pnpm vitest run test/unit/site/build.test.ts`
- [ ] Test count: at least 5 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(site): Build index and methodology pages from data`

---

### T21: Wire the browser app and check it in a real browser

**What**: `site/app.js`: adopt pre-rendered nodes, filters, removed toggle, empty state, scoreboard, audit `<dialog>` with clipboard and fallback, motion from the mock with reduced-motion off switch.
**Where**: `site/app.js`
**Depends on**: T17, T18, T20
**Reuses**: script in `mocks/a-vitrine.html`; Playwright scripts from the mock phase
**Requirement**: SITE-01, SITE-05, SITE-06, SITE-07, AUDIT-01, AUDIT-02, AUDIT-04, AUDIT-05, AUDIT-07, HIST-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] e2e on built `dist/`: no horizontal scroll at 360 px; panel opens from the inline link and the fixed button; "Prompt copiado" with clipboard and the fallback text without it; empty state with "Limpar filtros"; removed toggle shows the tagged item; zero requests to other origins; sprite markup identical before and after changing filters; no console errors
- [ ] Screenshots at 360 px and 1280 px reviewed
- [ ] Gate check passes: `pnpm vitest run test/e2e/site.test.ts`
- [ ] Test count: at least 8 e2e tests pass

**Tests**: e2e
**Gate**: full

**Commit**: `feat(site): Wire filters, audit panel and motion in the browser`

---

### Phase 6: Delivery

### T22: Add the update workflow

**What**: `.github/workflows/update.yml` per design, with pinned action versions, and a setup checklist (Pages source "GitHub Actions", `IA_S3_ACCESS` / `IA_S3_SECRET` secrets from a free archive.org account, bot allowed to push to `main`).
**Where**: `.github/workflows/update.yml`
**Depends on**: None
**Reuses**: design "Workflow"
**Requirement**: INGEST-01, DATA-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `actionlint` passes on the file
- [ ] Steps match the design order; deploy is in the same job; `check:labels` is last
- [ ] Setup checklist written in the README section of T23

**Tests**: none
**Gate**: build

**Commit**: `ci(update): Scrape, commit and deploy in one workflow`

---

### T23: Write the README

**What**: what the project is, how to run, how to audit (the same five steps as the prompt), how to add a debate, setup checklist from T22, licenses.
**Where**: `README.md`
**Depends on**: T22
**Reuses**: audit prompt text from `mocks/a-vitrine.html`
**Requirement**: DATA-07, CONF-01

**Tools**:

- MCP: NONE
- Skill: `unslop`

**Done when**:

- [ ] Every command in the README runs as written
- [ ] No em dash in the text

**Tests**: none
**Gate**: build

**Commit**: `docs(readme): Explain running, auditing and adding a debate`

---

### T24: Run the first real ingest locally

**What**: run `pnpm ingest` against the live sources, commit `data/`, run it again and confirm no diff; sample five records against agency page and archived copy.
**Where**: `data/checks.json` (generated)
**Depends on**: T22
**Reuses**: T15
**Requirement**: Success criteria

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Run report shows 8 sources `ok` and 292 records (or the difference is explained by agency changes since 2026-10-24)
- [ ] Second run: `git status --porcelain data/` is empty
- [ ] Five random records match statement, speaker and label on the agency page and, where present, the archived copy
- [ ] Records still waiting for a snapshot are listed for the user (expected until the archive.org keys exist)

**Tests**: none
**Gate**: full

**Commit**: `chore(data): Publish the first collected dataset`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
```

Inside each phase the arrows are the ones in the Execution Plan above; independent tasks (T7, T9 to T12, T16, T17, T19, T22) run in task-number order.

Batches for sub-agents (~7 tasks, whole phases): B1 = Phases 1 and 2 (T1 to T7), B2 = Phase 3 (T8 to T13), B3 = Phases 4 and 5 (T14 to T21), B4 = Phase 6 (T22 to T24).

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | Root tooling files, one setup concern | ⚠️ Several config files, cohesive (no code) |
| T2, T3 | One module each | ✅ |
| T4 to T8 | One module each | ✅ |
| T9 to T12 | One adapter each | ✅ |
| T13 | Registry plus its golden tests | ✅ |
| T14 to T18 | One module each | ✅ |
| T19 | Page shell plus copied assets | ⚠️ Assets are copies, cohesive |
| T20, T21 | One module each, with tests | ✅ |
| T22 to T24 | One file or one run each | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | none | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 (earlier phase) | none in phase | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T4, T5 | T4 → T6, T5 → T6 | ✅ |
| T7 | T3 (earlier phase) | none in phase | ✅ |
| T8 | T3 (earlier phase) | none in phase | ✅ |
| T9 to T12 | None | none | ✅ |
| T13 | T8, T9, T10, T11, T12 | five arrows into T13 | ✅ |
| T14 | T13 (earlier phase) | none in phase | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | None | none | ✅ |
| T17, T19 | None | none | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T20 | T18, T19 | T18 → T20, T19 → T20 | ✅ |
| T21 | T17, T18, T20 | T17 → T21, T18 → T21, T20 → T21 | ✅ |
| T22 | None | none | ✅ |
| T23 | T22 | T22 → T23 | ✅ |
| T24 | T22 | T22 → T24 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Config files | none | none | ✅ |
| T2 | Types | none | none | ✅ |
| T3 | Pipeline pure module | unit | unit | ✅ |
| T4 to T7 | Pipeline pure modules | unit | unit | ✅ |
| T8 | HTTP client | unit | unit | ✅ |
| T9 to T12 | Adapters | unit | unit | ✅ |
| T13 | Adapters on real pages | integration | integration | ✅ |
| T14 | Archiver | unit | unit | ✅ |
| T15 | Ingest CLI | integration | integration | ✅ |
| T16 | Pipeline pure module | unit | unit | ✅ |
| T17, T18, T20 | Site logic and templates | unit | unit | ✅ |
| T19 | Static markup plus sprite parity | none (markup), unit (parity check) | unit | ✅ |
| T21 | Site UI | e2e | e2e | ✅ |
| T22, T23 | Workflow, docs | none | none | ✅ |
| T24 | Operational run, generated data | none | none | ✅ |
