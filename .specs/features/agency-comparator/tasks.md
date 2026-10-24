# Agency Comparator Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/agency-comparator/design.md`
**Status**: Draft

Local commits only. `git push` and deploy need the user's explicit go-ahead.

---

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Claims modules (groups, blind, consensus, assemble) | unit | 1:1 to CLAIM and REPRO ACs, both edge cases on curator failure | `test/unit/claims/<module>.test.ts` | `pnpm vitest run test/unit/claims/<module>.test.ts` |
| Comparison logic (`site/compare.js`) | unit | 1:1 to CMP-03..06 and RIGOR-01..03, RIGOR-06; sem faixa and removed-record edge cases | `test/unit/site/compare.test.ts` | `pnpm vitest run test/unit/site/compare.test.ts` |
| Templates and build | unit | CMP-01, CMP-02, CMP-06, RIGOR-04, RIGOR-05, DISC-01..03, CLAIM-02 build failure | `test/unit/site/build.test.ts`, `test/unit/site/render.test.ts` | `pnpm vitest run <file>` |
| Comparison UI | e2e (playwright-core) | Filters, URL state, 360 px | `test/e2e/compare.test.ts` | `pnpm vitest run test/e2e/compare.test.ts` |
| Docs, workflow, committed curation data | none | Build gate and `pnpm check:claims` | - | build gate only |

## Gate Check Commands

> Scoped by file every time. Never `pnpm vitest run` without a path.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks with unit tests only | `pnpm vitest run <test files touched by the task>` |
| Full | Tasks with e2e tests | Quick, then `pnpm vitest run test/e2e/compare.test.ts` |
| Build | End of each phase | `pnpm typecheck && pnpm lint`, then `pnpm vitest run test/unit/claims`, then `pnpm vitest run test/unit/site` (one at a time) |

---

## Execution Plan

### Phase 1: Claim groups

```
T1 → T3 → T4
T1 → T4
T2 → T4
```

### Phase 2: Comparison page

```
T5 → T6 → T7
T6 → T8
```

---

## Task Breakdown

### T1: Validate the claim groups file

**What**: `src/claims/groups.ts` with the zod schema, `groupId`, `checkGroups` (every CLAIM-02 rule, all messages collected) and `loadGroups` (missing file gives an empty file with `run: null`, failures throw `ClaimsError`).
**Where**: `src/claims/groups.ts`, `test/unit/claims/groups.test.ts`
**Depends on**: None
**Reuses**: `src/config.ts` readJson and fail pattern
**Requirement**: CLAIM-01, CLAIM-02

**Done when**:

- [x] Each CLAIM-02 rule has a test that feeds a broken group and expects `"<id>: <rule>"`
- [x] A valid file with two groups passes with no message
- [x] Gate check passes: `pnpm vitest run test/unit/claims/groups.test.ts`
- [x] Test count: at least 9 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(claims): Validate the claim groups file against the records`

**Status**: ✅ Complete

---

### T2: Build the blind curation input

**What**: `src/claims/blind.ts` `blindInput(records, candidates)` and a CLI `--run <date>` writing `data/claim-curation/<date>/input.json`; script `claims:input` in package.json.
**Where**: `src/claims/blind.ts`, `test/unit/claims/blind.test.ts`, `package.json`
**Depends on**: None
**Reuses**: `src/config.ts` loadConfig for candidates
**Requirement**: CLAIM-03

**Done when**:

- [x] Each record in the output has exactly the keys `ref`, `src`, `quote`, `excerpt`; no agency name, URL, label or band appears anywhere in the serialized output
- [x] Letters follow sha256(debate + outlet) order, records follow sha256(id) order, removed records are absent
- [x] Given the 314 ids of `data/claim-curation/2026-10-24/input.json` and their records from `data/checks.json`, `blindInput` equals that file after JSON parse
- [x] Gate check passes: `pnpm vitest run test/unit/claims/blind.test.ts`
- [x] Test count: at least 4 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(claims): Build the blind input for claim curation`

**Status**: ✅ Complete

---

### T3: Port the curator consensus

**What**: `src/claims/consensus.ts` `sanitize` and `consensus`, a faithful port of `data/claim-curation/2026-10-24/workflow.js` (sanitize, pair votes, components, unanimity, proposals, fewer-runs rule).
**Where**: `src/claims/consensus.ts`, `test/unit/claims/consensus.test.ts`
**Depends on**: T1
**Reuses**: workflow.js logic
**Requirement**: CLAIM-04, CLAIM-05

**Done when**:

