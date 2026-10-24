# Agency Comparator Design

**Spec**: `.specs/features/agency-comparator/spec.md`
**Context**: `.specs/features/agency-comparator/context.md`
**Status**: Draft (2026-10-24)

---

## Architecture Overview

Two halves joined by one public file.

1. **Curation (offline, on demand).** A blind input is built from `data/checks.json`, a Claude Code workflow runs the agents, and their raw outputs land in `data/claim-curation/<run>/`. A deterministic assembler turns those outputs, plus the maintainer's `manual.json` edits, into `data/claim-groups.json`. The same assembler in check mode proves the file was not edited by hand (REPRO-01).
2. **Site (every build).** The build validates `data/claim-groups.json` against the records (CLAIM-02), pre-renders `comparar.html` from a pure module shared with the browser, and the browser script only filters rows and recomputes the two tables.

```mermaid
graph TD
    C[data/checks.json] --> B[src/claims/blind.ts]
    B --> I[data/claim-curation/RUN/input.json]
    I --> W[Claude Code workflow: 3 curators x debate, judge, editor, reviewer]
    W --> RAW[curator-*.json, judge-*.json, editor.json, review.json, workflow.js]
    M[manual.json, maintainer edits with reason] --> A
    RAW --> A[src/claims/assemble.ts]
    I --> A
    A --> G[data/claim-groups.json]
    A -- --check --> CK{same file?}
    G --> V[src/claims/groups.ts: schema + CLAIM-02]
    C --> V
    V --> BLD[src/site/build.ts]
    CMP[site/compare.js pure] --> BLD
    CMP --> APP[site/comparar.js browser]
    BLD --> P[dist/comparar.html]
```

Data lives in `data/` (not `config/`) because groups reference records and the build and its fixtures already read records from one `dataDir`. `writeData` only writes its three files, so ingest never touches the claim files.

---

## Code Reuse Analysis

| Component | Location | How to use |
| --------- | -------- | ---------- |
| Context, ordering, outlet order | `site/core.js` `createContext` | Rows and tables use `ctx.outletIds` (pt-BR collator on names) and the debate rank |
| `BANDS`, `bandClass`, `esc`, `shortDate` | `site/core.js`, `site/render.js` | Same verdict names and colors as the archive |
| Template fill with slot checks | `src/site/build.ts` `fill`, `jsonScript`, `table` | New page uses the same one-pass fill |
| zod config loading pattern | `src/config.ts` | `groups.ts` follows `readJson` + `fail(file, path, msg)` |
| URL state pattern | `site/core.js` `readState`/`writeState` | Same shape for `debate`, `speaker`, `div` |
| Site fixture | `test/fixtures/site.ts` | Extended with fixture groups and a fixture curation input |
| e2e harness | `test/e2e/site.test.ts` | New describe block on the same server |

---

## Components

### `src/claims/groups.ts`

- **Purpose**: schema, IDs and validation of `data/claim-groups.json`.
- **Interfaces**:
  - `groupId(records: string[]): string` → `"c" + sha256(sorted ids joined by ",").slice(0, 8)`. Stable while membership is stable, so issues can cite it.
  - `checkGroups(file: ClaimGroupsFile, records: CheckRecord[]): string[]` → one message per broken rule, `"<group id>: <rule>"`. Rules: unknown record, record debate or speaker differs from the group's, repeated outlet, fewer than 2 records, record in two groups, claim empty or over 120 characters, `id !== groupId(records)`.
  - `loadGroups(dataDir, records): Promise<ClaimGroupsFile>` → file missing gives `{ run: null, groups: [] }`; schema or rule failure throws `ClaimsError` listing every message.
- **Requirements**: CLAIM-01, CLAIM-02.

### `src/claims/blind.ts`

- **Purpose**: the blind curation input (CLAIM-03).
- **Interfaces**: `blindInput(records, candidates): BlindDebate[]`, CLI `node src/claims/blind.ts --run <yyyy-mm-dd>` writes `data/claim-curation/<run>/input.json`.
- **Rules**: records not found at the source are left out; per debate, outlets get letters A, B, C, D in order of `sha256(debate + outlet)`; records ordered by `sha256(id)`; partitions per speaker in ballot order; each record carries only `ref`, `src`, `quote`, `excerpt`. This is the format of the 2026-10-24 input already produced.

### `src/claims/consensus.ts`

- **Purpose**: pure port of the workflow's consensus so it can be tested and rerun.
- **Interfaces**:
  - `sanitize(srcOf: Map<ref, src>, groups)` → drops unknown or reused refs and groups with a repeated letter (edge case 1).
  - `consensus(srcOf, curatorRuns, expected = 3)` → `{ settled, disputed }`. Components are connected sets over every pair any curator linked. A component is settled only when every pair inside it has `expected` votes; with fewer runs than expected nothing is settled (edge case 2). Settled carries `curatorClaims` in curator order; disputed carries each curator's proposal restricted to the component.
- **Requirements**: CLAIM-04, CLAIM-05.

### `src/claims/assemble.ts`

- **Purpose**: `data/claim-curation/<run>/` → `data/claim-groups.json`, deterministic.
- **Steps**: read input and curator files per debate → `consensus` → judge decisions matched by component refs (not index), sanitized and restricted to the component → claim from `editor.json` by sorted refs, else the first candidate claim → reviewer rewrites by sorted refs → apply `manual.json` edits in order (`from` refs to replace or remove, `to` group to add, `reason` required; resulting groups get origin `manual`) → `groupId` → sort by debate, speaker, id.
- **CLI**: `pnpm claims:assemble [run]` writes the file; `pnpm check:claims` recomputes and exits 1 on any difference, and prints every `manual` group with its reason (REPRO-01, REPRO-02). Latest run = greatest folder name.
- **Raw outputs committed for run 2026-10-24**: `input.json`, `curator-<debate>-<n>.json`, `judge-<debate>.json` (agent output plus the component refs it was shown), `editor.json` and `review.json` (agent output plus the refs of each group id), `workflow.js` (the script with all prompts), `manual.json` (g060 gains the g1 record, reason recorded). CLAIM-06.

