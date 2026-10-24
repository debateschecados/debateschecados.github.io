import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { type Candidate, loadConfig } from '../config.ts'
import type { CheckRecord } from '../types.ts'

const ROOT = join(import.meta.dirname, '../..')

// What a curator sees of a record: no agency name, URL, label or band (CLAIM-03).
export interface BlindRecord {
  ref: string
  src: string // agency letter, assigned per debate
  quote: string
  excerpt: string
}

export interface BlindDebate {
  debate: string
  partitions: { speaker: string; records: BlindRecord[] }[]
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const byHash = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// Letters follow a hash of debate and outlet, so they say nothing about the agency and
// differ between debates; records follow a hash of their id, not the agency page order.
export function blindInput(
  records: readonly CheckRecord[],
  candidates: readonly Pick<Candidate, 'id' | 'number'>[],
): BlindDebate[] {
  const live = records.filter((r) => !r.missingSince)
  const speakers = candidates.toSorted((a, b) => a.number - b.number).map((c) => c.id)
  return [...new Set(live.map((r) => r.debate))].sort().map((debate) => {
    const inDebate = live.filter((r) => r.debate === debate)
    const letters = [...new Set(inDebate.map((r) => r.outlet))].sort((a, b) =>
      byHash(sha(debate + a), sha(debate + b)),
    )
    const partitions = speakers.map((speaker) => ({
      speaker,
      records: inDebate
        .filter((r) => r.speaker === speaker)
        .sort((a, b) => byHash(sha(a.id), sha(b.id)))
        .map((r) => ({
          ref: r.id,
          src: String.fromCharCode(65 + letters.indexOf(r.outlet)),
          quote: r.quote,
          excerpt: r.excerpt,
        })),
    }))
    return { debate, partitions: partitions.filter((p) => p.records.length > 0) }
  })
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      run: { type: 'string' },
      'data-dir': { type: 'string', default: join(ROOT, 'data') },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help || !values.run) {
    console.log(`Usage: node src/claims/blind.ts --run <yyyy-mm-dd> [--data-dir <dir>]

Writes the blind curation input to <data-dir>/claim-curation/<run>/input.json.`)
    if (!values.help) process.exitCode = 1
  } else {
    const dataDir = values['data-dir']
    const records = JSON.parse(
      await readFile(join(dataDir, 'checks.json'), 'utf8'),
    ) as CheckRecord[]
    const { candidates } = await loadConfig(join(ROOT, 'config'))
    const dir = join(dataDir, 'claim-curation', values.run)
    const path = join(dir, 'input.json')
    await mkdir(dir, { recursive: true })
    // A committed run is an audit trail: never overwrite it.
    try {
      await writeFile(path, `${JSON.stringify(blindInput(records, candidates), null, 2)}\n`, {
        flag: 'wx',
      })
      console.log(`Blind input written to ${path}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      console.error(`${path} already exists; pick another run name`)
      process.exitCode = 1
    }
  }
}
