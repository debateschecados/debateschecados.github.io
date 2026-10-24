import type { ZodType } from 'zod'

export type Band = 'verdadeiro' | 'impreciso' | 'falso' | 'sem faixa'

export interface Doc {
  url: string // where the bytes came from (page, API endpoint, or a repo file URL)
  body: string
  sha256: string
  fetchedAt: string
}

export interface ParsedItem {
  key: string | null // the source's own stable item id; null when the source has none
  doc: number // index of the doc in load()'s result that holds this item (the evidence)
  pos: number // 1-based order inside the source
  anchor: string | null // fragment that scrolls to the item on the outlet page, if any
  url?: string // per-item URL when it differs from the doc URL
  speakerRaw: string
  quote: string
  label: string // verbatim display text
  explanation: string
}

// Something an adapter saw but did not emit as an item (a quote without a label,
// an unrated comment, an unknown stamp code). Collected into the run report.
export interface ParseNote {
  kind: 'skipped' | 'unrated' | 'unknown-label'
  detail: string
}

export interface Io {
  get(url: string): Promise<Doc>
  readFile(path: string): Promise<Doc>
}

export interface SourceConfig {
  id: string
  outlet: string
  adapter: string
  url?: string
  file?: string
}

export interface Adapter {
  kind: string // "lupa-page", "aosfatos", later "manual", "claimreview"
  version: number // bumped on any output change; stored as "<kind>@<version>"
  configSchema: ZodType // source fields this adapter needs (url, or file for manual)
  load(source: SourceConfig, io: Io): Promise<Doc[]> // all I/O lives here
  // Pure: same docs, same items (DATA-04). `notes`, when given, receives what was not emitted.
  parse(docs: Doc[], notes?: ParseNote[]): ParsedItem[]
}

export interface HistoryEntry {
  label?: string
  quote?: string
  speaker?: string
  key?: string | null // the source's previous item id (DRIFT-01)
  until: string
}

export interface Evidence {
  url: string // doc the item was parsed from (page or API)
  fetchedAt: string // fetch that last changed this record
  archiveUrl: string | null // Wayback id_ URL, verified
  sha256: string | null // of the archived original bytes
}

export interface CheckRecord {
  id: string // assigned once, see "Record IDs"
  sourceId: string // config/debates.json source id
  debate: string // e.g. "globo-2026-10-23"
  outlet: string // key in config/outlets.json
  key: string | null // the source's own item id, if any
  pos: number
  anchor: string | null
  speaker: string // candidate id from config/candidates.json
  quote: string
  label: string // verbatim, as displayed by the outlet
  band: Band
  excerpt: string // <= 280 chars + "…"
  url: string // where a reader checks it: outlet page (+ #anchor) or the item's own URL
  adapter: string // "<kind>@<version>" that produced the current content
  evidence: Evidence
  missingSince?: string // HIST-02
  history?: HistoryEntry[] // HIST-01
}

export type SourceStatus = 'ok' | 'failed' | 'partial'

export interface ExcludedItem {
  url: string
  pos: number | null
  reason: string
}

export interface DuplicateItem {
  pos: number
  quote: string
  n: number // occurrence number of the quote inside the source (2 for the first repeat)
}

// Stable content only: no timestamps, no per-run hashes (INGEST-09).
export interface SourceReport {
  debate: string
  outlet: string
  adapter: string // "<kind>@<version>", or the unknown kind as configured
  status: SourceStatus
  reason: string | null
  httpStatus: number | null
  items: number
  excluded: ExcludedItem[]
  duplicates: DuplicateItem[]
  unmappedLabels: string[]
  unratedComments: number
  awaitingArchive: string[] // record ids without a verified snapshot
}

export interface RunReport {
  sources: Record<string, SourceReport>
}
