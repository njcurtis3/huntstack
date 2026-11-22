import { isoDay } from './zoneSeasons'

// Free map taps: visitors and free accounts can open MAP_FREE_TAPS details a day (a zone, site,
// state, eBird place or report); Pro and admin are never counted. Panning, zooming and the layer
// and day controls are always free.
//
// The count lives in this browser only, so a private window starts over. That is deliberate: the
// same data is free on the Migration page, so the wall is a nudge to subscribe, not a lock, and a
// server-side count would cost a request per tap to protect nothing.
//
// Each thing costs one tap a day: opening the same details again (tapping it twice, reloading a
// linked view, coming Back to the map) is free. The ids opened today are kept beside the count.

export const MAP_FREE_TAPS = 10

const KEY = 'huntstack-map-taps'

type Stored = { day: string; used: number; seen: string[] }

/** More than a day's taps, so a free user's whole day fits */
const MAX_SEEN = 50

function read(): Stored {
  const today = isoDay(new Date())
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<Stored>
      if (v.day === today && typeof v.used === 'number' && v.used >= 0) {
        const seen = Array.isArray(v.seen) ? v.seen.filter((x): x is string => typeof x === 'string') : []
        return { day: today, used: v.used, seen }
      }
    }
  } catch {
    // storage blocked or bad JSON: start the day over
  }
  return { day: today, used: 0, seen: [] }
}

/** Taps used today */
export function mapTapsUsed(): number {
  return read().used
}

/** Spend one tap on the details `id` ("kind:id"), unless they were already opened today.
 *  `allowed` is false once today's taps are gone, and nothing is spent then. */
export function spendMapTap(id: string): { allowed: boolean; used: number } {
  const s = read()
  if (s.seen.includes(id)) return { allowed: true, used: s.used }
  if (s.used >= MAP_FREE_TAPS) return { allowed: false, used: s.used }
  const next: Stored = { day: s.day, used: s.used + 1, seen: [...s.seen, id].slice(-MAX_SEEN) }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage blocked: the tap still opens, it just isn't remembered
  }
  return { allowed: true, used: next.used }
}
