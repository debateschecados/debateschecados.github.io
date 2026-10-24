import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import pkg from '../package.json' with { type: 'json' }
import { registry } from './adapters/index.ts'
import { type Config, loadConfig } from './config.ts'
import { type Clock, createHttp, HttpError, sourceHosts, systemClock } from './io/http.ts'
import { type ArchiveAttempt, archive, needsArchive } from './pipeline/archive.ts'
import { keylessIds } from './pipeline/ids.ts'
import { type FreshItem, merge, type SourceResult } from './pipeline/merge.ts'
import { cleanQuote, excerpt, mappedBand, resolveSpeaker } from './pipeline/normalize.ts'
import { writeData } from './pipeline/write.ts'
import type {
  Adapter,
  CheckRecord,
  Doc,
  DuplicateItem,
  ExcludedItem,
  Io,
  ParseNote,
  RunReport,
  SourceConfig,
  SourceReport,
} from './types.ts'

const ROOT = join(import.meta.dirname, '..')

const usage = `Usage: node src/ingest.ts [options]

Fetches every source in config/debates.json, merges it with the published records and
writes checks.json, checks.csv and run-report.json.

Options:
  --data-dir <dir>      where the dataset is read and written (default: data)
  --accept-drop=<id>    let source <id> shrink by more than 20% this run; repeatable, empty = none
  --offline <dir>       read docs from <dir> instead of the network, no archiving:
                        <source id>.html is the source page, <source id>.json its second doc
                        (the Aos Fatos Escriba API), as in .cache/
  --run-log <file>      per-run details: HTTP status and SHA-256 of each fetch, timings, archive
                        attempts (default: .cache/run-log.json)
  --help                show this text

Environment: IA_S3_ACCESS and IA_S3_SECRET (archive.org keys) enable Save Page Now captures;
GITHUB_STEP_SUMMARY, when set, receives a summary table.`

export interface FetchLog {
  url: string
  status: number | null
  sha256: string | null
  ms: number
  error?: string
}

export interface SourceLog {
  status: SourceReport['status']
  reason: string | null
  ms: number
  fetches: FetchLog[]
}

export interface RunLog {
  startedAt: string
  finishedAt: string
  offline: boolean
  sources: Record<string, SourceLog>
  archive: ArchiveAttempt[] | 'skipped'
}

export type Archiver = (
  records: CheckRecord[],
) => Promise<{ records: CheckRecord[]; attempts: ArchiveAttempt[] }>

export interface IngestOptions {
  config: Config
  dataDir: string
  registry: ReadonlyMap<string, Adapter>
  ioFor: (source: SourceConfig) => Io
  clock: Clock
  acceptDrop: ReadonlySet<string>
  archive: Archiver | null // null skips archiving (offline runs)
  offline?: boolean // docs do not come from HTTP, so no HTTP status is reported
}

// Calendar day in Brasília as YYYY-MM-DD ("en-CA" formats dates that way). Detection dates are
// read by people in Brazil, so a run at 22:30 local time must not land on the next day.
const brasiliaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const fileDoc = async (path: string, url: string, clock: Clock): Promise<Doc> => {
  const bytes = await readFile(path)
  return {
    url,
    body: bytes.toString('utf8'),
    sha256: sha256(bytes),
    fetchedAt: new Date(clock.now()).toISOString(),
  }
}

// Docs of one source read from a directory named like .cache/: the source page is
// <source id>.html and any other doc (the Aos Fatos Escriba API) is <source id>.json.
export const offlineIo =
  (dir: string, clock: Clock = systemClock) =>
  (source: SourceConfig): Io => ({
    async get(url) {
      const file = `${source.id}.${url === source.url ? 'html' : 'json'}`
      try {
        return await fileDoc(join(dir, file), url, clock)
      } catch {
        throw new HttpError('network', url, `offline: no ${file} in ${dir}`)
      }
    },
    readFile: (path) => fileDoc(join(ROOT, path), path, clock),
  })

const readRecords = async (dataDir: string): Promise<CheckRecord[]> => {
  let text: string
  try {
    text = await readFile(join(dataDir, 'checks.json'), 'utf8')
  } catch {
    return []
  }
  return JSON.parse(text) as CheckRecord[]
}

const withAnchor = (url: string, anchor: string | null) => (anchor ? `${url}#${anchor}` : url)

interface Collected {
  result: SourceResult
  report: Omit<SourceReport, 'status' | 'reason' | 'items' | 'unmappedLabels' | 'awaitingArchive'>
  log: SourceLog
}

