import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import pkg from '../../package.json' with { type: 'json' }
import { BANDS, createContext, emptyState, listed, notice, scoreboard } from '../../site/core.js'
import {
  bandClass,
  boardHtml,
  debatesHtml,
  esc,
  filtersHtml,
  fullDate,
  itemHtml,
} from '../../site/render.js'
import { type Config, loadConfig } from '../config.ts'
import { labelKey } from '../pipeline/normalize.ts'
import type { CheckRecord } from '../types.ts'

const ROOT = join(import.meta.dirname, '../..')
const DATA_FILES = ['checks.json', 'checks.csv', 'run-report.json']

export interface BuildOptions {
  siteDir: string
  dataDir: string
  configDir: string
  outDir: string
  repo: string // repository URL, used by the audit panel and the methodology page
}

type Context = ReturnType<typeof createContext>

// Replaces every <!--name--> and {{name}} slot; a slot missing from the template is an error,
// so template and build can't drift apart silently.
function fill(template: string, slots: Record<string, string>) {
  let out = template
  for (const [name, value] of Object.entries(slots)) {
    const marks = [`<!--${name}-->`, `{{${name}}}`].filter((m) => out.includes(m))
    if (!marks.length) throw new Error(`template has no slot "${name}"`)
    for (const mark of marks) out = out.replaceAll(mark, () => value)
  }
  const left = out.match(/<!--[a-z]+-->|\{\{[a-zA-Z]+\}\}/)
  if (left) throw new Error(`template slot ${left[0]} was not filled`)
  return out
}

// JSON inside <script>: escaping "<" keeps any "</script>" in agency text inert.
const jsonScript = (id: string, value: unknown) =>
  `<script type="application/json" id="${id}">${JSON.stringify(value).replaceAll('<', '\\u003c')}</script>`

