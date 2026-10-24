# Debate Archive Validation

## Validation: debate-archive - FAIL

**Date**: 2026-10-24
**Iteration**: 2 of 3 (re-verification after the iteration 1 FAIL at `b710b2f`)
**Spec**: `.specs/features/debate-archive/spec.md`
**Diff range**: `88e9ef1..HEAD` (HEAD `29fd94e`); changes since iteration 1: `b710b2f..29fd94e`
**Verifier**: independent sub-agent (author ≠ verifier)

The verdict is FAIL. All five iteration 1 survivors are now killed and the six iteration 1 gaps are closed. Fifteen new mutants found two new survivors in impartiality-critical logic: the browser's scoreboard can be fed every agency's records while one agency is selected and no test notices (`site/app.js:60`, N06), and ingest can resolve speakers against every configured candidate instead of the debate's own (`src/ingest.ts:197`, N04). A third survivor, quote matching applied to keyed sources (`src/pipeline/merge.ts:93`, N14), leaves the reworded INGEST-04 without a negative test.

---

## What changed since iteration 1

Commits `66d315a..29fd94e` add tests only and reword INGEST-04. `git diff --stat b710b2f HEAD -- src site data config` is empty, so the product code and the published dataset are the ones iteration 1 checked.

| Iteration 1 gap | Commit | New test | Asserts the spec outcome? | Status |
| --------------- | ------ | -------- | ------------------------- | ------ |
| Fix 1, DATA-06 snapshot ignores speaker and quote (M12, M26) | `66d315a` | `test/unit/archive.test.ts:341` to `:357`, `it.each` over label, speaker and quote on a keyed and a keyless record | Yes. Each case changes one field, then checks `archiveUrl` stays `null` for both records, the attempt outcome is `waiting` and the step reads `0 of 2 records, rejected`. A second candidate was added so the speaker case really resolves to `flavio` | ✅ Closed |
| Fix 2, INGEST-05 prefix match (M03) | `a8c4ae0` | `test/unit/normalize.test.ts:47` to `:55` (five near-miss names, prefix, suffix and inner match); `test/integration/ingest.test.ts:253` (excluded entry with source URL, pos and reason; published records keep only pos 1 and 3) | Yes. Null for names that only contain an alias, and the run report lists the item with its source URL | ✅ Closed |
| Fix 3, INGEST-04 rank without speaker tie-break (M07) | `03bd57a` | `test/unit/merge.test.ts:318`, same quote and same label, speakers swap places | Yes. Ids stay with the speaker, `history` stays undefined and no `new` or `missing` event appears. Any other assignment would write a speaker change into HIST-01 history that never happened | ✅ Closed |
| Fix 4, INGEST-06 30 s default (M25) | `e8e507e` | `test/unit/io/http.test.ts:249` | Yes. Without `timeoutMs` both requests ask for `30_000` ms and the error reads `no response after 30000 ms` | ✅ Closed |
| Fix 5, INGEST-04 wording | `972c687` | `spec.md:72` | Consistent with design steps 3.1 to 3.3 ("keyless only") and with the merge tests, which run quote matching only on Lupa (keyless) items. The implementation decides per item (`items[i].key === null`, `src/pipeline/merge.ts:89`); every MVP adapter gives keys to all of its items or to none, so per item and per source agree. No test pins the "keyless only" limit, see N14 | ✅ Closed, new gap N14 |
| Fix 6, AUDIT-08 footer and AUDIT-01 position | `29fd94e` | `test/unit/site/build.test.ts:109` (`.hero > h1 + p + p.trust`, exact text, last child is the panel button); `test/unit/site/build.test.ts:247` to `:273` (credits in both footers and the methodology list); `test/e2e/site.test.ts:267` (control inside a 740 px first screen at 360 and 1280 px) | Yes | ✅ Closed |

