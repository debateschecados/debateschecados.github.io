export const meta = {
  name: 'curate-claim-groups',
  description: 'Blind multi-agent grouping of agency fact-checks into shared claims, with adjudication and neutral claim wording',
  phases: [
    { title: 'Curate', detail: '3 blind curators per debate' },
    { title: 'Adjudicate', detail: 'one judge per debate, only for disputed components' },
    { title: 'Word', detail: 'editor writes one neutral claim sentence per group' },
    { title: 'Review', detail: 'neutrality and grouping reviewer' },
  ],
}

const INPUT = args.input
const SRC = args.src
const DEBATES = Object.keys(SRC)
const CURATORS = 3

const GROUPS_SCHEMA = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string', enum: ['lula', 'flavio'] },
          refs: { type: 'array', items: { type: 'string' }, minItems: 2 },
          claim: { type: 'string' },
        },
        required: ['speaker', 'refs', 'claim'],
      },
    },
  },
  required: ['groups'],
}

const RULES = `Context: the input file holds fact-checks that four Brazilian fact-checking agencies published about statements made in one presidential debate. Agency names are replaced by letters (src A, B, C, D) and the verdict labels are removed on purpose, so grouping cannot be influenced by who checked or what they concluded. Each record has: ref (opaque id), src (agency letter), quote (the candidate's statement as the agency quoted it), excerpt (start of the agency's explanation, which shows WHAT the agency actually evaluated).

Blindness rule: read ONLY the input file named below. Do not open any other file, do not search the repository, do not use the web. You must not learn which agency is which or what the verdicts were.

A group = records from DIFFERENT agencies that evaluate the SAME factual claim made by the candidate.
- Same claim means the same assertion is being evaluated: same number, same fact, same event. Same topic is not enough (two checks about hunger that evaluate different numbers are different claims).
- Agencies split compound statements differently. If one sentence holds two assertions (e.g. "the TCU just released a report" and "there are 11,500 stalled works"), records evaluating different parts belong to different groups, even when the quotes are almost identical. Use the excerpt to decide what each record evaluated.
- A record that evaluates a whole compound statement goes in the group of the assertion its excerpt mainly addresses. If it addresses several equally, leave it out of every group.
- Each group has at least 2 records, every record in it has a different src, all records share the speaker, and a record appears in at most one group.
- Records checked by only one agency are simply not in any group. Do not force groupings.

For each group also write "claim": one sentence in Brazilian Portuguese, at most 120 characters, stating the candidate's assertion as the candidate made it (e.g. "Relatório recente do TCU aponta mais de 11,5 mil obras paradas"). No verdict words (falso, verdadeiro, enganoso, exagerado, correto, errado), no "segundo o candidato", no adjectives that judge, no information the candidate did not say.`

const recordsOf = (debate, speaker) => SRC[debate]?.[speaker] ?? {}

// Drops refs that do not exist in the partition and groups that break the rules.
function sanitize(debate, groups, who) {
  const used = new Set()
  const out = []
  for (const g of groups ?? []) {
    const known = recordsOf(debate, g.speaker)
    const refs = [...new Set(g.refs)].filter((r) => known[r] && !used.has(r))
    const srcs = refs.map((r) => known[r])
    if (refs.length < 2) {
      if (g.refs.length >= 2) log(`${who}: dropped group with unknown or reused refs (${g.refs.join(',')})`)
      continue
    }
    if (new Set(srcs).size !== srcs.length) {
      log(`${who}: dropped group with repeated agency (${refs.join(',')})`)
      continue
    }
    refs.forEach((r) => used.add(r))
    out.push({ speaker: g.speaker, refs: refs.sort(), claim: g.claim })
  }
  return out
}

const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