### `site/compare.js`

- **Purpose**: pure comparison logic, shared by build, browser and tests.
- **Interfaces**:
  - `createComparison(ctx, file)` → `{ rows, curated }`. Row: `{ id, debate, speaker, claim, cells: (CheckRecord | null)[] in ctx.outletIds order, divergent, pos }`. Members not found at the source are dropped; a row with fewer than 2 members is dropped (CMP-05). `divergent` = at least two different bands among verdadeiro, impreciso, falso (CMP-03). Order: debate rank, then the smallest `pos` among members, then id (CMP-04).
  - `emptyCompareState()`, `readCompareState(search, ctx)`, `writeCompareState(state)` with keys `debate`, `speaker`, `div=1`.
  - `visibleRows(rows, state)`.
  - `coverage(ctx, rows, debate)` → per candidate, per outlet `{ n, of, solo }`: `of` = rows of that candidate in the debate filter, `n` = those with the outlet, `solo` = live records of that outlet and candidate in the filter that are in no row (RIGOR-01, RIGOR-06).
  - `rigor(ctx, rows, debate)` → per candidate, per outlet `{ harsher, equal, milder, n }`, one comparison per pair of members with bands in the order verdadeiro < impreciso < falso; `sem faixa` skipped (RIGOR-02).
  - `SMALL = 10`; a cell is small when its base (`of` or `n`) is below it (RIGOR-03).
  - `pendingCount(ctx, curatedRefs)` → live records not in the run's input (CMP-06).

### `site/render.js` additions and `site/comparar.html`

- `compareRowHtml(row, ctx)`: claim, speaker and debate line, one cell per agency: band chip with `title="Rótulo da agência: …"` linking to `record.url`, or "não checou" (CMP-02).
- `coverageHtml`, `rigorHtml`: one table per measure, rows = agencies, column groups = candidates in ballot order; "amostra pequena" marker in small cells. No sorting by value, no totals per agency (RIGOR-05).
- `compareFiltersHtml`: debate selector (same segmented control as the index), candidate select, "Só divergências" checkbox, row count.
- Page text: RIGOR-04 notice above the tables; "Como os grupos foram feitos" section (DISC-02) with links to `claim-groups.json` in dist and `data/claim-curation/` in the repository; contest instruction (DISC-03); pending notice (CMP-06).
- Layout at ≥ 720 px: a grid with the claim column and four agency columns. Below 720 px each row stacks: claim, then one line per agency `Agência · veredito`. No horizontal scroll at 360 px (CMP-07).

### `site/comparar.js`

- Reads `#compare-data` (records, groups, config), rebuilds the comparison with `compare.js`, toggles `hidden` on pre-rendered rows, re-renders the two tables and the filter bar, writes the URL with `history.replaceState`. Keeps keyboard focus like `app.js`. No list animation.

### `src/site/build.ts`

- Loads groups with `loadGroups` (build fails on CLAIM-02), reads the run's `input.json` refs for the pending count, copies `claim-groups.json` to `dist/`, fills `comparar.html`, adds the link to the index (below the scoreboard notice and in the footer nav) and to the methodology page (CMP-01).

### Disclosure

- `site/index.html` audit rule → DISC-01 sentence.
- `site/metodologia.html` new section "Comparação entre agências" (DISC-02) and a link to `comparar.html`.
- `README.md` rule line (DISC-04) and a short "Grupos de alegações" section with `claims:input`, the workflow, `claims:assemble`, `check:claims`.
- `.github/workflows/update.yml`: `pnpm check:claims` after `check:labels`.

---

## Data Models

```ts
interface ClaimGroup {
  id: string            // groupId(records)
  debate: string
  speaker: string
  claim: string         // 1..120 chars
  records: string[]     // record ids, sorted, ≥ 2, distinct outlets
  origin: 'unanimous' | 'adjudicated' | 'manual'
}
interface ClaimGroupsFile { run: string | null; groups: ClaimGroup[] }

interface ManualEdit { from: string[] | null; to: { records: string[]; claim: string } | null; reason: string }
```

---

## Error Handling Strategy

| Error scenario | Handling | User impact |
| -------------- | -------- | ----------- |
| `claim-groups.json` breaks a CLAIM-02 rule | Build throws with every `<group id>: <rule>` | Deploy stops; the run log names the group |
| `claim-groups.json` absent | Treated as no groups, every live record pending | Page shows no rows and the pending notice |
| Committed outputs and file differ | `check:claims` exits 1 with the differing group ids | CI fails after deploy step order: data commit already done, maintainer fixes |
| Manual edit `from` not found | `assemble` throws naming the edit | Maintainer fixes `manual.json` |
| Record of a group later removed at source | Dropped from the row; row hidden under 2 members | Counts follow HIST-02 |

---

## Tech Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Where groups live | `data/claim-groups.json` | Same `dataDir` as records for build and fixtures |
| Group ID | Hash of sorted member IDs | Stable across re-assembly; changes only when membership changes |
| Judge decisions | Matched by component refs | Index order depends on map iteration in the workflow; refs do not |
| Consensus code | Ported to TS and committed, workflow keeps its copy | The run is reproducible without Claude Code; tests pin the behavior |
| Agent transcripts | Not committed | They carry local environment details; the outputs and prompts are enough to audit |