Correction to iteration 1: several of its citations pointed at lines that do not exist (for example `test/unit/site/sprites.test.ts:357` in a 101-line file, `test/unit/adapters/lupa.test.ts:236` in a 112-line file). Every citation below was re-read at `29fd94e`.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 to T24 | ✅ Done | Unchanged since iteration 1. `data/` still holds 314 records, 83 waiting for a snapshot because web.archive.org refused connections during the run (DATA-06 retries them). |

---

## Spec-Anchored Acceptance Criteria

### P1: Collect the debate checks

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| INGEST-01 | every manifest source fetched (4 agencies x 2 debates) | `test/integration/ingest.test.ts:195` writes all three files for every configured source; `test/integration/ingest.test.ts:466` run log lists every source; `test/unit/config.test.ts:28` real config has 2 debates and 8 sources | ✅ |
| INGEST-02 | one record per check with agency, debate, speaker, quote, label, band, excerpt, source URL, anchor or position | `test/integration/ingest.test.ts:195`, full record equality on every field | ✅ |
| INGEST-03 | one parser per agency format | `test/unit/adapters/g1.test.ts:57`, `test/unit/adapters/lupa.test.ts:51`, `test/unit/adapters/estadao.test.ts:41`, `test/unit/adapters/aosfatos.test.ts:86` and `:123`; `test/golden/golden.ts:41` pins counts and label distribution per page | ✅ |
| INGEST-04 | ID kept on match by item ID or, for a source without item IDs, by the same quote or a similar quote from the same speaker | `test/unit/merge.test.ts:194` (key, quote rewritten), `:205` (same quoteKey), `:215` and `:228` (Jaccard ≥ 0.6), `:249` (same speaker required), `:318` (ids stay with speaker) | ⚠️ N14 survived: no test shows that a keyed item is NOT matched by quote |
| INGEST-05 | unresolved speaker excluded and listed with source URL | `test/unit/normalize.test.ts:42` and `:47` to `:55`, `resolveSpeaker(raw)` is null; `test/integration/ingest.test.ts:227` and `:253`, excluded entry `{ url, pos, reason }` | ❌ N04 survived: ingest may resolve against every configured candidate instead of the debate's own; only `resolveSpeaker` itself is tested with a narrowed list (`test/unit/normalize.test.ts:57`) |
| INGEST-06 | non-200, 30 s timeout, zero records or under 80% keeps prior records and reports | `test/unit/merge.test.ts:117`, `:128`, `:140`, `:164`, `:173`; `test/unit/io/http.test.ts:221`, `:228`, `:249` (`delays` equal `[30_000, 30_000]`); `test/integration/ingest.test.ts:270`, `:354` | ✅ |
| INGEST-07 | one request per domain per 5 s, UA with name and repo URL, robots.txt honored | `test/unit/io/http.test.ts:75`, `:127`, `:138`, `:159`, `:344` | ✅ |
| INGEST-08 | no agency content sent to AI | `test/unit/io/http.test.ts:310` and `:322`, hosts outside the allowlist refused; no AI or LLM client under `src/` or `site/` (unchanged since iteration 1) | ✅ |
| INGEST-09 | run report per source: HTTP status, count, excluded items, unmapped labels | `test/integration/ingest.test.ts:227`, `:327`; `test/unit/write.test.ts:148` | ✅ |

### P1: Browse every check

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| SITE-01 | "Todos" view with every record, no login | `test/e2e/site.test.ts:136`; `test/unit/site/build.test.ts:37` | ✅ |
| SITE-02 | speaker, quote, label most prominent, band, agency, excerpt, link | `test/unit/site/render.test.ts:23` | ✅ |
| SITE-03 | filters combine with AND | `test/unit/site/core.test.ts:34`, `:50`; `test/e2e/site.test.ts:143` | ✅ |
| SITE-04 | debate newest first, agency alphabetical, page order | `test/unit/site/core.test.ts:76`, `:92`; `test/unit/merge.test.ts:522` | ✅ |
| SITE-05 | "Nenhuma checagem com esses filtros." plus a clear control | `test/e2e/site.test.ts:168` | ✅ |
| SITE-06 | no horizontal scroll at 360 px | `test/e2e/site.test.ts:116` | ✅ |
| SITE-07 | no tracking cookies, analytics or cross-origin assets | `test/e2e/site.test.ts:362`; `test/unit/site/sprites.test.ts:83` | ✅ |

