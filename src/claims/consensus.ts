// Port of the consensus in data/claim-curation/2026-10-24/workflow.js, so a committed run can
// be recomputed and tested without the workflow runtime.
import type { BlindDebate } from './blind.ts'

export interface CuratorGroup {
  speaker: string
  refs: string[]
  claim: string
}

export interface Proposal {
  refs: string[]
  claim: string
}

export interface Settled {
  speaker: string
  refs: string[]
  curatorClaims: string[] // one per curator, in curator order
}

export interface Disputed {
  speaker: string
  refs: string[]
  proposals: Proposal[][] // per curator, its groups restricted to the component
}

// speaker -> ref -> agency letter, for one debate.
export type Known = ReadonlyMap<string, ReadonlyMap<string, string>>

export const knownRefs = (debate: BlindDebate): Known =>
  new Map(debate.partitions.map((p) => [p.speaker, new Map(p.records.map((r) => [r.ref, r.src]))]))

// SPEC_DEVIATION: design.md keys srcOf by ref only; this takes speaker -> ref -> letter.
// Reason: the workflow checks each group's refs against its own speaker's partition.
// Drops refs unknown to the group's speaker or already used by an earlier group, then
// groups left with fewer than 2 refs or with a repeated agency letter.
export function sanitize(
  known: Known,
  groups: readonly CuratorGroup[],
  log: (message: string) => void = () => {},
): CuratorGroup[] {
  const used = new Set<string>()
  const out: CuratorGroup[] = []
  for (const group of groups) {
    const partition = known.get(group.speaker)
    const refs = [...new Set(group.refs)].filter((r) => partition?.has(r) && !used.has(r))
    const letters = refs.map((r) => partition?.get(r))
    if (refs.length < 2) {
      if (group.refs.length >= 2)
        log(`dropped group with unknown or reused refs (${group.refs.join(',')})`)
      continue
    }
    if (new Set(letters).size !== letters.length) {
      log(`dropped group with repeated agency (${refs.join(',')})`)
      continue
    }
    for (const r of refs) used.add(r)
    out.push({ speaker: group.speaker, refs: refs.sort(), claim: group.claim })
  }
  return out
}

const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

// Components are connected sets over every pair any curator linked. A component is settled
// only when every pair inside it got `expected` votes, which needs `expected` runs; anything
// else goes to the judge with each curator's proposal.
export function consensus(runs: readonly CuratorGroup[][], expected = 3) {
  const votes = new Map<string, number>()
  const parent = new Map<string, string>()
  const find = (ref: string) => {
    let root = ref
    while (parent.get(root) !== root) root = parent.get(root) as string
    return root
  }
  for (const groups of runs) {
    for (const { refs } of groups) {
      for (const r of refs) if (!parent.has(r)) parent.set(r, r)
      for (let i = 0; i < refs.length; i++)
        for (let j = i + 1; j < refs.length; j++) {
          const key = pair(refs[i], refs[j])
          votes.set(key, (votes.get(key) ?? 0) + 1)
          parent.set(find(refs[i]), find(refs[j]))
        }
    }
  }
  const components = new Map<string, string[]>()
  for (const r of parent.keys()) {
    const root = find(r)
    components.set(root, [...(components.get(root) ?? []), r])
  }

  const settled: Settled[] = []
  const disputed: Disputed[] = []
  for (const members of components.values()) {
    members.sort()
    const inside = new Set(members)
    const unanimous =
      runs.length === expected &&
      members.every((a, i) =>
        members.slice(i + 1).every((b) => (votes.get(pair(a, b)) ?? 0) === expected),
      )
    const proposals = runs.map((groups) =>
      groups
        .filter((g) => g.refs.some((r) => inside.has(r)))
        .map((g) => ({ refs: g.refs.filter((r) => inside.has(r)), claim: g.claim })),
    )
    const speaker = runs.flat().find((g) => g.refs.includes(members[0]))?.speaker as string
    if (unanimous)
      settled.push({ speaker, refs: members, curatorClaims: proposals.flat().map((p) => p.claim) })
    else disputed.push({ speaker, refs: members, proposals })
  }
  return { settled, disputed }
}
