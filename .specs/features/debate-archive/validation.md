# Debate Archive Validation

## Validation: debate-archive - FAIL

**Date**: 2026-10-24
**Spec**: `.specs/features/debate-archive/spec.md`
**Diff range**: `88e9ef1..HEAD` (HEAD `b2aa35b`)
**Verifier**: independent sub-agent (author ≠ verifier)

The verdict is FAIL. Three mutants survived in impartiality-critical logic: speaker resolution (`src/pipeline/normalize.ts:16`) and archive verification (`src/pipeline/archive.ts:56`, twice). Every AC has test or artifact evidence and the gates are green. The tests do not tell a correct speaker match or a correct snapshot check from a broken one.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 to T23 | ✅ Done | All marked done in `tasks.md` |
| T24 | ✅ Done | `data/` holds 314 records. 83 still wait for an archive snapshot (g1 Band 37, Aos Fatos Globo 46) because web.archive.org refused connections during the run. DATA-06 retries them on every run, so this is environmental. |

Dataset cross-check on `data/` (read-only script): 0 band mismatches against `config/bands.json`, CSV and JSON carry the same 314 ids in the same order, per-source `items` and `awaitingArchive` in `data/run-report.json` match the records, every record with an `archiveUrl` has a `sha256` and none without one does, and ids are unique.

---

## Spec-Anchored Acceptance Criteria

### P1: Collect the debate checks

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| INGEST-01 | every manifest source fetched (4 agencies x 2 debates) | `test/integration/ingest.test.ts:449`, run report from the real config lists the 8 sources; `data/run-report.json` shows 8 sources with httpStatus 200 | ✅ |
| INGEST-02 | one record per check with agency, debate, speaker, quote, label, band, excerpt, source URL, anchor or position | `test/integration/ingest.test.ts:195`, full record equality on every field | ✅ |
| INGEST-03 | one parser per agency format (g1 verdict tags, Lupa uppercase label, Estadão phrasing, Aos Fatos stamps or Escriba) | `test/unit/adapters/g1.test.ts:57`, `test/unit/adapters/lupa.test.ts:236`, `test/unit/adapters/estadao.test.ts:41`, `test/unit/adapters/aosfatos.test.ts:210`; `test/golden/golden.ts:41` pins counts (g1 37/20, Lupa 41/43, Aos Fatos 49/37, Estadão 28/37) | ✅ |
| INGEST-04 | ID kept on match by item ID, same quote, or similar quote from same speaker | `test/unit/merge.test.ts:194`, `:205`, `:215`, `:228`, `:237`, `:249`, `:258`, `:358` | ⚠️ Spec-precision gap: the AC allows quote matching for any item, while design and spec assumptions limit quote matching to sources without their own item ID. Tests follow the design. M07 survived here. |
| INGEST-05 | unresolved speaker excluded and listed with source URL | `test/integration/ingest.test.ts:240`, excluded entry carries the source URL; `test/unit/normalize.test.ts:42`, `resolveSpeaker(raw)` is null for "Jornalista" and "César Tralli" | ❌ GAP: M03 survived. A prefix match ("Flávio Dino", "Lula Marques") would resolve to a candidate and no test rejects it. |
| INGEST-06 | non-200, 30 s timeout, zero records or under 80% keeps prior records and reports | `test/unit/merge.test.ts:117`, `:128`, `:140`, `:164`, `:173`; `test/integration/ingest.test.ts:253`, `:337` | ⚠️ the 30 s value is never asserted (`test/unit/io/http.test.ts:228` passes `timeoutMs: 20`). M25 survived. |
| INGEST-07 | one request per domain per 5 s, UA with name and repo URL, robots.txt honored | `test/unit/io/http.test.ts:75` (5 s spacing), `:127` and `:138` (robots), `:320` (UA `debates-checados/0.1.0 (+REPO)`) | ✅ |
| INGEST-08 | no agency content sent to AI | `test/unit/io/http.test.ts:286`, hosts outside the allowlist are refused; grep found no AI or LLM client under `src/` or `site/` | ✅ |
| INGEST-09 | run report per source: HTTP status, count, excluded items, unmapped labels | `test/integration/ingest.test.ts:227` to `:251`, `:310`; `test/unit/write.test.ts:148` | ✅ |

