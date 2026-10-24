# Debates checados

Public archive of outlet fact-checks for the 2026 presidential runoff debates. The verdict belongs to the outlet. This repository does not score a claim on its own.

Published site: https://debateschecados.github.io
Agent index: https://debateschecados.github.io/llms.txt
Audit steps: https://debateschecados.github.io/auditoria.md

An audit follows the five steps in auditoria.md. The same text is `auditPrompt` in `src/site/agents.ts` and the button on the site. Show a file and line, or a link, for each step. If a step cannot be checked, say so.

Parsers in `src/adapters/` do not branch on the speaker. A name becomes a candidate id in `src/pipeline/normalize.ts`, using `config/candidates.json`. Bands live in `config/bands.json` and do not depend on who spoke.

Do not edit `data/` by hand. `pnpm ingest` writes it.

Run tests one file at a time, for example `pnpm vitest run test/unit/site/build.test.ts`. Do not run the whole suite.
