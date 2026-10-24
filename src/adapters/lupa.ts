import { load } from 'cheerio'
import { z } from 'zod'
import { cleanQuote } from '../pipeline/normalize.ts'
import type { Adapter, Doc, ParsedItem, ParseNote } from '../types.ts'

const configSchema = z.object({ url: z.url() })

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

const BLOCKS =
  'div.wp-block-seox-seox-quotes, div[data-block-id], hr.wp-block-separator, p.wp-block-paragraph'

export function parseLupa(docs: Doc[], notes: ParseNote[] = []): ParsedItem[] {
  const $ = load(docs[0].body)
  const items: ParsedItem[] = []
  let pending: { raw: string; cite: string } | null = null
  let current: ParsedItem | null = null
  const unlabeled = (quote: { raw: string }) =>
    notes.push({ kind: 'skipped', detail: `quote without a label: "${collapse(quote.raw)}"` })

  for (const el of $(BLOCKS).toArray()) {
    const $el = $(el)
    if ($el.is('div.wp-block-seox-seox-quotes')) {
      if (pending) unlabeled(pending)
      const blockquote = $el.find('blockquote').first().clone()
      const cite = collapse(blockquote.find('cite').text())
      blockquote.find('cite').remove()
      pending = { raw: blockquote.text(), cite }
      current = null
    } else if ($el.is('div[data-block-id]')) {
      if (!pending) continue
      const quote = cleanQuote(pending.raw)
      if (!quote) {
        notes.push({ kind: 'skipped', detail: `quote too short: "${collapse(pending.raw)}"` })
        pending = null
        continue
      }
      current = {
        key: null,
        doc: 0,
        pos: items.length + 1,
        anchor: null,
        speakerRaw: pending.cite,
        quote,
        label: collapse($el.find('.block-text').text()),
        explanation: '',
      }
      items.push(current)
      pending = null
    } else if ($el.is('hr')) {
      current = null
    } else if (current && !$el.closest('blockquote').length) {
      const text = collapse($el.text())
      if (text) current.explanation += current.explanation ? `\n${text}` : text
    }
  }
  if (pending) unlabeled(pending)
  return items
}

export const lupa: Adapter = {
  kind: 'lupa-page',
  version: 1,
  configSchema,
  async load(source, io) {
    return [await io.get(configSchema.parse(source).url)]
  },
  parse: parseLupa,
}
