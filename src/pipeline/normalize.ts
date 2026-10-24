import type { Bands, Candidate } from '../config.ts'
import type { Band } from '../types.ts'

const MIN_QUOTE = 10
const MAX_EXCERPT = 280

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

// "Luiz Inácio Lula da Silva (PT), presidente e candidato" -> "luiz inacio lula da silva"
export const nameKey = (raw: string) => collapse(fold(raw.split(',')[0].replace(/\([^)]*\)/g, ' ')))

// Candidate id whose aliases contain the name key, or null (INGEST-05).
export const resolveSpeaker = (raw: string, candidates: readonly Candidate[]) => {
  const key = nameKey(raw)
  return candidates.find((c) => c.aliases.includes(key))?.id ?? null
}

// Matching key for labels: NFD, no diacritics, lowercase, only a-z kept.
export const labelKey = (label: string) => fold(label).replace(/[^a-z]/g, '')

// Band from config/bands.json, or null when the label is not in the table.
export const mappedBand = (bands: Bands, outlet: string, label: string): Band | null => {
  const key = labelKey(label)
  return bands[outlet]?.find((entry) => labelKey(entry.label) === key)?.band ?? null
}

export const bandFor = (bands: Bands, outlet: string, label: string): Band =>
  mappedBand(bands, outlet, label) ?? 'sem faixa'

export const excerpt = (text: string) => {
  const clean = collapse(text)
  if (clean.length <= MAX_EXCERPT) return clean
  const space = clean.lastIndexOf(' ', MAX_EXCERPT)
  return `${clean.slice(0, space > 0 ? space : MAX_EXCERPT).trimEnd()}…`
}

export const quoteKey = (quote: string) => collapse(fold(quote).replace(/[^\p{L}\p{N}\s]/gu, ''))

export const tokens = (quote: string) =>
  new Set(
    quoteKey(quote)
      .split(' ')
      .filter((word) => word.length >= 3),
  )

const MARK = /["“”]/

// Positions of matching quote marks, both ways. A straight " opens at the start or after a space
// or bracket and closes anywhere else.
const quotePairs = (text: string) => {
  const partner = new Map<number, number>()
  const open = { curly: [] as number[], straight: [] as number[] }
  for (let i = 0; i < text.length; i++) {
    const mark = text[i]
    if (!MARK.test(mark)) continue
    const stack = mark === '"' ? open.straight : open.curly
    if (mark === '“' || (mark === '"' && (i === 0 || /[\s([]/.test(text[i - 1])))) {
      stack.push(i)
      continue
    }
    const from = stack.pop()
    if (from === undefined) continue
    partner.set(from, i)
    partner.set(i, from)
  }
  return partner
}

// One step of edge cleanup: drop a pair wrapping the whole quote, or an edge mark without a pair.
const unwrap = (quote: string) => {
  const end = quote.length - 1
  const partner = quotePairs(quote)
  const loose = (i: number) => MARK.test(quote.charAt(i)) && !partner.has(i)
  if (end > 0 && partner.get(0) === end) return quote.slice(1, end)
  if (loose(0)) return quote.slice(1)
  if (loose(end)) return quote.slice(0, end)
}

// Collapsed quote without stray quote marks at the edges, or null when too short to be a quote.
// An edge mark that closes or opens a pair inside the quote stays: `de “bolsa-farelo”`.
export const cleanQuote = (raw: string) => {
  let quote = collapse(raw)
  for (let next = unwrap(quote); next !== undefined; next = unwrap(quote)) quote = next.trim()
  return quote.length >= MIN_QUOTE ? quote : null
}