### P1: Scoreboards

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| SCORE-01 | per-agency board per candidate and band, current filters | `test/unit/site/core.test.ts:106` (pure `scoreboard`); `test/e2e/site.test.ts:153` checks only the scope text " da Lupa" | ❌ N06 survived: the browser board can be fed records outside the selected agency and no test reads its numbers |
| SCORE-02 | general board sums all agencies | `test/unit/site/core.test.ts:121`; `test/unit/site/build.test.ts:68` (pre-rendered general board) | ✅ |
| SCORE-03 | exact notice text next to the general board | `test/unit/site/core.test.ts:132`; `test/e2e/site.test.ts:153` (per-agency notice) | ✅ |
| SCORE-04 | board total equals listed records still found | `test/unit/site/core.test.ts:141` | ⚠️ the test computes the board from `listed()` itself, so it cannot see the browser wiring that N06 breaks |
| SCORE-05 | ascending ballot order, four bands including zero | `test/unit/site/core.test.ts:166`; `test/unit/site/render.test.ts:77` | ✅ |

### P1: Open, auditable data

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| DATA-01 | JSON and CSV linked, same records as the site | `test/unit/site/build.test.ts:90`, `:277`; `test/unit/write.test.ts:115`, `:123` | ✅ |
| DATA-02 | source URL, snapshot URL, SHA-256 of snapshot bytes, fetch time, parser version | `test/unit/archive.test.ts:154`; `test/integration/ingest.test.ts:195`, `:426` | ✅ |
| DATA-03 | mapping file published and linked | `test/unit/config.test.ts:50`; `test/unit/normalize.test.ts:64` to `:91`; `test/unit/check-labels.test.ts:32`, `:42`; `test/unit/site/build.test.ts:139` | ✅ |
| DATA-04 | byte-identical records for same parser and HTML | `test/unit/write.test.ts:62`, `:76`; `test/integration/ingest.test.ts:419`; `test/unit/adapters/g1.test.ts:160`; `test/golden/golden.ts:79` | ✅ |
| DATA-05 | no raw agency HTML published | `.gitignore:3`; `test/unit/site/build.test.ts:277` | ✅ |
| DATA-06 | retry until the snapshot parses to the same statement, speaker and label; list as waiting meanwhile | `test/unit/archive.test.ts:170`, `:222`, `:341` to `:357` (label, speaker and quote each rejected), `:369`; `test/integration/ingest.test.ts:426` (`awaitingArchive`) | ✅ |
| DATA-07 | methodology: sources, parsers, mapping with per-candidate counts, order rule, error reporting | `test/unit/site/build.test.ts:139`, `:166`, `:224` | ✅ |

### P1: Visible impartiality and self-service audit

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AUDIT-01 | exact sentence in the first screen below the subtitle plus a panel control | `test/unit/site/build.test.ts:109`; `test/e2e/site.test.ts:251`, `:267` | ✅ |
| AUDIT-02 | fixed "Como auditar" button on every viewport | `test/e2e/site.test.ts:277` | ✅ |
| AUDIT-03 | five rules and links to repo, dataset, mapping, history | `test/unit/site/build.test.ts:90`; `test/e2e/site.test.ts:251` | ✅ |
| AUDIT-04 | prompt with repo URL, dataset URL, five steps; "Prompt copiado" | `test/e2e/site.test.ts:294` | ✅ |
| AUDIT-05 | fallback selects text and shows the exact message | `test/e2e/site.test.ts:306` | ✅ |
| AUDIT-06 | same template, size, pose, mirrored, equal animation and mouth frames | `test/unit/site/sprites.test.ts:26`, `:49`, `:57` | ✅ |
| AUDIT-07 | illustration never changes with verdicts or counts | `test/e2e/site.test.ts:323` | ✅ |
| AUDIT-08 | portrait and logo credits in the footer and on the methodology page | `test/unit/site/build.test.ts:253` (both footers), `:262` (methodology list) | ✅ |

