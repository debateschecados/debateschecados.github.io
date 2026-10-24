# Agency Comparator Validation

No validation.md was committed for phases 1 and 2, so this file starts with phase 3.

## Validation: Phase 3 iteration 3 (final verification) - FAIL

**Date**: 2026-10-24
**Diff range**: `1cf9b04..75a4a40` (`75a4a40` fix(site): Give the interval bar the contrast of the point)
**Verifier**: independent sub-agent, fresh detached scratch worktree at `75a4a40`

Final verdict for phase 3: FAIL, for a test gap only. The behavior meets every AC in scope, including the amended LEAN-06. One sensor mutant on the new LEAN-06 contrast test survived (M20 below). This was the third and last fix-and-verify round, so the gap goes to the user rather than another loop. The fix is small (Fix 5).

### LEAN-06 on the built page (real data)

The amended AC (spec.md:135) asks for a bar at least as thick as the point's diameter, with a fill of at least 3:1 contrast against the page background. Measured in Chromium on `node src/site/build.ts` output, all four agencies, at 1280 px and 360 px:

| Mark | Measured | Rule | Holds |
| ---- | -------- | ---- | ----- |
| bar (`rect.ci`, `site/render.js:345`) | 8 px tall, fill `rgb(142, 142, 147)`, opacity 1, fill-opacity 1; 116 to 271 px long | thickness ≥ point diameter | ✅ 8 ≥ 8 |
| bar fill against `rgb(255, 255, 255)` | 3.26:1 (WCAG relative luminance) | ≥ 3:1 | ✅ |
| point (`circle.pt`, `site/render.js:370`) | 8 px solid ink `rgb(29, 29, 31)`, no stroke, no halo | n/a | n/a |

On screen the bar now reads as a solid grey band the width of the interval, with the point sitting inside it. LEAN-04 is unchanged: a small sample still draws neither point nor bar (`test/unit/site/render.test.ts:476`).

### Tests for the amended AC

- Thickness: `test/unit/site/render.test.ts:465` `expect(Number(rect.ci height)).toBeGreaterThanOrEqual(2 * Number(circle.pt r))`, the spec rule written as an assertion.
- Contrast: `test/e2e/compare.test.ts:376` `expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(3)`, on a probe `rect.ci` styled by the page CSS. The fixture's agencies all have small samples and draw no bar, so the probe stands in. The probe reads only `getComputedStyle(rect).fill` (`:355`). The fill's own alpha is blended over the background, but the element's `opacity` and `fill-opacity` are ignored.

### Sensor, iteration 3

| Mutation | File:line | Description | Test file | Killed? |
| -------- | --------- | ----------- | --------- | ------- |
| M17 | `site/style.css:1126` | bar fill transparent | e2e/compare.test.ts | ✅ Killed (contrast 1) |
| M17b | `site/style.css:1126` | the iteration 2 fill `rgba(29, 29, 31, 0.24)` | e2e/compare.test.ts | ✅ Killed (contrast 1.66) |
| M18 | `site/render.js:345` | bar height 0 | render.test.ts | ✅ Killed (`expected 0 to be greater than or equal to 8`) |
| M20 | `site/style.css:1126` | `opacity: 0.3` added to the bar (effective contrast about 1.3:1) | e2e/compare.test.ts | ❌ Survived |
| M21 | `site/render.js:370` | point r 6, wider than the bar | render.test.ts | ✅ Killed (`expected 8 to be greater than or equal to 12`) |

**Result**: 4/5 killed, 1 survived - FAIL

### Gate, iteration 3

One file per command in the scratch at `75a4a40`: `test/unit/site/render.test.ts` 26 passed, `test/unit/site/build.test.ts` 30 passed, `test/unit/site/lean.test.ts` 17 passed, `test/e2e/compare.test.ts` 11 passed. `node src/site/build.ts` exit 0. Mutants were restored by rewriting the original file content, not by `git checkout`. Scratch removed; `git status --porcelain` of the phase3 tree empty before and after.

### Fix 5: count opacity in the LEAN-06 contrast test

- **Root cause**: `test/e2e/compare.test.ts:355` reads only the computed `fill`. A bar faded with `opacity` or `fill-opacity` passes the test while failing the AC.
- **Fix task**: in the probe, also return `getComputedStyle(rect).opacity` and `.fillOpacity`, and multiply both into the alpha before `over()`. M20 must then fail.
- **Priority**: Minor (the shipped page meets the AC; the guard misses one regression path).

