import type { Bands, Debate, IdLinks, Outlet } from '../config.ts'
import type { CheckRecord, HistoryEntry, SourceStatus } from '../types.ts'
import { keylessIds, recordId } from './ids.ts'
import { bandFor, quoteKey, tokens } from './normalize.ts'

const PARTIAL_RATIO = 0.8
const PARTIAL_MIN_PREVIOUS = 5
const JACCARD_MIN = 0.6

// An item after normalize: speaker resolved, quote cleaned, excerpt cut.
export interface FreshItem {
  key: string | null
  pos: number
  anchor: string | null
  speaker: string
  quote: string
  label: string
  excerpt: string
  url: string // where a reader checks it
  evidenceUrl: string // doc the item was parsed from
  fetchedAt: string // fetch of that doc
}

export interface SourceResult {
  sourceId: string
  debate: string
  outlet: string
  adapter: string // "<kind>@<version>"
  status: 'ok' | 'failed'
  reason?: string
  items: FreshItem[]
}

export interface MergeContext {
  date: string // detection date for history and missingSince
  bands: Bands
  outlets: Readonly<Record<string, Pick<Outlet, 'name'>>>
  debates: readonly Pick<Debate, 'id' | 'date'>[]
  idLinks: IdLinks
  acceptDrop: ReadonlySet<string>
}

export type MergeEvent =
  | { type: 'source'; sourceId: string; status: SourceStatus; reason: string | null }
  | { type: 'new' | 'changed' | 'missing' | 'returned'; sourceId: string; id: string }

const collator = new Intl.Collator('pt-BR')
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const jaccard = (a: Set<string>, b: Set<string>) => {
  let shared = 0
  for (const word of a) if (b.has(word)) shared++
  const union = a.size + b.size - shared
  return union === 0 ? 0 : shared / union
}

