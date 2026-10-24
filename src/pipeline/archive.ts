import type { Candidate } from '../config.ts'
import type { Clock, Http } from '../io/http.ts'
import type { Adapter, CheckRecord, Doc } from '../types.ts'
import { cleanQuote, resolveSpeaker } from './normalize.ts'

const AVAILABLE = 'https://archive.org/wayback/available'
// Save Page Now 2, checked 2026-10-24 against the public API doc:
// https://docs.google.com/document/d/1Nsv52MvSjbLb2PCpHlat0gkzw0EvtSgpKHu4mk0MnrA
// POST /save (form body, "Authorization: LOW <access>:<secret>", "Accept: application/json")
// answers { url, job_id }; GET /save/status/<job_id> answers status pending, success
// (timestamp, original_url) or error (status_ext, message).
const SAVE = 'https://web.archive.org/save'
// A capture made in the last hour is returned instead of a new one, so a rerun does not
// capture the same page twice.
const RECAPTURE_WINDOW = '1h'
export const CAPTURE_SPACING_MS = 20_000
export const POLL_MS = 5_000
export const POLL_LIMIT_MS = 180_000
const REQUEST_TIMEOUT_MS = 30_000

export interface ArchiveKeys {
  access: string
  secret: string
}

export interface ArchiveOptions {
  http: Pick<Http, 'get'> // availability lookups and id_ downloads
  clock: Clock
  adapters: ReadonlyMap<string, Pick<Adapter, 'parse'>>
  candidates: readonly Candidate[]
  keys: ArchiveKeys | null // without keys no capture is requested
  fetch?: typeof fetch // Save Page Now 2 requests
  userAgent: string
}

// What happened to one evidence doc, for the run log. Never holds the keys.
export interface ArchiveAttempt {
  url: string // evidence doc
  records: number
  outcome: 'verified' | 'captured' | 'waiting'
  archiveUrl: string | null
  steps: string[]
}

// Records that still need a verified snapshot. A record gone from its source would never be in a
// new capture, so it is left alone.
export const needsArchive = (record: CheckRecord) =>
  record.evidence.archiveUrl === null && record.missingSince === undefined

const snapshotUrl = (timestamp: string, url: string) =>
  `https://web.archive.org/web/${timestamp}id_/${url}`

const message = (error: unknown) => (error as Error).message

const content = (x: { quote: string | null; speaker: string | null; label: string }) =>
  JSON.stringify([x.quote, x.speaker, x.label])

