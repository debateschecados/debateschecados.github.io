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
  tabsHtml,
} from '../../site/render.js'
import { type Config, loadConfig } from '../config.ts'
import { labelKey } from '../pipeline/normalize.ts'
import type { CheckRecord } from '../types.ts'
import { agentBundle } from './agents.ts'

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

// Replaces every <!--name--> and {{name}} slot in one pass over the template, so agency text
// inside a filled value is never read as a slot. A template slot without a value, or a value
// without a slot, is an error, so template and build can't drift apart silently.
function fill(template: string, slots: Record<string, string>) {
  const used = new Set<string>()
  const out = template.replace(
    /<!--([a-zA-Z]+)-->|\{\{([a-zA-Z]+)\}\}/g,
    (mark, comment?: string, braces?: string) => {
      const name = comment ?? braces ?? ''
      if (!Object.hasOwn(slots, name)) throw new Error(`template slot ${mark} was not filled`)
      used.add(name)
      return slots[name]
    },
  )
  const unused = Object.keys(slots).find((name) => !used.has(name))
  if (unused) throw new Error(`template has no slot "${unused}"`)
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

const SHIELD =
  '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M10 2l6 2.5v4.6c0 4-2.6 7.4-6 8.9-3.4-1.5-6-4.9-6-8.9V4.5L10 2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const NAV = [{ href: 'como-funciona.html', name: 'Como funciona' }]

// The same bar on every page. On the home page "Como auditar" opens the panel in place;
// elsewhere it links there, and app.js opens the panel from the #auditar hash.
function topbarHtml(page: string) {
  const current = (href: string) => (href === page ? ' aria-current="page"' : '')
  const audit =
    page === 'index.html'
      ? `<button type="button" class="audit-btn" data-open-audit aria-haspopup="dialog">${SHIELD}Como auditar</button>`
      : `<a class="audit-btn" href="./#auditar">${SHIELD}Como auditar</a>`
  return `<header class="topbar"><div class="wrap"><a class="brand" href="./"${current('index.html')}>Debates checados</a><nav aria-label="Páginas">${NAV.map((n) => `<a href="${n.href}"${current(n.href)}>${n.name}</a>`).join('')}${audit}</nav></div></header>`
}

function archiveText(records: CheckRecord[]) {
  if (records.every((r) => r.evidence.archiveUrl))
    return '<strong>Toda checagem tem cópia arquivada.</strong> Todas têm cópia conferida na Wayback Machine.'
  return '<strong>A cópia arquivada ainda está chegando.</strong> Parte das checagens já tem cópia conferida na Wayback Machine. As outras esperam a próxima tentativa, e até lá a prova é o link da agência.'
}

// One stamp per agency with the label it uses for "impreciso": four ways to say the same thing.
function stampsHtml(config: Config, ctx: Context) {
  return ctx.outletIds
    .flatMap((outlet) => {
      const entry = (config.bands[outlet] ?? []).find((e) => e.band === 'impreciso')
      return entry
        ? [
            `<li><span class="stamp">${esc(entry.label)}</span><small>${esc(config.outlets[outlet].name)}</small></li>`,
          ]
        : []
    })
    .join('')
}

function recordHtml(r: CheckRecord, config: Config, ctx: Context) {
  const debate = ctx.debates.find((d) => d.id === r.debate)
  const rows = [
    ['Agência', esc(config.outlets[r.outlet]?.name ?? r.outlet)],
    [
      'Debate',
      debate ? `${esc(debate.broadcaster.name)}, ${fullDate(debate.date)}` : esc(r.debate),
    ],
    ['Quem falou', esc(ctx.candidates.find((c) => c.id === r.speaker)?.name ?? r.speaker)],
    ['Fala', `“${esc(r.quote)}”`],
    ['Rótulo da agência', `<strong>${esc(r.label)}</strong>`],
    ['Link', `<a href="${esc(r.url)}">página da agência</a>`],
    ['Coletado em', fullDate(r.evidence.fetchedAt)],
  ]
  return `<dl class="record">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`
}

// Every label in its band's bin, unmapped ones found in the data included, as on the
// methodology page. --i staggers the drop when the bins scroll into view.
function sorterHtml(config: Config, ctx: Context) {
  const rows = labelRows(config, ctx)
  let i = 0
  return BANDS.map((band) => {
    const chips = rows
      .filter((r) => r.band === band.id)
      .map(
        (r) =>
          `<li style="--i:${i++}">${esc(r.label)}<small>${esc(config.outlets[r.outlet].name)}</small></li>`,
      )
      .join('')
    return `<section class="bin ${bandClass(band.id)}"><h3 class="bin-name">${esc(band.name)}</h3><ul>${chips}</ul></section>`
  }).join('')
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
  const agents = agentBundle({ origin: pkg.homepage.replace(/\/$/, ''), repo, config, ctx })
  const state = emptyState()
  const items = listed(ctx, state)
  const repoSlots = { repo: esc(repo), repoLabel: esc(repo.replace(/^https?:\/\//, '')) }

  await rm(outDir, { recursive: true, force: true })
  await cp(siteDir, outDir, { recursive: true, filter: (src) => !src.endsWith('.py') })
  for (const file of DATA_FILES) await cp(join(dataDir, file), join(outDir, file))
  await cp(join(configDir, 'bands.json'), join(outDir, 'bands.json'))

  const duel = await duelHtml(siteDir, ctx)
  const index = fill(await readFile(join(siteDir, 'index.html'), 'utf8'), {
    ...repoSlots,
    topbar: topbarHtml('index.html'),
    archive: archiveText(records),
    duel,
    debates: debatesHtml(ctx),
    board: boardHtml(scoreboard(ctx, items), state, ctx),
    notice: esc(notice(ctx, state)),
    tabs: tabsHtml(ctx, state),
    filters: filtersHtml(ctx, state, items.length),
    // Every record, removed ones included; CSS hides the removed ones until the browser takes over.
    list: ctx.records.map((r) => itemHtml(r, ctx)).join('\n'),
    auditPrompt: esc(agents.auditPrompt),
    jsonLd: agents.jsonLd.replaceAll('<', '\\u003c'),
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
    topbar: topbarHtml('metodologia.html'),
    sources: sourcesTable(config, ctx),
    bands: bandsTable(config, ctx),
    counts: countsTable(config, ctx),
    order: ctx.candidates.map((c) => `${c.number}, ${esc(c.name)}`).join('; '),
  })
  await writeFile(join(outDir, 'metodologia.html'), method)

  const how = fill(await readFile(join(siteDir, 'como-funciona.html'), 'utf8'), {
    repo: repoSlots.repo,
    topbar: topbarHtml('como-funciona.html'),
    duel,
    stamps: stampsHtml(config, ctx),
    // One per candidate, the first of each in the home page list, so neither stands alone.
    records: ctx.candidates
      .flatMap((c) => items.find((r) => r.speaker === c.id) ?? [])
      .map((r) => recordHtml(r, config, ctx))
      .join(''),
    sorter: sorterHtml(config, ctx),
  })
  await writeFile(join(outDir, 'como-funciona.html'), how)
  for (const [name, body] of Object.entries(agents.files)) await writeFile(join(outDir, name), body)
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