### Traceability update

| Requirement | Status |
| ----------- | ------ |
| LEAN-06 | ✅ Behavior verified on the built page; ⚠️ contrast test misses opacity (Fix 5) |
| All other ACs in scope | ✅ Verified (iterations 1 and 2) |

---

## Iteration 2: Phase 3 re-verification - FAIL

**Date**: 2026-10-24
**Diff range**: `a621de8..f22d0a6` (`9a93406` style of the axes, `f22d0a6` tests for gaps 1-3 and the DRIFT-03 wording)
**Verifier**: independent sub-agent, fresh detached scratch worktree at `f22d0a6`

Final verdict for phase 3: FAIL. Gaps 1 to 4 of iteration 1 are closed. `9a93406` opened a new one: it makes the interval bar less visible than the point, against LEAN-06, and no test can see it.

### Iteration 1 gaps

| Gap | Evidence now | Mutant rerun | Status |
| --- | ------------ | ------------ | ------ |
| 1. CMP-08 shape | `test/e2e/compare.test.ts:354` `expect(new Set(shapes).size).toBe(5)` over border-radius, clip-path and fill of the legend dots | M16 killed (`expected 4 to be 5`) | ✅ Closed |
| 2. quote diff escaping | `test/unit/site/render.test.ts:348` `expect($('.qdiff b, .qdiff i')).toHaveLength(0)`, plus `del`/`ins` text | M15 killed | ✅ Closed |
| 3. repair `new` list | `test/unit/repair.test.ts:59` `report.new` equals the 7 ids derived from `after`, `before` and `merged` | M12 killed (`expected [] to deeply equal [ Array(7) ]`) | ✅ Closed |
| 4. DRIFT-03 first version | spec.md:153 now names the three date forms; `test/unit/site/render.test.ts:721`, `:722`, `:729` assert "até 24/10", "de 24/10 a 25/10", "desde 26/10, versão atual" | n/a | ✅ Closed |

### LEAN-04 and LEAN-06 after `9a93406`

- LEAN-04 holds: a small sample still draws neither point nor bar (`test/unit/site/render.test.ts:476`, spec value "neither the point nor the bar"); M13 (point drawn for a small sample) killed.
- LEAN-06 position and order hold: bar at `x="60%"` and point at `cx="75%"` on a ±0.5 domain (`test/unit/site/render.test.ts:460`, `:463`), zero line between bar and point in paint order (`:451` block); M19 (bar removed) killed.
- LEAN-06 "the interval as a bar at least as visible as the point" no longer holds. Measured in Chromium on the built page with the real data (`site/render.js:345`, `:370`, `site/style.css:1126`):

| Mark | Before `9a93406` | After `9a93406` |
| ---- | ---------------- | --------------- |
| bar (`rect.ci`) | 20 px tall, fill ink at 13% with a 1.5 px outline at 42% | 6 px tall, fill ink at 24%, no outline: about 1.7:1 against the white background |
| point (`circle.pt`) | 14 px hollow ring, 3 px ink stroke | 12 px solid ink with a white halo: about 16.8:1 |

  The bar is now thinner than the point's diameter and has about a tenth of its contrast; the point's white halo also cuts the bar where they meet. The goal at spec.md:10 asks for "the uncertainty drawn as large as the number", and LEAN-06 for a bar at least as visible as the point. On screen the point reads first and the interval reads as a light grey line. The 14 px end ticks (ink at 55%, about 3.9:1) help, but the AC is about the bar.
- No test asserts the bar's size or contrast: M17 (bar fill transparent, `test/e2e/compare.test.ts`) and M18 (bar height 0, `test/unit/site/render.test.ts`) both survived.

### Spec-precision gap

LEAN-06 does not say how "at least as visible" is measured, so neither the author nor a test can check it. Fix: state it in the AC, for example "the bar is at least as thick as the point's diameter and its fill has at least 3:1 contrast against the background (WCAG 1.4.11)".

### Sensor, iteration 2