// Sets evidence.archiveUrl and evidence.sha256 on records whose evidence doc has a Wayback snapshot
// that parses to the same items (DATA-02, DATA-06). Records are returned in the same order;
// any failure leaves the record as it was, to be retried on the next run.
export async function archive(
  records: readonly CheckRecord[],
  options: ArchiveOptions,
): Promise<{ records: CheckRecord[]; attempts: ArchiveAttempt[] }> {
  const { http, clock, keys } = options
  const fetchFn = options.fetch ?? fetch
  let lastCapture = Number.NEGATIVE_INFINITY

  // Per evidence doc, the records to archive and the ones already archived. A record to archive
  // with the same quote as an archived one needs its own occurrence in the snapshot.
  const groups = new Map<string, CheckRecord[]>()
  const archived = new Map<string, CheckRecord[]>()
  for (const record of records) {
    if (record.missingSince !== undefined) continue
    const into = needsArchive(record) ? groups : archived
    const group = into.get(record.evidence.url) ?? []
    group.push(record)
    into.set(record.evidence.url, group)
  }

  // Timestamp of the closest snapshot the archive answered with HTTP 200, or null.
  const lookup = async (url: string, steps: string[]) => {
    try {
      const doc = await http.get(`${AVAILABLE}?url=${encodeURIComponent(url)}`)
      const closest = JSON.parse(doc.body)?.archived_snapshots?.closest
      if (!closest?.timestamp) {
        steps.push('lookup: no snapshot')
        return null
      }
      if (closest.status !== '200') {
        steps.push(`lookup: snapshot ${closest.timestamp} has status ${closest.status}, ignored`)
        return null
      }
      return String(closest.timestamp)
    } catch (error) {
      steps.push(`lookup: ${message(error)}`)
      return null
    }
  }

  // The snapshot's original bytes when every record parses out of them unchanged, else null.
  const verify = async (
    url: string,
    timestamp: string,
    group: CheckRecord[],
    adapter: Pick<Adapter, 'parse'>,
    steps: string[],
  ) => {
    let doc: Doc
    let items: ReturnType<Adapter['parse']>
    try {
      doc = await http.get(snapshotUrl(timestamp, url))
      items = adapter.parse([doc])
    } catch (error) {
      steps.push(`snapshot ${timestamp}: ${message(error)}`)
      return null
    }
    const found = items.map((item) => ({
      key: item.key,
      quote: cleanQuote(item.quote),
      speaker: resolveSpeaker(item.speakerRaw, options.candidates),
      label: item.label,
    }))
    // Keyless records with the same quote, speaker and label (the "#2" case) each need their own
    // occurrence: one snapshot item serves at most one record, archived records of the doc first.
    const left = new Map<string, number>()
    for (const item of found) left.set(content(item), (left.get(content(item)) ?? 0) + 1)
    const take = (record: CheckRecord) => {
      const n = left.get(content(record)) ?? 0
      left.set(content(record), n - 1)
      return n > 0
    }
    for (const record of archived.get(url) ?? []) if (record.key === null) take(record)
    const holds = (record: CheckRecord) =>
      record.key === null
        ? take(record)
        : found.some((item) => item.key === record.key && content(item) === content(record))
    const held = group.filter(holds).length
    if (held === group.length) {
      steps.push(`snapshot ${timestamp}: verified ${held} records`)
      return doc
    }
    steps.push(`snapshot ${timestamp}: ${held} of ${group.length} records, rejected`)
    return null
  }

  const spn = (url: string, init: RequestInit = {}) =>
    fetchFn(url, {
      ...init,
      headers: {
        ...init.headers,
        accept: 'application/json',
        authorization: `LOW ${keys?.access}:${keys?.secret}`,
        'user-agent': options.userAgent,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

  // Requests a capture and waits for it. Returns the new snapshot's timestamp, or null.
  const capture = async (url: string, steps: string[]) => {
    const wait = lastCapture + CAPTURE_SPACING_MS - clock.now()
    if (wait > 0) await clock.sleep(wait)
    lastCapture = clock.now()
    try {
      const response = await spn(SAVE, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ url, if_not_archived_within: RECAPTURE_WINDOW }).toString(),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.job_id) {
        steps.push(`capture: HTTP ${response.status}${body.message ? `, ${body.message}` : ''}`)
        return null
      }
      const deadline = clock.now() + POLL_LIMIT_MS
      while (clock.now() < deadline) {
        await clock.sleep(POLL_MS)
        const poll = await spn(`${SAVE}/status/${encodeURIComponent(body.job_id)}`)
        if (!poll.ok) continue
        const status = await poll.json()
        if (status.status === 'success' && status.timestamp) {
          steps.push(`capture: snapshot ${status.timestamp}`)
          return String(status.timestamp)
        }
        if (status.status === 'error') {
          steps.push(`capture: ${status.status_ext ?? 'error'}, ${status.message ?? ''}`.trim())
          return null
        }
      }
      steps.push(`capture: no result after ${POLL_LIMIT_MS / 1000} s`)
    } catch (error) {
      steps.push(`capture: ${message(error)}`)
    }
    return null
  }

  const attempts: ArchiveAttempt[] = []
  const verified = new Map<string, Doc>() // record id -> verified snapshot
  for (const [url, group] of groups) {
    const steps: string[] = []
    let outcome: ArchiveAttempt['outcome'] = 'waiting'
    let doc: Doc | null = null
    const kind = group[0].adapter.split('@')[0]
    const adapter = options.adapters.get(kind)
    if (!adapter) steps.push(`no adapter "${kind}" to verify a snapshot`)
    else {
      const found = await lookup(url, steps)
      if (found !== null) doc = await verify(url, found, group, adapter, steps)
      if (doc) outcome = 'verified'
      else if (!keys) steps.push('capture: skipped, no IA_S3_ACCESS / IA_S3_SECRET')
      else {
        const captured = await capture(url, steps)
        if (captured !== null) doc = await verify(url, captured, group, adapter, steps)
        if (doc) outcome = 'captured'
      }
    }
    if (doc) for (const record of group) verified.set(record.id, doc)
    attempts.push({ url, records: group.length, outcome, archiveUrl: doc?.url ?? null, steps })
  }

  return {
    records: records.map((record) => {
      const doc = verified.get(record.id)
      if (!doc) return record
      return {
        ...record,
        evidence: { ...record.evidence, archiveUrl: doc.url, sha256: doc.sha256 },
      }
    }),
    attempts,
  }
}
