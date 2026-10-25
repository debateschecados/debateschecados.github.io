import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { createComparison } from '../site/compare.js'
import { createContext } from '../site/core.js'
import { headline, lean, sentence, signed } from '../site/lean.js'
import { loadGroups } from './claims/groups.ts'
import { loadConfig } from './config.ts'
import type { CheckRecord } from './types.ts'

const ROOT = join(import.meta.dirname, '..')

// The distances the comparison page shows with no debate filter, one line per agency, then the
// headline (LEAN-07).
export async function leanReport(dataDir: string, configDir = join(ROOT, 'config')) {
  const config = await loadConfig(configDir)
  const records = JSON.parse(await readFile(join(dataDir, 'checks.json'), 'utf8')) as CheckRecord[]
  const ctx = createContext({ ...config, records })
  const { rows } = createComparison(ctx, await loadGroups(dataDir, records), [])
  const result = lean(ctx, rows)
  const lines = result.map((r) => {
    const means = r.candidates.map((c, i) => {
      const who = ctx.candidates[i].short
      return `${who} ${c.mean === null ? 'sem dados' : signed(c.mean)} (n=${c.n})`
    })
    const distance = r.distance === null ? 'sem dados' : signed(r.distance)
    const range = r.interval
      ? `, intervalo de 97,5% de ${signed(r.interval[0])} a ${signed(r.interval[1])}`
      : ''
    const name = ctx.outlets[r.outlet].name
    return `${name}: ${means.join(', ')}; distância ${distance}${range}; ${sentence(r.verdict, ctx)}`
  })
  return [...lines, '', headline(result, ctx)].join('\n')
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      'data-dir': { type: 'string', default: join(ROOT, 'data') },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    console.log(`Usage: node src/lean.ts [--data-dir <dir>]

Prints each agency's distance from the other agencies on shared claims, as the comparison page
shows it with no debate filter: the mean deviation per candidate, the distance (Flávio minus
Lula), its 97.5% interval and the sentence of the fixed rule.`)
  } else console.log(await leanReport(values['data-dir']))
}