// Components over every pair any curator voted for; settled only when all curators formed it identically.
function consensus(debate, curated) {
  const votes = new Map()
  const parent = new Map()
  const find = (x) => {
    while (parent.get(x) !== x) x = parent.get(x)
    return x
  }
  for (const groups of curated) {
    for (const g of groups) {
      for (const r of g.refs) if (!parent.has(r)) parent.set(r, r)
      for (let i = 0; i < g.refs.length; i++)
        for (let j = i + 1; j < g.refs.length; j++) {
          const k = pair(g.refs[i], g.refs[j])
          votes.set(k, (votes.get(k) ?? 0) + 1)
          parent.set(find(g.refs[i]), find(g.refs[j]))
        }
    }
  }
  const comps = new Map()
  for (const r of parent.keys()) {
    const root = find(r)
    if (!comps.has(root)) comps.set(root, [])
    comps.get(root).push(r)
  }
  const settled = []
  const disputed = []
  for (const members of comps.values()) {
    members.sort()
    let unanimous = curated.length === CURATORS
    for (let i = 0; i < members.length && unanimous; i++)
      for (let j = i + 1; j < members.length; j++)
        if ((votes.get(pair(members[i], members[j])) ?? 0) !== CURATORS) {
          unanimous = false
          break
        }
    const proposals = curated.map((groups) =>
      groups.filter((g) => g.refs.some((r) => members.includes(r))).map((g) => ({ refs: g.refs.filter((r) => members.includes(r)), claim: g.claim })),
    )
    const speaker = curated.flat().find((g) => g.refs.includes(members[0])).speaker
    if (unanimous) settled.push({ debate, speaker, refs: members, origin: 'unanimous', curatorClaims: proposals.flat().map((p) => p.claim) })
    else disputed.push({ debate, speaker, refs: members, proposals })
  }
  return { settled, disputed, pairs: votes.size }
}

const ADJ_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          component: { type: 'integer' },
          groups: GROUPS_SCHEMA.properties.groups,
          reason: { type: 'string' },
        },
        required: ['component', 'groups', 'reason'],
      },
    },
  },
  required: ['decisions'],
}

const results = await pipeline(
  DEBATES,
  async (debate) => {
    const runs = await parallel(
      Array.from({ length: CURATORS }, (_, i) => () =>
        agent(
          `You are curator ${i + 1} of ${CURATORS}, working independently.\n\n${RULES}\n\nInput file: ${INPUT}. It is a JSON array of debates; work ONLY on the debate "${debate}" (both of its speaker partitions, lula and flavio, kept separate). Read every record of that debate before grouping. Return every group you find for both speakers.`,
          { label: `curate:${debate}:${i + 1}`, phase: 'Curate', schema: GROUPS_SCHEMA },
        ),
      ),
    )
    const curated = runs.filter(Boolean).map((r, i) => sanitize(debate, r.groups, `curator ${i + 1} ${debate}`))
    if (curated.length < CURATORS) log(`${debate}: only ${curated.length} curators returned; every component goes to the judge`)
    const c = consensus(debate, curated)
    log(`${debate}: ${c.settled.length} unanimous groups, ${c.disputed.length} disputed components`)
    return c
  },
  async (c, debate) => {
    if (!c.disputed.length) return c.settled
    const listing = c.disputed
      .map((d, i) => `Component ${i} (speaker ${d.speaker}, refs ${d.refs.join(', ')}):\n${d.proposals.map((p, k) => `  curator ${k + 1}: ${p.length ? p.map((g) => `[${g.refs.join(', ')}] "${g.claim}"`).join('; ') : 'no group with these refs'}`).join('\n')}`)
      .join('\n\n')
    const res = await agent(
      `You are the judge. Three independent curators grouped fact-checks of the debate "${debate}" and disagreed on the components below. Decide the final grouping of each component's refs.\n\n${RULES}\n\nInput file: ${INPUT} (debate "${debate}"). Read the records of every ref listed below, quote and excerpt, before deciding. Curator majority is evidence, not a rule: decide on what each excerpt actually evaluates.\n\n${listing}\n\nFor every component return a decision: its index, the final groups made only of that component's refs (an empty list when none of them check the same claim), and a one-sentence reason.`,
      { label: `judge:${debate}`, phase: 'Adjudicate', schema: ADJ_SCHEMA },
    )
    const judged = []
    for (const d of res?.decisions ?? []) {
      const comp = c.disputed[d.component]
      if (!comp) continue
      const inside = d.groups.map((g) => ({ ...g, speaker: comp.speaker, refs: g.refs.filter((r) => comp.refs.includes(r)) }))
      for (const g of sanitize(debate, inside, `judge ${debate}`))
        judged.push({ debate, speaker: g.speaker, refs: g.refs, origin: 'adjudicated', reason: d.reason, curatorClaims: [g.claim, ...comp.proposals.flat().map((p) => p.claim)] })
    }
    const decided = new Set((res?.decisions ?? []).map((d) => d.component))
    const skipped = c.disputed.filter((_, i) => !decided.has(i))
    if (skipped.length) log(`${debate}: judge left ${skipped.length} components undecided; they stay ungrouped`)
    return [...c.settled, ...judged]
  },
)

