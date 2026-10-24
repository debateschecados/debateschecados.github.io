# Agency Comparator Specification

## Problem Statement

The archive shows each agency's checks side by side, but it cannot answer the questions people ask after a debate: when two agencies checked the same claim, did they reach the same verdict? Does one agency rate one candidate more harshly than the others do? Which claims did an agency leave unchecked that the others checked? A probe on the 314 records (2026-10-24) found 61 statements checked by more than one agency, 26 of them with different bands, but also showed that matching by quote similarity alone is wrong: agencies split one sentence into different claims and similar quotes chain unrelated claims together.

## Goals

- [ ] Every claim checked by two or more agencies in the two runoff debates appears once on a public comparison page, with each agency's verdict or "não checou".
- [ ] Per agency and candidate, the page shows how many shared claims the agency checked and how far its verdicts sit from the other agencies on the same claims, with the uncertainty drawn as large as the number, without ranking or judging any agency.
- [ ] A visitor who suspects an agency leans to one candidate gets a direct answer, produced by a fixed public rule from the data, that anyone can recompute.
- [ ] Every verdict or quote an agency changed after publishing is shown with its versions and dates.
- [ ] Anyone can see how each claim group was formed, from the blind inputs to the final file, and contest it.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Anchoring checks to the debate transcript | The Aos Fatos transcript covers both debates (observed 2026-10-24), but anchoring does not settle claim boundaries inside one sentence and adds a dependency on one agency's page format. Deferred. |
| Coverage over everything a candidate said | Needs the transcript split into claims, which is the same judgment problem at a larger scale. Deferred. |
| Ranking agencies, a combined score, or any statement about an agency's intent | The distance (LEAN) describes verdicts on shared claims; it cannot see what each agency chose to check, so it never supports a claim of intent. |
| Hypothesis tests, p-values, adjusting for multiple comparisons | The page shows a 90% interval per agency and a fixed sentence rule; more machinery adds no honesty for 20 to 30 claims per cell. |
| Measuring lean in what each agency chose to check | Needs coverage over everything a candidate said (deferred above); the coverage view only shows shared claims. |
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
| Distance measure | Score verdadeiro 0, impreciso 1, falso 2; an agency's deviation on a claim is its score minus the mean score of the other agencies with a band on that claim; per candidate the mean deviation; the agency's distance is mean(Flávio) minus mean(Lula) | User asked for "a média" of the agencies to see if one leaned; leave-one-out keeps an agency from pulling its own reference | y |
| Interval | 90% percentile bootstrap, 5000 resamples per agency, deterministic generator so every run and anyone's rerun prints the same numbers | Shows the uncertainty without a significance test; deterministic so the numbers never change without a data change | n |
| Sentence rule | Interval contains 0: "sem diferença clara entre os candidatos"; entirely above 0: "mais dura com Flávio Bolsonaro do que as outras agências"; entirely below 0: "mais dura com Lula do que as outras agências" | Fixed before publication so nobody picks words after seeing results | y |
| Visual direction | Mock A "Balança e partitura" (2026-10-24): one axis per agency with the interval as a bar, the claims as a dot matrix per debate and candidate, coverage as one tick per claim, changed verdicts as version timelines | User chose A over the tug-of-war mock | y |
| Verdict encoding | Band by color and by shape, so the page works without color vision | The mock reviewer flagged red and green dots | n |
| Changed verdicts in the lean | The distance uses each record's current band; changes are shown separately (DRIFT) | The current verdict is the agency's standing position | n |
| 2026-10-24 Estadão key reissue | Repaired once from the published data before and after that run with the corrected matching (AD-004); the repair script and its report are committed | The CI run split 19 checks into new IDs and moved one ID to a check by the other candidate, which breaks CLAIM-02 | n |

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