- [x] Three identical groups → one settled group with three candidate claims
- [x] A chain A-B (3 votes) plus B-C (1 vote) → one disputed component {A, B, C} with each curator's proposal
- [x] Unknown ref, reused ref and repeated letter are dropped by `sanitize`
- [x] Two curator runs with `expected = 3` → nothing settled
- [x] Gate check passes: `pnpm vitest run test/unit/claims/consensus.test.ts`
- [x] Test count: at least 6 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(claims): Port the curator consensus to a tested module`

**Status**: ✅ Complete

---

### T4: Assemble and check the claim groups

**What**: `src/claims/assemble.ts` (design steps, manual edits, CLI write and `--check`), scripts `claims:assemble` and `check:claims`, the 2026-10-24 run committed under `data/claim-curation/2026-10-24/` (files from the orchestrator's scratch folder given in the worker prompt) with `manual.json` adding record `5434697c0611` to the 700-markets group, the generated `data/claim-groups.json`, and a `pnpm check:claims` step after `check:labels` in `.github/workflows/update.yml`.
**Where**: `src/claims/assemble.ts`, `test/unit/claims/assemble.test.ts`, `data/claim-curation/2026-10-24/`, `data/claim-groups.json`, `package.json`, `.github/workflows/update.yml`
**Depends on**: T1, T2, T3
**Reuses**: T3 consensus, T1 groupId and checkGroups
**Requirement**: CLAIM-04, CLAIM-05, CLAIM-06, REPRO-01, REPRO-02

**Done when**:

- [x] Assembling the committed run yields 81 groups: 78 unanimous, 2 adjudicated, 1 manual (the 700-markets group with 3 records), and passes `checkGroups` against `data/checks.json`
- [x] Every claim equals the workflow result in the orchestrator's scratch `result.json` for the same refs, reviewer rewrites included
- [x] `check:claims` fails on a copy with one adjudicated group edited and lists the manual group with its reason
- [x] A manual edit whose `from` matches no group throws
- [x] Gate check passes: `pnpm vitest run test/unit/claims/assemble.test.ts`
- [x] Test count: at least 5 tests pass

**Tests**: unit
**Gate**: build

**Commit**: `feat(claims): Assemble claim groups from the committed curation run`

**Status**: ✅ Complete

---

### T5: Comparison logic

**What**: `site/compare.js` (createComparison, state, visibleRows, coverage, rigor, SMALL, pendingCount) and fixture groups plus a fixture curation input in `test/fixtures/site.ts` (`buildFixture` writes both into the data dir). Fixture groups cover: a 4-agency row, a divergent row, a row with a `sem faixa` member, a row losing a member to `missingSince` and falling under 2, one per debate and candidate.
**Where**: `site/compare.js`, `test/unit/site/compare.test.ts`, `test/fixtures/site.ts`
**Depends on**: None (Phase 1 done)
**Reuses**: `site/core.js` createContext
**Requirement**: CMP-03, CMP-04, CMP-05, CMP-06, RIGOR-01, RIGOR-02, RIGOR-03, RIGOR-06

**Done when**:

- [x] Hand-counted coverage and harsher/equal/milder for each agency and candidate on the fixture match `coverage` and `rigor`, with and without a debate filter
- [x] Divergent filter, speaker filter and debate filter each select the expected row ids; URL state round-trips
- [x] The row with a removed member is absent and its remaining record counts as `solo`
- [x] Gate check passes: `pnpm vitest run test/unit/site/compare.test.ts`
- [x] Test count: at least 8 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(site): Compute claim rows, coverage and rigor`

**Status**: ✅ Complete

---

### T6: Render and build the comparison page

**What**: render functions in `site/render.js`, `site/comparar.html`, build wiring in `src/site/build.ts` (loadGroups, pending count from the run input, copy `claim-groups.json`, links from index and methodology).
**Where**: `site/render.js`, `site/comparar.html`, `src/site/build.ts`, `site/index.html`, `site/metodologia.html`, `test/unit/site/build.test.ts`, `test/unit/site/render.test.ts`
**Depends on**: T5
**Reuses**: `fill`, `jsonScript`, segmented debate control
**Requirement**: CMP-01, CMP-02, CMP-06, RIGOR-03, RIGOR-04, RIGOR-05, DISC-02, DISC-03

**Done when**:

