import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Doc } from '../../src/types.ts'
import pinned from './fixtures.json' with { type: 'json' }

// One pinned doc of a source: the URL it stands for, where the bytes came from and their hash.
// Raw agency pages are never committed (DATA-05); they live in the git-ignored .cache/.
export interface Fixture {
  file: string
  url: string
  from: string
  sha256: string
}

export const CACHE = join(import.meta.dirname, '../../.cache')
export const fixtures: Record<string, Fixture[]> = pinned

export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex')

// The docs of a source as its adapter's load() would return them, read from .cache/.
export function loadFixture(sourceId: string): Doc[] {
  const entries = fixtures[sourceId]
  if (!entries) throw new Error(`no pinned fixture for ${sourceId} in test/golden/fixtures.json`)
  return entries.map((fixture) => {
    const path = join(CACHE, fixture.file)
    let bytes: Buffer
    try {
      bytes = readFileSync(path)
    } catch {
      throw new Error(`missing .cache/${fixture.file}: run node test/golden/fetch-fixtures.ts`)
    }
    const hash = sha256(bytes)
    if (hash !== fixture.sha256)
      throw new Error(
        `.cache/${fixture.file} has sha256 ${hash}, pinned ${fixture.sha256}: run node test/golden/fetch-fixtures.ts`,
      )
    return { url: fixture.url, body: bytes.toString('utf8'), sha256: hash, fetchedAt: fixture.from }
  })
}