| Mutation | File:line | Description | Test file | Killed? |
| -------- | --------- | ----------- | --------- | ------- |
| M12 | `src/repair/estadao-2026-10-24.ts:104` | report `new` always empty | repair.test.ts | ✅ Killed |
| M13 | `site/render.js:367` | point drawn for a small sample | render.test.ts | ✅ Killed |
| M15 | `site/render.js:421` | removed words of the quote diff not escaped | render.test.ts | ✅ Killed |
| M16 | `site/style.css:1258` | impreciso drawn as a circle | e2e/compare.test.ts | ✅ Killed |
| M17 | `site/style.css:1126` | interval bar fill transparent | e2e/compare.test.ts | ❌ Survived |
| M18 | `site/render.js:345` | interval bar height 0 | render.test.ts | ❌ Survived |
| M19 | `site/render.js:345` | interval bar removed | render.test.ts | ✅ Killed |

**Result**: 5/7 killed, 2 survived (both LEAN-06 visibility) - FAIL

### Gate, iteration 2

One file per command in the scratch at `f22d0a6`: `test/unit/site/render.test.ts` 26 passed, `test/unit/site/build.test.ts` 30 passed, `test/unit/site/lean.test.ts` 17 passed, `test/unit/repair.test.ts` 6 passed, `test/e2e/compare.test.ts` 10 passed. `node src/site/build.ts` exit 0. Scratch removed; `git status --porcelain` of the phase3 tree empty before and after.

### Fix 4: make the bar at least as visible as the point (LEAN-06)

