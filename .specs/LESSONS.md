# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Test name resolvers with near-miss inputs that share a prefix with a known alias, not only with unrelated names
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `speaker-resolution` · harmful: 0
- features: debate-archive
- evidence: M03 src/pipeline/normalize.ts:16 (speaker-resolution)
- last seen: 2026-10-24T08:53:06Z

### L-002 - When a check compares several fields, give each field its own test where only that field differs
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `archive` · harmful: 0
- features: debate-archive
- evidence: M12 M26 src/pipeline/archive.ts:56 (archive)
- last seen: 2026-10-24T08:53:06Z

### L-003 - A test whose name lists several conditions must exercise each of them, or be split
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `archive` · harmful: 0
- features: debate-archive
- evidence: test/unit/archive.test.ts:330 (archive)
- last seen: 2026-10-24T08:53:06Z

### L-004 - Test each tie-break of a ranking with inputs that tie on every earlier and later key
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `merge` · harmful: 0
- features: debate-archive
- evidence: M07 src/pipeline/merge.ts:62 (merge)
- last seen: 2026-10-24T08:53:06Z

### L-005 - Pin every numeric limit the spec states with an assertion on the default value, not only on overridden values
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `http` · harmful: 0
- features: debate-archive
- evidence: M25 src/io/http.ts:18 (http)
- last seen: 2026-10-24T08:53:06Z

### L-006 - State in the AC itself any condition that narrows which items a matching rule applies to
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: debate-archive
- evidence: INGEST-04 spec.md:72 (spec)
- last seen: 2026-10-24T08:53:06Z

### L-007 - Assert the values the UI renders after a state change, not only the pure function that computes them
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `site` · harmful: 0
- features: debate-archive
- evidence: N06 site/app.js:60 (validation.md iteration 2) (site)
- last seen: 2026-10-24T09:05:44Z

### L-008 - Test that the caller passes the narrowed input a function expects, not only the function with an input the test narrowed itself
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `ingest` · harmful: 0
- features: debate-archive
- evidence: N04 src/ingest.ts:197 (validation.md iteration 2) (ingest)
- last seen: 2026-10-24T09:05:44Z

### L-009 - For a rule limited to one kind of input, test that the other kind does not trigger it
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `merge` · harmful: 0
- features: debate-archive
- evidence: N14 src/pipeline/merge.ts:93 (validation.md iteration 2) (merge)
- last seen: 2026-10-24T09:05:45Z

### L-010 - Test an override that names one item with a second qualifying item in the same run, so the override cannot apply to items it does not name
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `merge` · harmful: 0
- features: debate-archive
- evidence: R06 src/pipeline/merge.ts:183 (merge)
- last seen: 2026-10-24T09:20:34Z

### L-011 - Include a config entry that maps to the fallback value on purpose, so code cannot treat mapped-to-fallback as unmapped
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `ingest` · harmful: 0
- features: debate-archive
- evidence: R07 src/ingest.ts:324 (ingest)
- last seen: 2026-10-24T09:20:34Z

### L-012 - Assert provenance fields on every update path with a fresh value that differs from the stored one
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `merge` · harmful: 0
- features: debate-archive
- evidence: R04 src/pipeline/merge.ts:158 (merge)
- last seen: 2026-10-24T09:20:34Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
