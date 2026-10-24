import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { CheckRecord } from '../types.ts'

export const GROUPS_FILE = 'claim-groups.json'
export const MAX_CLAIM = 120

const groupSchema = z.object({
  id: z.string(),
  debate: z.string(),
  speaker: z.string(),
  claim: z.string(),
  records: z.array(z.string()),
  origin: z.enum(['unanimous', 'adjudicated', 'manual']),
})

const fileSchema = z.object({
  run: z.string().nullable(),
  groups: z.array(groupSchema),
})

export type ClaimGroup = z.infer<typeof groupSchema>
export type ClaimGroupsFile = z.infer<typeof fileSchema>

export class ClaimsError extends Error {
  name = 'ClaimsError'
}

// Stable while membership is stable, so an issue can cite it.
export const groupId = (records: readonly string[]) =>
  `c${createHash('sha256')
    .update([...records].sort().join(','))
    .digest('hex')
    .slice(0, 8)}`

// One "<group id>: <rule>" message per broken CLAIM-02 rule, in file order.
export function checkGroups(file: ClaimGroupsFile, records: readonly CheckRecord[]) {
  const byId = new Map(records.map((r) => [r.id, r]))
  const owner = new Map<string, number>() // record id -> index of its first group
  const messages: string[] = []
  for (const [index, group] of file.groups.entries()) {
    const broken = (rule: string) => messages.push(`${group.id}: ${rule}`)
    const outlets = new Set<string>()
    if (group.records.length < 2) broken('fewer than 2 records')
    for (const id of group.records) {
      const record = byId.get(id)
      if (!record) {
        broken(`unknown record "${id}"`)
        continue
      }
      if (record.debate !== group.debate)
        broken(`record "${id}" is from debate "${record.debate}", not "${group.debate}"`)
      if (record.speaker !== group.speaker)
        broken(`record "${id}" is from speaker "${record.speaker}", not "${group.speaker}"`)
      if (outlets.has(record.outlet)) broken(`agency "${record.outlet}" appears more than once`)
      outlets.add(record.outlet)
      // By index, not id: a group listed twice has the same id both times.
      const other = owner.get(id)
      if (other !== undefined && other !== index)
        broken(`record "${id}" is also in group ${file.groups[other].id}`)
      owner.set(id, other ?? index)
    }
    if (group.claim.trim() === '') broken('claim is empty')
    else if (group.claim.length > MAX_CLAIM)
      broken(`claim has ${group.claim.length} characters, more than ${MAX_CLAIM}`)
    const expected = groupId(group.records)
    if (group.id !== expected) broken(`id does not match its records, expected ${expected}`)
  }
  return messages
}

const fail = (path: PropertyKey[], message: string): never => {
  throw new ClaimsError(`${GROUPS_FILE}: ${path.join('.') || '(root)'}: ${message}`)
}

// A missing file means no curation yet: no groups, every live record pending.
export async function loadGroups(
  dataDir: string,
  records: readonly CheckRecord[],
): Promise<ClaimGroupsFile> {
  let text: string
  try {
    text = await readFile(join(dataDir, GROUPS_FILE), 'utf8')
  } catch {
    return { run: null, groups: [] }
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return fail([], `invalid JSON (${(error as Error).message})`)
  }
  const result = fileSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    return fail(issue.path, issue.message)
  }
  const messages = checkGroups(result.data, records)
  if (messages.length > 0) throw new ClaimsError(`${GROUPS_FILE}:\n${messages.join('\n')}`)
  return result.data
}
