import type { ClaimGroupsFile } from '../../src/claims/groups.ts'
import { groupId } from '../../src/claims/groups.ts'
import type { Band, CheckRecord } from '../../src/types.ts'

// Twelve Globo claims per candidate, each checked by all four agencies, built so that Aos Fatos
// is harsher than the others on every Flávio claim and milder on every Lula claim: its
// deviations are at least 1 for Flávio and below 0 for Lula, so its whole interval sits above 0.
export const LEAN_CLAIMS = 12
const OUTLETS = ['aosfatos', 'estadao', 'g1', 'lupa'] as const
const LABELS: Record<string, Record<string, string>> = {
  aosfatos: { verdadeiro: 'verdadeiro', impreciso: 'não é bem assim', falso: 'falso' },
  estadao: { verdadeiro: 'é verdadeiro', impreciso: 'é enganoso', falso: 'é falso' },
  g1: { verdadeiro: '#FATO', impreciso: '#NÃOÉBEMASSIM', falso: '#FAKE' },
  lupa: { verdadeiro: 'VERDADEIRO', impreciso: 'FALTA CONTEXTO', falso: 'FALSO' },
}
const CYCLE: Band[] = ['verdadeiro', 'impreciso', 'falso']

const bandsOf = (speaker: string, i: number): Band[] =>
  speaker === 'flavio'
    ? ['falso', 'verdadeiro', CYCLE[i % 3], 'impreciso']
    : ['verdadeiro', i % 2 ? 'falso' : 'impreciso', CYCLE[i % 3], 'impreciso']

export function leanFixture() {
  const debate = 'globo-2026-10-23'
  const records: CheckRecord[] = []
  const groups: ClaimGroupsFile['groups'] = []
  for (const speaker of ['lula', 'flavio']) {
    for (let i = 0; i < LEAN_CLAIMS; i++) {
      const ids = bandsOf(speaker, i).map((band, j) => {
        const outlet = OUTLETS[j]
        const id = `${speaker[0]}${j}${String(i).padStart(10, '0')}`
        const page = `https://example.org/${outlet}/`
        records.push({
          id,
          sourceId: `${outlet}-${debate}`,
          debate,
          outlet,
          key: null,
          pos: i + 1 + (speaker === 'flavio' ? LEAN_CLAIMS : 0),
          anchor: null,
          speaker,
          quote: `Fala ${i} de ${speaker} para a conta da distância.`,
          label: LABELS[outlet][band],
          band,
          excerpt: '',
          url: page,
          adapter: `${outlet}-page@1`,
          evidence: {
            url: page,
            fetchedAt: '2026-10-24T10:00:00.000Z',
            archiveUrl: null,
            sha256: null,
          },
        })
        return id
      })
      groups.push({
        id: groupId(ids),
        debate,
        speaker,
        claim: `Alegação ${i} de ${speaker}.`,
        records: ids.toSorted(),
        origin: 'unanimous',
      })
    }
  }
  return { records, groups: { run: null, groups } satisfies ClaimGroupsFile }
}
