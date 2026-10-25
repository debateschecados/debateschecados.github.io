import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { Config } from '../config.ts'
import { loadConfig } from '../config.ts'
import { type FreshItem, merge } from '../pipeline/merge.ts'
import { checksCsv, checksJson } from '../pipeline/write.ts'
import type { CheckRecord } from '../types.ts'

// One-off repair of the 2026-10-24 CI run (DRIFT-02). That run matched Estadão Globo items with
// rules that trusted keys, so 19 checks got new ids and one id moved to the other candidate. The
// fix replays the run with the current rules: the items Estadão published after the run against
// the records published before it.
export const SOURCE = 'estadao-globo-2026-10-23'
export const BEFORE = 'e13bac2'
export const AFTER = 'bc3a25d'
const DATE = '2026-10-24'

const ROOT = join(import.meta.dirname, '../..')
export const REPORT_FILE = join('repairs', '2026-10-24-estadao.json')

export interface RepairReport {
  source: string
  before: string
  after: string
  merged: { from: string; into: string }[]
  new: string[]
  missing: string[]
}

export class RepairError extends Error {}

const ofSource = (records: readonly CheckRecord[]) => records.filter((r) => r.sourceId === SOURCE)

const fresh = (record: CheckRecord): FreshItem => ({
  key: record.key,
  pos: record.pos,
  anchor: record.anchor,
  speaker: record.speaker,
  quote: record.quote,
  label: record.label,
  excerpt: record.excerpt,
  url: record.url,
  evidenceUrl: record.evidence.url,
  fetchedAt: record.evidence.fetchedAt,
})

// Returns the dataset with the source's records rebuilt and the report; `applied` is true when
// the current records of the source already are the repaired ones. Throws when they are
// neither those nor the ones the CI run wrote.
export function repair(
  before: readonly CheckRecord[],
  after: readonly CheckRecord[],
  current: readonly CheckRecord[],
  config: Pick<Config, 'bands' | 'outlets' | 'debates' | 'idLinks'>,
) {
  const own = ofSource(current)
  const others = current.filter((r) => r.sourceId !== SOURCE)
  const result = rebuild(before, ofSource(after), others, config)
  if (isDeepStrictEqual(own, ofSource(after))) return { ...result, applied: false }
  if (isDeepStrictEqual(own, ofSource(result.records))) return { ...result, applied: true }
  throw new RepairError(`${SOURCE} changed since the run of ${DATE}; nothing written`)
}

function rebuild(
  before: readonly CheckRecord[],
  written: readonly CheckRecord[],
  others: readonly CheckRecord[],
  config: Pick<Config, 'bands' | 'outlets' | 'debates' | 'idLinks'>,
) {
  const live = written.filter((r) => r.missingSince === undefined)
  const [first] = live
  if (!first) throw new RepairError(`${SOURCE} has no live record after the run`)
  const { records, events } = merge(
    [...others, ...ofSource(before)],
    [
      {
        sourceId: SOURCE,
        debate: first.debate,
        outlet: first.outlet,
        adapter: first.adapter,
        status: 'ok',
        items: live.map(fresh),
      },
    ],
    { ...config, date: DATE, acceptDrop: new Set() },
  )

  // A merged record takes the item's key and position, which identify it inside the source.
  const repaired = ofSource(records)
  const idOf = (item: CheckRecord) =>
    repaired.find((r) => r.key === item.key && r.pos === item.pos)?.id
  const merged = live
    .map((item) => ({ from: item.id, into: idOf(item) ?? item.id }))
    .filter(({ from, into }) => from !== into)
  const ids = (type: 'new' | 'missing') =>
    events.flatMap((e) => (e.type === type ? [e.id] : [])).toSorted()
  const report: RepairReport = {
    source: SOURCE,
    before: BEFORE,
    after: AFTER,
    merged: merged.toSorted((a, b) => (a.from < b.from ? -1 : 1)),
    new: ids('new'),
    missing: ids('missing'),
  }

  // Every other source passes through merge untouched; check it rather than trust it.
  const rest = records.filter((r) => r.sourceId !== SOURCE)
  if (!isDeepStrictEqual(rest, others))
    throw new RepairError('the repair changed records of other sources; nothing written')
  return { records, report }
}

const pinned = (commit: string) =>
  JSON.parse(
    execFileSync('git', ['show', `${commit}:data/checks.json`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  ) as CheckRecord[]

if (import.meta.main) {
  const dataDir = join(ROOT, 'data')
  const current = JSON.parse(await readFile(join(dataDir, 'checks.json'), 'utf8')) as CheckRecord[]
  const config = await loadConfig(join(ROOT, 'config'))
  try {
    const { records, report, applied } = repair(pinned(BEFORE), pinned(AFTER), current, config)
    if (applied) console.log(`${SOURCE}: the repair of ${DATE} is already applied; nothing written`)
    else {
      await writeFile(join(dataDir, 'checks.json'), checksJson(records))
      await writeFile(join(dataDir, 'checks.csv'), checksCsv(records))
      await mkdir(join(dataDir, 'repairs'), { recursive: true })
      await writeFile(join(dataDir, REPORT_FILE), `${JSON.stringify(report, null, 2)}\n`)
      console.log(
        `${SOURCE}: ${report.merged.length} ids merged, ${report.new.length} new, ${report.missing.length} missing; report in data/${REPORT_FILE}`,
      )
    }
  } catch (error) {
    if (!(error instanceof RepairError)) throw error
    console.error(error.message)
    process.exitCode = 1
  }
}
