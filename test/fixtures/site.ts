import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import pkg from '../../package.json' with { type: 'json' }
import { blindInput } from '../../src/claims/blind.ts'
import { type ClaimGroupsFile, GROUPS_FILE, groupId } from '../../src/claims/groups.ts'
import { loadConfig } from '../../src/config.ts'
import { writeData } from '../../src/pipeline/write.ts'
import { build } from '../../src/site/build.ts'
import type { CheckRecord, RunReport } from '../../src/types.ts'

const ROOT = join(import.meta.dirname, '../..')

// Small dataset for the site tests. Quotes are made up; labels and bands follow
// config/bands.json. Records are listed out of display order on purpose.

const LABELS: Record<string, [string, CheckRecord['band']][]> = {
  lupa: [
    ['VERDADEIRO', 'verdadeiro'],
    ['FALTA CONTEXTO', 'impreciso'],
    ['FALSO', 'falso'],
    ['INSUSTENTÁVEL', 'sem faixa'],
  ],
  g1: [
    ['#FATO', 'verdadeiro'],
    ['#NÃOÉBEMASSIM', 'impreciso'],
    ['#FAKE', 'falso'],
  ],
  estadao: [
    ['é verdadeiro', 'verdadeiro'],
    ['é enganoso', 'impreciso'],
    ['é falso', 'falso'],
    ['é inconclusivo', 'sem faixa'],
  ],
  aosfatos: [
    ['verdadeiro', 'verdadeiro'],
    ['não é bem assim', 'impreciso'],
    ['falso', 'falso'],
  ],
}

const DEBATES = ['band-2026-10-18', 'globo-2026-10-23']
const PAGE: Record<string, string> = {
  lupa: 'https://www.agencialupa.org/checagem/teste',
  g1: 'https://g1.globo.com/fato-ou-fake/teste',
  estadao: 'https://www.estadao.com.br/estadao-verifica/teste',
  aosfatos: 'https://www.aosfatos.org/noticias/teste',
}

export function fixtureRecords(): CheckRecord[] {
  const records: CheckRecord[] = []
  DEBATES.forEach((debate, d) => {
    for (const outlet of Object.keys(LABELS)) {
      for (let pos = 4; pos >= 1; pos--) {
        const n = records.length + 1
        const [label, band] = LABELS[outlet][(pos - 1) % LABELS[outlet].length]
        const page = `${PAGE[outlet]}-${debate}/`
        records.push({
          id: n.toString(16).padStart(12, '0'),
          sourceId: `${outlet}-${debate}`,
          debate,
          outlet,
          key: null,
          pos,
          anchor: null,
          speaker: (pos + d) % 2 ? 'lula' : 'flavio',
          quote: `Fala de teste número ${n}, inventada para a suíte do site.`,
          label,
          band,
          excerpt: `Explicação de teste ${n}.`,
          url: page,
          adapter: `${outlet}-page@1`,
          evidence: {
            url: page,
            fetchedAt: '2026-10-24T10:00:00.000Z',
            archiveUrl: null,
            sha256: null,
          },
        })
      }
    }
  })
  const byId = (id: number) => records[id - 1]
  // Removed from the source on a later run (HIST-02), one per candidate.
  Object.assign(byId(3), { missingSince: '2026-10-25' })
  Object.assign(byId(23), { missingSince: '2026-10-26' })
  // A label the outlet changed, kept in history (HIST-01).
  Object.assign(byId(5), { history: [{ label: '#FAKE', until: '2026-10-25' }] })
  // Archived and verified copy.
  Object.assign(byId(6).evidence, {
    archiveUrl: 'https://web.archive.org/web/20261024000000id_/https://g1.globo.com/x',
    sha256: 'a'.repeat(64),
  })
  // Markup inside agency text must be shown as text.
  Object.assign(byId(9), {
    quote: 'Disse <script>alert("x")</script> & mais "aspas" no debate.',
    excerpt: 'Trecho com <b>negrito</b> & entidade.',
  })
  return records
}

export function fixtureReport(records: CheckRecord[]): RunReport {
  const sources: RunReport['sources'] = {}
  for (const r of records) {
    sources[r.sourceId] ??= {
      debate: r.debate,
      outlet: r.outlet,
      adapter: r.adapter,
      status: 'ok',
      reason: null,
      httpStatus: 200,
      items: 0,
      excluded: [],
      duplicates: [],
      unmappedLabels: [],
      unratedComments: 0,
      awaitingArchive: [],
    }
    sources[r.sourceId].items++
  }
  return { sources }
}

export const FIXTURE_RUN = '2026-10-24'

// Claim groups by record number (as in fixtureRecords, 1-based). Band: A has all four
// agencies and diverges, B agrees, C ranks one record next to two "sem faixa", D loses its
// Lupa record (3, removed) and drops under two, I diverges on impreciso against verdadeiro.
// Globo: E has a "sem faixa" member, F and H agree, G diverges.
export const FIXTURE_GROUPS: Record<string, number[]> = {
  A: [4, 8, 12, 14],
  B: [2, 6],
  C: [1, 9, 13],
  D: [3, 7],
  I: [5, 11],
  E: [17, 21, 29],
  F: [19, 27],
  G: [18, 24, 28],
  H: [22, 26, 30],
}

// Live records published after the fixture curation run, so they are not in its input.
export const FIXTURE_PENDING = [15, 32]

export const recordId = (n: number) => n.toString(16).padStart(12, '0')
export const fixtureGroupId = (letter: string) => groupId(FIXTURE_GROUPS[letter].map(recordId))

export function fixtureGroups(): ClaimGroupsFile {
  const records = fixtureRecords()
  const groups = Object.entries(FIXTURE_GROUPS).map(([letter, numbers]) => {
    const ids = numbers.map(recordId).sort()
    const first = records[numbers[0] - 1]
    return {
      id: groupId(ids),
      debate: first.debate,
      speaker: first.speaker,
      claim: `Alegação de teste ${letter}, inventada para a suíte do site.`,
      records: ids,
      origin: 'unanimous' as const,
    }
  })
  return { run: FIXTURE_RUN, groups }
}

// Writes the dataset files for `records`, the claim groups and the curation input of their run
// (every live record but FIXTURE_PENDING), and builds the site from them into <dir>/dist.
export async function buildFixture(
  dir: string,
  records = fixtureRecords(),
  groups = fixtureGroups(),
) {
  const dataDir = join(dir, 'data')
  const outDir = join(dir, 'dist')
  await writeData(dataDir, records, fixtureReport(records))
  await writeFile(join(dataDir, GROUPS_FILE), `${JSON.stringify(groups, null, 2)}\n`)
  if (groups.run) {
    const { candidates } = await loadConfig(join(ROOT, 'config'))
    const pending = new Set(FIXTURE_PENDING.map(recordId))
    const input = blindInput(
      records.filter((r) => !pending.has(r.id)),
      candidates,
    )
    const runDir = join(dataDir, 'claim-curation', groups.run)
    await mkdir(runDir, { recursive: true })
    await writeFile(join(runDir, 'input.json'), `${JSON.stringify(input, null, 2)}\n`)
  }
  await build({
    siteDir: join(ROOT, 'site'),
    dataDir,
    configDir: join(ROOT, 'config'),
    outDir,
    repo: pkg.repository,
  })
  return { records, dataDir, outDir }
}
