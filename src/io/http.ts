import { createHash } from 'node:crypto'
import robotsModule from 'robots-parser'
import pkg from '../../package.json' with { type: 'json' }
import type { Doc } from '../types.ts'

export interface Clock {
  now(): number
  sleep(ms: number): Promise<void>
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export const ARCHIVE_HOSTS = ['archive.org', 'web.archive.org']
export const SPACING_MS = 5_000
export const TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 5

export type HttpErrorKind = 'host' | 'robots' | 'status' | 'timeout' | 'network'

export class HttpError extends Error {
  name = 'HttpError'
  kind: HttpErrorKind
  url: string
  status: number | null

  constructor(kind: HttpErrorKind, url: string, message: string, status: number | null = null) {
    super(`${message}: ${url}`)
    this.kind = kind
    this.url = url
    this.status = status
  }
}

export interface HttpOptions {
  hosts: Iterable<string> // agency hosts; the archive.org hosts are always added
  repoUrl: string // goes into the user agent
  clock?: Clock
  fetch?: typeof fetch
  timeoutMs?: number
}

export interface Http {
  get(url: string): Promise<Doc>
}

// robots-parser is CommonJS (module.exports = fn) but its typings declare a default export.
const robotsParser = robotsModule as unknown as typeof robotsModule.default
type Robot = ReturnType<typeof robotsParser>

// Hosts of every source URL in the config.
export const sourceHosts = (debates: readonly { sources: readonly { url?: string }[] }[]) =>
  debates.flatMap((d) => d.sources.flatMap((s) => (s.url ? [new URL(s.url).hostname] : [])))

// The only network path to agency sites and the archive (INGEST-07).
export function createHttp(options: HttpOptions): Http {
  const allowed = new Set([...options.hosts, ...ARCHIVE_HOSTS])
  const clock = options.clock ?? systemClock
  const fetchFn = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS
  const userAgent = `debates-checados/${pkg.version} (+${options.repoUrl})`
  const lanes = new Map<string, Promise<unknown>>()
  const lastStart = new Map<string, number>()
  const robots = new Map<string, Promise<Robot>>()

  // Requests to one host run one after another, each starting at least SPACING_MS after the last.
  // The archive hosts are one service and share one lane.
  const polite = <T>(host: string, task: () => Promise<T>) => {
    const lane = ARCHIVE_HOSTS.includes(host) ? ARCHIVE_HOSTS[0] : host
    const run = (lanes.get(lane) ?? Promise.resolve()).then(async () => {
      const wait = (lastStart.get(lane) ?? Number.NEGATIVE_INFINITY) + SPACING_MS - clock.now()
      if (wait > 0) await clock.sleep(wait)
      lastStart.set(lane, clock.now())
      return task()
    })
    lanes.set(
      lane,
      run.catch(() => {}),
    )
    return run
  }

  // The timeout signal also covers reading the body, so both paths map errors the same way.
  const failure = (url: URL, error: unknown) => {
    const name = (error as Error).name
    if (name === 'TimeoutError' || name === 'AbortError')
      return new HttpError('timeout', url.href, `no response after ${timeoutMs} ms`)
    return new HttpError('network', url.href, (error as Error).message)
  }

  const send = (url: URL) =>
    polite(url.hostname, async () => {
      try {
        return await fetchFn(url.href, {
          headers: { 'user-agent': userAgent },
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        throw failure(url, error)
      }
    })

  const read = async <T>(url: URL, body: () => Promise<T>) => {
    try {
      return await body()
    } catch (error) {
      throw failure(url, error)
    }
  }

  // Redirects are followed by hand so every hop passes the allowlist, `check` and its host's spacing.
  const follow = async (start: URL, check?: (url: URL) => Promise<void>) => {
    let url = start
    for (let hop = 0; ; hop++) {
      if (!allowed.has(url.hostname)) throw new HttpError('host', url.href, 'host not allowed')
      await check?.(url)
      const response = await send(url)
      const location = response.headers.get('location')
      if (response.status >= 300 && response.status < 400 && location && hop < MAX_REDIRECTS) {
        url = new URL(location, url)
        continue
      }
      return { url, response }
    }
  }

  // robots.txt is read once per host. A 4xx means no rules; any other failure, too many
  // redirects included, refuses the host.
  const readRobots = async (origin: string) => {
    const robotsUrl = new URL('/robots.txt', origin)
    const { url, response } = await follow(robotsUrl)
    let text = ''
    if (response.status === 200) text = await read(url, () => response.text())
    else if (response.status < 400 || response.status >= 500)
      throw new HttpError('robots', url.href, 'robots.txt unavailable', response.status)
    return robotsParser(robotsUrl.href, text)
  }

  const robotsFor = (url: URL) => {
    let robot = robots.get(url.origin)
    if (!robot) {
      robot = readRobots(url.origin)
      robots.set(url.origin, robot)
      robot.catch(() => robots.delete(url.origin))
    }
    return robot
  }

  return {
    async get(start) {
      const { url, response } = await follow(new URL(start), async (hop) => {
        const robot = await robotsFor(hop)
        if (robot.isAllowed(hop.href, userAgent) === false)
          throw new HttpError('robots', hop.href, 'disallowed by robots.txt')
      })
      if (response.status !== 200)
        throw new HttpError('status', url.href, `HTTP ${response.status}`, response.status)
      const bytes = new Uint8Array(await read(url, () => response.arrayBuffer()))
      return {
        url: url.href,
        body: new TextDecoder().decode(bytes),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        fetchedAt: new Date(clock.now()).toISOString(),
      }
    },
  }
}
