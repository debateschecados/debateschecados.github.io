import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { type Clock, createHttp, HttpError, SPACING_MS, sourceHosts } from '../../../src/io/http.ts'

const REPO = 'https://example.org/debates-checados'

const ESTADAO_ROBOTS = `User-agent: *
Disallow: /estadao
Disallow: /ext/
Allow: /estadao-verifica

User-agent: ClaudeBot
Disallow: /
`
const ESTADAO_DEBATES = [
  'https://www.estadao.com.br/estadao-verifica/checamos-o-debate-entre-lula-e-flavio-na-band/',
  'https://www.estadao.com.br/estadao-verifica/debate-tv-globo-checagem-tempo-real-ao-vivo/',
]

const fakeClock = (): Clock & { t: number } => {
  const clock = {
    t: 1_000_000,
    now: () => clock.t,
    sleep: async (ms: number) => {
      clock.t += ms
    },
  }
  return clock
}

interface Call {
  url: string
  at: number
  userAgent: string | null
}

type Route = string | number | ((init: RequestInit) => Promise<Response>) | Response

// Fake fetch answering from a URL -> route map; unknown robots.txt is a 404, any other URL a 404 too.
function fakeFetch(clock: Clock, routes: Record<string, Route>) {
  const calls: Call[] = []
  const fn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, at: clock.now(), userAgent: new Headers(init.headers).get('user-agent') })
    const route = routes[url]
    if (route === undefined) return new Response('', { status: 404 })
    if (typeof route === 'string') return new Response(route, { status: 200 })
    if (typeof route === 'number') return new Response('', { status: route })
    if (route instanceof Response) return route
    return route(init)
  }
  return { calls, fetch: fn as typeof fetch }
}

const setup = (
  routes: Record<string, Route>,
  hosts = ['a.test', 'b.test', 'www.estadao.com.br'],
) => {
  const clock = fakeClock()
  const fake = fakeFetch(clock, routes)
  const http = createHttp({ hosts, repoUrl: REPO, clock, fetch: fake.fetch })
  return { clock, http, calls: fake.calls }
}

describe('spacing (INGEST-07)', () => {
  it('starts requests to one domain at least 5 s apart, robots.txt included', async () => {
    const { http, calls } = setup({ 'https://a.test/1': 'one', 'https://a.test/2': 'two' })
    const docs = await Promise.all([http.get('https://a.test/1'), http.get('https://a.test/2')])
    expect(docs.map((d) => d.body)).toEqual(['one', 'two'])
    expect(calls.map((c) => c.url)).toEqual([
      'https://a.test/robots.txt',
      'https://a.test/1',
      'https://a.test/2',
    ])
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(SPACING_MS)
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(SPACING_MS)
    expect(SPACING_MS).toBe(5_000)
  })

  it('does not delay a different domain', async () => {
    const { clock, http, calls } = setup({ 'https://a.test/1': 'a', 'https://b.test/1': 'b' })
    await http.get('https://a.test/1')
    const before = clock.now()
    await http.get('https://b.test/1')
    const b = calls.filter((c) => c.url.startsWith('https://b.test'))
    expect(b[0]).toMatchObject({ url: 'https://b.test/robots.txt', at: before })
  })

  it('reads robots.txt once per domain', async () => {
    const { http, calls } = setup({ 'https://a.test/1': 'x', 'https://a.test/2': 'y' })
    await http.get('https://a.test/1')
    await http.get('https://a.test/2')
    expect(calls.filter((c) => c.url.endsWith('/robots.txt'))).toHaveLength(1)
  })
})

