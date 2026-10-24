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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
