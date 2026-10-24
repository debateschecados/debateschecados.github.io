import { load } from 'cheerio'
import { z } from 'zod'
import { cleanQuote } from '../pipeline/normalize.ts'
import type { Adapter, Doc, ParsedItem, ParseNote } from '../types.ts'

const configSchema = z.object({ url: z.url() })

// Display text of each stamp code, from the CSS ::after content of blockquote[data-stamp].
const STAMPS: Record<string, string> = {
  verdadeiro: 'verdadeiro',
  falso: 'falso',
  nao_e_bem_assim: 'não é bem assim',
}

// The Escriba transcript id sits in the page's Next.js payload, with or without escaped quotes.
const ESCRIBA_ID = /escribaId\\*"\s*:\s*\\*"([0-9a-f-]{36})/

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

interface Raw {
  key: string
  doc: number
  anchor: string | null
  speaker: string
  quote: string
  stamp: string
  explanation: string
}

function fromHtml(body: string, doc: number, notes: ParseNote[]): Raw[] {
  const $ = load(body)
  const raws: Raw[] = []
  let speaker = ''
  for (const el of $('p.text-xl.font-bold, blockquote[data-stamp]').toArray()) {
    const $el = $(el)
    if ($el.is('p')) {
      speaker = collapse($el.text())
      continue
    }
    const said = $el.prev('p[id]')
    const id = said.attr('id')
    if (!id) {
      notes.push({
        kind: 'skipped',
        detail: `stamp without a <p id> before it: ${$el.attr('data-stamp')}`,
      })
      continue
    }
    raws.push({
      key: id,
      doc,
      anchor: id,
      speaker,
      quote: said.text(),
      stamp: $el.attr('data-stamp') ?? '',
      explanation: collapse($el.find('p').first().text()),
    })
  }
  return raws
}

interface EscribaNode {
  type?: string
  id?: string
  text?: string
  children?: EscribaNode[]
  data?: Record<string, { key?: string; value?: string; children?: EscribaNode[] }>
}

interface EscribaBlock {
  speaker?: string | null
  children: EscribaNode[]
}

const nodeText = (node: EscribaNode): string =>
  (node.text ?? '') + (node.children ?? []).map(nodeText).join('')

function fromEscriba(blocks: EscribaBlock[], doc: number, notes: ParseNote[]): Raw[] {
  const raws: Raw[] = []
  let speaker = ''
  for (const block of blocks) {
    if (block.speaker) speaker = block.speaker
    for (const node of block.children) {
      if (node.type !== 'comment' || !node.id) continue
      const data = node.data ?? {}
      const stamp = Object.values(data).find((prop) => prop.key === 'selo')?.value
      const quote = nodeText(node)
      if (!stamp) {
        notes.push({ kind: 'unrated', detail: `${node.id}: "${collapse(quote)}"` })
        continue
      }
      const paragraph = data.content?.children?.find((child) => child.type === 'paragraph')
      raws.push({
        key: node.id,
        doc,
        anchor: null,
        speaker,
        quote,
        stamp,
        explanation: paragraph ? collapse(nodeText(paragraph)) : '',
      })
    }
  }
  return raws
}

// Each doc is either a page (server HTML) or an Escriba transcript (JSON array).
export function parseAosFatos(docs: Doc[], notes: ParseNote[] = []): ParsedItem[] {
  const raws = docs.flatMap((d, i) =>
    d.body.trimStart().startsWith('[')
      ? fromEscriba(JSON.parse(d.body) as EscribaBlock[], i, notes)
      : fromHtml(d.body, i, notes),
  )
  const items: ParsedItem[] = []
  for (const raw of raws) {
    const quote = cleanQuote(raw.quote)
    if (!quote) {
      notes.push({
        kind: 'skipped',
        detail: `${raw.key}: quote too short: "${collapse(raw.quote)}"`,
      })
      continue
    }
    const label = STAMPS[raw.stamp]
    if (!label) notes.push({ kind: 'unknown-label', detail: `${raw.key}: stamp "${raw.stamp}"` })
    items.push({
      key: raw.key,
      doc: raw.doc,
      pos: items.length + 1,
      anchor: raw.anchor,
      speakerRaw: raw.speaker,
      quote,
      label: label ?? raw.stamp,
      explanation: raw.explanation,
    })
  }
  return items
}

export const aosfatos: Adapter = {
  kind: 'aosfatos',
  version: 1,
  configSchema,
  async load(source, io) {
    const page = await io.get(configSchema.parse(source).url)
    const id = ESCRIBA_ID.exec(page.body)?.[1]
    if (!id) return [page]
    return [page, await io.get(new URL(`/api/escriba/${id}/`, page.url).href)]
  },
  parse: parseAosFatos,
}
