# Agency Comparator Specification

## Problem Statement

The archive shows each agency's checks side by side, but it cannot answer the questions people ask after a debate: when two agencies checked the same claim, did they reach the same verdict? Does one agency rate one candidate more harshly than the others do? Which claims did an agency leave unchecked that the others checked? A probe on the 314 records (2026-10-24) found 61 statements checked by more than one agency, 26 of them with different bands, but also showed that matching by quote similarity alone is wrong: agencies split one sentence into different claims and similar quotes chain unrelated claims together.

## Goals

- [ ] Every claim checked by two or more agencies in the two runoff debates appears once on a public comparison page, with each agency's verdict or "não checou".
- [ ] Per agency and candidate, the page shows how many shared claims the agency checked and how its verdicts compare with the other agencies on the same claims, without ranking or judging any agency.
- [ ] Anyone can see how each claim group was formed, from the blind inputs to the final file, and contest it.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Anchoring checks to the debate transcript | The Aos Fatos transcript covers both debates (observed 2026-10-24), but anchoring does not settle claim boundaries inside one sentence and adds a dependency on one agency's page format. Deferred. |
| Coverage over everything a candidate said | Needs the transcript split into claims, which is the same judgment problem at a larger scale. Deferred. |
| Any score, ranking or statement that an agency favors a candidate | 61 shared claims split over 4 agencies and 2 candidates leave 10 to 20 per cell; numbers show patterns, not intent. |
| Statistical significance tests | Same sample-size reason; the page shows counts and marks small samples instead. |
| Running the curation automatically in CI | Curation calls AI agents and needs human review of the diff; it runs on demand. |
| AI producing, changing or summarizing verdicts | The verdict is always the agency's (AD-002 stays in force for verdicts). |
| Grouping across debates or across candidates | A claim repeated in both debates is two claims; the comparison is per debate and speaker. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Unit of comparison | A claim group: records from different agencies that evaluate the same assertion, not the same sentence | Probe showed sentence-level matching produces false disagreements (TCU case) | y |
| Who forms the groups | AI agents propose, the maintainer reviews the diff before commit | User decision 2026-10-24 | y |
| How AI curation stays impartial | Blind input (agency replaced by a letter, label and band removed), 3 independent curators, unanimous components kept, disputed ones decided by a judge, then a neutrality reviewer | User asked for several agents to validate | y |
| Claim sentence | Each group carries one short neutral sentence (max 120 characters) stating the candidate's assertion, written by the agents and reviewed for neutrality | User decision 2026-10-24 | y |
| Public AI rule | The audit panel, methodology page and README change from "no AI on agency text" to "AI only groups checks of the same claim, blind to agency and verdict; it never sets a verdict" | The current sentence would become false | y |
| Groups per record | A record belongs to at most one group | One verdict counted once per claim; compound checks go to the claim their excerpt mainly addresses or stay ungrouped | n |
| Agencies per group | At most one record per agency in a group | A repeated agency would count its verdict twice | n |
| Band order for comparisons | verdadeiro < impreciso < falso; "sem faixa" never compared | The common scale already shown on every item; sem faixa labels do not fit the order | n |
| "Mais dura" / "mais branda" | Agency A is harsher than B on a claim when A's band is higher in the order above | Simple, checkable by hand | n |
| Coverage universe | Claims checked by two or more agencies; single-agency records are counted apart as "só ela checou" | Single records include sub-claims other agencies folded into a bigger check, so they inflate the universe | n |
| Small sample marker | A table cell based on fewer than 10 claims or comparisons shows "amostra pequena" | Below 10, one case moves the share by 10 points or more | n |
| Removed records | Records not found at the source are left out of every comparison; a group with fewer than two remaining records is hidden from the page | Same rule as the scoreboards (HIST-02) | n |
| Records published after the last curation | Not grouped until the next curation; the page shows how many exist | Curation is on demand, not in CI | n |
| Agency column order | Alphabetical by agency name, as in the archive's default order | Same rule as SITE-04; no agency is placed first by choice | n |
| Curation audit trail | The blind input, every agent's raw output and the run's script are committed next to the groups file | Lets anyone see where agents disagreed and redo the consensus | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Claim groups ⭐ MVP

**User Story**: As the maintainer, I want the checks of the same claim grouped in a public file, formed by independent blind agents and reviewed by me, so that the comparison rests on a grouping anyone can inspect.

**Why P1**: Every comparison depends on it.

**Acceptance Criteria**:

1. The system SHALL store claim groups in the public file `data/claim-groups.json`, each group with an ID, debate, speaker, claim sentence, member record IDs and origin (`unanimous`, `adjudicated` or `manual`). (CLAIM-01)
2. IF a group references a record ID that does not exist, mixes debates or speakers, repeats an agency, has fewer than two records, shares a record with another group, or has an empty claim sentence or one longer than 120 characters THEN the build SHALL fail and name the group ID and the broken rule. (CLAIM-02)
3. The system SHALL build the curation input with only the record ID, an agency letter assigned per debate, the quoted statement and the excerpt, and SHALL leave out the agency name, URL, label and band. (CLAIM-03)
4. WHEN all three curators place the same set of records in one group and no curator links any of those records to another record THEN the system SHALL keep that group with origin `unanimous`. (CLAIM-04)
5. WHEN curators disagree on a set of linked records THEN the system SHALL send that set, with every curator's proposal, to one judge per debate and SHALL keep the judge's groups with origin `adjudicated`. (CLAIM-05)
6. The system SHALL commit the blind input, each curator's, the judge's, the editor's and the reviewer's raw output and the curation script under `data/claim-curation/<run date>/`. (CLAIM-06)