1. The system SHALL publish a page `comparar.html`, linked from the main page and the methodology page, that shows every claim group as one column of a dot matrix per debate and candidate, with one lane per agency and one dot per agency: filled with the band's color and shape when the agency checked the claim, hollow when it did not ("não checou"). (CMP-01)
2. WHEN the visitor selects a claim THEN the system SHALL show its claim sentence, speaker, debate and, per agency, the band, the agency's original label as visible text and a link to the agency item, or "não checou". (CMP-02)
3. WHEN the visitor selects a debate, a candidate or "Só divergências" THEN the system SHALL show only the rows matching all selected filters, where a divergence is a row with at least two different bands among verdadeiro, impreciso and falso. (CMP-03)
4. The system SHALL order agency cells alphabetically by agency name and rows by debate newest first, then by the smallest position of a member record on its agency page. (CMP-04)
5. The system SHALL leave records marked "não encontrado na fonte" out of every row and count, and SHALL hide a group left with fewer than two records. (CMP-05)
6. IF published records are missing from the latest curation input THEN the system SHALL show "N checagens publicadas depois da última revisão ainda não foram agrupadas." with their number. (CMP-06)
7. The system SHALL render without horizontal scrolling at a 360 px viewport width; below 720 px the dot matrix becomes a list with one claim per line and the agency lanes as columns. (CMP-07)
8. The system SHALL encode each band by color and by shape in every dot, chip and legend, and every dot SHALL have a text alternative naming the agency, the band and the claim. (CMP-08)

**Independent Test**: Build the site with a fixture dataset and a fixture groups file; check one row per group, the "não checou" cells, each filter, a removed record and the pending notice.

---

### P1: Coverage and relative rigor ⭐ MVP

**User Story**: As a skeptic, I want per-agency numbers on which shared claims each agency checked and how its verdicts compare with the others, split by candidate, so that I can see whether an agency treats one candidate differently.

**Why P1**: User asked to see whether an agency "helps" a candidate and which statements agencies did not check.

**Acceptance Criteria**:

1. The system SHALL show, per agency and candidate, under the current debate filter, how many of the claim groups of that candidate include the agency, out of all claim groups of that candidate, as one mark per claim, and how many of the agency's curated records are in no group ("só ela checou"); records published after the last curation are left out of "só ela checou" and the page says so. (RIGOR-01)
2. Superseded by LEAN-01 and LEAN-02: the pairwise harsher/equal/milder counts are not shown on the page. (RIGOR-02)
3. WHERE a table cell is based on fewer than 10 claims or comparisons the system SHALL show the marker "amostra pequena" in that cell. (RIGOR-03)
4. The system SHALL show above the tables the text "Cada agência escolhe o que checar e pode checar partes diferentes da mesma fala. Estes números mostram diferenças, não provam favorecimento." (RIGOR-04)
5. The system SHALL NOT order agencies by any number, show a ranking or a combined score, or show any sentence attributing intent to an agency; the only per-agency number besides counts is the LEAN distance with its interval. (RIGOR-05)
6. The system SHALL compute every number in the tables from the same rows the page lists for the current debate filter. (RIGOR-06)

**Independent Test**: With a fixture of 4 groups, count coverage and harsher/equal/milder by hand for each agency and candidate and compare with the page.

---

### P1: Distance from the other agencies ⭐ MVP

**User Story**: As a skeptic who heard that the agencies lean to one candidate, I want a direct answer computed from the agencies' own verdicts, with its uncertainty, so that I can judge the claim myself and anyone can recompute it.

**Why P1**: User asked for "a média" to see if an agency "foi mais pro Lula ou pro Flávio", and to have that answer on the page as evidence.

**Acceptance Criteria**:

