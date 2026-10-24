# Debate Archive Validation

## Validation: debate-archive - PASS

**Date**: 2026-10-24
**Iteration**: 3 of 3 (re-verification after the iteration 2 FAIL at `523adc2`)
**Spec**: `.specs/features/debate-archive/spec.md`
**Diff range**: `88e9ef1..HEAD` (HEAD `b487783`); changes since iteration 2: `523adc2..b487783`
**Verifier**: independent sub-agent (author ≠ verifier)

The verdict is PASS. The three iteration 2 survivors (N04, N06, N14 in both variants) are killed by tests that assert the spec outcome with expectations computed independently of the code under test, and the five iteration 1 survivors stay killed. Of 24 new mutants in areas no earlier iteration touched, 21 were killed. The three survivors sit outside impartiality-critical logic (band mapping, speaker resolution, scoreboard counting, candidate ordering, archive verification) and become ranked gaps: `--accept-drop` leaks to every source (`src/pipeline/merge.ts:183`), a label mapped to "sem faixa" on purpose can be reported as unmapped (`src/ingest.ts:324`), and a silent field change can keep the old `fetchedAt` (`src/pipeline/merge.ts:158`).

---

## What changed since iteration 2

Commits `42539c3..b487783` add tests only. `git diff --stat 523adc2 HEAD -- src site data config` is empty, so product code and the published dataset are the ones iterations 1 and 2 checked. Three test files changed, 119 insertions, 2 deletions.

