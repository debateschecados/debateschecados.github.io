import { describe, expect, it } from 'vitest'
import { type CuratorGroup, consensus, knownRefs, sanitize } from '../../../src/claims/consensus.ts'

// Lula: a, b, c, d from agencies A, B, C, D; a2 is a second record of agency A.
// Flávio: f1, f2.
const KNOWN = knownRefs({
  debate: 'band',
  partitions: [
    {
      speaker: 'lula',
      records: [
        { ref: 'a', src: 'A', quote: '', excerpt: '' },
        { ref: 'b', src: 'B', quote: '', excerpt: '' },
        { ref: 'c', src: 'C', quote: '', excerpt: '' },
        { ref: 'd', src: 'D', quote: '', excerpt: '' },
        { ref: 'a2', src: 'A', quote: '', excerpt: '' },
      ],
    },
    {
      speaker: 'flavio',
      records: [
        { ref: 'f1', src: 'A', quote: '', excerpt: '' },
        { ref: 'f2', src: 'B', quote: '', excerpt: '' },
      ],
    },
  ],
})

const g = (refs: string[], claim = refs.join('+'), speaker = 'lula'): CuratorGroup => ({
  speaker,
  refs,
  claim,
})

describe('sanitize (edge case: invalid curator groups)', () => {
  it('keeps a valid group with its refs deduplicated and sorted', () => {
    expect(sanitize(KNOWN, [g(['b', 'a', 'b'], 'x')])).toEqual([g(['a', 'b'], 'x')])
  })

  it('drops a group left with fewer than 2 refs after removing unknown ones, and logs it', () => {
    const log: string[] = []
    expect(sanitize(KNOWN, [g(['a', 'zz'])], (m) => log.push(m))).toEqual([])
    expect(log).toEqual(['dropped group with unknown or reused refs (a,zz)'])
  })

  it('drops refs of another speaker partition', () => {
    expect(sanitize(KNOWN, [g(['f1', 'f2'], 'x', 'lula')])).toEqual([])
  })

  it('drops a ref already used by an earlier group of the same curator', () => {
    const log: string[] = []
    const out = sanitize(KNOWN, [g(['a', 'b']), g(['b', 'c']), g(['b', 'c', 'd'])], (m) =>
      log.push(m),
    )
    expect(out).toEqual([g(['a', 'b']), g(['c', 'd'], 'b+c+d')])
    expect(log).toEqual(['dropped group with unknown or reused refs (b,c)'])
  })

  it('drops a group with a repeated agency letter, and logs it', () => {
    const log: string[] = []
    expect(sanitize(KNOWN, [g(['a', 'a2', 'b'])], (m) => log.push(m))).toEqual([])
    expect(log).toEqual(['dropped group with repeated agency (a,a2,b)'])
  })
})

describe('consensus (CLAIM-04, CLAIM-05)', () => {
  it('settles a group all three curators formed identically, with their claims in curator order', () => {
    const runs = [[g(['a', 'b'], 'one')], [g(['a', 'b'], 'two')], [g(['a', 'b'], 'three')]]
    expect(consensus(runs)).toEqual({
      settled: [{ speaker: 'lula', refs: ['a', 'b'], curatorClaims: ['one', 'two', 'three'] }],
      disputed: [],
    })
  })

  it('disputes a chain A-B (3 votes) plus B-C (1 vote) as one component with every proposal', () => {
    const runs = [[g(['a', 'b'], 'one')], [g(['a', 'b'], 'two')], [g(['a', 'b', 'c'], 'three')]]
    expect(consensus(runs)).toEqual({
      settled: [],
      disputed: [
        {
          speaker: 'lula',
          refs: ['a', 'b', 'c'],
          proposals: [
            [{ refs: ['a', 'b'], claim: 'one' }],
            [{ refs: ['a', 'b'], claim: 'two' }],
            [{ refs: ['a', 'b', 'c'], claim: 'three' }],
          ],
        },
      ],
    })
  })

  it('records an empty proposal for a curator that left the component ungrouped', () => {
    const runs = [[g(['c', 'd'], 'one')], [g(['c', 'd'], 'two')], []]
    expect(consensus(runs).disputed).toEqual([
      {
        speaker: 'lula',
        refs: ['c', 'd'],
        proposals: [[{ refs: ['c', 'd'], claim: 'one' }], [{ refs: ['c', 'd'], claim: 'two' }], []],
      },
    ])
    expect(consensus(runs).settled).toEqual([])
  })

  it('judges each component on its own pairs: one settled and one disputed in the same debate', () => {
    const flavio = (claim: string) => g(['f1', 'f2'], claim, 'flavio')
    const runs = [
      [g(['a', 'b'], 'l1'), flavio('f-one')],
      [g(['a', 'b'], 'l2'), flavio('f-two')],
      [g(['a', 'c'], 'l3'), flavio('f-three')],
    ]
    const result = consensus(runs)
    expect(result.settled).toEqual([
      { speaker: 'flavio', refs: ['f1', 'f2'], curatorClaims: ['f-one', 'f-two', 'f-three'] },
    ])
    expect(result.disputed.map((d) => [d.speaker, d.refs])).toEqual([['lula', ['a', 'b', 'c']]])
  })

  it('settles nothing when fewer curators returned than expected (edge case: curator failure)', () => {
    const runs = [[g(['a', 'b'], 'one')], [g(['a', 'b'], 'two')]]
    expect(consensus(runs, 3)).toEqual({
      settled: [],
      disputed: [
        {
          speaker: 'lula',
          refs: ['a', 'b'],
          proposals: [[{ refs: ['a', 'b'], claim: 'one' }], [{ refs: ['a', 'b'], claim: 'two' }]],
        },
      ],
    })
  })
})