const table = (head: string[], rows: string[][], numeric = new Set<number>()) => {
  const cell = (tag: string, i: number, html: string) =>
    `<${tag}${numeric.has(i) ? ' class="n"' : ''}>${html}</${tag}>`
  return `<table><thead><tr>${head.map((h, i) => cell('th', i, h)).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((html, i) => cell('td', i, html)).join('')}</tr>`)
    .join('')}</tbody></table>`
}

const chip = (band: string) =>
  `<span class="chip ${bandClass(band)}">${esc(BANDS.find((b) => b.id === band)?.name ?? band)}</span>`

function sourcesTable(config: Config, ctx: Context) {
  const rows = ctx.debates.flatMap((debate) => {
    const sources = config.debates.find((d) => d.id === debate.id)?.sources ?? []
    return [...sources]
      .sort((a, b) => ctx.outletIds.indexOf(a.outlet) - ctx.outletIds.indexOf(b.outlet))
      .map((s) => [
        `${esc(debate.broadcaster.name)}, ${fullDate(debate.date)}`,
        esc(config.outlets[s.outlet].name),
        s.url ? `<a href="${esc(s.url)}">página da agência</a>` : esc(s.file ?? ''),
        `<code>${esc(s.adapter)}</code>`,
      ])
  })
  return table(['Debate', 'Agência', 'Fonte', 'Leitor'], rows)
}

// One row per label in config/bands.json, plus any label found in the data but not mapped.
function labelRows(config: Config, ctx: Context) {
  return ctx.outletIds.flatMap((outlet) => {
    const entries = (config.bands[outlet] ?? []).map((e) => ({ label: e.label, band: e.band }))
    const known = new Set(entries.map((e) => labelKey(e.label)))
    for (const r of ctx.records) {
      if (r.outlet !== outlet || known.has(labelKey(r.label))) continue
      known.add(labelKey(r.label))
      entries.push({ label: r.label, band: 'sem faixa' })
    }
    return entries.map((e) => ({ outlet, ...e }))
  })
}

function bandsTable(config: Config, ctx: Context) {
  const rows = ctx.outletIds.flatMap((outlet) =>
    (config.bands[outlet] ?? []).map((e) => [
      esc(config.outlets[outlet].name),
      esc(e.label),
      chip(e.band),
    ]),
  )
  return table(['Agência', 'Rótulo', 'Faixa'], rows)
}

function countsTable(config: Config, ctx: Context) {
  const found = ctx.records.filter((r) => !r.missingSince)
  const rows = labelRows(config, ctx).map((row) => [
    esc(config.outlets[row.outlet].name),
    esc(row.label),
    chip(row.band),
    ...ctx.candidates.map((c) =>
      String(
        found.filter(
          (r) =>
            r.outlet === row.outlet &&
            r.speaker === c.id &&
            labelKey(r.label) === labelKey(row.label),
        ).length,
      ),
    ),
  ])
  const numeric = new Set(ctx.candidates.map((_, i) => i + 3))
  return table(
    ['Agência', 'Rótulo', 'Faixa', ...ctx.candidates.map((c) => esc(c.short))],
    rows,
    numeric,
  )
}

async function duelHtml(siteDir: string, ctx: Context) {
  const fighters = await Promise.all(
    ctx.candidates.map(async (c, i) => {
      const svg = await readFile(join(siteDir, 'sprites', `${c.sprite}-talk.svg`), 'utf8')
      return `<span class="fighter ${i ? 'right' : 'left'}" data-sprite="${esc(c.sprite)}">${svg}</span>`
    }),
  )
  return fighters.join('<span class="vs">×</span>')
}

export async function build({ siteDir, dataDir, configDir, outDir, repo }: BuildOptions) {
  const config = await loadConfig(configDir)
  const records = JSON.parse(await readFile(join(dataDir, 'checks.json'), 'utf8')) as CheckRecord[]
  const debates = config.debates.map(({ id, date, broadcaster }) => ({ id, date, broadcaster }))
  const ctx = createContext({ ...config, debates, records })
  const state = emptyState()
  const items = listed(ctx, state)
  const repoSlots = { repo: esc(repo), repoLabel: esc(repo.replace(/^https?:\/\//, '')) }

  await rm(outDir, { recursive: true, force: true })
  await cp(siteDir, outDir, { recursive: true, filter: (src) => !src.endsWith('.py') })
  for (const file of DATA_FILES) await cp(join(dataDir, file), join(outDir, file))
  await cp(join(configDir, 'bands.json'), join(outDir, 'bands.json'))

  const index = fill(await readFile(join(siteDir, 'index.html'), 'utf8'), {
    ...repoSlots,
    duel: await duelHtml(siteDir, ctx),
    debates: debatesHtml(ctx),
    board: boardHtml(scoreboard(ctx, items), state, ctx),
    notice: esc(notice(ctx, state)),
    filters: filtersHtml(ctx, state, items.length),
    // Every record, removed ones included; CSS hides those until the toggle is on.
    list: ctx.records.map((r) => itemHtml(r, ctx)).join('\n'),
    data: jsonScript('data', {
      records,
      candidates: config.candidates,
      outlets: config.outlets,
      debates,
    }),
  })
  await writeFile(join(outDir, 'index.html'), index)

  const method = fill(await readFile(join(siteDir, 'metodologia.html'), 'utf8'), {
    ...repoSlots,
    sources: sourcesTable(config, ctx),
    bands: bandsTable(config, ctx),
    counts: countsTable(config, ctx),
    order: ctx.candidates.map((c) => `${c.number}, ${esc(c.name)}`).join('; '),
  })
  await writeFile(join(outDir, 'metodologia.html'), method)
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      'data-dir': { type: 'string', default: join(ROOT, 'data') },
      out: { type: 'string', default: join(ROOT, 'dist') },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    console.log(`Usage: node src/site/build.ts [--data-dir <dir>] [--out <dir>]

Builds the static site from site/, config/ and the dataset (default: data/) into dist/.`)
  } else {
    await build({
      siteDir: join(ROOT, 'site'),
      dataDir: values['data-dir'],
      configDir: join(ROOT, 'config'),
      outDir: values.out,
      repo: pkg.repository,
    })
    console.log(`Site built in ${values.out}`)
  }
}
