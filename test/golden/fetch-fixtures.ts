// Fills .cache/ with the pinned copies listed in test/golden/fixtures.json.
// Usage: node test/golden/fetch-fixtures.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHttp } from '../../src/io/http.ts'
import { CACHE, fixtures, sha256 } from './fixtures.ts'

const http = createHttp({
  hosts: [],
  repoUrl: process.env.REPO_URL ?? 'repository not published yet',
})
mkdirSync(CACHE, { recursive: true })

let missing = 0
for (const fixture of Object.values(fixtures).flat()) {
  const path = join(CACHE, fixture.file)
  let current: string | null = null
  try {
    current = sha256(readFileSync(path))
  } catch {}
  if (current === fixture.sha256) {
    console.log(`ok       ${fixture.file}`)
    continue
  }
  if (!fixture.from.startsWith('https://web.archive.org/')) {
    console.error(
      `missing  ${fixture.file}: pinned from "${fixture.from}" (${fixture.url}), not re-downloadable; copy it into .cache/ with sha256 ${fixture.sha256}`,
    )
    missing++
    continue
  }
  const doc = await http.get(fixture.from)
  if (doc.sha256 !== fixture.sha256) {
    console.error(`mismatch ${fixture.file}: got sha256 ${doc.sha256} from ${fixture.from}`)
    missing++
    continue
  }
  writeFileSync(path, doc.body)
  console.log(`fetched  ${fixture.file}`)
}
if (missing) process.exitCode = 1
