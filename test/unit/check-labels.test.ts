import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RunReport, SourceReport } from '../../src/types.ts'

const ROOT = join(import.meta.dirname, '../..')

const source = (outlet: string, unmappedLabels: string[]): SourceReport => ({
  debate: 'band-2026-10-18',
  outlet,
  adapter: `${outlet}-page@1`,
  status: 'ok',
  reason: null,
  httpStatus: 200,
  items: 3,
  excluded: [],
  duplicates: [],
  unmappedLabels,
  unratedComments: 0,
  awaitingArchive: [],
})

const check = async (report: RunReport) => {
  const path = join(await mkdtemp(join(tmpdir(), 'labels-')), 'run-report.json')
  await writeFile(path, JSON.stringify(report))
  return spawnSync(process.execPath, ['src/check-labels.ts', path], { cwd: ROOT, encoding: 'utf8' })
}

describe('check:labels (DATA-03)', () => {
  it('exits 0 when every label has a band', async () => {
    const result = await check({
      sources: {
        'g1-band-2026-10-18': source('g1', []),
        'lupa-band-2026-10-18': source('lupa', []),
      },
    })
    expect(result.status).toBe(0)
  })

  it('exits 1 naming the outlet and label of every unmapped label', async () => {
    const result = await check({
      sources: {
        'g1-band-2026-10-18': source('g1', []),
        'lupa-band-2026-10-18': source('lupa', ['AINDA É CEDO PARA DIZER']),
        'aosfatos-globo-2026-10-23': source('aosfatos', ['selo_novo', 'distorcido']),
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('lupa-band-2026-10-18 (lupa): AINDA É CEDO PARA DIZER')
    expect(result.stderr).toContain('aosfatos-globo-2026-10-23 (aosfatos): selo_novo')
    expect(result.stderr).toContain('aosfatos-globo-2026-10-23 (aosfatos): distorcido')
    expect(result.stderr).not.toContain('g1-band')
  })
})
