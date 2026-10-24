# Debate Archive Specification

## Problem Statement

During the 2026 presidential runoff, four fact-checking agencies checked the Band (2026-10-18) and Globo (2026-10-23) debates, each on its own page, with its own rating scale. The only aggregator (rodape.org) works live, during the debate, and turns into a final report afterwards, so there is no permanent, public place where anyone can browse every check side by side and audit how the data was collected. A petition for real-time debate fact-checking passed 769 thousand signatures after the Band debate, which shows public demand for this material.

## Goals

- [ ] Every check published by the four agencies for the two runoff debates is browsable in one public page, with the agency's original label and a link to the source.
- [ ] Anyone can download the full dataset and trace each record back to the agency page, an archived copy, and the parser version that produced it.
- [ ] Adding a future debate requires a configuration entry, not new pipeline code, for agencies whose page format is already supported.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Grouping the same statement across agencies (comparator) | Deferred by the user. Records keep the fields a future grouping needs. |
| Live mode during a debate | No debate left in 2026; next use is 2028. |
| Any LLM or AI processing of agency content | Three of the four agencies block AI crawlers in robots.txt; the project must not contradict that intent. |
| Agencies other than g1, Lupa, Aos Fatos, Estadão | MVP scope. UOL Confere also covered the Band debate and is the first candidate later. |
| First-round, state or Senate debates | User chose runoff debates only. |
| Standalone checks, viral hoaxes, RSS and ClaimReview ingestion | Not debate coverage. Kept as a deferred idea. |
| User accounts, comments, submissions | Read-only public site. |
| Reinterpreting or overriding agency verdicts | The agency label is the source of truth; bands only filter and count. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Debates in MVP | Band 2026-10-18 and Globo 2026-10-23, runoff only | User decision | y |
| Items in scope | Only items inside each agency's debate coverage page, every verdict included | User decision: a record of what was said, not a list of lies | y |
| Label presentation | Original label prominent; band used only for filters and counts; mapping is a public file | User decision | y |
| Default view | "Todos" with all agencies, filterable by agency | User decision | y |
| Scoreboards | Per-agency scoreboard plus a general one with a fixed notice about double counting | User decision | y |
| Estadão "é enganoso" | Band impreciso | Estadão also uses "é falso" on the same pages, so enganoso is a distinct, weaker verdict | y |
| Lupa "FALTA CONTEXTO" | Band impreciso | Same meaning as Estadão "falta contexto" and Aos Fatos "não é bem assim" (18 items: 13 Flávio, 5 Lula) | y |
| Agency filter | Single select: "Todas" or exactly one agency | Matches the approved mock; the per-agency scoreboard has one clear state | y |
| Records no longer found at the source | Left out of every scoreboard; hidden from the list unless the visitor turns on "Mostrar removidos" | Counts reflect what the agencies publish today, and the removal stays auditable | y |
| Candidate order | Ascending ballot number (13 Lula, 22 Flávio Bolsonaro), stated on the methodology page | An objective rule, so left/right placement carries no preference | y |
| Bands | verdadeiro, impreciso, falso, sem faixa | Labels like INSUSTENTÁVEL or AINDA É CEDO PARA DIZER do not fit true/false; a 4th band avoids forcing them | n |
| Label not present in the mapping file | Item is published with band "sem faixa" and listed in the run report | Never hide or guess a verdict | n |
| Auditability (user did not discuss) | Each record stores source URL, public archived copy URL, SHA-256 of the archived copy's original bytes, fetch timestamp and parser version; dataset versioned in the public repository; raw agency HTML never redistributed | Anyone can download the archived copy, hash it and rerun the parser; the live pages of g1 and Estadão change bytes on every request, so their hash could not be checked by outsiders | n |
| Archived copy | Internet Archive Wayback Machine snapshot of the source page | Already has snapshots of these pages (observed 2026-10-24); third party, public, free | n |
| Agency explanation text | Excerpt capped at 280 characters, full text only at the agency link | Copyright: show the minimum needed, send readers to the agency | n |
| Item removed from the agency page on a later run | Record stays published, marked as no longer found at the source with the detection date | An archive that silently drops items cannot be audited | y |
| Agency asks for removal | Maintainer removes the agency's records manually via a public commit stating the request date | Rare event; no feature needed | n |
| Default order in "Todos" | Debate newest first, then agency in alphabetical order, then the order in which the item appears on the agency page | Agencies do not publish a shared timestamp per statement | n |
| Code license | AGPL-3.0 | Hosted forks must stay open source too | n |
| Data license | CC BY 4.0 for the structured dataset; quoted text and excerpts remain the agencies' | Separates what the project produces from what it cites | n |
| Speakers | The debate's candidates from a config file; for 2026, Lula and Flávio Bolsonaro | Only candidates in the runoff debates; 2028 needs new names without code changes | n |
| Item identity | The source's own item ID where it has one (g1, Estadão, Aos Fatos); otherwise the quote at first sight, matched on later runs by exact or similar quote from the same speaker | Agencies fix typos in quotes; an ID derived only from the quote would split one check into two | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Collect the debate checks ⭐ MVP