| Iteration 2 gap | Commit | New test | Asserts the spec outcome, independently? | Status |
| --------------- | ------ | -------- | ---------------------------------------- | ------ |
| Fix 1, SCORE-01/SCORE-04 browser board never read (N06) | `b487783` | `test/e2e/site.test.ts:261`; helpers `boardNumbers` at `:111` and `expectedBoard` at `:131` | Yes. `expectedBoard` filters the fixture `records` by hand (`!r.missingSince`, speaker, the test's own predicate) and counts the four bands in the spec's order. It imports nothing from `site/core.js`. The test reads each candidate's total and four legend numbers from `#board` after the count-up settles, for "Todas" (`:263`), Lupa (`:268`, with the anchor `lupa.flavio.total === 3` at `:267`), "Todas" again (`:271`) and Globo plus Estadão (`:277`), and checks the list length equals the board total (`:278`, SCORE-04) | ✅ Closed |
| Fix 2, INGEST-05 per-debate candidate list (N04) | `e692ae8` | `test/integration/ingest.test.ts:275`; the `debate()` helper now takes `candidates` (`:56` to `:68`) | Yes. A Globo debate listing only `lula` excludes the Flávio item: report `excluded` holds `{ url, pos: 2, reason: 'speaker not resolved: "FLÁVIO BOLSONARO (PL)"' }` (`:283` to `:287`), only positions 1 and 3 are published (`:289`), and the same speaker still resolves on the Band debate that lists him (`:294`) | ✅ Closed |
| Fix 3, INGEST-04 keyed sources match only by key (N14) | `42539c3` | `test/unit/merge.test.ts:355` (new key, known quote) and `:377` (keyed item vs keyless record) | Yes. The new key gets `recordId(G1, 'chunk-9')`, the old record equals itself plus `missingSince` (`:366`), no history, and `new` plus `missing` events (`:373`, `:374`). The keyed item does not inherit the keyless record's id (`:380`) | ✅ Closed |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 to T24 | ✅ Done | Unchanged since iteration 1. `data/` holds 314 records, 83 waiting for a snapshot because web.archive.org refused connections during the run (DATA-06 retries them). |

---

## Spec-Anchored Acceptance Criteria

Every citation below was re-read at `b487783`. Files untouched since iteration 2 keep their line numbers; the three changed files were re-indexed.

### P1: Collect the debate checks

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| INGEST-01 | every manifest source fetched (4 agencies x 2 debates) | `test/integration/ingest.test.ts:200` writes all three files for every configured source; `test/integration/ingest.test.ts:493` run log lists every source; `test/unit/config.test.ts:28` real config has 2 debates and 8 sources | ✅ |
| INGEST-02 | one record per check with agency, debate, speaker, quote, label, band, excerpt, source URL, anchor or position | `test/integration/ingest.test.ts:200`, full record equality on every field | ✅ |
| INGEST-03 | one parser per agency format | `test/unit/adapters/g1.test.ts:57`, `test/unit/adapters/lupa.test.ts:51`, `test/unit/adapters/estadao.test.ts:41`, `test/unit/adapters/aosfatos.test.ts:86` and `:123`; `test/golden/golden.ts:41` pins counts and label distribution per page | ✅ |
| INGEST-04 | ID kept on match by item ID or, for a source without item IDs, by the same or a similar quote from the same speaker | `test/unit/merge.test.ts:194` (key, quote rewritten), `:205` (same quoteKey), `:215` and `:228` (Jaccard ≥ 0.6), `:249` (same speaker required), `:318` (ids stay with speaker), `:355` and `:377` (keyed items never matched by quote) | ✅ |
| INGEST-05 | unresolved speaker excluded and listed with source URL | `test/unit/normalize.test.ts:42`, `:47` to `:55`, `:57`; `test/integration/ingest.test.ts:232`, `:258`, `:275` (candidate configured but not in the debate) | ✅ |
| INGEST-06 | non-200, 30 s timeout, zero records or under 80% keeps prior records and reports | `test/unit/merge.test.ts:117`, `:128`, `:140`, `:164`, `:173`; `test/unit/io/http.test.ts:221`, `:228`, `:249`; `test/integration/ingest.test.ts:297`, `:381` | ✅ (gap R06: the `--accept-drop` override is not pinned to the source it names) |
| INGEST-07 | one request per domain per 5 s, UA with name and repo URL, robots.txt honored | `test/unit/io/http.test.ts:75`, `:127`, `:138`, `:159`, `:344` | ✅ |
| INGEST-08 | no agency content sent to AI | `test/unit/io/http.test.ts:310` and `:322`, hosts outside the allowlist refused; no AI or LLM client under `src/` or `site/` | ✅ |
| INGEST-09 | run report per source: HTTP status, count, excluded items, unmapped labels | `test/integration/ingest.test.ts:232` (`unmappedLabels: ['INSUSTENTÁVEL']` at `:250`), `:354`; `test/unit/write.test.ts:148` | ✅ (gap R07: no fixture has a label mapped to "sem faixa" on purpose) |

### P1: Browse every check

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| SITE-01 | "Todos" view with every record, no login | `test/e2e/site.test.ts:173`; `test/unit/site/build.test.ts:37` | ✅ |
| SITE-02 | speaker, quote, label most prominent, band, agency, excerpt, link | `test/unit/site/render.test.ts:23` | ✅ |
| SITE-03 | filters combine with AND | `test/unit/site/core.test.ts:34`, `:50`; `test/e2e/site.test.ts:180` | ✅ |
| SITE-04 | debate newest first, agency alphabetical, page order | `test/unit/site/core.test.ts:76`, `:92`; `test/unit/merge.test.ts:553` | ✅ |
| SITE-05 | "Nenhuma checagem com esses filtros." plus a clear control | `test/e2e/site.test.ts:205` | ✅ |
| SITE-06 | no horizontal scroll at 360 px | `test/e2e/site.test.ts:153` | ✅ |
| SITE-07 | no tracking cookies, analytics or cross-origin assets | `test/e2e/site.test.ts:421`; `test/unit/site/sprites.test.ts:83` | ✅ |

### P1: Scoreboards

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| SCORE-01 | per-agency board per candidate and band, current filters | `test/unit/site/core.test.ts:106`; `test/e2e/site.test.ts:268` and `:277`, `expect(await boardNumbers(page)).toEqual(expectedBoard(...))` | ✅ |
| SCORE-02 | general board sums all agencies | `test/unit/site/core.test.ts:121`; `test/unit/site/build.test.ts:68`; `test/e2e/site.test.ts:263` and `:271` | ✅ |
| SCORE-03 | exact notice text next to the general board | `test/unit/site/core.test.ts:132`; `test/e2e/site.test.ts:190` (per-agency notice) | ✅ |
| SCORE-04 | board total equals listed records still found | `test/unit/site/core.test.ts:141`; `test/e2e/site.test.ts:278`, `expect(await listedIds(page)).toHaveLength(pair.lula.total + pair.flavio.total)` | ✅ |
| SCORE-05 | ascending ballot order, four bands including zero | `test/unit/site/core.test.ts:166`; `test/unit/site/render.test.ts:77` | ✅ |

### P1: Open, auditable data

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| DATA-01 | JSON and CSV linked, same records as the site | `test/unit/site/build.test.ts:90`, `:277`; `test/unit/write.test.ts:115`, `:123` | ✅ |
| DATA-02 | source URL, snapshot URL, SHA-256 of snapshot bytes, fetch time, parser version | `test/unit/archive.test.ts:154`; `test/integration/ingest.test.ts:200`, `:453` | ✅ (gap R04: `fetchedAt` on a silent change is not pinned) |
| DATA-03 | mapping file published and linked | `test/unit/config.test.ts:50`; `test/unit/normalize.test.ts:64` to `:91`; `test/unit/check-labels.test.ts:32`, `:42`; `test/unit/site/build.test.ts:139` | ✅ |
| DATA-04 | byte-identical records for same parser and HTML | `test/unit/write.test.ts:62`, `:76`; `test/integration/ingest.test.ts:446`; `test/unit/adapters/g1.test.ts:160`; `test/golden/golden.ts:79` | ✅ |
| DATA-05 | no raw agency HTML published | `.gitignore:3`; `test/unit/site/build.test.ts:277` | ✅ |
| DATA-06 | retry until the snapshot parses to the same statement, speaker and label; list as waiting meanwhile | `test/unit/archive.test.ts:170`, `:222`, `:341` (label, speaker and quote each rejected), `:369`; `test/integration/ingest.test.ts:453` | ✅ |
| DATA-07 | methodology: sources, parsers, mapping with per-candidate counts, order rule, error reporting | `test/unit/site/build.test.ts:139`, `:166`, `:224` | ✅ |

### P1: Visible impartiality and self-service audit

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AUDIT-01 | exact sentence in the first screen below the subtitle plus a panel control | `test/unit/site/build.test.ts:109`; `test/e2e/site.test.ts:310`, `:326` | ✅ |
| AUDIT-02 | fixed "Como auditar" button on every viewport | `test/e2e/site.test.ts:336` | ✅ |
| AUDIT-03 | five rules and links to repo, dataset, mapping, history | `test/unit/site/build.test.ts:90`; `test/e2e/site.test.ts:310` | ✅ |
| AUDIT-04 | prompt with repo URL, dataset URL, five steps; "Prompt copiado" | `test/e2e/site.test.ts:353` | ✅ |
| AUDIT-05 | fallback selects text and shows the exact message | `test/e2e/site.test.ts:365` | ✅ |
| AUDIT-06 | same template, size, pose, mirrored, equal animation and mouth frames | `test/unit/site/sprites.test.ts:26`, `:49`, `:57` | ✅ |
| AUDIT-07 | illustration never changes with verdicts or counts | `test/e2e/site.test.ts:382` | ✅ |
| AUDIT-08 | portrait and logo credits in the footer and on the methodology page | `test/unit/site/build.test.ts:253` (both footers), `:262` (methodology list) | ✅ |

### P2: History, sharing, configuration

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| HIST-01 | new value published, previous kept with detection date | `test/unit/merge.test.ts:215`, `:420`, `:450` | ✅ |
| HIST-02 | missing record kept, marked, out of boards, shown only with "Mostrar removidos" | `test/unit/merge.test.ts:510`; `test/unit/site/core.test.ts:182`, `:193`, `:201`; `test/unit/site/render.test.ts:52`; `test/e2e/site.test.ts:283`, `:303`; `test/integration/ingest.test.ts:401` | ✅ |
| SHARE-01 | all active filters in the URL | `test/unit/site/core.test.ts:210`; `test/e2e/site.test.ts:180` | ✅ |
| SHARE-02 | URL filters applied on open | `test/unit/site/core.test.ts:225`, `:233`; `test/e2e/site.test.ts:180` | ✅ |
| CONF-01 | new manifest entry ingested without code changes | `test/integration/ingest.test.ts:431`; `test/unit/config.test.ts:174` | ✅ |
| CONF-02 | agency without parser fails that entry and is named | `test/integration/ingest.test.ts:410` | ✅ |

**Status**: ✅ All 42 ACs covered with spec-anchored assertions. Three ranked gaps (R06, R07, R04) narrow INGEST-06, INGEST-09 and DATA-02 but do not leave an AC without evidence.

---

## Discrimination Sensor

Scratch: `git worktree add` at `b487783` under the session scratchpad, `node_modules` symlinked, git-ignored `.cache/` and `mocks/` copied in. One mutant at a time through a script that checks the target text occurs exactly once, runs only the listed test files with the local `vitest` binary, runs `git checkout -- <file>` and confirms a clean worktree. A first pass of R02 to R06 passed both test paths as one argument under zsh, so vitest found no files and exited 1. Those five were rerun with separate arguments, and the script now refuses to call a mutant killed when vitest prints no test summary. Only the rerun results are recorded.

### Regression: iteration 1 and 2 survivors, re-applied

| Mutation | File:line | Description | Tests run | Killed? |
| -------- | --------- | ----------- | --------- | ------- |
| N04 | `src/ingest.ts:197` | `speakers = config.candidates` instead of the debate's candidates | integration | ✅ Killed (`test/integration/ingest.test.ts:275`) |
| N06a | `site/app.js:60` | board fed `listed(ctx, state, 'outlet')` inside `renderBoard` | e2e | ✅ Killed (`test/e2e/site.test.ts:261`) |
| N06b | `site/app.js:208` | `render()` passes `listed(ctx, state, 'outlet')` to `renderBoard` | e2e | ✅ Killed (`test/e2e/site.test.ts:261`) |
| N14 A | `src/pipeline/merge.ts:93` | quote matching loops over every item and drops `r.key === null` | merge, integration | ✅ Killed (`test/unit/merge.test.ts:355` and `:377`) |
| N14 B | `src/pipeline/merge.ts:93` | quote matching loops over every item, keeps `r.key === null` | merge, integration | ✅ Killed (`test/unit/merge.test.ts:377`) |
| N14 C | `src/pipeline/merge.ts:95` | keyless items may match a keyed previous record by quote | merge, integration | ❌ Survived, unreachable today (see gap 4) |
| M03 | `src/pipeline/normalize.ts:16` | alias prefix match | normalize, integration | ✅ Killed (4 tests) |
| M07 | `src/pipeline/merge.ts:62` | same-speaker preference removed from `rank` | merge | ✅ Killed (`test/unit/merge.test.ts:318`) |
| M12 | `src/pipeline/archive.ts:56` | `content()` drops the speaker | archive | ✅ Killed |
| M25 | `src/io/http.ts:18` | `TIMEOUT_MS` 30_000 changed to 60_000 | http, integration | ✅ Killed (`test/unit/io/http.test.ts:249`) |
| M26 | `src/pipeline/archive.ts:56` | `content()` drops the quote | archive | ✅ Killed |

### New mutants (iteration 3)

| Mutation | File:line | Description | Tests run | Killed? |
| -------- | --------- | ----------- | --------- | ------- |
| R01 | `src/pipeline/merge.ts:130` | history stores the new label instead of the old one | merge, integration | ✅ Killed |
| R02 | `src/pipeline/merge.ts:161` | a second change replaces earlier history entries | merge, integration | ✅ Killed |
| R03 | `src/pipeline/merge.ts:161` | `until` is the old fetch day instead of the detection date | merge, integration | ✅ Killed |
| R04 | `src/pipeline/merge.ts:158` | a pos, anchor, excerpt or url change keeps the old `evidence.fetchedAt` | merge, integration | ❌ Survived |
| R05 | `src/pipeline/merge.ts:140` | an unchanged record gets the new `fetchedAt` | merge, integration | ✅ Killed (4 tests incl. byte-identical second run) |
| R06 | `src/pipeline/merge.ts:183` | `!ctx.acceptDrop.has(sourceId)` changed to `ctx.acceptDrop.size === 0` | merge, integration | ❌ Survived |
| R07 | `src/ingest.ts:324` | `unmappedLabels` also lists labels mapped to "sem faixa" | integration, write | ❌ Survived |
| R08 | `src/pipeline/write.ts:58` | run report gains a `generatedAt` timestamp | write, integration | ✅ Killed |
| R09 | `src/pipeline/write.ts:46` | records written in construction key order instead of `RECORD_KEYS` | write, integration | ✅ Killed |
| R10 | `src/adapters/g1.ts:84` | second verdict keyed `.1` instead of `.2` | g1 unit, g1 golden | ✅ Killed |
| R11 | `src/adapters/estadao.ts:65` | key is the conclusion element's `_id` instead of the "O que" element's | estadao unit, estadao golden | ✅ Killed |
| R12 | `src/adapters/aosfatos.ts:96` | Escriba items lose their anchor | aosfatos unit, aosfatos golden | ✅ Killed |
| R13 | `src/io/http.ts:156` | robots.txt checked only on the first hop | http | ✅ Killed |
| R14 | `src/io/http.ts:118` | host allowlist checked only on the first hop | http | ✅ Killed |
| R15 | `src/site/build.ts:117` | methodology label counts ignore the speaker | build | ✅ Killed |
| R16 | `src/site/build.ts:107` | methodology label counts include removed records | build | ✅ Killed |
| R17 | `site/core.js:108` | "Mostrar removidos (N)" counts removed records under no filter | core, render, build | ✅ Killed |
| R18 | `site/app.js:78` | browser legend numbers written in reverse band order | e2e | ✅ Killed |
| R19 | `site/core.js:87` | URL state drops the band filter | core | ✅ Killed |
| R20 | `src/pipeline/archive.ts:137` | keyed record verified by key alone, content ignored | archive | ✅ Killed |
| R21 | `src/pipeline/archive.ts:234` | `archiveUrl` stores the live evidence URL instead of the snapshot | archive, integration | ✅ Killed |
| R22 | `src/site/build.ts:135` | illustrations swap left and right | build, sprites | ✅ Killed |
| R23 | `site/app.js:60` | browser board writes each candidate's numbers on the other card | e2e | ✅ Killed |
| R24 | `site/app.js:292` | "Copiar prompt" copies the prompt without step 5 | e2e | ✅ Killed |

**Sensor depth**: P0-full (manual: 11 regression mutants and 24 new ones across history, provenance timestamps, accept-drop scope, report stability, record key order, adapter keys and anchors, robots and allowlist on redirects, methodology counts, removed toggle, URL state, archive verification, browser board and legend, illustration placement and the copied prompt)
**Result**: regression 10/11 killed (every iteration 1 and 2 survivor dies; the extra N14 C variant survives); new 21/24 killed. No survivor sits in impartiality-critical logic.

Main tree `git status --porcelain` was empty before the sensor and empty after `git worktree remove --force` (compared with `cmp`).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ (iteration 3 adds tests only) |
| Surgical changes | ✅ (3 files, 119 insertions, 2 deletions, each tied to an iteration 2 fix) |
| No scope creep | ✅ |
| Matches patterns | ✅ (`biome check .` clean on 60 files) |
| Spec-anchored outcome check (asserted values match spec) | ✅ (the e2e board check counts from records without `site/core.js`) |
| Per-layer Coverage Expectation met | ✅ for every AC; gaps 1 to 3 below narrow three of them |
| Every test maps to a spec requirement, no unclaimed tests | ✅ |
| Documented guidelines followed: `AGENTS.md`, `tasks.md` Gate Check Commands | ✅ |

---

## Edge Cases

- [x] Duplicate statement on one page: one record per anchor, duplicate reported (`test/unit/ids.test.ts:33`, `test/integration/ingest.test.ts:249`)
- [x] Unknown label: band "sem faixa", label listed in the report (`test/unit/normalize.test.ts:81`, `test/integration/ingest.test.ts:250`); see gap 2 for a label mapped to "sem faixa" on purpose
- [x] No explanation: empty excerpt (`test/unit/normalize.test.ts:124`, `test/unit/site/render.test.ts:71`)
- [x] Excerpt over 280 characters: cut at the last word boundary plus "…" (`test/unit/normalize.test.ts:105`, `:115`)

---

## Gate Check

- **Gate command**: `tsc --noEmit`, `biome check .`, `node src/ingest.ts --help`, then `vitest run <files>` in the scratch worktree, one batch at a time: `test/unit/adapters` plus `test/unit/io`; `test/unit/site`; the seven remaining unit files; `test/integration`; `test/golden`; `test/e2e/site.test.ts`.
- **Result**: 287 passed, 0 failed, 0 skipped (unit 215, integration 15, golden 41, e2e 16). Typecheck exit 0, lint clean, CLI smoke exit 0.
- **Test count at iteration 2**: 283
- **Test count now**: 287
- **Delta**: +4 (merge +2, integration +1, e2e +1); no test removed or weakened. The integration helper change only adds a defaulted parameter.
- **Skipped tests**: none
- **Failures**: none

---

## Remaining gaps (ranked)

1. **`--accept-drop` applies to every source (R06), Major.** `test/unit/merge.test.ts:149` and `test/integration/ingest.test.ts:381` accept a drop with only one shrinking source in the run. With R06, a manual run that accepts a drop for one source also lets any other source that shrank below 80% mark its records missing, which INGEST-06 forbids. Fix: in `test/unit/merge.test.ts`, merge two sources that both shrink, accept one, and expect the other to stay `partial` with its records unchanged.
2. **Labels mapped to "sem faixa" can be reported as unmapped (R07), Major.** The integration bands config (`test/integration/ingest.test.ts:130`) maps no label to "sem faixa", so the report cannot tell "mapped to sem faixa" from "unmapped". With R07 the real Lupa `INSUSTENTÁVEL` and Estadão `é inconclusivo` would show up in `unmappedLabels` and `check:labels` would fail every CI run. Fix: add a label mapped to "sem faixa" to that config and expect it absent from `unmappedLabels`.
3. **`fetchedAt` on a silent change is not pinned (R04), Minor.** The design says `evidence.fetchedAt` is the "fetch that last changed this record". `test/unit/merge.test.ts:460` changes pos, anchor, excerpt and url but reuses the first run's `fetchedAt`, so keeping the old value passes. Fix: give the fresh item a later `fetchedAt` there and assert it. DATA-02 itself only says "the fetch timestamp", so this is also a spec-precision note.
4. **Keyless item against a keyed previous record (N14 C), Informational.** No MVP adapter mixes keyed and keyless items (`src/adapters/lupa.ts:39` is the only `key: null`), so the mutant cannot change today's data. It matters only if an adapter switches between keyed and keyless output across versions.

None of these blocks the feature: none touches band mapping, speaker resolution, scoreboard counting, candidate ordering or archive verification, and every AC has spec-anchored evidence.

---

## Requirement Traceability Update

| Requirement | Iteration 2 status | Iteration 3 status |
| ----------- | ------------------ | ------------------ |
| INGEST-05 | ❌ Needs Fix | ✅ Verified |
| SCORE-01, SCORE-04 | ❌ Needs Fix | ✅ Verified |
| INGEST-04 | ⚠️ Needs Fix | ✅ Verified |
| INGEST-06 | ✅ Verified | ✅ Verified, gap 1 open |
| INGEST-09 | ✅ Verified | ✅ Verified, gap 2 open |
| DATA-02 | ✅ Verified | ✅ Verified, gap 3 open |
| All other IDs | ✅ Verified | ✅ Verified |

---

## Iterations 1 to 3

| Iteration | HEAD | Verdict | Sensor | Outcome |
| --------- | ---- | ------- | ------ | ------- |
| 1 | `b710b2f` | FAIL | 23/28 killed | Survivors in archive content (speaker, quote), alias prefix match, merge speaker tie-break and the 30 s default; six fix tasks |
| 2 | `523adc2` | FAIL | 17/20 killed | Old survivors dead; new survivors in the browser board (N06), ingest's per-debate candidates (N04) and keyed quote matching (N14) |
| 3 | `b487783` | PASS | regression 10/11, new 21/24 killed | N04, N06 and N14 A/B dead; remaining survivors outside impartiality-critical logic, listed as gaps 1 to 4 |

---

## Summary

**Overall**: ✅ Ready, with ranked gaps

**Spec-anchored check**: 42/42 ACs matched the spec outcome; 1 spec-precision note (DATA-02 `fetchedAt`)
**Sensor**: regression 10/11 killed, new 21/24 killed
**Gate**: 287 passed, 0 failed

**What works**: the browser scoreboard is now checked number by number against counts taken from the records, for one agency, all agencies and a debate plus agency. Ingest resolves speakers against each debate's own candidates. Keyed sources never match by quote. History, adapter keys and anchors, robots and allowlist on redirects, report stability, methodology counts, URL state, archive verification and the copied prompt all killed their mutants.

**Issues found**: gaps 1 and 2 are cheap test additions that pin INGEST-06 and INGEST-09 more tightly; gap 3 pins a design rule for provenance timestamps.

**Next steps**: route gaps 1 to 3 as fix tasks when convenient; they do not block the feature.
