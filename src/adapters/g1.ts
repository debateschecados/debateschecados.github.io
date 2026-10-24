import { load } from 'cheerio'
import { z } from 'zod'
import { cleanQuote } from '../pipeline/normalize.ts'
import type { Adapter, Doc, ParsedItem, ParseNote } from '../types.ts'

const configSchema = z.object({ url: z.url() })

// Verdict tags as printed: #FATO, #FAKE, #NÃOÉBEMASSIM, and the observed typo #/FATO.
const TAG = /#\/?\p{Lu}+/gu

// Paragraphs that close the checks: the credits line, or the live-update notice.
const FOOTER = /^(Participaram da checagem|Esta checagem está em andamento)/i

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

interface Verdict {
  label: string
  explanation: string[]
}

interface Quote {
  key: string
  speaker: string
  raw: string
  verdicts: Verdict[]
}

export function parseG1(docs: Doc[], notes: ParseNote[] = []): ParsedItem[] {
  const $ = load(docs[0].body)
  const quotes: Quote[] = []
  let speaker = ''
  let quote: Quote | null = null
  let verdict: Verdict | null = null

  for (const chunk of $('div[id^="chunk-"]').toArray()) {
    const $chunk = $(chunk)
    const heading = $chunk.find('.content-intertitle h2')
    if (heading.length) {
      const title = collapse(heading.text())
      if (/^veja também/i.test(title)) break
      speaker = title
      quote = null
      verdict = null
      continue
    }
    const blockquote = $chunk.find('blockquote.content-blockquote')
    if (blockquote.length) {
      quote = { key: $chunk.attr('id') as string, speaker, raw: blockquote.text(), verdicts: [] }
      quotes.push(quote)
      verdict = null
      continue
    }
    if (!quote || !$chunk.find('.content-text').length) continue

    const text = collapse($chunk.text())
    if (FOOTER.test(text)) break
    const tags = text.match(TAG) ?? []
    // Labels only come from "A declaração… é #X." or "Veja por que… é #X:" paragraphs. A paragraph
    // with two tags is the summary of a double verdict; its "Veja por que" paragraphs follow.
    if (tags.length && (text.startsWith('A declaração') || text.includes('Veja por qu'))) {
      verdict = tags.length === 1 ? { label: tags[0], explanation: [] } : null
      if (verdict) quote.verdicts.push(verdict)
      continue
    }
    if (!verdict) continue
    const items = $chunk.find('li').toArray()
    const paragraphs = items.length ? items.map((li) => collapse($(li).text())) : [text]
    verdict.explanation.push(...paragraphs.filter(Boolean))
  }

  const parsed: ParsedItem[] = []
  for (const { key, speaker, raw, verdicts } of quotes) {
    const text = cleanQuote(raw)
    if (!text) {
      notes.push({ kind: 'skipped', detail: `${key}: quote too short: "${collapse(raw)}"` })
      continue
    }
    if (!verdicts.length) {
      notes.push({ kind: 'skipped', detail: `${key}: quote without a verdict: "${text}"` })
      continue
    }
    verdicts.forEach((v, i) => {
      parsed.push({
        key: i === 0 ? key : `${key}.${i + 1}`,
        doc: 0,
        pos: parsed.length + 1,
        anchor: key,
        speakerRaw: speaker,
        quote: text,
        label: v.label,
        explanation: v.explanation.join('\n'),
      })
    })
  }
  return parsed
}

export const g1: Adapter = {
  kind: 'g1-page',
  version: 2,
  configSchema,
  async load(source, io) {
    return [await io.get(configSchema.parse(source).url)]
  },
  parse: parseG1,
}
