import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CheckRecord, RunReport, SourceReport } from '../types.ts'

// Copies the given keys in this order, dropping undefined values, so output never
// depends on how an object was built.
const pick = <T extends object>(value: T, keys: readonly (keyof T)[]) =>
  Object.fromEntries(keys.filter((k) => value[k] !== undefined).map((k) => [k, value[k]]))

const RECORD_KEYS = [
  'id',
  'sourceId',
  'debate',
  'outlet',
  'key',
  'pos',
  'anchor',
  'speaker',
  'quote',
  'label',
  'band',
  'excerpt',
  'url',
  'adapter',
  'evidence',
  'missingSince',
  'history',
] as const satisfies readonly (keyof CheckRecord)[]

const REPORT_KEYS = [
  'debate',
  'outlet',
  'adapter',
  'status',
  'reason',
  'httpStatus',
  'items',
  'excluded',
  'duplicates',
  'unmappedLabels',
  'unratedComments',
  'awaitingArchive',
] as const satisfies readonly (keyof SourceReport)[]

const orderRecord = (record: CheckRecord) => ({
  ...pick(record, RECORD_KEYS),
  evidence: pick(record.evidence, ['url', 'fetchedAt', 'archiveUrl', 'sha256']),
  ...(record.history && {
    history: record.history.map((h) => pick(h, ['label', 'quote', 'speaker', 'until'])),
  }),
})

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

export const checksJson = (records: readonly CheckRecord[]) => json(records.map(orderRecord))

export const reportJson = (report: RunReport) =>
  json({
    sources: Object.fromEntries(
      Object.keys(report.sources)
        .sort()
        .map((id) => {
          const source = report.sources[id]
          return [
            id,
            {
              ...pick(source, REPORT_KEYS),
              excluded: source.excluded.map((e) => pick(e, ['url', 'pos', 'reason'])),
              duplicates: source.duplicates.map((d) => pick(d, ['pos', 'quote', 'n'])),
            },
          ]
        }),
    ),
  })

export const CSV_COLUMNS = [
  'id',
  'source_id',
  'debate',
  'outlet',
  'key',
  'pos',
  'anchor',
  'speaker',
  'quote',
  'label',
  'band',
  'excerpt',
  'url',
  'adapter',
  'evidence_url',
  'fetched_at',
  'archive_url',
  'sha256',
  'missing_since',
  'history',
] as const

// RFC 4180: quote a field holding a comma, a quote or a line break; double inner quotes.
const field = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const checksCsv = (records: readonly CheckRecord[]) => {
  const rows = records.map((r) =>
    [
      r.id,
      r.sourceId,
      r.debate,
      r.outlet,
      r.key,
      r.pos,
      r.anchor,
      r.speaker,
      r.quote,
      r.label,
      r.band,
      r.excerpt,
      r.url,
      r.adapter,
      r.evidence.url,
      r.evidence.fetchedAt,
      r.evidence.archiveUrl,
      r.evidence.sha256,
      r.missingSince,
      r.history && JSON.stringify(orderRecord(r).history),
    ]
      .map(field)
      .join(','),
  )
  return `${[CSV_COLUMNS.join(','), ...rows].join('\r\n')}\r\n`
}

// Writes data/checks.json, data/checks.csv and data/run-report.json.
export async function writeData(dir: string, records: readonly CheckRecord[], report: RunReport) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'checks.json'), checksJson(records))
  await writeFile(join(dir, 'checks.csv'), checksCsv(records))
  await writeFile(join(dir, 'run-report.json'), reportJson(report))
}