### P1: Browse every check

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| SITE-01 | "Todos" view with every record, no login | `test/e2e/site.test.ts:136`; `test/unit/site/build.test.ts:169` | ✅ |
| SITE-02 | item shows speaker, quote, label most prominent, band, agency, excerpt, link | `test/unit/site/render.test.ts:262` | ✅ |
| SITE-03 | filters combine with AND | `test/unit/site/core.test.ts:34`, `:50`; `test/e2e/site.test.ts:143` | ✅ |
| SITE-04 | debate newest first, agency alphabetical, page order | `test/unit/site/core.test.ts:76`, `:92`; `test/unit/merge.test.ts:504` | ✅ |
| SITE-05 | "Nenhuma checagem com esses filtros." plus a clear control | `test/e2e/site.test.ts:168`, exact message and "Limpar filtros" | ✅ |
| SITE-06 | no horizontal scroll at 360 px | `test/e2e/site.test.ts:116` | ✅ |
| SITE-07 | no tracking cookies, no third-party analytics, no cross-origin assets | `test/e2e/site.test.ts:352`, no cross-origin request and `document.cookie` is empty; `test/unit/site/sprites.test.ts:414` | ✅ |

### P1: Scoreboards

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| SCORE-01 | per-agency board per candidate and band | `test/unit/site/core.test.ts:106`; `test/e2e/site.test.ts:153` | ✅ |
| SCORE-02 | general board sums all agencies | `test/unit/site/core.test.ts:121` | ✅ |
| SCORE-03 | exact notice text next to the general board | `test/unit/site/core.test.ts:132`, exact string; `test/unit/site/build.test.ts:208` | ✅ |
| SCORE-04 | board total equals listed records still found | `test/unit/site/core.test.ts:141` | ✅ |
| SCORE-05 | ascending ballot order, all four bands shown including zero | `test/unit/site/core.test.ts:166`; `test/unit/site/render.test.ts:316` | ✅ |

### P1: Open, auditable data

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| DATA-01 | JSON and CSV linked, same records as the site | `test/unit/site/build.test.ts:189`, `:237`, `:371`; `test/unit/write.test.ts:115` to `:144` | ✅ |
| DATA-02 | source URL, snapshot URL, SHA-256 of snapshot bytes, fetch time, parser version | `test/unit/archive.test.ts:144` (archiveUrl and sha256 of the body); `test/integration/ingest.test.ts:195` (fetchedAt, adapter, evidence url) | ✅ |
| DATA-03 | mapping file published and linked | `test/unit/config.test.ts:254`, `:276`; `test/unit/normalize.test.ts:52` to `:82`; `test/unit/check-labels.test.ts:202` to `:225`; `test/unit/site/build.test.ts:222`, `:262` | ✅ |
| DATA-04 | byte-identical records for same parser and HTML | `test/unit/write.test.ts:62`, `:76`; `test/integration/ingest.test.ts:402`; `test/unit/adapters/g1.test.ts:160` (adapter purity); `test/golden/golden.ts:41` (byte-identical run) | ✅ |
| DATA-05 | no raw agency HTML published | `.gitignore:3` ignores `.cache`; `test/unit/site/build.test.ts:371`; `git ls-files` lists no agency HTML | ✅ |
| DATA-06 | retry each run until snapshot parses to same statement, speaker and label; list as waiting meanwhile | `test/unit/archive.test.ts:160`, `:212`, `:330`, `:352`; `test/integration/ingest.test.ts:409` (awaitingArchive) | ❌ GAP: M12 and M26 survived. The test at `test/unit/archive.test.ts:330` is named "label or speaker" but only changes the label. No test changes the speaker or the quote. |
| DATA-07 | methodology page: sources, parsers, mapping with per-candidate counts, order rule, error reporting | `test/unit/site/build.test.ts:262`, `:289`, `:347` | ✅ |