1. The system SHALL compute, for every visible claim group under the current debate filter and every member record whose band is not "sem faixa" in a group with at least two such records, the deviation = the record's score (verdadeiro 0, impreciso 1, falso 2) minus the mean score of the other such records in the group, and SHALL show per agency and candidate the mean deviation and the number of deviations. (LEAN-01)
2. The system SHALL show per agency the distance = mean deviation on Flávio Bolsonaro's claims minus mean deviation on Lula's claims, and its 90% interval from a percentile bootstrap with 5000 resamples drawn by a fixed deterministic generator, so that the same data always gives the same numbers. (LEAN-02)
3. The system SHALL show next to each agency exactly one sentence chosen by the rule: interval contains 0, "sem diferença clara entre os candidatos"; interval entirely above 0, "mais dura com Flávio Bolsonaro do que as outras agências"; interval entirely below 0, "mais dura com Lula do que as outras agências". (LEAN-03)
4. IF an agency has fewer than 10 deviations for either candidate under the current filter THEN the system SHALL show "amostra pequena" instead of the interval and the sentence for that agency. (LEAN-04)
5. The system SHALL open the page with a headline chosen by rule: when every agency's sentence is "sem diferença clara entre os candidatos", "Pelos dados de hoje, nenhuma das quatro mostra diferença clara entre os candidatos."; otherwise one sentence per agency with a clear difference, "<agência> foi mais dura com <candidato> do que as outras agências.", in agency order. (LEAN-05)
6. The system SHALL draw the distances as one horizontal axis per agency, in alphabetical agency order, from "mais dura com Lula" to "mais dura com Flávio", with the zero line, the point, and the interval as a bar at least as visible as the point, and SHALL show RIGOR-04 and a method note (claims with two or more agencies only; the reference is the other agencies, not the truth; what each agency chose to check is not measured) next to it. (LEAN-06)
7. WHEN `pnpm lean` runs THEN the system SHALL print, from `data/`, the same per-agency numbers, intervals and sentences the page shows with no debate filter. (LEAN-07)
8. The system SHALL explain the formula, the scale, the interval, the sentence rule and the limits on the methodology page and link to this specification in the repository. (LEAN-08)

**Independent Test**: With a fixture of hand-built groups, compute deviations, means and the distance by hand; check that the page and `pnpm lean` print them; feed a fixture whose interval is entirely above 0 and check the sentence and the headline.

---

### P1: Verdicts that changed ⭐ MVP

**User Story**: As a visitor, I want to see every check whose verdict or quote changed after publication, with each version and its date, so that changes cannot pass unnoticed.

**Why P1**: The 2026-10-24 run showed Estadão changing three verdicts and reissuing the internal ID of 19 checks; the user wants that kept and shown as a tree of versions.

**Acceptance Criteria**:

1. WHEN a re-run matches a record whose source key changed THEN the system SHALL keep the previous key in the record's history with the detection date, in the same entry as any label, quote or speaker change of that run. (DRIFT-01)
2. The system SHALL repair the records of source `estadao-globo-2026-10-23` written by the 2026-10-24 CI run by matching, with the current rules, the records published after that run against those published before it, SHALL commit the repair script and a report listing every ID that was merged into an older ID, and SHALL leave every other source unchanged. (DRIFT-02)
3. The system SHALL show on the comparison page every live record with a label, quote or key change in its history, as a timeline from the first version to the current one, each version with its label, band and date range; a quote change SHALL show the words removed and added; a key-only change SHALL show "a agência trocou o identificador interno". (DRIFT-03)
4. The system SHALL show per agency and candidate how many band changes went to a harsher band, to a milder band, from "sem faixa" to a band, or from a band to "sem faixa", using the order verdadeiro < impreciso < falso, and "nenhuma mudança" when there is none. (DRIFT-04)
5. WHERE a record in a claim group has a band change THEN the system SHALL mark its dot in the dot matrix and show the previous band in the claim detail. (DRIFT-05)

