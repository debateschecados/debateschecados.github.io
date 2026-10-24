import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { labelKey, nameKey } from './pipeline/normalize.ts'
import type { Adapter, SourceConfig } from './types.ts'

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'expected a lowercase id (a-z, 0-9, -)')

const candidateSchema = z.object({
  id,
  name: z.string().min(1),
  short: z.string().min(1),
  party: z.string().min(1),
  number: z.number().int().positive(),
  aliases: z.array(z.string().min(1)).min(1),
  partyLogo: z.string().min(1),
  sprite: z.string().min(1),
})

const outletSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  url: z.url(),
})

// Loose: adapter-specific fields pass through and are checked by the adapter's configSchema.
const sourceSchema = z.looseObject({
  id,
  outlet: z.string().min(1),
  adapter: z.string().min(1),
  url: z.url().optional(),
  file: z.string().min(1).optional(),
})

const debateSchema = z.object({
  id,
  broadcaster: z.object({ name: z.string().min(1), logo: z.string().min(1) }),
  date: z.iso.date(),
  round: z.number().int().positive(),
  candidates: z.array(z.string().min(1)).min(1),
  sources: z.array(sourceSchema).min(1),
})

export const BANDS = ['verdadeiro', 'impreciso', 'falso', 'sem faixa'] as const

const bandEntrySchema = z.object({
  label: z.string().min(1),
  band: z.enum(BANDS),
  definitionUrl: z.url().nullable(),
})

const schemas = {
  'candidates.json': z.array(candidateSchema).min(1),
  'outlets.json': z.record(z.string(), outletSchema),
  'debates.json': z.object({ debates: z.array(debateSchema) }),
  'bands.json': z.record(z.string(), z.array(bandEntrySchema)),
  'id-links.json': z.record(z.string(), z.record(z.string(), z.string().regex(/^[0-9a-f]{12}$/))),
}

export type Candidate = z.infer<typeof candidateSchema>
export type Outlet = z.infer<typeof outletSchema>
export type Debate = Omit<z.infer<typeof debateSchema>, 'sources'> & { sources: SourceConfig[] }
export type BandEntry = z.infer<typeof bandEntrySchema>
export type Bands = Record<string, BandEntry[]>
export type IdLinks = Record<string, Record<string, string>>

export interface Config {
  candidates: Candidate[]
  outlets: Record<string, Outlet>
  debates: Debate[]
  bands: Bands
  idLinks: IdLinks
}

export class ConfigError extends Error {
  name = 'ConfigError'
}

const fail = (file: string, path: PropertyKey[], message: string): never => {
  throw new ConfigError(`${file}: ${path.join('.') || '(root)'}: ${message}`)
}

async function readJson<F extends keyof typeof schemas>(
  dir: string,
  file: F,
): Promise<z.infer<(typeof schemas)[F]>> {
  let text: string
  try {
    text = await readFile(join(dir, file), 'utf8')
  } catch {
    return fail(file, [], 'file not found')
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return fail(file, [], `invalid JSON (${(error as Error).message})`)
  }
  const result = schemas[file].safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    return fail(file, issue.path, issue.message)
  }
  return result.data as z.infer<(typeof schemas)[F]>
}

// Validates every config file and the references between them. Sources whose adapter
// is not in `adapters` are not rejected here: they fail alone at run time (CONF-02).
export async function loadConfig(
  dir: string,
  adapters?: ReadonlyMap<string, Pick<Adapter, 'configSchema'>>,
): Promise<Config> {
  const candidates = await readJson(dir, 'candidates.json')
  const outlets = await readJson(dir, 'outlets.json')
  const { debates } = await readJson(dir, 'debates.json')
  const bands = await readJson(dir, 'bands.json')
  const idLinks = await readJson(dir, 'id-links.json')

  // resolveSpeaker compares nameKey(raw) with the aliases as written, first candidate wins.
  const aliasOwner = new Map<string, string>()
  candidates.forEach((candidate, c) => {
    candidate.aliases.forEach((alias, a) => {
      const path = [c, 'aliases', a]
      const key = nameKey(alias)
      if (key !== alias)
        fail('candidates.json', path, `alias "${alias}" is not normalized, write "${key}"`)
      const owner = aliasOwner.get(alias)
      if (owner !== undefined && owner !== candidate.id)
        fail('candidates.json', path, `alias "${alias}" is also an alias of "${owner}"`)
      aliasOwner.set(alias, candidate.id)
    })
  })

  const candidateIds = new Set(candidates.map((c) => c.id))
  const debateIds = new Set<string>()
  const sourceIds = new Set<string>()
  debates.forEach((debate, d) => {
    if (debateIds.has(debate.id))
      fail('debates.json', ['debates', d, 'id'], `duplicate debate id "${debate.id}"`)
    debateIds.add(debate.id)
    debate.candidates.forEach((candidate, c) => {
      if (!candidateIds.has(candidate))
        fail('debates.json', ['debates', d, 'candidates', c], `unknown candidate "${candidate}"`)
    })
    debate.sources.forEach((source, s) => {
      const path = ['debates', d, 'sources', s]
      if (sourceIds.has(source.id))
        fail('debates.json', [...path, 'id'], `duplicate source id "${source.id}"`)
      sourceIds.add(source.id)
      if (!Object.hasOwn(outlets, source.outlet))
        fail('debates.json', [...path, 'outlet'], `unknown outlet "${source.outlet}"`)
      const adapter = adapters?.get(source.adapter)
      if (!adapter) return
      const result = adapter.configSchema.safeParse(source)
      if (!result.success) {
        const issue = result.error.issues[0]
        fail('debates.json', [...path, ...issue.path], issue.message)
      }
    })
  })

  for (const sourceId of Object.keys(idLinks)) {
    if (!sourceIds.has(sourceId))
      fail('id-links.json', [sourceId], `unknown source "${sourceId}", not in debates.json`)
  }

  for (const [outlet, entries] of Object.entries(bands)) {
    const seen = new Map<string, string>()
    entries.forEach((entry, i) => {
      const key = labelKey(entry.label)
      const previous = seen.get(key)
      if (previous !== undefined)
        fail(
          'bands.json',
          [outlet, i, 'label'],
          `"${entry.label}" has the same matching key "${key}" as "${previous}"`,
        )
      seen.set(key, entry.label)
    })
  }

  return { candidates, outlets, debates, bands, idLinks }
}
