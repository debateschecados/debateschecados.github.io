# Agency Comparator Context

**Gathered:** 2026-10-24
**Spec:** `.specs/features/agency-comparator/spec.md`
**Status:** Ready for design

---

## Feature Boundary

A public page that lines up, claim by claim, how the four agencies rated the same assertion in the two runoff debates, which agencies did not check it, and per agency and candidate how many shared claims it checked and how its bands compare with the others. Built on a public file of claim groups formed by blind AI curation and reviewed by the maintainer.

---

## Implementation Decisions

### What the user asked for

- Compare classification across agencies on the same statement (one says falso, another impreciso).
- See whether an agency "helps" a candidate.
- See which statements an agency did not check.

### Unit of comparison

- The claim, not the sentence. Probe on 2026-10-24: in "o TCU acaba de soltar um relatório... 11.500 obras paralisadas", Estadão checked the number (verdadeiro) while g1 and Aos Fatos checked the date of the report (falso). Sentence matching would read this as a disagreement.
- Similarity-only chaining also pulled "o Brasil voltou a ser um cemitério de obras" into the TCU cluster. Similarity can only suggest.

### Curation

- User chose: Claude proposes the groups, the user reviews the diff. This changes the public rule "no text passes through AI", which must be rewritten everywhere it appears.
- User asked for several agents to validate. Run: input blind to agency and verdict, 3 independent curators per debate, a judge per debate only for components where curators disagree, an editor for claim sentences, an adversarial neutrality reviewer.
- Each group carries one short neutral sentence of what the candidate asserted (user confirmed).

### Presentation

- Descriptive only: counts, cases and method. No ranking, no score, no sentence like "agency X helps Y". Small cells are marked.

### Agent's Discretion

- Coverage universe, band order, small-sample threshold, column order, removed records, records newer than the curation: chosen defaults are logged in the spec's Assumptions.

### Declined / Undiscussed Gray Areas → Assumptions

- Page layout and visual direction: follows the archive's approved direction A; decided in Design.

---

## Specific References

- The 2026-10-24 probe (`scratchpad/graph/probe.py`): 61 multi-agency clusters at similarity 0.6, 26 with different bands, Flávio 31 and Lula 30.

---

## Deferred Ideas

- Anchoring each check to the Aos Fatos transcript (Globo: Escriba JSON with speaker and timestamps; Band: transcript paragraphs in the page HTML), which would also allow measuring coverage over everything each candidate said.
- Re-running curation in CI when new records appear.
