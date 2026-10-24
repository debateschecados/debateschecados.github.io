# Debate Archive Context

**Gathered:** 2026-10-24
**Spec:** `.specs/features/debate-archive/spec.md`
**Status:** Ready for design

---

## Feature Boundary

A public, open source site that collects the fact-checks four Brazilian agencies (g1 Fato ou Fake, Agência Lupa, Aos Fatos, Estadão Verifica) published for the two 2026 presidential runoff debates (Band on 2026-10-18, Globo on 2026-10-23), shows them in one place with filters and scoreboards, and publishes the collected data so anyone can audit it.

---

## Implementation Decisions

### What gets in

- Only the runoff debates: Band (2026-10-18) and Globo (2026-10-23), Lula x Flávio Bolsonaro.
- Only items published by the agencies inside their debate coverage pages. Viral hoaxes, standalone checks and institutional articles stay out.
- Every verdict gets in, true ones included. The site is a record of what was said and how it was rated, not a list of lies.
- The architecture must allow adding new debates later (2028) without rewriting the pipeline.

### Labels

- Revised 2026-10-24 after seeing the site: each item shows the band (Verdadeiro / Impreciso / Falso / Sem faixa) as its verdict, so "#FAKE" and "falso" read the same. The agency's original label stays verbatim in the data and appears on hover over the verdict. The label-to-band table is a public file in the repository and the methodology page explains the common scale.
- Lupa FALTA CONTEXTO and Estadão "é enganoso" go to impreciso (user confirmed 2026-10-24). Because band choices move the scoreboard unevenly, the methodology page shows a label × candidate count table and the "sem faixa" band is always shown.

### Views and comparison

- Default view is "Todos": every item from every agency, filterable by one agency at a time (single select).
- Items an agency removed from its page leave every scoreboard and show in the list only behind a "Mostrar removidos" toggle, tagged with the date they disappeared.
- Candidates are ordered by ballot number (13 Lula, 22 Flávio Bolsonaro), a rule stated on the methodology page.
- No automatic or manual grouping of the same statement across agencies in the MVP. Each agency item stands alone.
- Records must keep enough data (stable ID, speaker, quoted statement, debate) so a future analysis can find the same statement across agencies.

### Scoreboard

- Per-agency scoreboard: counts per candidate and band for one agency.
- General scoreboard in "Todos": sums all agencies, always shown with a notice that the same statement can be counted once per agency.

### Visual direction

- Direction A ("Vitrine", Apple-like) chosen, mock at `mocks/a-vitrine.html`. No top bar.
- Two pixel-art candidate illustrations facing each other in the hero ("se desafiando"), small versions next to each name in the scoreboard. Hand-drawn 32x32 from one shared body template; head rows and mouth frames differ; Flávio is the mirrored template. Source grids in `mocks/sprites/render.py`.
- Both candidates talk at the same time, each with his own two mouth shapes and rhythm, same animation length and same number of open-mouth beats (12). Click replays; nothing moves under reduced motion.
- Scoreboard card: portrait tile with the party logo pinned to the outer corner, then the full name (Luiz Inácio Lula da Silva, Flávio Nantes Bolsonaro). Debate selector shows the broadcaster logo.
- Changes animate instead of jumping: sliding pill in the debate selector (passes over the options in between), rolling numbers, bars that grow in a wave with a sheen, and a FLIP list where items glide, leave and enter.
- Illustrations never react to verdicts (no Pinocchio-style effects); the scoreboard is never shown as health bars.

### Impartiality and audit

- First screen states that the verdict is always the agency's and that code and data are open, with a link to the audit panel.
- Fixed "Como auditar" button opens a panel with the impartiality rules, links to repository, data, band mapping and commit history, and a "Copiar prompt" button with an AI audit script.

### Agent's Discretion

- Auditability details (the user did not choose to discuss it). Default logged in the spec's Assumptions.

### Declined / Undiscussed Gray Areas → Assumptions

- Auditability: each record carries its provenance (source URL, archived copy, fetch time, content hash, parser version), the dataset lives in a public versioned repository, and raw agency HTML is never redistributed. Logged in spec Assumptions.

---

## Specific References

- rodape.org: aggregates the same four agencies live, but only during debates, behind invitations for the extension, and collapses labels into 3 bands. This project differs by being permanent, fully public, label-faithful and auditable.
- Rodapé's FAQ: counts reflect which statements agencies chose to check, not who lies more. This drove the scoreboard notice.

---

## Deferred Ideas

- Grouping the same statement across agencies (comparator) and a data lake to study whether agencies agree.
- Live mode during debates (2028).
- Other agencies (UOL Confere, AFP Checamos, Comprova) and first-round or state debates.
- Standalone checks via RSS and ClaimReview JSON-LD.
