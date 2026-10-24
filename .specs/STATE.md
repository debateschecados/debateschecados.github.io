# STATE

## Decisions

### AD-001
- **Decision**: The project has no server and no database: a GitHub Actions job scrapes the agency pages, commits JSON/CSV to the public repo, and deploys a static site to GitHub Pages in the same workflow.
- **Reason**: R$ 0/month, and git history doubles as the public audit log of every data change.
- **Trade-off**: No live updates faster than the cron interval; depends on GitHub runners not being blocked by agency CDNs (local run is the fallback).
- **Scope**: All features (ingestion, data, site, deploy).
- **Date**: 2026-10-24
- **Status**: active

### AD-002
- **Decision**: The agency's label is stored and shown verbatim; bands come only from the public table `config/bands.json`, labels missing from it become `sem faixa` and are reported, and no AI or LLM touches agency content.
- **Reason**: Impartiality must be checkable by anyone; three of the four agencies block AI crawlers.
- **Trade-off**: New labels need a manual table update; no automatic grouping or summarizing of checks.
- **Scope**: Ingestion, data model, site, any future comparator.
- **Date**: 2026-10-24
- **Status**: active

### AD-003
- **Decision**: The site uses no UI framework: static HTML, CSS and one ES module, pre-rendered by a small build script.
- **Reason**: The approved mock already works this way; a framework adds tooling without changing what visitors get.
- **Trade-off**: Shared markup between build and browser is hand-written string templates.
- **Scope**: Site and build.
- **Date**: 2026-10-24
- **Status**: active

### AD-004
- **Decision**: A record's ID is assigned once and never recomputed: from the source's own item ID when it has one (g1 chunk id, Estadão `_id`, Aos Fatos uuid), otherwise from the quote at first sight; later runs match keyless items by exact or similar quote (token Jaccard >= 0.6, same speaker), with `config/id-links.json` as a public manual override.
- **Reason**: Agencies fix typos in quotes; a quote hash would split one check into two and lose its history.
- **Trade-off**: Matching logic in the merger; a heavily rewritten Lupa quote may still need a manual link.
- **Scope**: Ingestion, data model, any future comparator.
- **Date**: 2026-10-24
- **Status**: active

### AD-005
- **Decision**: Proof of origin is the Wayback `id_` copy of the document an item was parsed from: the archiver only stores a snapshot URL and SHA-256 after parsing that copy and finding the record in it. Live-fetch hashes stay in Actions logs, not in `data/`.
- **Reason**: g1 and Estadão serve different bytes per request, so a live hash is unverifiable and would churn the dataset every run.
- **Trade-off**: Needs archive.org keys in repo secrets to capture new snapshots; records wait with `archiveUrl: null` until one verifies.
- **Scope**: Ingestion, data model, audit panel.
- **Date**: 2026-10-24
- **Status**: active

## Handoff

- **Feature**: `.specs/features/debate-archive`
- **Phase / Task**: Tasks written (T1 to T24, validate_tasks 0 errors), awaiting user approval
- **Completed**: Specify, mocks (direction A), design.md (revised), spec.md re-validated (0 errors)
- **In-progress** (file:line): none
- **Next step**: On approval, Execute T1; offer 4 batch sub-agents (B1 T1-T7, B2 T8-T13, B3 T14-T21, B4 T22-T24).
- **Blockers**: archive.org keys (`IA_S3_ACCESS`, `IA_S3_SECRET`) must be created by the user before the first CI run
- **Uncommitted files**: project is not a git repo yet
- **Branch**: none
