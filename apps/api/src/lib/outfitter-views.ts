import { createHash } from 'node:crypto'
import { BoundedCache } from './cache.js'
import { utcDay } from './outfitters.js'
import type { OutfitterTx, ViewKind } from './outfitter-store.js'

// Server-side view counting into a daily aggregate. Nothing identifying is ever written: the viewer
// key (sha256 of the UTC day, IP and User-Agent) lives only in this process's memory to dedupe, and
// only (outfitter, day, kind, count) reaches the database. The dedupe resets on deploy (accepted).

export const MAX_DEDUPE_KEYS = 50_000
const DAY_MS = 24 * 60 * 60 * 1000

// Crawlers, link previews and uptime checks: skipped so counts reflect people
const BOT_RE = /bot|crawl|spider|slurp|curl|wget|python|httpclient|headless|preview|facebookexternalhit|monitor/i

export function isCountableUserAgent(userAgent: string | undefined): boolean {
  return !!userAgent && userAgent.trim() !== '' && !BOT_RE.test(userAgent)
}

export interface Viewer {
  ip: string
  userAgent: string | undefined
}

export interface ViewCounter {
  /** Count each item once per viewer, kind and UTC day. Never throws; resolves once the write settled. */
  record(viewer: Viewer, items: Array<{ outfitterId: string; kind: ViewKind }>, log?: { error: (obj: unknown, msg: string) => void }): Promise<void>
}

export function createViewCounter({ store, now }: { store: Pick<OutfitterTx, 'addViews'>; now: () => Date }): ViewCounter {
  const seen = new BoundedCache<true>(MAX_DEDUPE_KEYS)
  return {
    async record(viewer, items, log) {
      try {
        if (!isCountableUserAgent(viewer.userAgent)) return
        const day = utcDay(now())
        const viewerKey = createHash('sha256').update(`${day}|${viewer.ip}|${viewer.userAgent}`).digest('hex')
        const deltas = new Map<string, { outfitterId: string; day: string; kind: ViewKind; n: number }>()
        for (const { outfitterId, kind } of items) {
          const key = `${viewerKey}:${outfitterId}:${kind}`
          if (seen.get(key)) continue
          seen.set(key, true, DAY_MS)
          deltas.set(`${outfitterId}:${kind}`, { outfitterId, day, kind, n: 1 })
        }
        if (deltas.size > 0) await store.addViews([...deltas.values()])
      } catch (err) {
        // Counting is best effort: a failure here must never fail the page it was counting
        log?.error(err, 'outfitter view count failed')
      }
    },
  }
}