### P2: History, sharing, configuration

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| HIST-01 | new value published, previous kept with detection date | `test/unit/merge.test.ts:215`, `:389`, `:419` | ✅ |
| HIST-02 | missing record kept, marked, out of boards, shown only with "Mostrar removidos" | `test/unit/merge.test.ts:479`; `test/unit/site/core.test.ts:182`, `:193`, `:201`; `test/unit/site/render.test.ts:52`; `test/e2e/site.test.ts:224`, `:244`; `test/integration/ingest.test.ts:374` | ✅ |
| SHARE-01 | all active filters in the URL | `test/unit/site/core.test.ts:210`; `test/e2e/site.test.ts:143` | ✅ |
| SHARE-02 | URL filters applied on open | `test/unit/site/core.test.ts:225`, `:233`; `test/e2e/site.test.ts:143` | ✅ |
| CONF-01 | new manifest entry ingested without code changes | `test/integration/ingest.test.ts:404`; `test/unit/config.test.ts:174` | ✅ |
| CONF-02 | agency without parser fails that entry and is named | `test/integration/ingest.test.ts:383` | ✅ |

**Status**: ❌ Gaps present (INGEST-05 wiring, SCORE-01 browser board), ⚠️ INGEST-04 negative case and SCORE-04 wiring flagged

---

## Discrimination Sensor

Scratch: `git worktree add` at `29fd94e` under the session scratchpad, `node_modules` symlinked and the git-ignored `.cache/` and `mocks/` copied in. One mutant at a time, only the listed test files run with the local `vitest` binary, `git checkout -- <file>` after each run and a clean worktree check before the next. The worktree was removed with `git worktree remove --force`.

### Iteration 1 survivors, re-applied exactly

| Mutation | File:line | Description | Tests run | Killed? |
| -------- | --------- | ----------- | --------- | ------- |
| M03 | `src/pipeline/normalize.ts:16` | `c.aliases.includes(key)` changed to `c.aliases.some((a) => key.startsWith(a))` | normalize, integration | ✅ Killed (4 failures, incl. `test/integration/ingest.test.ts:253`) |
| M07 | `src/pipeline/merge.ts:62` | same-speaker preference removed from `rank` | merge | ✅ Killed (`test/unit/merge.test.ts:318`) |
| M12 | `src/pipeline/archive.ts:56` | `content()` drops the speaker | archive | ✅ Killed (speaker case of `test/unit/archive.test.ts:345`) |
| M25 | `src/io/http.ts:18` | `TIMEOUT_MS` 30_000 changed to 60_000 | http, integration | ✅ Killed (`test/unit/io/http.test.ts:249`) |
| M26 | `src/pipeline/archive.ts:56` | `content()` drops the quote | archive | ✅ Killed (quote case of `test/unit/archive.test.ts:345`) |

### New mutants (iteration 2)