- [x] Built `comparar.html` has one row per visible fixture group with "não checou" in empty agency cells and the agency label in each verdict's title
- [x] RIGOR-04 text, contest instruction and the "Como os grupos foram feitos" section with both links are present; the pending notice shows the fixture count
- [x] No element orders agencies by a number and no per-agency total exists (RIGOR-05)
- [x] A fixture with a broken group makes `build` reject with the group id in the message
- [x] Gate check passes: `pnpm vitest run test/unit/site/build.test.ts` then `pnpm vitest run test/unit/site/render.test.ts`
- [x] Test count: at least 7 new tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(site): Build the agency comparison page`

**Status**: ✅ Complete

---

### T7: Browser filters and layout

**What**: `site/comparar.js` (filters, URL, tables re-render, focus kept) and CSS for the grid and the stacked mobile layout, following direction A.
**Where**: `site/comparar.js`, `site/style.css`, `test/e2e/compare.test.ts`
**Depends on**: T6
**Reuses**: `site/app.js` focus handling, e2e server from `test/e2e/site.test.ts`
**Requirement**: CMP-03, CMP-07, RIGOR-06

**Done when**:

- [x] e2e: each filter changes visible rows and table numbers as `compare.js` computes; reload with the URL restores the view
- [x] e2e: no horizontal scroll at 360 px; no cross-origin request
- [x] Gate check passes: `pnpm vitest run test/e2e/compare.test.ts`
- [x] Test count: at least 4 tests pass

**Tests**: e2e
**Gate**: full

**Commit**: `feat(site): Filter the comparison page in the browser`

**Status**: ✅ Complete

---

### T8: Disclose the AI grouping

**What**: replace the audit-panel rule with the DISC-01 sentence, add the methodology section on how groups are made, update README rules and add a "Grupos de alegações" section with the commands.
**Where**: `site/index.html`, `site/metodologia.html`, `README.md`, `test/unit/site/build.test.ts`
**Depends on**: T6
**Reuses**: existing pages
**Requirement**: DISC-01, DISC-02, DISC-04

**Done when**:

- [x] Built site contains the DISC-01 sentence and no longer contains "Nenhum texto passa por inteligência artificial"
- [x] README contains the DISC-01 sentence
- [x] Gate check passes: `pnpm vitest run test/unit/site/build.test.ts`
- [x] Test count: at least 2 new tests pass

**Tests**: unit
**Gate**: build

**Commit**: `docs(site): Disclose that AI groups claims blind to agency and verdict`

**Status**: ✅ Complete

---

## Parallel Execution Map

Phases run in sequence; inside a phase the diagram order holds. One worker per phase.

---

## Amendment 2026-10-24: distance, changed verdicts, direction A

### Phase 3: Distance and changed verdicts

```
T9 → T10
T11 → T13
T12 → T13
T13 → T14
T13 → T15
```

### T9: Keep key changes in history

**What**: `HistoryEntry.key`; `update` in `src/pipeline/merge.ts` records the previous key in the same history entry.
**Where**: `src/types.ts`, `src/pipeline/merge.ts`, `test/unit/merge.test.ts`
**Depends on**: None
**Reuses**: existing history entry logic
**Requirement**: DRIFT-01

**Done when**:

- [x] A reissued key with a label change gives one history entry with `key` and `label`; a key-only change gives an entry with only `key` and keeps the archive copy
- [x] Gate check passes: `pnpm vitest run test/unit/merge.test.ts`
- [x] Test count: at least 2 new tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ingest): Keep the previous source key in history`

**Status**: ✅ Complete

---

### T10: Repair the 2026-10-24 Estadão run

**What**: `src/repair/estadao-2026-10-24.ts`, its run on the data, the report `data/repairs/2026-10-24-estadao.json`, and the repaired `data/checks.json` and `data/checks.csv`.
**Where**: `src/repair/estadao-2026-10-24.ts`, `test/unit/repair.test.ts`, `data/`
**Depends on**: T9
**Reuses**: `merge`, the data writer
**Requirement**: DRIFT-02

**Done when**:

- [x] On the pinned files: no record of the source is missing, `d5bca87d832d` is Lula's hunger claim again, the report lists the merged IDs, and other sources are byte-identical
- [x] Refuses to write when the current source records differ from the `after` ones, unless they already equal the repaired ones: then a second run exits 0, says the repair is already applied and writes nothing
- [x] `pnpm check:claims` and the build pass on the repaired data
- [x] Gate check passes: `pnpm vitest run test/unit/repair.test.ts`
- [x] Test count: at least 3 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `fix(data): Repair the Estadão checks split by the 2026-10-24 run`

**Status**: ✅ Complete

---

### T11: Compute the distance from the other agencies

**What**: `site/lean.js`, `src/lean.ts`, script `lean`.
**Where**: `site/lean.js`, `src/lean.ts`, `package.json`, `test/unit/site/lean.test.ts`
**Depends on**: None
**Reuses**: `site/compare.js` rows
**Requirement**: LEAN-01, LEAN-02, LEAN-03, LEAN-04, LEAN-05, LEAN-07