const groups = results.filter(Boolean).flat()
groups.forEach((g, i) => (g.id = `g${String(i + 1).padStart(3, '0')}`))
log(`${groups.length} groups after consensus and judging`)

const WORD_SCHEMA = {
  type: 'object',
  properties: { claims: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, claim: { type: 'string' } }, required: ['id', 'claim'] } } },
  required: ['claims'],
}
const describe = groups.map((g) => `${g.id} (${g.debate}, ${g.speaker}, refs ${g.refs.join(', ')}): candidates ${g.curatorClaims.map((c) => `"${c}"`).join(' | ')}`).join('\n')

phase('Word')
const worded = await agent(
  `You are the editor. Write the final claim sentence for each group below.\n\n${RULES}\n\nInput file: ${INPUT}. For each group read its records (quote and excerpt), then write one sentence that names exactly the assertion all its records evaluated, starting from the curators' candidate sentences. Keep one consistent style for both candidates: same verb tense, same structure, no attribution verbs like "diz" or "afirma" (the speaker is shown elsewhere).\n\nGroups:\n${describe}\n\nReturn one claim per group id.`,
  { label: 'editor', phase: 'Word', schema: WORD_SCHEMA },
)
const byId = new Map((worded?.claims ?? []).map((c) => [c.id, c.claim]))
for (const g of groups) g.claim = byId.get(g.id) ?? g.curatorClaims[0]

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    rewrites: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, problem: { type: 'string' }, claim: { type: 'string' } }, required: ['id', 'problem', 'claim'] } },
    groupingIssues: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, problem: { type: 'string' }, suggestion: { type: 'string' } }, required: ['id', 'problem', 'suggestion'] } },
  },
  required: ['rewrites', 'groupingIssues'],
}

phase('Review')
const review = await agent(
  `You are an adversarial neutrality reviewer for a public, impartial fact-check archive covering two opposing candidates (lula and flavio). Assume the sentences below contain bias until you have checked each one.\n\n${RULES}\n\nInput file: ${INPUT}. For every group, read its records and check its claim sentence for: (1) verdict leakage, wording that hints whether the claim is true or false; (2) loaded or judging words; (3) asymmetry, one candidate's claims phrased more harshly, vaguely or favorably than the other's; (4) infidelity, a sentence that adds or drops something the records evaluated; (5) length over 120 characters. Return a rewrite only for sentences with a real problem.\nSeparately, list groups whose records do NOT all evaluate the same assertion (groupingIssues), with a concrete suggestion (split which refs, or drop which ref). Do not rewrite the grouping yourself.\n\nGroups:\n${groups.map((g) => `${g.id} (${g.debate}, ${g.speaker}, refs ${g.refs.join(', ')}): "${g.claim}"`).join('\n')}`,
  { label: 'neutrality', phase: 'Review', schema: REVIEW_SCHEMA },
)
for (const r of review?.rewrites ?? []) {
  const g = groups.find((x) => x.id === r.id)
  if (g) Object.assign(g, { claim: r.claim, rewritten: r.problem })
}

return {
  groups: groups.map(({ id, debate, speaker, refs, claim, origin, reason, rewritten }) => ({ id, debate, speaker, refs, claim, origin, reason, rewritten })),
  groupingIssues: review?.groupingIssues ?? [],
  rewrites: (review?.rewrites ?? []).length,
}