// Loads and parses one source, then normalizes its items. Never throws: a failure becomes a
// failed SourceResult so the other sources still run (INGEST-06, CONF-02).
async function collect(
  source: SourceConfig,
  debate: Config['debates'][number],
  config: Config,
  options: IngestOptions,
): Promise<Collected> {
  const { clock } = options
  const started = clock.now()
  const fetches: FetchLog[] = []
  const base = { sourceId: source.id, debate: debate.id, outlet: source.outlet }
  const excluded: ExcludedItem[] = []
  let duplicates: DuplicateItem[] = []
  let unratedComments = 0
  let httpStatus: number | null = null
  const adapter = options.registry.get(source.adapter)

  // The report's httpStatus is the source page's answer (INGEST-09). A robots.txt or second doc
  // failure leaves it null and says why in reason.
  const io = options.ioFor(source)
  const logged: Io = {
    async get(url) {
      const at = clock.now()
      try {
        const doc = await io.get(url)
        const status = options.offline ? null : 200
        if (url === source.url) httpStatus = status
        fetches.push({ url: doc.url, status, sha256: doc.sha256, ms: clock.now() - at })
        return doc
      } catch (error) {
        const status = error instanceof HttpError && error.kind === 'status' ? error.status : null
        if (url === source.url) httpStatus = status
        fetches.push({
          url,
          status,
          sha256: null,
          ms: clock.now() - at,
          error: (error as Error).message,
        })
        throw error
      }
    },
    readFile: (path) => io.readFile(path),
  }

  let result: SourceResult
  if (!adapter) {
    result = {
      ...base,
      adapter: source.adapter,
      status: 'failed',
      reason: `unknown adapter "${source.adapter}"`,
      items: [],
    }
  } else {
    const kind = `${adapter.kind}@${adapter.version}`
    try {
      const docs = await adapter.load(source, logged)
      const notes: ParseNote[] = []
      const parsed = adapter.parse(docs, notes)
      const page = source.url ?? docs[0]?.url ?? ''
      const speakers = config.candidates.filter((c) => debate.candidates.includes(c.id))
      const items: FreshItem[] = []
      for (const item of parsed) {
        const speaker = resolveSpeaker(item.speakerRaw, speakers)
        const quote = cleanQuote(item.quote)
        if (speaker === null) {
          excluded.push({
            url: page,
            pos: item.pos,
            reason: `speaker not resolved: "${item.speakerRaw}"`,
          })
          continue
        }
        if (quote === null) {
          excluded.push({
            url: page,
            pos: item.pos,
            reason: `quote shorter than 10 characters: "${item.quote}"`,
          })
          continue
        }
        const doc = docs[item.doc]
        items.push({
          key: item.key,
          pos: item.pos,
          anchor: item.anchor,
          speaker,
          quote,
          label: item.label,
          excerpt: excerpt(item.explanation),
          url: item.url ?? withAnchor(page, item.anchor),
          evidenceUrl: doc.url,
          fetchedAt: doc.fetchedAt,
        })
      }
      for (const note of notes) {
        if (note.kind === 'skipped') excluded.push({ url: page, pos: null, reason: note.detail })
        if (note.kind === 'unrated') unratedComments++
        // 'unknown-label': the label is published verbatim and listed in unmappedLabels.
      }
      duplicates = keylessIds(
        source.id,
        items.filter((item) => item.key === null),
      ).duplicates
      result = { ...base, adapter: kind, status: 'ok', items }
    } catch (error) {
      result = {
        ...base,
        adapter: kind,
        status: 'failed',
        reason: (error as Error).message,
        items: [],
      }
    }
  }

  return {
    result,
    report: {
      debate: debate.id,
      outlet: source.outlet,
      adapter: result.adapter,
      httpStatus,
      excluded,
      duplicates,
      unratedComments,
    },
    log: {
      status: result.status,
      reason: result.reason ?? null,
      ms: clock.now() - started,
      fetches,
    },
  }
}