**User Story**: As a maintainer, I want one command that turns the eight agency debate pages into structured records so that the site and the dataset come from the same reproducible source.

**Why P1**: Nothing else exists without the records.

**Acceptance Criteria**:

1. WHEN the pipeline runs THEN the system SHALL fetch every source page listed in the debate manifest (4 agencies x 2 debates). (INGEST-01)
2. WHEN a source page is parsed THEN the system SHALL produce one record per checked statement with: agency, debate, speaker, quoted statement, original label, band, excerpt, source URL, item anchor or position. (INGEST-02)
3. The system SHALL use a dedicated parser per agency page format: g1 (quote blocks with #FATO, #FAKE, #NÃOÉBEMASSIM verdicts, one record per verdict), Lupa (uppercase label after the quote), Estadão ("O que X disse" followed by "checou e concluiu que" or "investigou e concluiu que"), Aos Fatos (stamped checks, read from `<p id>` plus `<blockquote data-stamp>` in the page HTML, or from the Escriba transcript API when the page references an `escribaId`). (INGEST-03)
4. WHEN a re-run finds an item that matches a published record by the source's own item ID, by the same quoted statement, or by a similar quoted statement from the same speaker THEN the system SHALL keep that record's ID. (INGEST-04)
5. IF the speaker of an item cannot be resolved to Lula or Flávio Bolsonaro THEN the system SHALL exclude the item and list it in the run report with its source URL. (INGEST-05)
6. IF a source page returns a non-200 status, times out after 30 seconds, yields zero records, or yields fewer than 80% of that source's previously published records THEN the system SHALL keep that source's previously published records unchanged and SHALL report the failure in the run report. (INGEST-06)
7. The system SHALL send at most one request per domain every 5 seconds, identify itself with a user agent containing the project name and repository URL, and SHALL NOT fetch any URL its robots.txt disallows for that user agent. (INGEST-07)
8. The system SHALL NOT send agency content to any LLM or AI service. (INGEST-08)
9. WHEN a run finishes THEN the system SHALL write a run report with, per source page, the HTTP status, the number of records, the excluded items and the unmapped labels. (INGEST-09)

**Independent Test**: Run the pipeline against the eight saved fixture pages and compare the records against a hand-checked expected file per page.

---

### P1: Browse every check ⭐ MVP

**User Story**: As a voter or journalist, I want to see every check from every agency in one list so that I can read how each statement was rated without opening four sites.

**Why P1**: This is the product.

**Acceptance Criteria**:

1. WHEN a visitor opens the site THEN the system SHALL show the "Todos" view with every published record, without login. (SITE-01)
2. The system SHALL display on each item the speaker, the quoted statement, the agency's original label as the most prominent element, the band, the agency name, the excerpt and a link to the agency page. (SITE-02)
3. WHEN the visitor selects filters for debate, agency, speaker or band THEN the system SHALL show only the records matching all selected filters. (SITE-03)
4. The system SHALL order records by debate newest first, then agency alphabetically, then their order on the agency page. (SITE-04)
5. IF a filter combination matches no record THEN the system SHALL show the message "Nenhuma checagem com esses filtros." and a control that clears all filters. (SITE-05)
6. The system SHALL render without horizontal scrolling at a 360 px viewport width. (SITE-06)
7. The system SHALL NOT set tracking cookies, load third-party analytics, or load fonts, scripts or images from another origin. (SITE-07)

**Independent Test**: Load the site with the fixture dataset, apply each filter alone and combined, and compare counts with the dataset.

---

### P1: Scoreboards ⭐ MVP

**User Story**: As a visitor, I want to see how many checks each candidate received per band so that I can get an overview, knowing what the numbers mean.

**Why P1**: User decision; it is the first thing people look for after a debate.

**Acceptance Criteria**:

1. WHILE one agency is selected the system SHALL show, per candidate, the number of that agency's records in each band for the current filters. (SCORE-01)
2. WHILE no agency is selected the system SHALL show the general scoreboard summing the matching records of all agencies per candidate and band. (SCORE-02)
3. WHILE the general scoreboard is shown the system SHALL display next to it the notice "Cada agência escolhe o que checar. A mesma fala pode aparecer uma vez por agência, então este placar soma checagens, não falas." (SCORE-03)
4. The system SHALL compute every scoreboard number from the same records the list shows, so the scoreboard total equals the number of listed records still found at the source for the current filters. (SCORE-04)
5. The system SHALL list candidates in ascending ballot number order and SHALL show all four bands for each candidate, including bands with zero records. (SCORE-05)

**Independent Test**: With the fixture dataset, compare scoreboard numbers with a manual count for one agency and for "Todos".

---

### P1: Open, auditable data ⭐ MVP

**User Story**: As a researcher or skeptic, I want to download the data and trace each record back to its source so that I can verify the site did not alter any verdict.

**Why P1**: User requirement: 100% open and auditable.

**Acceptance Criteria**:

1. The system SHALL publish the full dataset as JSON and CSV files linked from the site, containing the same records the site shows. (DATA-01)
2. The system SHALL store in each record the source URL, the Wayback Machine snapshot URL of the document the record was parsed from, the SHA-256 of that snapshot's original bytes, the fetch timestamp and the parser version. (DATA-02)
3. The system SHALL publish the label-to-band mapping as a file in the repository and link it from the site. (DATA-03)
4. WHEN the same parser version runs over the same fetched HTML THEN the system SHALL produce byte-identical records. (DATA-04)
5. The system SHALL NOT publish the raw HTML of agency pages. (DATA-05)
6. IF a record has no verified Wayback Machine snapshot THEN the system SHALL request one on each run until the snapshot exists and parses to the same statement, speaker and label, and SHALL list the record as waiting for a snapshot in the run report meanwhile. (DATA-06)
7. The system SHALL publish a methodology page describing the sources, the parsers, the band mapping with a count of each label per candidate, the candidate order rule and how to report an error. (DATA-07)

**Independent Test**: Download the CSV, pick five random records, open their snapshot URLs and confirm the quoted statement and label appear there.

---

### P1: Visible impartiality and self-service audit ⭐ MVP

**User Story**: As a skeptical visitor, I want to see how the site stays impartial and to audit it myself or with an AI so that I do not have to trust the maintainers.

**Why P1**: User requirement: the project must be completely auditable and clearly impartial.

**Acceptance Criteria**:

1. The system SHALL show, in the first screen below the subtitle, the sentence "O veredito é sempre da agência. Código e dados são abertos." followed by a control that opens the audit panel. (AUDIT-01)
2. The system SHALL show a fixed "Como auditar" button on every viewport that opens the audit panel. (AUDIT-02)
3. WHEN the audit panel opens THEN the system SHALL list the impartiality rules (agency verdict unchanged, same code for both candidates, no AI on agency text, proof of origin per record, illustrations with equal weight) and links to the repository, the dataset files, the band mapping file and the commit history. (AUDIT-03)
4. WHEN the visitor activates "Copiar prompt" THEN the system SHALL copy to the clipboard an audit prompt containing the repository URL, the dataset URL and the five audit steps, and SHALL show "Prompt copiado". (AUDIT-04)
5. IF the clipboard API is unavailable THEN the system SHALL select the prompt text and show "Texto selecionado. Use Ctrl+C para copiar.". (AUDIT-05)
6. The system SHALL render both candidate illustrations from the same body template, at the same size and pose, mirrored so they face each other, with talk animations of equal length and an equal number of mouth frames. (AUDIT-06)
7. The system SHALL NOT change a candidate illustration based on any verdict or count. (AUDIT-07)
8. The system SHALL credit the official portraits used as drawing references (Palácio do Planalto, CC BY 2.0; Agência Senado) and the source of the party and broadcaster logos (Wikimedia Commons) in the footer and on the methodology page. (AUDIT-08)

**Independent Test**: Open the site, open the panel from both entry points, copy the prompt, paste it into a text editor and check the URLs and steps; diff the two sprite grids and confirm only head rows and mouth frames differ, with the same frame count and animation length.

---

### P2: Re-runs keep history

**User Story**: As an auditor, I want label changes made by agencies after publication to be visible so that corrections are not silent.

**Why P2**: Agencies update pages ("Atualizado"); the MVP works without it but loses that trail.

**Acceptance Criteria**:

1. WHEN a re-run finds a different original label, quoted statement or speaker for an existing record ID THEN the system SHALL publish the new value and keep the previous value with the detection date in the record's history. (HIST-01)
2. IF a previously published record is not found on a re-run of a successfully fetched page THEN the system SHALL keep the record, mark it "não encontrado na fonte" with the detection date, leave it out of every scoreboard and show it in the list only while "Mostrar removidos" is on. (HIST-02)

**Independent Test**: Run the pipeline on a fixture, then on an edited copy with one label changed, one quote edited and one item removed, and inspect the three records.

---

### P2: Shareable filters

**User Story**: As a visitor, I want to share a link to a filtered view so that others see exactly what I saw.

**Why P2**: Cheap and drives sharing, but not essential to browse.

**Acceptance Criteria**:

1. WHEN the visitor changes a filter THEN the system SHALL reflect all active filters in the page URL. (SHARE-01)
2. WHEN a visitor opens a URL containing filters THEN the system SHALL show the view with those filters applied. (SHARE-02)

**Independent Test**: Apply filters, copy the URL, open it in a new session, compare the list.

---

### P2: New debate by configuration

**User Story**: As a maintainer in 2028, I want to add a debate by listing its agency URLs so that the archive grows without new pipeline code.

**Why P2**: Keeps the project alive after 2026; not needed for the two current debates.

**Acceptance Criteria**:

1. WHEN a maintainer adds a debate entry to the manifest with source URLs whose page format has a parser THEN the system SHALL ingest it on the next run without code changes. (CONF-01)
2. IF a manifest entry references an agency without a parser THEN the system SHALL fail the run for that entry and name the agency in the run report. (CONF-02)

**Independent Test**: Add a manifest entry pointing to a fixture copy of an existing page under a new debate name and run the pipeline.

---

## Edge Cases

- IF an agency page lists the same statement twice THEN the system SHALL keep one record per distinct anchor or position and report the duplicate.
- IF an item's label text is not in the mapping file THEN the system SHALL publish it with band "sem faixa" and list the label in the run report.
- IF an item has no explanation text THEN the system SHALL publish it with an empty excerpt.
- WHEN an excerpt exceeds 280 characters THEN the system SHALL cut it at the last word boundary before 280 characters and append "…".

## Implicit-Requirement Dimensions

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | INGEST-05, excerpt bound in Edge Cases |
| Failure / partial-failure states | INGEST-06, DATA-06 |
| Idempotency / retry / duplicates | INGEST-04, DATA-04, duplicate edge case |
| Auth boundaries & rate limits | INGEST-07; site is public read-only, no auth: N/A because nothing is writable |
| Concurrency / ordering | SITE-04; pipeline concurrency N/A because it is a single batch job |
| Data lifecycle / expiry | Permanent archive; HIST-02 and removal assumption |
| Observability | INGEST-09 run report |
| External-dependency failure | INGEST-06, DATA-06 |
| State-transition integrity | HIST-01, HIST-02 |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| INGEST-01 | P1: Collect the debate checks | Tasks: T15, T22 | In Progress |
| INGEST-02 | P1: Collect the debate checks | Tasks: T2, T9, T10, T11, T12, T15 | Implemented |
| INGEST-03 | P1: Collect the debate checks | Tasks: T9, T10, T11, T12, T13 | Implemented |
| INGEST-04 | P1: Collect the debate checks | Tasks: T5, T6 | Implemented |
| INGEST-05 | P1: Collect the debate checks | Tasks: T4, T15 | Implemented |
| INGEST-06 | P1: Collect the debate checks | Tasks: T6, T15 | Implemented |
| INGEST-07 | P1: Collect the debate checks | Tasks: T8 | Implemented |
| INGEST-08 | P1: Collect the debate checks | Tasks: T8 | Implemented |
| INGEST-09 | P1: Collect the debate checks | Tasks: T7, T15 | Implemented |
| SITE-01 | P1: Browse every check | Tasks: T20, T21 | Pending |
| SITE-02 | P1: Browse every check | Tasks: T18 | Pending |
| SITE-03 | P1: Browse every check | Tasks: T17 | Implemented |
| SITE-04 | P1: Browse every check | Tasks: T17 | Implemented |
| SITE-05 | P1: Browse every check | Tasks: T21 | Pending |
| SITE-06 | P1: Browse every check | Tasks: T21 | Pending |
| SITE-07 | P1: Browse every check | Tasks: T19, T21 | Pending |
| SCORE-01 | P1: Scoreboards | Tasks: T17 | Implemented |
| SCORE-02 | P1: Scoreboards | Tasks: T17 | Implemented |
| SCORE-03 | P1: Scoreboards | Tasks: T17 | Implemented |
| SCORE-04 | P1: Scoreboards | Tasks: T17 | Implemented |
| SCORE-05 | P1: Scoreboards | Tasks: T17 | Implemented |
| DATA-01 | P1: Open, auditable data | Tasks: T7, T20 | In Progress |
| DATA-02 | P1: Open, auditable data | Tasks: T14 | Implemented |
| DATA-03 | P1: Open, auditable data | Tasks: T3, T16, T20 | In Progress |
| DATA-04 | P1: Open, auditable data | Tasks: T7, T13 | Implemented |
| DATA-05 | P1: Open, auditable data | Tasks: T1, T20 | In Progress |
| DATA-06 | P1: Open, auditable data | Tasks: T14 | Implemented |
| DATA-07 | P1: Open, auditable data | Tasks: T20, T23 | Pending |
| AUDIT-01 | P1: Visible impartiality and self-service audit | Tasks: T21 | Pending |
| AUDIT-02 | P1: Visible impartiality and self-service audit | Tasks: T21 | Pending |
| AUDIT-03 | P1: Visible impartiality and self-service audit | Tasks: T19 | Pending |
| AUDIT-04 | P1: Visible impartiality and self-service audit | Tasks: T21 | Pending |
| AUDIT-05 | P1: Visible impartiality and self-service audit | Tasks: T21 | Pending |
| AUDIT-06 | P1: Visible impartiality and self-service audit | Tasks: T19 | Pending |
| AUDIT-07 | P1: Visible impartiality and self-service audit | Tasks: T21 | Pending |
| AUDIT-08 | P1: Visible impartiality and self-service audit | Tasks: T19, T20 | Pending |
| HIST-01 | P2: Re-runs keep history | Tasks: T6 | Implemented |
| HIST-02 | P2: Re-runs keep history | Tasks: T6, T17, T21 | In Progress |
| SHARE-01 | P2: Shareable filters | Tasks: T17 | Implemented |
| SHARE-02 | P2: Shareable filters | Tasks: T17 | Implemented |
| CONF-01 | P2: New debate by configuration | Tasks: T3, T15 | Implemented |
| CONF-02 | P2: New debate by configuration | Tasks: T15 | Implemented |

**Coverage:** 42 total, 42 mapped to tasks, 0 unmapped

---

## External Dependencies

| Resource | Identifier | System | Verified | Evidence |
| -------- | ---------- | ------ | -------- | -------- |
| g1 Band debate page | https://g1.globo.com/fato-ou-fake/eleicoes/noticia/2026/10/19/veja-o-que-e-fato-ou-fake-nas-falas-de-flavio-bolsonaro-e-lula-no-debate-da-band-no-2o-turno-das-eleicoes-2026.ghtml | g1 | yes | curl 2026-10-24: HTTP 200, 35 `blockquote.content-blockquote`, 37 verdicts (16 #FATO, 9 #NÃOÉBEMASSIM, 12 #FAKE); quote blocks sit in `div#chunk-*` whose ids matched on a second fetch |
| g1 Globo debate page | https://g1.globo.com/fato-ou-fake/eleicoes/noticia/2026/10/23/veja-o-que-e-fato-ou-fake-nas-falas-de-flavio-bolsonaro-e-lula-no-debate-da-globo-no-2o-turno-das-eleicoes-2026.ghtml | g1 | yes | curl 2026-10-24: HTTP 200, 19 `blockquote.content-blockquote`, 20 verdicts (11 #FATO, one written `#/FATO`; 7 #NÃOÉBEMASSIM; 2 #FAKE) |
| Lupa Band debate page | https://www.agencialupa.org/checagem/2026/10/18/ao-vivo-checagem-do-debate-entre-lula-e-flavio-bolsonaro-na-band/ | Agência Lupa | yes | curl 2026-10-24: HTTP 200, 41 quote blocks each followed by a label (11 VERDADEIRO, 7 FALTA CONTEXTO, 4 INSUSTENTÁVEL, 6 EXAGERADO, 11 FALSO, 2 SUBESTIMADO); found via post-sitemap31 |
| Lupa Globo debate page | https://www.agencialupa.org/checagem/2026/10/23/ao-vivo-checagem-do-ultimo-debate-entre-lula-e-flavio-bolsonaro-no-segundo-turno/ | Agência Lupa | yes | curl 2026-10-24: HTTP 200, 43 quote blocks each followed by a label (13 VERDADEIRO, 11 FALTA CONTEXTO, 3 INSUSTENTÁVEL, 6 EXAGERADO, 8 FALSO, 2 SUBESTIMADO) |
| Aos Fatos Band debate page | https://www.aosfatos.org/noticias/checamos-lula-flavio-bolsonaro-debate-band/ | Aos Fatos | yes | curl 2026-10-24: HTTP 200, 49 `blockquote[data-stamp]` in server HTML (16 falso, 15 nao_e_bem_assim, 18 verdadeiro), 48 index anchors |
| Aos Fatos Globo debate page | https://www.aosfatos.org/noticias/checamos-flavio-bolsonaro-lula-debate-globo/ | Aos Fatos | yes | curl 2026-10-24: HTTP 200, no checks in server HTML, payload holds `escribaId` 177500de-f763-4f91-894c-981086c9bbe3; rendered page (Chromium) shows 37 stamps |
| Aos Fatos Escriba transcript API | https://www.aosfatos.org/api/escriba/177500de-f763-4f91-894c-981086c9bbe3/ | Aos Fatos | yes | curl 2026-10-24: HTTP 200 application/json, 61 comment nodes, 37 with a `selo` prop (20 verdadeiro, 9 nao_e_bem_assim, 8 falso); robots.txt disallows only AI crawlers |
| Aos Fatos stamp display text | CSS `::after` of `blockquote[data-stamp]` | Aos Fatos | yes | Chromium computed style 2026-10-24: "verdadeiro", "falso", "não é bem assim" |
| Estadão Band debate page | https://www.estadao.com.br/estadao-verifica/checamos-o-debate-entre-lula-e-flavio-na-band/ | Estadão | yes | curl 2026-10-24: HTTP 200, embedded `Fusion.globalContent` JSON has 103 elements with unique `_id`, 28 conclusions (24 "checou", 4 "investigou"), each right after an "O que … disse" element |
| Estadão Globo debate page | https://www.estadao.com.br/estadao-verifica/debate-tv-globo-checagem-tempo-real-ao-vivo/ | Estadão | yes | curl 2026-10-24: HTTP 200, embedded `Fusion.globalContent` JSON has 82 elements with unique `_id`, 37 conclusions (33 "checou", 4 "investigou"), each right after an "O que … disse" element |
| robots.txt rules | robots.txt of g1, Lupa, Aos Fatos, Estadão | agency sites | yes | curl 2026-10-24: debate paths allowed for generic agents; Estadão has explicit allow for /estadao-verifica; Lupa, Aos Fatos and Estadão fully block AI crawlers; Lupa blocks Scrapy |
| Lula official portrait (drawing reference) | File:Foto oficial de Luiz Inácio Lula da Silva (ombros).jpg | Wikimedia Commons | yes | Commons API 2026-10-24: LicenseShortName "CC BY 2.0", Artist "Palácio do Planalto" |
| Flávio Bolsonaro official portrait (drawing reference) | File:Foto oficial do senador Flávio Bolsonaro (v. AgSen).jpg | Wikimedia Commons | yes | Commons API 2026-10-24: LicenseShortName "Attribution", Artist "Agência Senado" |
| Wayback availability API | https://archive.org/wayback/available | Internet Archive | yes | curl 2026-10-24: snapshots found for Lupa Band (2026-10-21) and g1 Globo (2026-10-24) pages |

## Success Criteria

- [ ] For each of the 8 source pages, the number of published records equals the number of checks a person counts on the agency page (observed 2026-10-24: g1 37 / 20, Lupa 41 / 43, Aos Fatos 49 / 37, Estadão 28 / 37; 292 in total).
- [ ] Five randomly sampled records match their agency page and archived copy on statement, speaker and label.
- [ ] The site loads and filters correctly at 360 px and on desktop, with no login and no tracking.
- [ ] A second pipeline run with no source changes produces no diff in the dataset.
