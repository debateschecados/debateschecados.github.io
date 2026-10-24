import { readFile } from 'node:fs/promises'
import type { RunReport } from './types.ts'

// One line per unmapped label: "<source id> (<outlet>): <label>".
export const unmappedLabels = (report: RunReport) =>
  Object.entries(report.sources).flatMap(([id, source]) =>
    source.unmappedLabels.map((label) => `${id} (${source.outlet}): ${label}`),
  )

// Usage: node src/check-labels.ts [run-report.json]. Exits 1 when a label has no band (DATA-03).
if (import.meta.main) {
  const path = process.argv[2] ?? 'data/run-report.json'
  const report = JSON.parse(await readFile(path, 'utf8')) as RunReport
  const lines = unmappedLabels(report)
  if (lines.length > 0) {
    console.error(`Labels without a band in config/bands.json:\n${lines.join('\n')}`)
    process.exitCode = 1
  } else console.log('Every label has a band.')
}