// Pairs fresh item index -> previous record, following design steps 3.1 to 3.4.
function match(
  previous: readonly CheckRecord[],
  items: readonly FreshItem[],
  links: Readonly<Record<string, string>>,
) {
  const matched = new Map<number, CheckRecord>()
  const used = new Set<CheckRecord>()
  const pair = (i: number, record: CheckRecord) => {
    matched.set(i, record)
    used.add(record)
  }
  const free = (filter: (r: CheckRecord) => boolean) =>
    previous.filter((r) => !used.has(r) && filter(r))

  items.forEach((item, i) => {
    if (item.key === null) return
    const record = free((r) => r.key === item.key)[0]
    if (record) pair(i, record)
  })

  const keyless = items.flatMap((item, i) => (item.key === null ? [i] : []))
  for (const i of keyless) {
    const key = quoteKey(items[i].quote)
    const record = free((r) => r.key === null && quoteKey(r.quote) === key)[0]
    if (record) pair(i, record)
  }

  const candidates: { i: number; record: CheckRecord; score: number }[] = []
  for (const i of keyless) {
    if (matched.has(i)) continue
    const words = tokens(items[i].quote)
    for (const record of free((r) => r.key === null && r.speaker === items[i].speaker)) {
      const score = jaccard(words, tokens(record.quote))
      if (score >= JACCARD_MIN) candidates.push({ i, record, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.i - b.i || a.record.pos - b.record.pos)
  for (const { i, record } of candidates) {
    if (!matched.has(i) && !used.has(record)) pair(i, record)
  }

  for (const i of keyless) {
    if (matched.has(i)) continue
    const id = links[quoteKey(items[i].quote)]
    const record = id === undefined ? undefined : free((r) => r.id === id)[0]
    if (record) pair(i, record)
  }

  return matched
}

// Applies a matched item to its record. Returns the same object when nothing changed.
function update(record: CheckRecord, item: FreshItem, adapter: string, date: string) {
  const old: Omit<HistoryEntry, 'until'> = {}
  if (item.label !== record.label) old.label = record.label
  if (item.quote !== record.quote) old.quote = record.quote
  if (item.speaker !== record.speaker) old.speaker = record.speaker
  const verifiedChanged = Object.keys(old).length > 0 || item.evidenceUrl !== record.evidence.url
  const silentChanged =
    item.pos !== record.pos ||
    item.anchor !== record.anchor ||
    item.excerpt !== record.excerpt ||
    item.url !== record.url
  const changed = verifiedChanged || silentChanged
  if (!changed && record.missingSince === undefined) return { next: record, changed }

  const { missingSince: _, ...rest } = record
  const next: CheckRecord = {
    ...rest,
    pos: item.pos,
    anchor: item.anchor,
    speaker: item.speaker,
    quote: item.quote,
    label: item.label,
    excerpt: item.excerpt,
    url: item.url,
  }
  if (changed) {
    next.adapter = adapter
    // A snapshot only proves the content it was verified against.
    next.evidence = verifiedChanged
      ? { url: item.evidenceUrl, fetchedAt: item.fetchedAt, archiveUrl: null, sha256: null }
      : { ...record.evidence, fetchedAt: item.fetchedAt }
  }
  if (Object.keys(old).length > 0)
    next.history = [...(record.history ?? []), { ...old, until: date }]
  return { next, changed }
}

function mergeSource(
  previous: readonly CheckRecord[],
  result: SourceResult,
  ctx: MergeContext,
  events: MergeEvent[],
): CheckRecord[] {
  const { sourceId } = result
  const source = (status: SourceStatus, reason: string | null) =>
    events.push({ type: 'source', sourceId, status, reason })

  if (result.status === 'failed' || result.items.length === 0) {
    source('failed', result.reason ?? 'no items')
    return [...previous]
  }
  const active = previous.filter((r) => r.missingSince === undefined).length
  if (
    active >= PARTIAL_MIN_PREVIOUS &&
    result.items.length < active * PARTIAL_RATIO &&
    !ctx.acceptDrop.has(sourceId)
  ) {
    source('partial', `${result.items.length} items, ${active} published`)
    return [...previous]
  }
  source('ok', null)

  const matched = match(previous, result.items, ctx.idLinks[sourceId] ?? {})
  const taken = new Set(previous.map((r) => r.id))
  const keyless = keylessIds(sourceId, result.items).ids
  const records: CheckRecord[] = []

  result.items.forEach((item, i) => {
    const record = matched.get(i)
    if (record) {
      const { next, changed } = update(record, item, result.adapter, ctx.date)
      if (record.missingSince !== undefined)
        events.push({ type: 'returned', sourceId, id: record.id })
      if (changed) events.push({ type: 'changed', sourceId, id: record.id })
      records.push(next)
      return
    }
    let id = item.key === null ? keyless[i] : recordId(sourceId, item.key)
    // A new keyless item can hash to the id of a record it did not match; take the next #n.
    for (let n = 2; taken.has(id); n++) id = recordId(sourceId, `${quoteKey(item.quote)}#${n}`)
    taken.add(id)
    events.push({ type: 'new', sourceId, id })
    records.push({
      id,
      sourceId,
      debate: result.debate,
      outlet: result.outlet,
      key: item.key,
      pos: item.pos,
      anchor: item.anchor,
      speaker: item.speaker,
      quote: item.quote,
      label: item.label,
      band: 'sem faixa', // set in the band pass
      excerpt: item.excerpt,
      url: item.url,
      adapter: result.adapter,
      evidence: {
        url: item.evidenceUrl,
        fetchedAt: item.fetchedAt,
        archiveUrl: null,
        sha256: null,
      },
    })
  })

  const kept = new Set(matched.values())
  for (const record of previous) {
    if (kept.has(record)) continue
    if (record.missingSince !== undefined) {
      records.push(record)
      continue
    }
    events.push({ type: 'missing', sourceId, id: record.id })
    records.push({ ...record, missingSince: ctx.date })
  }
  return records
}

// Merges this run's results with the published records, one source at a time (design "Merger").
export function merge(
  previous: readonly CheckRecord[],
  fresh: readonly SourceResult[],
  ctx: MergeContext,
): { records: CheckRecord[]; events: MergeEvent[] } {
  const events: MergeEvent[] = []
  const bySource = new Map<string, CheckRecord[]>()
  for (const record of previous) {
    const list = bySource.get(record.sourceId) ?? []
    list.push(record)
    bySource.set(record.sourceId, list)
  }

  const merged: CheckRecord[] = []
  const done = new Set<string>()
  for (const result of fresh) {
    done.add(result.sourceId)
    merged.push(...mergeSource(bySource.get(result.sourceId) ?? [], result, ctx, events))
  }
  for (const [sourceId, records] of bySource) if (!done.has(sourceId)) merged.push(...records)

  const records = merged.map((record) => {
    const band = bandFor(ctx.bands, record.outlet, record.label)
    return band === record.band ? record : { ...record, band }
  })

  const dates = new Map(ctx.debates.map((d) => [d.id, d.date]))
  const outletName = (id: string) => ctx.outlets[id]?.name ?? id
  records.sort(
    (a, b) =>
      cmp(dates.get(b.debate) ?? '', dates.get(a.debate) ?? '') ||
      collator.compare(outletName(a.outlet), outletName(b.outlet)) ||
      a.pos - b.pos ||
      cmp(a.sourceId, b.sourceId) ||
      cmp(a.id, b.id),
  )
  return { records, events }
}
