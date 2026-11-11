import { isoDay } from './zoneSeasons'

// Free map taps: visitors and free accounts can open MAP_FREE_TAPS details a day (a zone, site,
// state, eBird place or report); Pro and admin are never counted. Panning, zooming and the layer
// and day controls are always free.
//
// The count lives in this browser only, so a private window starts over. That is deliberate: the
// same data is free on the Migration page, so the wall is a nudge to subscribe, not a lock, and a
// server-side count would cost a request per tap to protect nothing.

export const MAP_FREE_TAPS = 10

const KEY = 'huntstack-map-taps'

type Stored = { day: string; used: number }

function read(): Stored {
  const today = isoDay(new Date())
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<Stored>
      if (v.day === today && typeof v.used === 'number' && v.used >= 0) return { day: today, used: v.used }
    }
  } catch {
    // storage blocked or bad JSON: start the day over
  }
  return { day: today, used: 0 }
}

/** Taps used today */
export function mapTapsUsed(): number {
  return read().used
}

/** Spend one tap. `allowed` is false once today's taps are gone, and nothing is spent then. */
export function spendMapTap(): { allowed: boolean; used: number } {
  const s = read()
  if (s.used >= MAP_FREE_TAPS) return { allowed: false, used: s.used }
  const next = { day: s.day, used: s.used + 1 }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage blocked: the tap still opens, it just isn't remembered
  }
  return { allowed: true, used: next.used }
}