**Done when**:

- [x] Hand-computed deviations, means and distance match on a fixture; the interval is identical across two calls
- [x] Each sentence branch, the small-sample case and both headline forms are produced by fixtures built for them
- [x] `pnpm lean` prints the same numbers as `lean()` on the fixture data
- [x] Gate check passes: `pnpm vitest run test/unit/site/lean.test.ts`
- [x] Test count: at least 7 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(site): Compute each agency's distance from the others`

**Status**: ✅ Complete

---

### T12: Rebuild verdict versions

**What**: `site/drift.js` (versions, wordDiff, changed, driftCounts).
**Where**: `site/drift.js`, `test/unit/site/drift.test.ts`
**Depends on**: None
**Reuses**: `site/core.js` context and band lookup
**Requirement**: DRIFT-03, DRIFT-04, DRIFT-05

**Done when**:

- [x] Versions from 0, 1 and 2 history entries, including a quote-only entry that keeps the label, match hand-written expectations
- [x] Counts of harsher, milder, gained and lost per agency and candidate match a fixture, with and without a debate filter
- [x] Gate check passes: `pnpm vitest run test/unit/site/drift.test.ts`
- [x] Test count: at least 6 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(site): Rebuild the versions of changed checks`

**Status**: ✅ Complete

---

### T13: Render the comparison page in direction A

**What**: new sections, axes SVG, dot matrix, claim detail, coverage ticks, timelines and counts in `site/render.js` and `site/comparar.html`; build wiring; remove the pairwise table and `rigor`; agency count from config; the two test gaps from the phase 2 review (removed record in `curated` stays out of "só ela checou"; escaping of claim and label).
**Where**: `site/render.js`, `site/comparar.html`, `site/compare.js`, `src/site/build.ts`, `test/unit/site/render.test.ts`, `test/unit/site/build.test.ts`, `test/unit/site/compare.test.ts`, `test/fixtures/site.ts`
**Depends on**: T11, T12
**Reuses**: `fill`, `jsonScript`, mock `a-balanca.html` markup
**Requirement**: CMP-01, CMP-02, CMP-08, RIGOR-01, RIGOR-05, LEAN-06, DRIFT-03, DRIFT-05

**Done when**:

- [x] Built page has the four sections, one axis per agency in alphabetical order with the sentence, the matrix with one button per visible row, shapes per band and text alternatives, the detail with labels as text, the ticks, the timelines and counts
- [x] No element is ordered by a number; no shaded zone around zero
- [x] A claim and a label with `<`, `&` and `"` come out escaped; the page still has exactly the expected `</script>` count
- [x] Gate check passes: `pnpm vitest run test/unit/site/render.test.ts`, then `build.test.ts`, then `compare.test.ts`
- [x] Test count: at least 8 new tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(site): Render the comparison page as axes, a dot matrix and timelines`

**Status**: ✅ Complete

---

### T14: Browser interactions and layout

**What**: `site/comparar.js` re-renders axes, matrix visibility, ticks and counts on filter change; claim detail by click and keyboard; CSS for desktop and the list layout below 720 px.
**Where**: `site/comparar.js`, `site/style.css`, `test/e2e/compare.test.ts`
**Depends on**: T13
**Reuses**: existing URL state and focus handling
**Requirement**: CMP-03, CMP-07, LEAN-06

**Done when**:

- [x] e2e: each filter changes the axes numbers, the matrix and the counts as `lean.js` and `drift.js` compute; reload restores the view
- [x] e2e: the detail opens with Enter and shows each agency's label; no horizontal scroll at 360 px; no cross-origin request
- [x] Gate check passes: `pnpm vitest run test/e2e/compare.test.ts`
- [x] Test count: at least 6 tests pass

**Tests**: e2e
**Gate**: full

**Commit**: `feat(site): Filter the axes, matrix and changes in the browser`

**Status**: ✅ Complete

---

### T15: Explain the distance and the changes

**What**: methodology sections "Distância das outras agências" and "Vereditos que mudaram" (LEAN-08), README "Comparador" lines with `pnpm lean` and the repair report.
**Where**: `site/metodologia.html`, `README.md`, `test/unit/site/build.test.ts`
**Depends on**: T13
**Reuses**: existing pages
**Requirement**: LEAN-08

**Done when**:

- [x] Built methodology page has the formula, scale, interval, sentence rule, limits and the spec link
- [x] Gate check passes: `pnpm vitest run test/unit/site/build.test.ts`
- [x] Test count: at least 2 new tests pass

**Tests**: unit
**Gate**: build

**Commit**: `docs(site): Explain the distance measure and changed verdicts`

**Status**: ✅ Complete