describe('robots.txt (INGEST-07)', () => {
  it('refuses a disallowed path without requesting it', async () => {
    const { http, calls } = setup({
      'https://a.test/robots.txt': 'User-agent: *\nDisallow: /private',
      'https://a.test/private/page': 'secret',
    })
    const error = await http.get('https://a.test/private/page').catch((e) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error.kind).toBe('robots')
    expect(calls.map((c) => c.url)).toEqual(['https://a.test/robots.txt'])
  })

  it('allows both Estadão debate URLs under Disallow: /estadao and Allow: /estadao-verifica', async () => {
    const { http } = setup({
      'https://www.estadao.com.br/robots.txt': ESTADAO_ROBOTS,
      [ESTADAO_DEBATES[0]]: 'band',
      [ESTADAO_DEBATES[1]]: 'globo',
    })
    expect((await http.get(ESTADAO_DEBATES[0])).body).toBe('band')
    expect((await http.get(ESTADAO_DEBATES[1])).body).toBe('globo')
    const error = await http.get('https://www.estadao.com.br/estadao/x').catch((e) => e)
    expect(error.kind).toBe('robots')
  })

  it('follows a group addressed to the project user agent', async () => {
    const { http } = setup({
      'https://a.test/robots.txt':
        'User-agent: debates-checados\nDisallow: /\n\nUser-agent: *\nAllow: /',
      'https://a.test/1': 'x',
    })
    expect((await http.get('https://a.test/1').catch((e) => e)).kind).toBe('robots')
  })

  it('refuses the domain when robots.txt answers 5xx', async () => {
    const { http, calls } = setup({ 'https://a.test/robots.txt': 503, 'https://a.test/1': 'x' })
    const error = await http.get('https://a.test/1').catch((e) => e)
    expect(error).toMatchObject({ kind: 'robots', status: 503 })
    expect(calls.map((c) => c.url)).toEqual(['https://a.test/robots.txt'])
  })
})

describe('errors and allowlist', () => {
  it('throws a status error on non-200', async () => {
    const { http } = setup({ 'https://a.test/gone': 410 })
    const error = await http.get('https://a.test/gone').catch((e) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ kind: 'status', status: 410, url: 'https://a.test/gone' })
  })

  it('throws a timeout error when the server does not answer in time', async () => {
    const clock = fakeClock()
    const hang = (init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })
    const fake = fakeFetch(clock, { 'https://a.test/slow': hang })
    const http = createHttp({
      hosts: ['a.test'],
      repoUrl: REPO,
      clock,
      fetch: fake.fetch,
      timeoutMs: 20,
    })
    const error = await http.get('https://a.test/slow').catch((e) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error.kind).toBe('timeout')
  })

  it('refuses a host outside the allowlist before any request', async () => {
    const { http, calls } = setup({ 'https://evil.test/x': 'x' })
    const error = await http.get('https://evil.test/x').catch((e) => e)
    expect(error).toMatchObject({ kind: 'host', url: 'https://evil.test/x' })
    expect(calls).toEqual([])
  })

  it('allows the archive.org hosts without listing them', async () => {
    const { http } = setup({ 'https://web.archive.org/web/1id_/https://a.test/': 'snap' }, [])
    expect((await http.get('https://web.archive.org/web/1id_/https://a.test/')).body).toBe('snap')
  })

  it('checks every redirect hop against the allowlist', async () => {
    const { http, calls } = setup({
      'https://a.test/moved': new Response('', {
        status: 302,
        headers: { location: 'https://evil.test/x' },
      }),
    })
    const error = await http.get('https://a.test/moved').catch((e) => e)
    expect(error.kind).toBe('host')
    expect(calls.some((c) => c.url.startsWith('https://evil.test'))).toBe(false)
  })

  it('builds the allowlist from the source URLs in the config', () => {
    const hosts = sourceHosts([
      { sources: [{ url: 'https://g1.globo.com/a' }, { url: 'https://www.aosfatos.org/b' }] },
      { sources: [{}] },
    ])
    expect(hosts).toEqual(['g1.globo.com', 'www.aosfatos.org'])
  })
})

describe('docs', () => {
  it('sends the project user agent and returns body, sha256, final url and fetch time', async () => {
    const { clock, http, calls } = setup({ 'https://a.test/1': 'olá' })
    const doc = await http.get('https://a.test/1')
    expect(calls.every((c) => c.userAgent === `debates-checados/0.1.0 (+${REPO})`)).toBe(true)
    expect(doc).toEqual({
      url: 'https://a.test/1',
      body: 'olá',
      sha256: createHash('sha256').update('olá', 'utf8').digest('hex'),
      fetchedAt: new Date(clock.now()).toISOString(),
    })
  })
})