| Mutation | File:line | Description | Tests run | Killed? |
| -------- | --------- | ----------- | --------- | ------- |
| N01 | `src/pipeline/normalize.ts:29` | band fallback `'sem faixa'` changed to `'impreciso'` | normalize, merge | ✅ Killed |
| N02 | `src/pipeline/normalize.ts:20` | `labelKey` strips only whitespace, keeps `#` and `/` | normalize, check-labels, golden g1 | ✅ Killed |
| N03 | `src/pipeline/normalize.ts:11` | `nameKey` keeps the text after the first comma | normalize, integration | ✅ Killed |
| N04 | `src/ingest.ts:197` | `speakers = config.candidates` instead of the debate's candidates | integration | ❌ Survived |
| N05 | `site/core.js:117` | scoreboard `total` counts removed records (bands still exclude them) | core, render, build | ✅ Killed |
| N06 | `site/app.js:60` | browser board fed `listed(ctx, state, 'outlet')`, so the per-agency board shows every agency | e2e | ❌ Survived |
| N07 | `site/core.js:47` | candidates sorted by short name instead of ballot number | core, render, build | ✅ Killed |
| N08 | `src/pipeline/merge.ts:140` | an unchanged returning record keeps `missingSince` | merge, integration | ✅ Killed |
| N09 | `src/pipeline/merge.ts:181` | partial guard applies only above 5 previous records (`>=` changed to `>`) | merge | ✅ Killed |
| N10 | `src/pipeline/write.ts:102` | CSV stops doubling inner quotes | write | ✅ Killed |
| N11 | `site/render.js:39` | quote rendered without HTML escaping | render, build | ✅ Killed |
| N12 | `site/core.js:78` | `readState` accepts any value from the URL | core | ✅ Killed |
| N13 | `src/pipeline/merge.ts:133` | a label, quote or speaker change keeps the old verified snapshot | merge, integration | ✅ Killed |
| N14 | `src/pipeline/merge.ts:93` | quote matching runs for keyed items too (keyless filter dropped) | merge, integration | ❌ Survived |
| N15 | `src/pipeline/normalize.ts:11` | `nameKey` lowercases without folding diacritics | normalize, integration | ✅ Killed |

**Sensor depth**: P0-full (manual, 5 re-applied + 15 new mutants across band mapping, speaker resolution, scoreboard counting, candidate order, archive evidence, merge identity, CSV and HTML escaping, URL state)
**Result**: old 5/5 killed; new 12/15 killed; 17/20 overall - FAIL

Why the survivors matter:

- **N06** (scoreboard counting): `test/unit/site/core.test.ts:106` and `:141` test the pure `scoreboard()` with records the test itself filters. Nothing reads the numbers the browser shows after an agency is picked: `test/e2e/site.test.ts:153` checks only the " da Lupa" scope text, and `:323` only checks that the totals change after four filters. A visitor choosing Lupa would see the general counts under a Lupa label.
- **N04** (speaker resolution): `test/unit/normalize.test.ts:57` proves `resolveSpeaker` honors a narrowed list, but no integration test has a debate whose `candidates` is a subset of `config/candidates.json` (the integration helper at `test/integration/ingest.test.ts:61` always lists both). Today both debates list both candidates, so the published data is unaffected. A 2028 debate added by configuration (CONF-01) would attribute a quote from a 2026 candidate who is not in that debate to that candidate and count it.
- **N14** (merge identity): with a g1, Estadão or Aos Fatos item whose key is new but whose quote equals an unmatched previous record, the mutant reuses the old id; INGEST-04 now says keyed sources match only by item ID.

Main tree `git status --porcelain` was empty before the sensor and is empty after `git worktree remove --force` (compared byte for byte).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ (iteration 2 adds tests only) |
| Surgical changes | ✅ (8 files, 143 insertions, 8 deletions, each tied to an iteration 1 fix) |
| No scope creep | ✅ |
| Matches patterns | ✅ (`biome check .` clean on 60 files) |
| Spec-anchored outcome check (asserted values match spec) | ✅ for the new tests; ⚠️ SCORE-04 test is self-referential for the browser path |
| Per-layer Coverage Expectation met | ❌ browser scoreboard wiring (N06) and ingest speaker wiring (N04) lack tests |
| Every test maps to a spec requirement, no unclaimed tests | ✅ |
| Documented guidelines followed: `AGENTS.md`, `tasks.md` Gate Check Commands | ✅ |

---

## Edge Cases

- [x] Duplicate statement on one page: one record per anchor, duplicate reported (`test/unit/ids.test.ts:33`, `test/integration/ingest.test.ts:244`)
- [x] Unknown label: band "sem faixa", label listed in the report (`test/unit/normalize.test.ts:81`, `test/integration/ingest.test.ts:245`)
- [x] No explanation: empty excerpt (`test/unit/normalize.test.ts:124`, `test/unit/site/render.test.ts:71`)
- [x] Excerpt over 280 characters: cut at the last word boundary plus "…" (`test/unit/normalize.test.ts:105`, `:115`)

