import { load } from 'cheerio'
import { z } from 'zod'
import { cleanQuote } from '../pipeline/normalize.ts'
import type { Adapter, Doc, ParsedItem, ParseNote } from '../types.ts'

const configSchema = z.object({ url: z.url() })

const MARKER = 'Fusion.globalContent='
const SAID = /^O que (?:(.+?) disse|disse (.+?))\s*:\s*(.*)$/s
const CONCLUSION = /^O Estadão Verifica (?:checou|investigou) e concluiu que\s*:\s*(.*)$/s

interface Element {
  _id: string
  type: string
  content?: string
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()
const plain = (html: string) => collapse(load(html, null, false).root().text())

// The JSON value that starts at `start`, found by matching braces outside strings.
function jsonAt(text: string, start: number): unknown {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return JSON.parse(text.slice(start, i + 1))
    }
  }
  throw new Error('unterminated JSON')
}

export function parseEstadao(docs: Doc[], notes: ParseNote[] = []): ParsedItem[] {
  const body = docs[0].body
  const at = body.indexOf(MARKER)
  if (at < 0) throw new Error('Fusion.globalContent not found')
  const content = jsonAt(body, at + MARKER.length) as { content_elements: Element[] }

  const items: ParsedItem[] = []
  let said: { id: string; speaker: string; raw: string } | null = null
  for (const element of content.content_elements) {
    const text = element.type === 'text' ? plain(element.content ?? '') : ''
    const saidMatch = SAID.exec(text)
    const conclusion = CONCLUSION.exec(text)
    if (conclusion) {
      if (!said) {
        notes.push({
          kind: 'skipped',
          detail: `${element._id}: conclusion without "O que": ${text}`,
        })
        continue
      }
      const rest = conclusion[1]
      const dot = rest.indexOf('.')
      const quote = cleanQuote(said.raw)
      if (quote)
        items.push({
          key: said.id,
          doc: 0,
          pos: items.length + 1,
          anchor: null,
          speakerRaw: said.speaker,
          quote,
          label: (dot < 0 ? rest : rest.slice(0, dot)).trim(),
          explanation: dot < 0 ? '' : rest.slice(dot + 1).trim(),
        })
      else notes.push({ kind: 'skipped', detail: `${said.id}: quote too short: "${said.raw}"` })
    } else if (said) {
      notes.push({ kind: 'skipped', detail: `${said.id}: "O que" without a conclusion` })
    }
    said = saidMatch
      ? { id: element._id, speaker: saidMatch[1] ?? saidMatch[2], raw: saidMatch[3] }
      : null
  }
  if (said) notes.push({ kind: 'skipped', detail: `${said.id}: "O que" without a conclusion` })
  return items
}

export const estadao: Adapter = {
  kind: 'estadao-page',
  version: 1,
  configSchema,
  async load(source, io) {
    return [await io.get(configSchema.parse(source).url)]
  },
  parse: parseEstadao,
}