**Independent Test**: Run the consensus step on three hand-written curator outputs (one unanimous group, one disputed chain) and check which groups come out unanimous and which go to the judge; feed the build a groups file with each broken rule and check the error.

---

### P1: Compare agencies ⭐ MVP

**User Story**: As a voter or journalist, I want to see, claim by claim, how each agency rated what the candidate said and which agencies did not check it, so that I can spot disagreements and gaps myself.

**Why P1**: This is what the user asked for.

**Acceptance Criteria**:

1. The system SHALL publish a page `comparar.html`, linked from the main page and the methodology page, with one row per claim group showing the speaker, the debate, the claim sentence and one cell per agency. (CMP-01)
2. The system SHALL show in an agency's cell the band of its record as the verdict, the agency's original label on hover and a link to the agency item, or the text "não checou" when the agency has no record in the group. (CMP-02)
3. WHEN the visitor selects a debate, a candidate or "Só divergências" THEN the system SHALL show only the rows matching all selected filters, where a divergence is a row with at least two different bands among verdadeiro, impreciso and falso. (CMP-03)
4. The system SHALL order agency cells alphabetically by agency name and rows by debate newest first, then by the smallest position of a member record on its agency page. (CMP-04)
5. The system SHALL leave records marked "não encontrado na fonte" out of every row and count, and SHALL hide a group left with fewer than two records. (CMP-05)
6. IF published records are missing from the latest curation input THEN the system SHALL show "N checagens publicadas depois da última revisão ainda não foram agrupadas." with their number. (CMP-06)
7. The system SHALL render without horizontal scrolling at a 360 px viewport width. (CMP-07)

**Independent Test**: Build the site with a fixture dataset and a fixture groups file; check one row per group, the "não checou" cells, each filter, a removed record and the pending notice.

---

### P1: Coverage and relative rigor ⭐ MVP

**User Story**: As a skeptic, I want per-agency numbers on which shared claims each agency checked and how its verdicts compare with the others, split by candidate, so that I can see whether an agency treats one candidate differently.

**Why P1**: User asked to see whether an agency "helps" a candidate and which statements agencies did not check.

**Acceptance Criteria**:

1. The system SHALL show, per agency and candidate, under the current debate filter, how many of the claim groups of that candidate include the agency, out of all claim groups of that candidate, and how many of the agency's records are in no group ("só ela checou"). (RIGOR-01)
2. The system SHALL show, per agency and candidate, under the current debate filter, the number of pairwise comparisons where the agency's band is higher, equal or lower than another agency's band on the same claim, using the order verdadeiro < impreciso < falso and skipping records with band "sem faixa". (RIGOR-02)
3. WHERE a table cell is based on fewer than 10 claims or comparisons the system SHALL show the marker "amostra pequena" in that cell. (RIGOR-03)
4. The system SHALL show above the tables the text "Cada agência escolhe o que checar e pode checar partes diferentes da mesma fala. Estes números mostram diferenças, não provam favorecimento." (RIGOR-04)
5. The system SHALL NOT show a ranking of agencies, a single score per agency, or any sentence attributing intent to an agency. (RIGOR-05)
6. The system SHALL compute every number in the tables from the same rows the page lists for the current debate filter. (RIGOR-06)

**Independent Test**: With a fixture of 4 groups, count coverage and harsher/equal/milder by hand for each agency and candidate and compare with the page.

---

### P1: Honest AI disclosure ⭐ MVP

**User Story**: As a visitor, I want to know that AI grouped the claims and how, so that the archive's impartiality claims stay true.

**Why P1**: The current audit panel says no text passes through AI; that becomes false once groups are curated by agents.

**Acceptance Criteria**:

1. The system SHALL replace the audit panel rule "Nenhum texto passa por inteligência artificial." with "A IA só agrupa checagens da mesma alegação, sem saber a agência nem o veredito. Ela nunca define veredito." (DISC-01)
2. The system SHALL explain on the comparison page and on the methodology page how groups are formed (blind input, three curators, judge, neutrality review, maintainer review) and link to `data/claim-groups.json` and `data/claim-curation/`. (DISC-02)
3. The system SHALL show on the comparison page how to contest a group: open an issue in the repository with the group ID. (DISC-03)
4. The system SHALL update the README's impartiality rules with the same sentence as DISC-01. (DISC-04)

**Independent Test**: Open the audit panel, the comparison page and the methodology page and read the texts; grep the built site for the old sentence.

---

### P2: Reproducible consensus

**User Story**: As an auditor, I want to recompute the groups from the committed agent outputs so that I can confirm the maintainer did not edit groups silently.