---

## Gate Check

- **Gate command**: `tsc --noEmit`, `biome check .`, `node src/ingest.ts --help`, then `vitest run <files>` in batches inside the scratch worktree: unit in three batches, integration, golden, e2e. The local `vitest` binary ran instead of `pnpm vitest`, as in iteration 1.
- **Result**: 283 passed, 0 failed, 0 skipped (unit 213, integration 14, golden 41, e2e 15). Typecheck exit 0, lint clean, CLI smoke exit 0.
- **Test count at iteration 1**: 268
- **Test count now**: 283
- **Delta**: +15 (archive +2, normalize +5, merge +1, http +1, build +4, integration +1, e2e +1); no test removed. The archive "label or speaker" test became three cases, each stricter than the original.
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1: browser scoreboard numbers are never checked (N06)

- **Root cause**: SCORE-01 and SCORE-04 are tested on the pure `scoreboard()` only; `renderBoard` in `site/app.js:60` can take the wrong record set and every test passes.
- **Fix task**: in `test/e2e/site.test.ts`, pick one agency (and one debate) and assert each candidate's total and four band counts in `#board` equal a count computed from `records` for that agency, still found at the source. Repeat with "Todas" for the general board.
- **Priority**: Blocker

### Fix 2: ingest speaker list per debate is untested (N04)

- **Root cause**: the integration `debate()` helper hardcodes `candidates: ['lula', 'flavio']`, so `src/ingest.ts:197` can drop the per-debate filter unnoticed.
- **Fix task**: let the helper take a candidate list and add an integration test with a debate that lists only `lula`; an item spoken by `FLÁVIO BOLSONARO (PL)` on that debate's page must land in `excluded` with `speaker not resolved` and must not be published.
- **Priority**: Blocker

### Fix 3: keyed sources must not match by quote (N14)

- **Root cause**: every quote-matching test uses Lupa items; nothing shows a keyed item staying unmatched when only its quote is equal.
- **Fix task**: in `test/unit/merge.test.ts`, re-run a g1 source where `chunk-1` disappears and a new `chunk-9` carries the same quote. Expect a new id for `chunk-9` and `missingSince` on the old record.
- **Priority**: Major

---

## Requirement Traceability Update

| Requirement | Iteration 1 status | Iteration 2 status |
| ----------- | ------------------ | ------------------ |
| DATA-06 | ❌ Needs Fix | ✅ Verified |
| INGEST-06 | ⚠️ Needs Fix | ✅ Verified |
| AUDIT-01, AUDIT-08 | ✅ Verified (weak) | ✅ Verified |
| INGEST-05 | ❌ Needs Fix | ❌ Needs Fix (Fix 2) |
| SCORE-01, SCORE-04 | ✅ Verified | ❌ Needs Fix (Fix 1) |
| INGEST-04 | ⚠️ Needs Fix | ⚠️ Needs Fix (Fix 3) |
| All other IDs | ✅ Verified | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 38/42 ACs matched the spec outcome; 2 gaps (INGEST-05 wiring, SCORE-01 browser board), 2 flagged (INGEST-04 negative case, SCORE-04 wiring)
**Sensor**: 17/20 killed (old 5/5, new 12/15)
**Gate**: 283 passed, 0 failed

**What works**: every iteration 1 gap is closed with tests that assert the spec outcome, and the old survivors die. Band mapping, label keys, name keys, candidate order, removed-record exclusion, the 80% guard boundary, evidence reset on content change, CSV quoting, HTML escaping and URL state parsing all killed their mutants.

**Issues found**: the two new survivors sit where pure functions meet their callers: the browser board (Fix 1) and ingest's per-debate candidate list (Fix 2). Fix 3 pins the reworded INGEST-04.

**Next steps**: run Fix 1 and Fix 2, then Fix 3, then re-verify. One fix and re-verify iteration remains before escalation to the user.
