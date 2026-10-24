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
- **Status**: active; partially superseded by AD-007 for claim grouping

### AD-003
- **Decision**: The site uses no UI framework: static HTML, CSS and one ES module, pre-rendered by a small build script.
- **Reason**: The approved mock already works this way; a framework adds tooling without changing what visitors get.
- **Trade-off**: Shared markup between build and browser is hand-written string templates.
- **Scope**: Site and build.
- **Date**: 2026-10-24
- **Status**: active

### AD-004
- **Decision**: A record's ID is assigned once and never recomputed: from the source's own item ID when it has one (g1 chunk id, Estadão `_id`, Aos Fatos uuid), otherwise from the quote at first sight; later runs match by key when the quote agrees, then by exact or similar quote (token Jaccard >= 0.6, same speaker), then by key alone within the same speaker, with `config/id-links.json` as a public manual override for keyless sources. Keys alone are not trusted since Estadão reissued and moved `_id`s on 2026-10-24.
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

### AD-006
- **Decision**: Each item shows the band as its verdict (Verdadeiro, Impreciso, Falso, Sem faixa). The agency's original label stays verbatim in `label` and appears on hover over the verdict; the methodology page explains the common scale with the full label table.
- **Reason**: The user saw "#FAKE" and "falso" side by side and wanted one status vocabulary across agencies.
- **Trade-off**: The band mapping is now visible on every item, so mapping choices (FALTA CONTEXTO and é enganoso as impreciso) weigh more; the label × candidate table and public `bands.json` stay the check on that. On touch screens the original label is reachable only through the agency link, the CSV and the methodology table.
- **Scope**: Site item template, spec SITE-02, README, methodology page.
- **Date**: 2026-10-24
- **Status**: active

### AD-007
- **Decision**: Claim groups for the agency comparator are formed by AI agents and reviewed by the maintainer before commit. Agents see only record IDs, an agency letter, the quote and the excerpt (no agency name, label or band); three curators work independently per debate, a judge decides only where they disagree, an editor writes one neutral claim sentence per group and an adversarial reviewer checks neutrality. Every raw output is committed. AI never sets, changes or summarizes a verdict.
- **Reason**: Deciding which checks evaluate the same assertion is editorial judgment the maintainer chose to delegate; blindness and independent votes keep that judgment from leaning on agency or verdict.
- **Trade-off**: Partially supersedes AD-002: agency quotes and excerpts now pass through AI at curation time, which goes against the AI-crawler blocks of three agencies. The public rule "no text passes through AI" is replaced on the site and in the README.
- **Scope**: Agency comparator, audit panel, methodology page, README.
- **Date**: 2026-10-24
- **Status**: active

## Handoff

- **Feature**: `.specs/features/debate-archive`
- **Phase / Task**: Execute done, T1 to T24 complete; Verifier PASS at iteration 3 (`validation.md`, validate_state 0 errors)
- **Completed**: all tasks, reviewer and fix rounds per batch, first live dataset in `data/` (314 records, 8 sources ok), Verifier gaps 1 and 2 of iteration 3 closed by `076d2ef` and `7e97dfb`
- **In-progress** (file:line): none
- **Next step**: needs the user's go-ahead for outward actions: create the GitHub repo `debates-checados/debates-checados`, rename `master` to `main`, push, set secrets `IA_S3_ACCESS`/`IA_S3_SECRET` (rotated keys), Pages source "GitHub Actions", run the `update` workflow once
- **Open items**: 83 records await a Wayback snapshot (g1 Band, Aos Fatos Globo Escriba API); web.archive.org refused IPv4 connections from the dev machine after the first run, CI retries every 6 h. Iteration-3 minor gap: `fetchedAt` on silent changes is untested and unspecified (R04)
- **Uncommitted files**: none
- **Branch**: `master` (local only, workflow and site links expect `main`)
