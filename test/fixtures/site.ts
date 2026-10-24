import type { CheckRecord, RunReport } from '../../src/types.ts'

// Small dataset for the site tests. Quotes are made up; labels and bands follow
// config/bands.json. Records are listed out of display order on purpose.

const LABELS: Record<string, [string, CheckRecord['band']][]> = {
  lupa: [
    ['VERDADEIRO', 'verdadeiro'],
    ['FALTA CONTEXTO', 'impreciso'],
    ['FALSO', 'falso'],
    ['INSUSTENTÁVEL', 'sem faixa'],
  ],
  g1: [
    ['#FATO', 'verdadeiro'],
    ['#NÃOÉBEMASSIM', 'impreciso'],
    ['#FAKE', 'falso'],
  ],
  estadao: [
    ['é verdadeiro', 'verdadeiro'],
    ['é enganoso', 'impreciso'],
    ['é falso', 'falso'],
    ['é inconclusivo', 'sem faixa'],
  ],
  aosfatos: [
    ['verdadeiro', 'verdadeiro'],
    ['não é bem assim', 'impreciso'],
    ['falso', 'falso'],
  ],
}

const DEBATES = ['band-2026-10-18', 'globo-2026-10-23']
const PAGE: Record<string, string> = {
  lupa: 'https://www.agencialupa.org/checagem/teste',
  g1: 'https://g1.globo.com/fato-ou-fake/teste',
  estadao: 'https://www.estadao.com.br/estadao-verifica/teste',
  aosfatos: 'https://www.aosfatos.org/noticias/teste',
}

export function fixtureRecords(): CheckRecord[] {
  const records: CheckRecord[] = []
  DEBATES.forEach((debate, d) => {
    for (const outlet of Object.keys(LABELS)) {
      for (let pos = 4; pos >= 1; pos--) {
        const n = records.length + 1
        const [label, band] = LABELS[outlet][(pos - 1) % LABELS[outlet].length]
        const page = `${PAGE[outlet]}-${debate}/`
        records.push({
          id: n.toString(16).padStart(12, '0'),
          sourceId: `${outlet}-${debate}`,
          debate,
          outlet,
          key: null,
          pos,
          anchor: null,
          speaker: (pos + d) % 2 ? 'lula' : 'flavio',
          quote: `Fala de teste número ${n}, inventada para a suíte do site.`,
          label,
          band,
          excerpt: `Explicação de teste ${n}.`,
          url: page,
          adapter: `${outlet}-page@1`,
          evidence: {
            url: page,
            fetchedAt: '2026-10-24T10:00:00.000Z',
            archiveUrl: null,
            sha256: null,
          },
        })
      }
    }
  })
  const byId = (id: number) => records[id - 1]
  // Removed from the source on a later run (HIST-02), one per candidate.
  Object.assign(byId(3), { missingSince: '2026-10-25' })
  Object.assign(byId(23), { missingSince: '2026-10-26' })
  // A label the outlet changed, kept in history (HIST-01).
  Object.assign(byId(5), { history: [{ label: '#FAKE', until: '2026-10-25' }] })
  // Archived and verified copy.
  Object.assign(byId(6).evidence, {
    archiveUrl: 'https://web.archive.org/web/20261024000000id_/https://g1.globo.com/x',
    sha256: 'a'.repeat(64),
  })
  // Markup inside agency text must be shown as text.
  Object.assign(byId(9), {
    quote: 'Disse <script>alert("x")</script> & mais "aspas" no debate.',
    excerpt: 'Trecho com <b>negrito</b> & entidade.',
  })
  return records
}

export function fixtureReport(records: CheckRecord[]): RunReport {
  const sources: RunReport['sources'] = {}
  for (const r of records) {
    sources[r.sourceId] ??= {
      debate: r.debate,
      outlet: r.outlet,
      adapter: r.adapter,
      status: 'ok',
      reason: null,
      httpStatus: 200,
      items: 0,
      excluded: [],
      duplicates: [],
      unmappedLabels: [],
      unratedComments: 0,
      awaitingArchive: [],
    }
    sources[r.sourceId].items++
  }
  return { sources }
}