**Why P2**: Strong audit property; the MVP is auditable by reading the raw outputs without it.

**Acceptance Criteria**:

1. WHEN `pnpm check:claims` runs THEN the system SHALL recompute the `unanimous` and `adjudicated` groups from the latest run's committed outputs and SHALL fail if they differ from `data/claim-groups.json`. (REPRO-01)
2. WHEN `pnpm check:claims` runs THEN the system SHALL list every group with origin `manual`. (REPRO-02)

**Independent Test**: Edit one adjudicated group's members in a copy of the file and run the check.

---

## Edge Cases

- IF a curator returns a group with an unknown record ID, a repeated agency or a record already used THEN the system SHALL drop that group from the curator's output and log it in the run.
- IF a curator or the judge fails to return THEN the system SHALL send every component of that debate to the judge, or leave the undecided components ungrouped, and log it.
- WHEN every record of a group has band "sem faixa" except one THEN the system SHALL show the row but count no comparison for it.
- WHEN the debate filter selects one debate THEN the coverage and rigor tables SHALL count only that debate's groups.

## Implicit-Requirement Dimensions

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | CLAIM-02, 120-character claim |
| Failure / partial-failure states | Edge cases on curator and judge failure; CLAIM-02 fails the build |
| Idempotency / retry / duplicates | One group per record and one record per agency (CLAIM-02); each curation run gets its own dated folder (CLAIM-06) |
| Auth boundaries & rate limits | N/A because the page is static and read-only |
| Concurrency / ordering | CMP-04 ordering; curation is a single on-demand run |
| Data lifecycle / expiry | CMP-05 removed records, CMP-06 records newer than the curation |
| Observability | CLAIM-06 raw outputs, REPRO-02 manual list |
| External-dependency failure | Agents only run at curation time; the site never calls them. Failure edge case above |
| State-transition integrity | Group changes go through commits; REPRO-01 catches silent edits |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| CLAIM-01 | P1: Claim groups | Tasks: T1 | Implemented |
| CLAIM-02 | P1: Claim groups | Tasks: T1, T6 | Implemented |
| CLAIM-03 | P1: Claim groups | Tasks: T2 | Implemented |
| CLAIM-04 | P1: Claim groups | Tasks: T3, T4 | Implemented |
| CLAIM-05 | P1: Claim groups | Tasks: T3, T4 | Implemented |
| CLAIM-06 | P1: Claim groups | Tasks: T4 | Implemented |
| CMP-01 | P1: Compare agencies | Tasks: T6 | Implemented |
| CMP-02 | P1: Compare agencies | Tasks: T6 | Implemented |
| CMP-03 | P1: Compare agencies | Tasks: T5, T7 | Implemented |
| CMP-04 | P1: Compare agencies | Tasks: T5 | Implemented |
| CMP-05 | P1: Compare agencies | Tasks: T5 | Implemented |
| CMP-06 | P1: Compare agencies | Tasks: T5, T6 | Implemented |
| CMP-07 | P1: Compare agencies | Tasks: T7 | Implemented |
| RIGOR-01 | P1: Coverage and relative rigor | Tasks: T5 | Implemented |
| RIGOR-02 | P1: Coverage and relative rigor | Tasks: T5 | Implemented |
| RIGOR-03 | P1: Coverage and relative rigor | Tasks: T5, T6 | Implemented |
| RIGOR-04 | P1: Coverage and relative rigor | Tasks: T6 | Implemented |
| RIGOR-05 | P1: Coverage and relative rigor | Tasks: T6 | Implemented |
| RIGOR-06 | P1: Coverage and relative rigor | Tasks: T5, T7 | Implemented |
| DISC-01 | P1: Honest AI disclosure | Tasks: T8 | Implemented |
| DISC-02 | P1: Honest AI disclosure | Tasks: T6, T8 | Implemented |
| DISC-03 | P1: Honest AI disclosure | Tasks: T6 | Implemented |
| DISC-04 | P1: Honest AI disclosure | Tasks: T8 | Implemented |
| REPRO-01 | P2: Reproducible consensus | Tasks: T4 | Implemented |
| REPRO-02 | P2: Reproducible consensus | Tasks: T4 | Implemented |

**Coverage:** 25 total, 25 mapped to tasks, 0 unmapped

---

## External Dependencies

| Resource | Identifier | System | Verified | Evidence |
| -------- | ---------- | ------ | -------- | -------- |
| Published records | data/checks.json | repo | yes | data/checks.json (314 records, 2026-10-24) |
| Claude Code workflow runtime (curation agents) | Workflow tool, run wf_00495b34-59b | Claude Code | yes | run launched 2026-10-24 with 3 curators per debate, judge, editor and reviewer |

## Success Criteria

- [ ] The comparison page lists every claim group with two or more live records, and a person can follow each cell to the agency item.
- [ ] Five sampled groups, read by the maintainer, check the same assertion in every member record.
- [ ] Coverage and rigor numbers for one agency and candidate match a hand count from `data/claim-groups.json` and `data/checks.json`.
- [ ] No page of the built site still says that no text passes through AI.