### P1: Visible impartiality and self-service audit

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AUDIT-01 | exact sentence below the subtitle plus a panel control | `test/e2e/site.test.ts:251` | ✅ (position asserted only through `.hero .trust`) |
| AUDIT-02 | fixed "Como auditar" button on every viewport | `test/e2e/site.test.ts:267` | ✅ |
| AUDIT-03 | five rules and links to repo, dataset, mapping, history | `test/e2e/site.test.ts:262`; `test/unit/site/build.test.ts:222`; rule texts at `site/index.html:40` to `:44` | ✅ |
| AUDIT-04 | prompt with repo URL, dataset URL, five steps; "Prompt copiado" | `test/e2e/site.test.ts:284` | ✅ |
| AUDIT-05 | fallback selects text and shows the exact message | `test/e2e/site.test.ts:296` | ✅ |
| AUDIT-06 | same body template, size, pose, mirrored, equal animation and mouth frames | `test/unit/site/sprites.test.ts:357`, `:380`, `:388` | ✅ |
| AUDIT-07 | illustration never changes with verdicts or counts | `test/e2e/site.test.ts:313` | ✅ |
| AUDIT-08 | portrait and logo credits in footer and methodology page | `test/unit/site/build.test.ts:347` (methodology); footer credits only as artifact at `site/index.html:78` | ✅ (footer has no test) |

### P2: History, sharing, configuration

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| HIST-01 | new value published, previous kept with detection date | `test/unit/merge.test.ts:215`, `:371`, `:401` | ✅ |
| HIST-02 | missing record kept, marked, out of boards, shown only with "Mostrar removidos" | `test/unit/merge.test.ts:461`; `test/unit/site/core.test.ts:182`, `:193`, `:201`; `test/unit/site/render.test.ts:291`; `test/e2e/site.test.ts:224`, `:244`; `test/integration/ingest.test.ts:357` | ✅ |
| SHARE-01 | all active filters in the URL | `test/unit/site/core.test.ts:210`; `test/e2e/site.test.ts:143` | ✅ |
| SHARE-02 | URL filters applied on open | `test/unit/site/core.test.ts:225`; `test/e2e/site.test.ts:160` | ✅ |
| CONF-01 | new manifest entry ingested without code changes | `test/integration/ingest.test.ts:387`; `test/unit/config.test.ts:400` | ✅ |
| CONF-02 | agency without parser fails that entry and is named | `test/integration/ingest.test.ts:366` | ✅ |

**Status**: ❌ Gaps present (INGEST-05, DATA-06), ⚠️ spec-precision gaps flagged (INGEST-04, INGEST-06 timeout value)

---

## Discrimination Sensor

