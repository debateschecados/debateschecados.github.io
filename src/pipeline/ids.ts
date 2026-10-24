import { createHash } from 'node:crypto'
import type { DuplicateItem } from '../types.ts'
import { quoteKey } from './normalize.ts'

// First 12 hex chars of SHA-256("<sourceId>|<key>"). Assigned once, never recomputed (INGEST-04).
export const recordId = (sourceId: string, key: string) =>
  createHash('sha256').update(`${sourceId}|${key}`).digest('hex').slice(0, 12)

// Ids for a source without item keys: "<quoteKey>#<n>", where n counts identical quotes in the
// source. Every repeat (n >= 2) is reported as a duplicate.
export function keylessIds(
  sourceId: string,
  items: readonly { pos: number; quote: string }[],
): { ids: string[]; duplicates: DuplicateItem[] } {
  const seen = new Map<string, number>()
  const duplicates: DuplicateItem[] = []
  const ids = items.map((item) => {
    const key = quoteKey(item.quote)
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    if (n > 1) duplicates.push({ pos: item.pos, quote: item.quote, n })
    return recordId(sourceId, `${key}#${n}`)
  })
  return { ids, duplicates }
}