// One ingest run: every configured source, merged with the published records, archived and
// written to options.dataDir. Returns what was written and the per-run log.
export async function ingest(options: IngestOptions) {
  const { clock } = options
  const started = clock.now()
  const startedAt = new Date(started).toISOString()
  const { config } = options
  const previous = await readRecords(options.dataDir)

  const collected = await Promise.all(
    config.debates.flatMap((debate) =>
      debate.sources.map((source) => collect(source, debate, config, options)),
    ),
  )

  const merged = merge(
    previous,
    collected.map((c) => c.result),
    {
      date: brasiliaDay.format(started),
      bands: config.bands,
      outlets: config.outlets,
      debates: config.debates,
      idLinks: config.idLinks,
      acceptDrop: options.acceptDrop,
    },
  )
  let records = merged.records
  let attempts: RunLog['archive'] = 'skipped'
  if (options.archive) {
    const archived = await options.archive(records)
    records = archived.records
    attempts = archived.attempts
  }

  const report: RunReport = { sources: {} }
  const logs: Record<string, SourceLog> = {}
  for (const { result, report: partial, log } of collected) {
    const { sourceId } = result
    const event = merged.events.find((e) => e.type === 'source' && e.sourceId === sourceId)
    const status = event?.type === 'source' ? event.status : result.status
    const reason = event?.type === 'source' ? event.reason : (result.reason ?? null)
    const own = records.filter((r) => r.sourceId === sourceId)
    report.sources[sourceId] = {
      ...partial,
      status,
      reason,
      items: own.filter((r) => r.missingSince === undefined).length,
      unmappedLabels: [
        ...new Set(
          own
            .filter((r) => mappedBand(config.bands, r.outlet, r.label) === null)
            .map((r) => r.label),
        ),
      ].sort(),
      awaitingArchive: own
        .filter(needsArchive)
        .map((r) => r.id)
        .sort(),
    }
    logs[sourceId] = { ...log, status, reason }
  }

  await writeData(options.dataDir, records, report)
  const log: RunLog = {
    startedAt,
    finishedAt: new Date(clock.now()).toISOString(),
    offline: options.offline ?? false,
    sources: logs,
    archive: attempts,
  }
  return { records, report, log }
}

// Short markdown for the GitHub Actions job summary.
export function summary(report: RunReport, log: RunLog) {
  const rows = Object.entries(report.sources).map(
    ([id, s]) =>
      `| ${id} | ${s.status}${s.reason ? ` (${s.reason})` : ''} | ${s.items} | ${s.excluded.length} | ${s.unmappedLabels.length} | ${s.awaitingArchive.length} |`,
  )
  const { archive } = log
  const archived =
    archive === 'skipped'
      ? 'Archive: skipped (offline run).'
      : `Archive, evidence docs: ${(['verified', 'captured', 'waiting'] as const)
          .map((outcome) => `${archive.filter((a) => a.outcome === outcome).length} ${outcome}`)
          .join(', ')}.`
  return [
    '## Ingest',
    '',
    '| Source | Status | Records | Excluded | Unmapped labels | Awaiting archive |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    archived,
    '',
  ].join('\n')
}

// package.json "repository", then REPO_URL, for the user agent.
export const repoUrl = (env: NodeJS.ProcessEnv) => {
  const repository = (pkg as { repository?: string | { url?: string } }).repository
  const fromPkg = typeof repository === 'string' ? repository : repository?.url
  return fromPkg || env.REPO_URL || 'repository not published yet'
}

export async function main(argv: string[], env: NodeJS.ProcessEnv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean' },
      'data-dir': { type: 'string', default: 'data' },
      'accept-drop': { type: 'string', multiple: true, default: [] },
      offline: { type: 'string' },
      'run-log': { type: 'string', default: join('.cache', 'run-log.json') },
    },
  })
  if (values.help) {
    console.log(usage)
    return
  }

  const clock = systemClock
  const config = await loadConfig(join(ROOT, 'config'), registry)
  const offline = values.offline
  let ioFor: IngestOptions['ioFor']
  let archiver: Archiver | null = null
  if (offline !== undefined) ioFor = offlineIo(offline, clock)
  else {
    const repo = repoUrl(env)
    const http = createHttp({ hosts: sourceHosts(config.debates), repoUrl: repo, clock })
    const io: Io = {
      get: (url) => http.get(url),
      readFile: (path) => fileDoc(join(ROOT, path), path, clock),
    }
    ioFor = () => io
    const keys =
      env.IA_S3_ACCESS && env.IA_S3_SECRET
        ? { access: env.IA_S3_ACCESS, secret: env.IA_S3_SECRET }
        : null
    archiver = (records) =>
      archive(records, {
        http,
        clock,
        adapters: registry,
        candidates: config.candidates,
        keys,
        userAgent: `debates-checados/${pkg.version} (+${repo})`,
      })
  }

  const { report, log } = await ingest({
    config,
    dataDir: values['data-dir'],
    registry,
    ioFor,
    clock,
    acceptDrop: new Set(values['accept-drop'].filter(Boolean)),
    archive: archiver,
    offline: offline !== undefined,
  })

  const runLog = values['run-log']
  await mkdir(dirname(runLog), { recursive: true })
  await writeFile(runLog, `${JSON.stringify(log, null, 2)}\n`)
  const text = summary(report, log)
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, text)
  console.log(text)
}

if (import.meta.main) await main(process.argv.slice(2), process.env)