Scratch: a temporary git worktree at `b2aa35b`, one mutant at a time, reverted with `git checkout -- <file>` after each run. Only the test files covering the mutated code ran.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M01 | `src/pipeline/normalize.ts:20` | `labelKey` without diacritic folding | ✅ Killed |
| M02 | `src/pipeline/normalize.ts:25` | `mappedBand` searches every outlet's labels | ✅ Killed |
| M03 | `src/pipeline/normalize.ts:16` | `c.aliases.includes(key)` changed to `c.aliases.some((a) => key.startsWith(a))` | ❌ Survived (normalize, integration) |
| M04 | `src/config.ts:298` | alias owner check removed | ✅ Killed |
| M05 | `src/pipeline/merge.ts:104` | Jaccard `>=` changed to `>` | ✅ Killed |
| M06 | `src/pipeline/merge.ts:102` | fuzzy match drops the same-speaker filter | ✅ Killed |
| M07 | `src/pipeline/merge.ts:62` | same-speaker preference removed from `rank` | ❌ Survived (merge) |
| M08 | `src/pipeline/merge.ts:132` | history entry for speaker change not written | ✅ Killed |
| M09 | `src/pipeline/merge.ts:182` | partial guard `<` changed to `<=` | ✅ Killed |
| M10 | `src/pipeline/merge.ts:242` | `missingSince` not set | ✅ Killed |
| M11 | `src/pipeline/merge.ts:207` | id collision loop removed | ✅ Killed |
| M12 | `src/pipeline/archive.ts:56` | `content()` drops the speaker: `JSON.stringify([x.quote, x.label])` | ❌ Survived (archive) |
| M13 | `src/pipeline/archive.ts:139` | all-or-nothing check changed to `held > 0` | ✅ Killed |
| M14 | `src/pipeline/archive.ts:133` | archived duplicates not pre-consumed | ✅ Killed |
| M15 | `src/pipeline/archive.ts:234` | sha256 not stored | ✅ Killed |
| M16 | `src/pipeline/archive.ts:90` | `closest.status` 200 check removed | ✅ Killed |
| M17 | `src/ingest.ts:331` | `awaitingArchive` left unsorted | ✅ Killed |
| M18 | `src/pipeline/write.ts:300` | report source keys left unsorted | ✅ Killed |
| M19 | `site/core.js:114` | scoreboard counts removed records | ✅ Killed |
| M20 | `site/core.js:47` | candidates not sorted by ballot number | ✅ Killed |
| M21 | `site/core.js:80` | `readState` uses `params.has('removed')` | ✅ Killed |
| M22 | `site/render.js:139` | `esc` stops escaping `"` | ✅ Killed |
| M23 | `src/site/build.ts:53` | `jsonScript` stops escaping `<` | ✅ Killed |
| M24 | `src/ingest.ts:87` | Brasília timezone changed to UTC | ✅ Killed |
| M25 | `src/io/http.ts:18` | `TIMEOUT_MS` 30_000 changed to 60_000 | ❌ Survived (http, integration) |
| M26 | `src/pipeline/archive.ts:56` | `content()` drops the quote: `JSON.stringify([x.speaker, x.label])` | ❌ Survived (archive) |
| M27 | `site/core.js:95` | band filter ignored | ✅ Killed |
| M28 | `site/core.js:29` | debates sorted oldest first | ✅ Killed |

**Sensor depth**: P0-full (manual, 28 mutants across every impartiality-critical path)
**Result**: 23/28 killed - FAIL

Main tree `git status --porcelain` was empty before the sensor and is empty after `git worktree remove --force`.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (fresh repository, every file belongs to the feature) |
| No scope creep | ✅ |
| Matches patterns | ✅ (`biome check .` clean on 60 files) |
| Spec-anchored outcome check (asserted values match spec) | ❌ DATA-06 test at `test/unit/archive.test.ts:330` claims speaker coverage it does not exercise; INGEST-06 timeout value unasserted |
| Per-layer Coverage Expectation met | ❌ speaker resolution and snapshot verification lack negative cases (M03, M12, M26) |
| Every test maps to a spec requirement, no unclaimed tests | ✅ |
| Documented guidelines followed: `AGENTS.md`, `tasks.md` Gate Check Commands | ✅ |

---

## Edge Cases

- [x] Duplicate statement on one page: one record per anchor, duplicate reported (`test/unit/ids.test.ts:199`, `test/integration/ingest.test.ts:244`)
- [x] Unknown label: band "sem faixa", label listed in the report (`test/unit/normalize.test.ts:70`, `test/integration/ingest.test.ts:245`)
- [x] No explanation: empty excerpt (`test/unit/normalize.test.ts:113`, `test/unit/site/render.test.ts:310`)
- [x] Excerpt over 280 characters: cut at the last word boundary plus "…" (`test/unit/normalize.test.ts:94`, `:104`)

---

## Gate Check

