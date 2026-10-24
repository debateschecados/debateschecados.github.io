import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import type { CheckRecord } from '../types.ts'
import type { BlindDebate } from './blind.ts'
import { consensus, knownRefs, sanitize } from './consensus.ts'
import {
  type ClaimGroup,
  type ClaimGroupsFile,
  checkGroups,
  GROUPS_FILE,
  groupId,
  loadGroups,
} from './groups.ts'

const ROOT = join(import.meta.dirname, '../..')
const CURATORS = 3

const curatorGroup = z.object({
  speaker: z.string(),
  refs: z.array(z.string()),
  claim: z.string(),
})

const schemas = {
  input: z.array(
    z.object({
      debate: z.string(),
      partitions: z.array(
        z.object({
          speaker: z.string(),
          records: z.array(
            z.object({ ref: z.string(), src: z.string(), quote: z.string(), excerpt: z.string() }),
          ),
        }),
      ),
    }),
  ),
  curator: z.object({ groups: z.array(curatorGroup) }),
  judge: z.object({
    components: z.array(
      z.object({ component: z.number(), speaker: z.string(), refs: z.array(z.string()) }),
    ),
    decisions: z.array(
      z.object({ component: z.number(), groups: z.array(curatorGroup), reason: z.string() }),
    ),
  }),
  claims: z.object({
    claims: z.array(z.object({ id: z.string(), claim: z.string(), refs: z.array(z.string()) })),
  }),
  review: z.object({
    rewrites: z.array(z.object({ id: z.string(), claim: z.string(), refs: z.array(z.string()) })),
  }),
  manual: z.object({
    edits: z.array(
      z.object({
        from: z.array(z.string()).min(2).nullable(),
        to: z.object({ records: z.array(z.string()).min(2), claim: z.string() }).nullable(),
        reason: z.string().trim().min(1),
      }),
    ),
  }),
}

async function readJson<S extends keyof typeof schemas>(
  dir: string,
  file: string,
  schema: S,
): Promise<z.infer<(typeof schemas)[S]>> {
  const result = schemas[schema].safeParse(JSON.parse(await readFile(join(dir, file), 'utf8')))
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(`${file}: ${issue.path.join('.') || '(root)'}: ${issue.message}`)
  }
  return result.data as z.infer<(typeof schemas)[S]>
}

const key = (refs: readonly string[]) => refs.toSorted().join(',')
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

interface Draft {
  debate: string
  speaker: string
  refs: string[]
  origin: ClaimGroup['origin']
  claims: string[] // candidate sentences, the first one is the fallback
}

export interface ManualChange {
  removed: string | null // group id
  added: string | null // group id
  reason: string
}

// Unanimous and adjudicated groups of one debate, as the workflow formed them.
async function debateGroups(dir: string, files: string[], debate: BlindDebate) {
  const known = knownRefs(debate)
  const curatorFiles = files
    .map((file) => [file, file.match(/^curator-(.+)-(\d+)\.json$/)] as const)
    .filter(([, match]) => match?.[1] === debate.debate)
    .sort(([, a], [, b]) => Number(a?.[2]) - Number(b?.[2]))
  const runs = await Promise.all(
    curatorFiles.map(async ([file]) =>
      sanitize(known, (await readJson(dir, file, 'curator')).groups),
    ),
  )
  const { settled, disputed } = consensus(runs, CURATORS)
  const drafts: Draft[] = settled.map((s) => ({
    debate: debate.debate,
    speaker: s.speaker,
    refs: s.refs,
    origin: 'unanimous',
    claims: s.curatorClaims,
  }))

  // No judge file means the judge did not run or failed: disputed components stay ungrouped.
  const judgeFile = `judge-${debate.debate}.json`
  if (disputed.length === 0 || !files.includes(judgeFile)) return drafts
  const judge = await readJson(dir, judgeFile, 'judge')
  for (const decision of judge.decisions) {
    const shown = judge.components.find((c) => c.component === decision.component)
    // Matched by refs, not index: the workflow's component order depends on map iteration.
    const component = disputed.find((d) => shown && key(d.refs) === key(shown.refs))
    if (!shown || !component)
      throw new Error(`${judgeFile}: component ${decision.component} is not a disputed component`)
    const inside = new Set(component.refs)
    const groups = decision.groups.map((g) => ({
      ...g,
      speaker: component.speaker,
      refs: g.refs.filter((r) => inside.has(r)),
    }))
    for (const g of sanitize(known, groups))
      drafts.push({
        debate: debate.debate,
        speaker: g.speaker,
        refs: g.refs,
        origin: 'adjudicated',
        claims: [g.claim, ...component.proposals.flat().map((p) => p.claim)],
      })
  }
  return drafts
}

