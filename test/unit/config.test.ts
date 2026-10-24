import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { loadConfig } from '../../src/config.ts'

const realDir = join(import.meta.dirname, '../../config')
const dirs: string[] = []

// Copies the real config to a temp dir and lets a test edit one file as JSON.
// biome-ignore lint/suspicious/noExplicitAny: tests reshape arbitrary JSON, including invalid shapes
async function configWith(file: string, edit: (json: any) => void) {
  const dir = await mkdtemp(join(tmpdir(), 'config-'))
  dirs.push(dir)
  await cp(realDir, dir, { recursive: true })
  const json = JSON.parse(await readFile(join(dir, file), 'utf8'))
  edit(json)
  await writeFile(join(dir, file), JSON.stringify(json))
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('real config (CONF-01, DATA-03)', () => {
  it('loads 2 debates with 8 sources, 21 labels and the two candidates', async () => {
    const config = await loadConfig(realDir)
    const sources = config.debates.flatMap((d) => d.sources)
    expect(config.debates.map((d) => d.id).sort()).toEqual(['band-2026-10-18', 'globo-2026-10-23'])
    expect(sources).toHaveLength(8)
    expect(new Set(sources.map((s) => s.id)).size).toBe(8)
    expect(Object.values(config.bands).flat()).toHaveLength(21)
    expect(config.candidates.map((c) => [c.id, c.number])).toEqual([
      ['lula', 13],
      ['flavio', 22],
    ])
    expect(config.candidates.find((c) => c.id === 'flavio')?.aliases).toContain('flavio bolsonaro')
    expect(config.idLinks).toEqual({})
  })

  it('keeps "é subestimado" and "está subestimado" as two distinct Estadão labels', async () => {
    const config = await loadConfig(realDir)
    const labels = config.bands.estadao.map((e) => e.label)
    expect(labels).toContain('é subestimado')
    expect(labels).toContain('está subestimado')
  })

  it('maps the user-confirmed and no-band labels as in the design table', async () => {
    const config = await loadConfig(realDir)
    const band = (outlet: string, label: string) =>
      config.bands[outlet].find((e) => e.label === label)?.band
    expect(band('estadao', 'é enganoso')).toBe('impreciso')
    expect(band('lupa', 'FALTA CONTEXTO')).toBe('impreciso')
    expect(band('lupa', 'INSUSTENTÁVEL')).toBe('sem faixa')
    expect(band('estadao', 'é inconclusivo')).toBe('sem faixa')
  })
})

describe('invalid config files fail naming file and field', () => {
  it('rejects a source without id', async () => {
    const dir = await configWith('debates.json', (json) => {
      delete json.debates[0].sources[1].id
    })
    await expect(loadConfig(dir)).rejects.toThrow(/^debates\.json: debates\.0\.sources\.1\.id: /)
  })

  it('rejects a duplicate source id', async () => {
    const dir = await configWith('debates.json', (json) => {
      json.debates[1].sources[2].id = json.debates[0].sources[0].id
    })
    await expect(loadConfig(dir)).rejects.toThrow(
      'debates.json: debates.1.sources.2.id: duplicate source id "g1-band-2026-10-18"',
    )
  })

  it('rejects a source whose outlet is not in outlets.json', async () => {
    const dir = await configWith('debates.json', (json) => {
      json.debates[0].sources[0].outlet = 'uol'
    })
    await expect(loadConfig(dir)).rejects.toThrow(
      'debates.json: debates.0.sources.0.outlet: unknown outlet "uol"',
    )
  })

  it('rejects a debate that lists an unknown candidate', async () => {
    const dir = await configWith('debates.json', (json) => {
      json.debates[1].candidates = ['lula', 'tarcisio']
    })
    await expect(loadConfig(dir)).rejects.toThrow(
      'debates.json: debates.1.candidates.1: unknown candidate "tarcisio"',
    )
  })

  it('rejects a band outside the four bands', async () => {
    const dir = await configWith('bands.json', (json) => {
      json.lupa[0].band = 'mentira'
    })
    await expect(loadConfig(dir)).rejects.toThrow(/^bands\.json: lupa\.0\.band: /)
  })

  it('rejects two labels of one outlet with the same matching key', async () => {
    const dir = await configWith('bands.json', (json) => {
      json.g1.push({ label: '#/FATO', band: 'verdadeiro', definitionUrl: null })
    })
    await expect(loadConfig(dir)).rejects.toThrow(
      'bands.json: g1.3.label: "#/FATO" has the same matching key "fato" as "#FATO"',
    )
  })

  it('accepts the same label under two different outlets', async () => {
    const dir = await configWith('bands.json', (json) => {
      json.g1.push({ label: 'falta contexto', band: 'impreciso', definitionUrl: null })
    })
    const config = await loadConfig(dir)
    expect(config.bands.g1.map((e) => e.label)).toContain('falta contexto')
  })

  it('names a missing file', async () => {
    const dir = await configWith('id-links.json', () => {})
    await rm(join(dir, 'outlets.json'))
    await expect(loadConfig(dir)).rejects.toThrow('outlets.json: (root): file not found')
  })

  it('validates a source with its adapter schema and names the field', async () => {
    const adapters = new Map([['g1-page', { configSchema: z.object({ url: z.url() }) }]])
    const dir = await configWith('debates.json', (json) => {
      delete json.debates[0].sources[0].url
    })
    await expect(loadConfig(dir, adapters)).rejects.toThrow(
      /^debates\.json: debates\.0\.sources\.0\.url: /,
    )
  })
})

describe('new debate by configuration (CONF-01, CONF-02)', () => {
  it('loads a third debate added only in config, keeping an unknown adapter for run time', async () => {
    const dir = await configWith('debates.json', (json) => {
      json.debates.push({
        id: 'sbt-2028-10-20',
        broadcaster: { name: 'SBT', logo: 'logos/sbt.svg' },
        date: '2028-10-20',
        round: 2,
        candidates: ['lula', 'flavio'],
        sources: [
          {
            id: 'g1-sbt-2028-10-20',
            outlet: 'g1',
            adapter: 'g1-page',
            url: 'https://g1.globo.com/x',
          },
          {
            id: 'uol-sbt-2028-10-20',
            outlet: 'g1',
            adapter: 'uol-page',
            url: 'https://uol.com.br/x',
          },
        ],
      })
    })
    const adapters = new Map([['g1-page', { configSchema: z.object({ url: z.url() }) }]])
    const config = await loadConfig(dir, adapters)
    expect(config.debates.map((d) => d.id)).toContain('sbt-2028-10-20')
    expect(config.debates.flatMap((d) => d.sources)).toHaveLength(10)
    expect(config.debates[2].sources[1].adapter).toBe('uol-page')
  })
})
