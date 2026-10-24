import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SITE = join(import.meta.dirname, '../../../site')
const read = (path: string) => readFile(join(SITE, path), 'utf8')

const BODY_FIRST_ROW = 21 // render.py: HEADS are rows 0..20, BODY rows 21..31
const SIZE = 32

// Expands the merged runs of a <g> back into one color per cell, keyed "x,y".
function cells(group: string, mirror = false) {
  const map = new Map<string, string>()
  for (const m of group.matchAll(
    /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="([^"]+)"\/>/g,
  )) {
    const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])]
    for (let i = x; i < x + w; i++) map.set(`${mirror ? SIZE - 1 - i : i},${y}`, m[4])
  }
  return map
}

const groups = (svg: string) => [...svg.matchAll(/<g( class="([^"]+)")?>(.*?)<\/g>/g)]

describe('sprites (AUDIT-06)', () => {
  it('share the viewBox and the body rows, with Flávio mirrored', async () => {
    const lula = await read('sprites/lula-talk.svg')
    const flavio = await read('sprites/flavio-talk.svg')
    const viewBox = (svg: string) => svg.match(/viewBox="([^"]+)"/)?.[1]
    expect(viewBox(lula)).toBe(`0 0 ${SIZE} ${SIZE}`)
    expect(viewBox(flavio)).toBe(viewBox(lula))
    expect(viewBox(await read('sprites/lula.svg'))).toBe(viewBox(lula))
    expect(viewBox(await read('sprites/flavio.svg'))).toBe(viewBox(lula))

    const body = (map: Map<string, string>) =>
      new Map([...map].filter(([k]) => Number(k.split(',')[1]) >= BODY_FIRST_ROW))
    const a = body(cells(groups(lula)[0][3]))
    const b = body(cells(groups(flavio)[0][3], true))
    expect(a.size).toBeGreaterThan(200)
    expect([...b.keys()].sort()).toEqual([...a.keys()].sort())
    // Same drawing, own palette: each Lula color maps to exactly one Flávio color and back.
    const pairs = new Set([...a].map(([k, color]) => `${color}>${b.get(k)}`))
    const from = new Set([...pairs].map((p) => p.split('>')[0]))
    const to = new Set([...pairs].map((p) => p.split('>')[1]))
    expect(pairs.size).toBe(from.size)
    expect(pairs.size).toBe(to.size)
  })

  it('each talking sprite has exactly two mouth frame groups', async () => {
    for (const name of ['lula', 'flavio']) {
      const talk = groups(await read(`sprites/${name}-talk.svg`))
      expect(talk.map((g) => g[2] ?? 'base')).toEqual(['base', 'm-a', 'm-b'])
      expect(groups(await read(`sprites/${name}.svg`)).map((g) => g[2] ?? 'base')).toEqual(['base'])
    }
  })

  it('talk animations have the same length and 12 open-mouth beats each', async () => {
    const css = await read('style.css')
    const talk = (name: string) =>
      ['m-a', 'm-b'].map((frame) => {
        const rule = css.match(
          new RegExp(
            `\\.duel\\.talking \\[data-sprite="${name}"\\] \\.${frame} \\{\\s*animation: ([^;]+);`,
          ),
        )?.[1]
        expect(rule).toBeDefined()
        const [keyframes, ...timing] = (rule ?? '').split(' ')
        const block = css.match(new RegExp(`@keyframes ${keyframes} \\{([^@]*?)\\n\\}`))?.[1] ?? ''
        return { timing: timing.join(' '), beats: block.match(/opacity: 1;/g)?.length ?? 0 }
      })
    const lula = talk('lula')
    const flavio = talk('flavio')
    expect(lula.map((f) => f.timing)).toEqual(['5s step-end 2', '5s step-end 2'])
    expect(flavio.map((f) => f.timing)).toEqual(lula.map((f) => f.timing))
    expect(lula[0].beats + lula[1].beats).toBe(12)
    expect(flavio[0].beats + flavio[1].beats).toBe(12)
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.duel\.talking \.fighter \[class\^="m-"\] \{\s*animation: none;/)
  })
})

// The one third-party request, cookieless page view counting added on purpose.
const GOATCOUNTER =
  '<script data-goatcounter="https://debateschecados.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>'

describe('site assets (SITE-07)', () => {
  it('loads no font, script, style or image from another origin but GoatCounter', async () => {
    const files = (await readdir(SITE, { recursive: true })).filter((f) =>
      /\.(html|css|js)$/.test(f),
    )
    expect(files).toEqual(expect.arrayContaining(['index.html', 'style.css']))
    for (const file of files) {
      const text = (await read(file)).replace(GOATCOUNTER, '')
      expect(text, file).not.toContain('fonts.googleapis.com')
      expect(text, file).not.toMatch(/\bsrc="(https?:)?\/\//)
      expect(text, file).not.toMatch(/<link[^>]+href="(https?:)?\/\//)
      expect(text, file).not.toMatch(/url\(["']?(https?:)?\/\//)
      expect(text, file).not.toMatch(/@import|\bimport\s*\(?\s*["']https?:/)
    }
    const fonts = (await read('style.css')).match(/url\(fonts\/[^)]+\.woff2\)/g) ?? []
    expect(fonts).toHaveLength(7)
    const shipped = await readdir(join(SITE, 'fonts'))
    for (const url of fonts) expect(shipped).toContain(url.slice('url(fonts/'.length, -1))
  })
})