**Independent Test**: Merge a fixture where a key is reissued with a label change and check the history entry; run the repair on copies of the before and after files of 2026-10-24 and check the report and that the build passes CLAIM-02; build the page with a fixture record with two history entries and read the timeline.

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
- WHEN the debate filter selects one debate THEN the coverage, the distances and the changed-verdict counts SHALL count only that debate's records.
- WHEN a group's only banded records are from one agency THEN the system SHALL count no deviation for that group.
- IF the 2026-10-24 repair finds an item after the run that matches no record before it THEN the system SHALL keep it as a new record and list it in the report.

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
| State-transition integrity | Group changes go through commits; REPRO-01 catches silent edits; verdict, quote and key changes kept in history (DRIFT-01) |

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
| RIGOR-02 | P1: Coverage and relative rigor | Tasks: T5 | Superseded by LEAN-01, LEAN-02 |
| RIGOR-03 | P1: Coverage and relative rigor | Tasks: T5, T6 | Implemented |
| RIGOR-04 | P1: Coverage and relative rigor | Tasks: T6 | Implemented |
| RIGOR-05 | P1: Coverage and relative rigor | Tasks: T6 | Implemented |
| RIGOR-06 | P1: Coverage and relative rigor | Tasks: T5, T7 | Implemented |
| CMP-08 | P1: Compare agencies | Tasks: pending | Pending |
| LEAN-01 | P1: Distance from the other agencies | Tasks: pending | Pending |
| LEAN-02 | P1: Distance from the other agencies | Tasks: pending | Pending |
| LEAN-03 | P1: Distance from the other agencies | Tasks: pending | Pending |
| LEAN-04 | P1: Distance from the other agencies | Tasks: pending | Pending |
| LEAN-05 | P1: Distance from the other agencies | Tasks: pending | Pending |
| LEAN-06 | P1: Distance from the other agencies | Tasks: pending | Pending |
| LEAN-07 | P1: Distance from the other agencies | Tasks: pending | Pending |
| LEAN-08 | P1: Distance from the other agencies | Tasks: pending | Pending |
| DRIFT-01 | P1: Verdicts that changed | Tasks: pending | Pending |
| DRIFT-02 | P1: Verdicts that changed | Tasks: pending | Pending |
| DRIFT-03 | P1: Verdicts that changed | Tasks: pending | Pending |
| DRIFT-04 | P1: Verdicts that changed | Tasks: pending | Pending |
| DRIFT-05 | P1: Verdicts that changed | Tasks: pending | Pending |
| DISC-01 | P1: Honest AI disclosure | Tasks: T8 | Implemented |
| DISC-02 | P1: Honest AI disclosure | Tasks: T6, T8 | Implemented |
| DISC-03 | P1: Honest AI disclosure | Tasks: T6 | Implemented |
| DISC-04 | P1: Honest AI disclosure | Tasks: T8 | Implemented |
| REPRO-01 | P2: Reproducible consensus | Tasks: T4 | Implemented |
| REPRO-02 | P2: Reproducible consensus | Tasks: T4 | Implemented |

**Coverage:** 39 total, 25 mapped to tasks, 14 pending the amendment's tasks

---

## External Dependencies

| Resource | Identifier | System | Verified | Evidence |
| -------- | ---------- | ------ | -------- | -------- |
| Published records | data/checks.json | repo | yes | data/checks.json (314 records, 2026-10-24) |
| Data directory | data/ | repo | yes | data/checks.json, data/claim-groups.json |
| Curation runs | data/claim-curation/ | repo | yes | data/claim-curation/2026-10-24/input.json |
| Estadão Globo source | estadao-globo-2026-10-23 | repo | yes | config/debates.json |
| Records before and after the 2026-10-24 CI run | commits e13bac2 and bc3a25d of main | repo | yes | git show e13bac2:data/checks.json, bc3a25d:data/checks.json |
| Claude Code workflow runtime (curation agents) | Workflow tool, run wf_00495b34-59b | Claude Code | yes | run launched 2026-10-24 with 3 curators per debate, judge, editor and reviewer |

## Success Criteria

- [ ] The comparison page lists every claim group with two or more live records, and a person can follow each cell to the agency item.
- [ ] Five sampled groups, read by the maintainer, check the same assertion in every member record.
- [ ] Coverage and distance numbers for one agency and candidate match a hand count from `data/claim-groups.json` and `data/checks.json`, and `pnpm lean` prints the same distances as the page.
- [ ] The five changed Estadão checks of 2026-10-24 appear with both versions and dates, and the build passes CLAIM-02 on the repaired data.
- [ ] No page of the built site still says that no text passes through AI.