- **Gate command**: `tsc --noEmit`, `biome check .`, `node src/ingest.ts --help`, then `vitest run <file>` one file at a time (unit, integration, golden, e2e). `pnpm vitest` refused to run inside the worktree (ERR_PNPM_UNSAFE_MODULES_DIR), so the local `vitest` binary ran instead.
- **Result**: 268 passed, 0 failed, 0 skipped (unit 200, integration 13, golden 41, e2e 14). Typecheck exit 0, lint clean, CLI smoke exit 0.
- **Test count before feature**: 0 (fresh repository)
- **Test count after feature**: 268
- **Delta**: +268
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1: snapshot verification ignores speaker and quote

- **Root cause**: `test/unit/archive.test.ts:330` only changes the label, so `content()` at `src/pipeline/archive.ts:56` can drop the speaker or the quote and every test still passes. DATA-06 requires the snapshot to parse to the same statement, speaker and label.
- **Fix task**: add two archive tests: a snapshot whose item has the same key but a different speaker, and one with the same key but a different quote. Both must leave the record without `archiveUrl` and list it in `awaitingArchive`. Rename the existing test to "label".
- **Priority**: Blocker

### Fix 2: speaker resolution accepts near-miss names

- **Root cause**: `test/unit/normalize.test.ts:42` checks null only for names unrelated to any alias, so a prefix match at `src/pipeline/normalize.ts:16` survives.
- **Fix task**: add `resolveSpeaker` null cases for names that start with a candidate alias, such as "Flávio Dino" and "Lula Marques", plus one integration item with such a speaker that must land in the excluded list.
- **Priority**: Blocker

### Fix 3: merge ranking without speaker preference survives

- **Root cause**: `test/unit/merge.test.ts:293` uses records that also differ by label, so the label tie-break hides a missing speaker tie-break at `src/pipeline/merge.ts:62`.
- **Fix task**: add a merge test where both candidates say the same quote with the same label and the page order swaps. Each id must stay with its speaker.
- **Priority**: Major

### Fix 4: 30 s timeout not pinned

- **Root cause**: `test/unit/io/http.test.ts:228` overrides `timeoutMs`, so the default at `src/io/http.ts:18` is never checked.
- **Fix task**: assert `TIMEOUT_MS === 30_000`, or assert the default used when no `timeoutMs` is passed.
- **Priority**: Minor

### Fix 5: INGEST-04 wording

- **Root cause**: the AC reads as quote matching for every item, while the design limits quote matching to sources without their own item ID.
- **Fix task**: reword INGEST-04 in `spec.md` to state that quote matching applies when the source has no item ID.
- **Priority**: Minor

### Fix 6: footer credits and hero position untested

- **Root cause**: AUDIT-08 footer credits exist only in `site/index.html:78`; AUDIT-01 position is checked only through the `.hero .trust` selector.
- **Fix task**: assert the footer credit text in `test/unit/site/build.test.ts` or the e2e suite.
- **Priority**: Cosmetic

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| INGEST-05 | Implemented | ❌ Needs Fix (Fix 2) |
| DATA-06 | Implemented | ❌ Needs Fix (Fix 1) |
| INGEST-04 | Implemented | ⚠️ Needs Fix (Fix 3, Fix 5) |
| INGEST-06 | Implemented | ⚠️ Needs Fix (Fix 4) |
| All other IDs | Implemented | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 38/42 ACs matched spec outcome; 2 gaps (INGEST-05, DATA-06), 2 spec-precision gaps (INGEST-04, INGEST-06)
**Sensor**: 23/28 mutations killed
**Gate**: 268 passed, 0 failed

**What works**: ingestion across 8 sources, merge and history, scoreboards, filters and sharing, the static build, the audit panel and the e2e checks in a real browser. The published dataset is internally consistent.

**Issues found**: snapshot verification and speaker resolution have no negative tests that pin the impartiality rules (Fix 1, Fix 2). Merge ranking and the HTTP timeout have weaker gaps (Fix 3, Fix 4).

**Next steps**: run Fix 1 and Fix 2, then Fix 3 and Fix 4, then re-verify.