// data/claim-curation/<run>/ -> the claim groups file, deterministically (REPRO-01).
export async function assemble(
  runDir: string,
): Promise<{ file: ClaimGroupsFile; manual: ManualChange[] }> {
  const files = await readdir(runDir)
  const input = (await readJson(runDir, 'input.json', 'input')) as BlindDebate[]
  const drafts = (await Promise.all(input.map((d) => debateGroups(runDir, files, d)))).flat()

  const editor = await readJson(runDir, 'editor.json', 'claims')
  const review = await readJson(runDir, 'review.json', 'review')
  const edited = new Map(editor.claims.map((c) => [key(c.refs), c.claim]))
  const rewritten = new Map(review.rewrites.map((r) => [key(r.refs), r.claim]))
  const groups = drafts.map(({ debate, speaker, refs, origin, claims }) => {
    const claim = rewritten.get(key(refs)) ?? edited.get(key(refs)) ?? claims[0]
    return { debate, speaker, refs, origin, claim }
  })

  const manual: ManualChange[] = []
  const { edits } = files.includes('manual.json')
    ? await readJson(runDir, 'manual.json', 'manual')
    : { edits: [] }
  edits.forEach(({ from, to, reason }, i) => {
    let removed: string | null = null
    if (from) {
      const at = groups.findIndex((g) => key(g.refs) === key(from))
      if (at < 0) throw new Error(`manual.json: edit ${i}: no group has the records ${key(from)}`)
      groups.splice(at, 1)
      removed = groupId(from)
    }
    let added: string | null = null
    if (to) {
      const debate = input.find((d) =>
        d.partitions.some((p) => p.records.some((r) => r.ref === to.records[0])),
      )
      const speaker = debate?.partitions.find((p) => p.records.some((r) => r.ref === to.records[0]))
      if (!debate || !speaker)
        throw new Error(`manual.json: edit ${i}: record ${to.records[0]} is not in the run input`)
      const refs = to.records.toSorted()
      groups.push({
        debate: debate.debate,
        speaker: speaker.speaker,
        refs,
        origin: 'manual',
        claim: to.claim,
      })
      added = groupId(refs)
    }
    manual.push({ removed, added, reason })
  })

  const out: ClaimGroup[] = groups
    .map((g) => ({
      id: groupId(g.refs),
      debate: g.debate,
      speaker: g.speaker,
      claim: g.claim,
      records: g.refs.toSorted(),
      origin: g.origin,
    }))
    .sort(
      (a, b) => compare(a.debate, b.debate) || compare(a.speaker, b.speaker) || compare(a.id, b.id),
    )
  return { file: { run: basename(runDir), groups: out }, manual }
}

// Group ids whose content differs between two files, in either direction.
const differing = (a: ClaimGroupsFile, b: ClaimGroupsFile) => {
  const byId = (file: ClaimGroupsFile) => new Map(file.groups.map((g) => [g.id, JSON.stringify(g)]))
  const left = byId(a)
  const right = byId(b)
  return [...new Set([...left.keys(), ...right.keys()])].filter(
    (id) => left.get(id) !== right.get(id),
  )
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      check: { type: 'boolean', default: false },
      'data-dir': { type: 'string', default: join(ROOT, 'data') },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    console.log(`Usage: node src/claims/assemble.ts [run] [--check] [--data-dir <dir>]

Assembles <data-dir>/claim-curation/<run>/ (default: the latest run) into
<data-dir>/${GROUPS_FILE}. With --check, recomputes the groups and exits 1 if the
committed file differs (REPRO-01); every manual change is listed with its reason.`)
  } else {
    const dataDir = values['data-dir']
    const curation = join(dataDir, 'claim-curation')
    const run = positionals[0] ?? (await readdir(curation)).sort().at(-1)
    if (!run) throw new Error(`no curation run in ${curation}`)
    const { file, manual } = await assemble(join(curation, run))
    const records = JSON.parse(
      await readFile(join(dataDir, 'checks.json'), 'utf8'),
    ) as CheckRecord[]

    // REPRO-02: every manual change is printed, so a reviewer sees what the agents did not decide.
    if (manual.length > 0) console.log('Manual changes:')
    for (const { added, removed, reason } of manual) {
      const replaces = added && removed ? ` (replaces ${removed})` : ''
      console.log(`  ${added ?? `${removed} removed`}: ${reason}${replaces}`)
    }
    const broken = checkGroups(file, records)
    if (broken.length > 0) {
      console.error(`Run ${run} gives invalid groups:\n${broken.join('\n')}`)
      process.exitCode = 1
    } else if (values.check) {
      const committed = await loadGroups(dataDir, records)
      const ids = differing(file, committed)
      if (committed.run !== file.run || ids.length > 0) {
        console.error(
          `${GROUPS_FILE} differs from run ${run}${committed.run !== file.run ? ` (file run: ${committed.run})` : ''}:\n${ids.join('\n')}`,
        )
        process.exitCode = 1
      } else console.log(`${GROUPS_FILE} matches run ${run}.`)
    } else {
      await writeFile(join(dataDir, GROUPS_FILE), `${JSON.stringify(file, null, 2)}\n`)
      console.log(`${file.groups.length} groups from run ${run} written to ${GROUPS_FILE}`)
    }
  }
}