- **Root cause**: `9a93406` thinned the bar to 6 px at 24% ink and filled the point solid ink (`site/render.js:345`, `:370`, `site/style.css:1126-1141`, legend keys `.k-ci`, `.k-pt`).
- **Fix task**: first amend LEAN-06 with a measurable rule (above). Then either revert the bar to at least the point's diameter with a fill of at least 3:1 contrast, or go back to a hollow or lighter point. Add `test/unit/site/render.test.ts`: `rect.ci` height ≥ 2 × `circle.pt` r. Add `test/e2e/compare.test.ts`: computed bar fill contrast against the page background ≥ 3:1. M17 and M18 must then fail.
- **Priority**: Major (LEAN-06 is the page's uncertainty display; the goal is that it reads as large as the number).

### Traceability update

| Requirement | Status |
| ----------- | ------ |
| CMP-08 | ✅ Verified |
| DRIFT-02, DRIFT-03 | ✅ Verified |
| LEAN-04 | ✅ Verified |
| LEAN-06 | ❌ Needs fix (Fix 4) |

---

## Iteration 1: Phase 3 (T9-T15 and review fixes) - FAIL

**Date**: 2026-10-24
**Spec**: `.specs/features/agency-comparator/spec.md` (amendment of 2026-10-24: LEAN-01..08, DRIFT-01..05, CMP-01/02/07/08, RIGOR-01/05)
**Diff range**: `3e4fff3..00bc68e` (branch `phase3`, 16 commits)
**Verifier**: independent sub-agent (author ≠ verifier)

Verdict reason: every AC in scope has a test that targets the spec outcome and the gates are green, but 3 of 18 sensor mutants survived. One of them leaves CMP-08's "by shape" with no evidence. Per the sensor rule, surviving mutants are fix tasks before the phase is done.

---

### Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T9 | ✅ Done | `9468dff` |
| T10 | ✅ Done | `e6ee1d4`, `0a62114`; rerun on committed data prints "already applied", report recomputes equal |
| T11 | ✅ Done | `c86a959`, `55e2f40`, `18fef36`, `06dac49`, `00bc68e` |
| T12 | ✅ Done | `28c0b0a` |
| T13 | ⚠️ Partial | `24be2ee`, `38d25df`, `d695226`; quote-diff escaping untested (M15), band shape untested (M16) |
| T14 | ✅ Done | `4f15217` |
| T15 | ✅ Done | `cc0fc7e`, `f0562b9` |

---

### Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LEAN-01 deviation | score minus mean of the other banded members; sem faixa out; nothing under 2 banded | `test/unit/site/lean.test.ts:58` `toEqual([... value: 1.5 ..., -1.5 ..., 0])` (hand-computed 2 - (0+1)/2); `:66` sem faixa and lone banded record | ✅ |
| LEAN-01 mean and n per agency and candidate | mean deviation and count | `test/unit/site/lean.test.ts:87` `{ id: 'lula', n: 10, mean: -1 }, { id: 'flavio', n: 11, mean: 9 / 11 }` | ✅ |
| LEAN-02 distance | mean(Flávio) minus mean(Lula) | `test/unit/site/lean.test.ts:91` `toBeCloseTo(9 / 11 + 1, 12)`, `:92` mirror for Estadão | ✅ |
| LEAN-02 97.5% interval, 5000 resamples, sorted[62]/[4937], deterministic | fixed LCG of design.md:184 | `test/unit/site/lean.test.ts:107` `toEqual([-0.759469696969697, 1.1268939393939394])`, `:108` same on two calls. Recomputed independently in Python from design.md:184: same pair; sorted[250]/[4749] gives -0.528/0.898 | ✅ |
| LEAN-03 sentence branches | three fixed sentences | `test/unit/site/lean.test.ts:147`, `:151`, `:166` exact strings | ✅ |
| LEAN-03 rounded ends, no −0,00 | rule on ends rounded to 2 decimals; 0,00 counts as 0 | `test/unit/site/lean.test.ts:193` `verdictOf([-0.3, -0.004])` is `none`, `:196` `[-0.3, -0.006]` is `c1`; `:207` `signed(-0.004)` is `0,00` | ✅ |
| LEAN-04 small sample | "amostra pequena", no interval, no point or bar, numbers as text | `test/unit/site/lean.test.ts:216-219` n `[10, 9]`, interval null; `test/unit/site/render.test.ts:462` `svg .pt, .ci, .end` length 0, `:464-472` numbers as text | ✅ |
| LEAN-05 headline | every form in the AC, agency order, "A, B e C", small never counted as no difference | `test/unit/site/lean.test.ts:229`, `:235`, `:241-245`, `:250-254`, `:259` exact sentences; page uses it at `test/unit/site/build.test.ts:519` | ✅ |
| LEAN-06 axes | one axis per agency in name order, Lula to Flávio, zero line, point, bar at least as visible, caveat and method note next to it | `test/unit/site/render.test.ts:389`, `:415` ends, `:448` zero at 50%, element order ci, zero, pt; `test/unit/site/build.test.ts:545` method note; `test/e2e/compare.test.ts:160` filter recompute | ✅ |
| LEAN-07 `pnpm lean` | same numbers and sentences as the page with no filter | `test/unit/site/lean.test.ts:291` line per agency, `:295` headline; manual: `node src/lean.ts` prints +0,14 [−0,15, +0,43] etc., equal to the frozen pin at `test/unit/site/lean.test.ts:131-134` | ✅ |
| LEAN-08 methodology | formula, scale, interval, rule, limits, spec link | `test/unit/site/build.test.ts:297`, `:313`, `:327` spec link href | ✅ |
| DRIFT-01 | previous key in the same history entry as a label change; key-only entry; kept on write | `test/unit/merge.test.ts:569` `{ label: '#FATO', key: 'chunk-1', until }`, `:586` key-only; `test/unit/write.test.ts:112` `{ key: null, until }` | ✅ |
| DRIFT-02 | repair from before/after, report lists merged ids, other sources unchanged | `test/unit/repair.test.ts:46-47` merged set is the 19 lost ids plus `d5bca87d832d`; `:77` other sources byte-identical; `:84` CLAIM-02 passes. Manual: other sources' sha equal at `3e4fff3` and `00bc68e`, CSV diff touches only the source, report recomputes equal to `data/repairs/2026-10-24-estadao.json` | ✅ (edge case gap below) |
| DRIFT-03 timeline | each version with label, band, date range; quote diff; key-only text | `test/unit/site/render.test.ts:707-716` versions with label, band, dates, `:714` key-only text, `:726` removed words; `test/unit/site/drift.test.ts:79` versions | ✅ (escaping gap M15; first-version date is a spec-precision gap) |
| DRIFT-04 counts | harsher, milder, gained, lost per agency and candidate; "nenhuma mudança" | `test/unit/site/drift.test.ts:195-207` hand counts with and without a debate filter; `test/unit/site/build.test.ts:587` | ✅ |
| DRIFT-05 | marked dot, previous band in detail | `test/unit/site/render.test.ts:188` `moved`, "antes falso"; `:273` "faixa anterior: falso"; `test/e2e/compare.test.ts:275` | ✅ |
| CMP-01 (amended) | dot matrix per debate and candidate, lane and dot per agency, hollow "não checou" | `test/unit/site/build.test.ts:426` per-button dots; `test/unit/site/render.test.ts:175` `dot none` | ✅ |
| CMP-02 (amended) | sentence, speaker, debate, band, label as text, link or "não checou" | `test/unit/site/render.test.ts:249-281`; `test/e2e/compare.test.ts:275` innerText | ✅ |
| CMP-07 (amended) | no horizontal scroll at 360 px; list below 720 px | `test/e2e/compare.test.ts:310`, `:328`, `:330` overflow ≤ 0; one claim per line | ✅ |
| CMP-08 color | band class on every dot, chip, legend | `test/unit/site/build.test.ts:507` legend classes | ✅ |
| CMP-08 shape | each band has its own shape | no test reads a shape; M16 survived | ❌ GAP |
| CMP-08 text alternative | agency, band and claim per dot | `test/unit/site/render.test.ts:175` aria-labels | ✅ |
| RIGOR-01 (amended) | one mark per claim, filled where checked | `test/unit/site/compare.test.ts:221` `marks` equal to cells, `:226-231` hand-written `[false, true, true, false]`; `test/unit/site/render.test.ts:594` | ✅ |
| RIGOR-05 (amended) | no ordering by number, no total, only LEAN number | `test/unit/site/render.test.ts:389` rows in name order with distances out of numeric order; `:574` no total | ✅ |

**Status**: ❌ one AC part without evidence (CMP-08 shape); 1 spec-precision gap flagged.

### Edge Cases

- [x] Group whose only banded records are from one agency counts no deviation: `test/unit/site/lean.test.ts:66`.
- [x] Debate filter counts only that debate (distances, coverage, change counts): `test/unit/site/drift.test.ts:200`, `test/e2e/compare.test.ts:160`.
- [ ] Repair item that matches no earlier record is kept and listed in the report: kept (`test/unit/repair.test.ts:37`), but the `new` list is never asserted (M12 survived). Real report has 7 new ids.

---

### Discrimination Sensor

Scratch: detached worktree `verify3` at `00bc68e` with node_modules symlinked; each mutant applied by exact string replacement, one test file run, file restored with `git checkout` inside the scratch. Scratch removed afterwards; `git -C phase3 status --porcelain` empty before and after.

| Mutation | File:line | Description | Test file | Killed? |
| -------- | --------- | ----------- | --------- | ------- |
| M01 | `site/lean.js:103` | sentence rule on raw ends, not rounded | lean.test.ts | ✅ Killed |
| M02 | `site/lean.js:20` | tail index 250 (90%) instead of 62 | lean.test.ts | ✅ Killed |
| M03 | `site/lean.js:137` | small-sample agencies counted as "sem diferença" in headline | lean.test.ts | ✅ Killed |
| M04 | `site/lean.js:82` | distance Lula minus Flávio | lean.test.ts | ✅ Killed |
| M05 | `site/lean.js:39` | reference mean includes the agency itself | lean.test.ts | ✅ Killed |
| M06 | `site/lean.js:83` | small-sample guard at n < 1 | lean.test.ts | ✅ Killed |
| M07 | `site/drift.js:92` | `missingSince` filter dropped | drift.test.ts | ✅ Killed |
| M08 | `site/drift.js:120` | previous band from the oldest version | drift.test.ts | ✅ Killed |
| M09 | `src/pipeline/merge.ts:148` | previous key not put in history | merge.test.ts | ✅ Killed |
| M10 | `src/pipeline/write.ts:49` | `key` dropped from written history | write.test.ts | ✅ Killed |
| M11 | `src/repair/estadao-2026-10-24.ts:112` | repair shifts one record of another source | repair.test.ts | ✅ Killed |
| M12 | `src/repair/estadao-2026-10-24.ts:104` | report `new` always empty | repair.test.ts, lean.test.ts | ❌ Survived |
| M13 | `site/render.js:367` | point drawn for a small sample | render.test.ts | ✅ Killed |
| M14 | `site/render.js:438` | timeline label not escaped | render.test.ts | ✅ Killed |
| M15 | `site/render.js:421` | removed words of the quote diff not escaped | render.test.ts, build.test.ts | ❌ Survived |
| M16 | `site/style.css:1258` | impreciso drawn as a circle, same shape as verdadeiro | e2e/compare.test.ts | ❌ Survived |

**Sensor depth**: expanded (16 behavior mutants, 18 runs)
**Result**: 13/16 killed, 3 survived - FAIL

---

### Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (other sources byte-identical after the repair) |
| No scope creep | ✅ |
| Matches patterns | ✅ (pure site modules shared by build, browser, CLI and tests) |
| Spec-anchored outcome check | ✅ except CMP-08 shape |
| Per-layer coverage | ⚠️ DRIFT-02 edge case on new items not asserted |
| Every test maps to a requirement | ✅ |
| Documented guidelines followed: AGENTS.md, tasks.md gate commands | ✅ |

---

### Gate Check

All run in the scratch at `00bc68e`, one file per command (`node_modules/.bin/vitest run --project <p> <file>`):

| File | Result |
| ---- | ------ |
| test/unit/site/lean.test.ts | 17 passed |
| test/unit/site/drift.test.ts | 10 passed |
| test/unit/site/render.test.ts | 25 passed |
| test/unit/site/build.test.ts | 30 passed |
| test/unit/site/compare.test.ts | 13 passed |
| test/unit/merge.test.ts | 39 passed |
| test/unit/write.test.ts | 8 passed |
| test/unit/repair.test.ts | 6 passed |
| test/e2e/compare.test.ts | 9 passed |

`tsc --noEmit` exit 0; `biome check .` exit 0 (84 files); `node src/site/build.ts` exit 0; `node src/lean.ts` exit 0; `node src/claims/assemble.ts --check` exit 0 ("claim-groups.json matches run 2026-10-24"); `node src/repair/estadao-2026-10-24.ts` exit 0 ("already applied; nothing written"). No skipped tests.

---

### Spec-precision gap

- DRIFT-03 asks for each version's "date range", but nothing records when the first version started, so the first chip reads "até 24/10" (`site/render.js:413`, asserted at `test/unit/site/render.test.ts:707`). The test is consistent with the code, not with a spec-defined value. Fix: state in DRIFT-03 that the first version shows only its end date (or name the start date to use).

---

### Fix Plans

#### Fix 1: assert band shapes (CMP-08)

- **Root cause**: the shapes live only in `site/style.css:1255-1280`; no test reads them.
- **Fix task**: in `test/e2e/compare.test.ts`, read `getComputedStyle(dot, '::before')` for the four legend dots and assert that the clip-path or border-radius pairs are pairwise different (verdadeiro round, impreciso triangle, falso cross, sem faixa square).
- **Priority**: Major (the AC exists for visitors without color vision).

#### Fix 2: escape test for the quote diff (DRIFT-03)

- **Root cause**: the hostile fixtures change the label and the claim, never the quote inside a history entry, so `diffHtml` (`site/render.js:419-424`) is never fed markup.
- **Fix task**: in `test/unit/site/render.test.ts` "escaping in the comparison page", add a history entry with `quote: 'a <b>x</b> & "y"'` and assert `.qdiff del` and `.qdiff ins` text and that `.qdiff b` has length 0.
- **Priority**: Major (agency text reaching HTML unescaped).

#### Fix 3: assert the new ids in the repair report (DRIFT-02 edge case)

- **Root cause**: `test/unit/repair.test.ts` checks `merged` and `missing`, never `new`.
- **Fix task**: assert `report.new` equals the ids of live after-run records that are neither in `before` nor a `merged.from`, and that it is non-empty on the pinned files (7 today).
- **Priority**: Minor.

---

### Requirement Traceability Update

| Requirement | Previous status | New status |
| ----------- | --------------- | ---------- |
| LEAN-01..08 | Implemented | ✅ Verified |
| DRIFT-01, DRIFT-04, DRIFT-05 | Implemented | ✅ Verified |
| DRIFT-02 | Implemented | ⚠️ Verified, edge-case test gap (Fix 3) |
| DRIFT-03 | Implemented | ❌ Needs fix (Fix 2) |
| CMP-01, CMP-02, CMP-07 | Implemented | ✅ Verified |
| CMP-08 | Implemented | ❌ Needs fix (Fix 1) |
| RIGOR-01, RIGOR-05 | Implemented | ✅ Verified |

---

### Summary

**Overall**: ❌ Not ready (test gaps only; no behavior defect found)

**Spec-anchored check**: 23/24 AC rows matched the spec outcome, 1 without evidence (CMP-08 shape), 1 spec-precision gap (DRIFT-03 first version)
**Sensor**: 13/16 killed
**Gate**: 157 passed, 0 failed across 9 files; typecheck, lint, build, lean, check:claims and the repair rerun all exit 0

**What works**: the distance, interval and sentence rule match the spec and an independent recomputation; the repair is idempotent, its report recomputes equal, and other sources are untouched; the page and `pnpm lean` give the same numbers.

**Next steps**: Fix 1 to Fix 3, then re-verify.
