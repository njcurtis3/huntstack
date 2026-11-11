// Which waterfowl seasons are open in each map zone on a given day.
//
// The zone shapes (public/data/waterfowl-zones-2026.json, built by scripts/zones) carry, for
// each piece of a state, every seasons.units value that applies there, once for ducks and once
// for geese (Illinois' North duck and North goose lines differ). A season applies to a zone when
// one of its units is in the zone's list for its birds; "Statewide" is in every list.

export type BirdGroup = 'duck' | 'goose'
export type ZoneStatus = 'open' | 'special' | 'closed' | 'none'

export interface ZoneProperties {
  id: string
  state: string
  duckZone: string
  gooseZone: string
  duckUnits: string[]
  gooseUnits: string[]
  source: string
}

export interface MapSeason {
  state: string
  name: string
  seasonType: string | null
  /** YYYY-MM-DD */
  start: string
  /** YYYY-MM-DD */
  end: string
  units: string[]
  group: BirdGroup
  bagDaily: number | null
  sourceUrl: string | null
  restrictions: string | null
}

/** Season types that are only for some hunters or some birds: teal, youth, veterans, falconry. */
const SPECIAL_TYPES = new Set(['teal', 'youth', 'special', 'falconry', 'conservation_order'])

export function isSpecialSeason(s: Pick<MapSeason, 'seasonType'>): boolean {
  return SPECIAL_TYPES.has(s.seasonType ?? '')
}

export function groupForSpecies(slug: string): BirdGroup {
  return slug.endsWith('-goose') ? 'goose' : 'duck'
}

/** The local calendar day as YYYY-MM-DD. */
export function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return isoDay(new Date(y, m - 1, d + n))
}

/** The season year a day belongs to: July through June, stored as the year it starts. */
export function seasonYearOf(day: string): number {
  const [y, m] = day.split('-').map(Number)
  return m >= 7 ? y : y - 1
}

export function seasonsForZone(all: MapSeason[], zone: Pick<ZoneProperties, 'state' | 'duckUnits' | 'gooseUnits'>, group: BirdGroup): MapSeason[] {
  const units = new Set(group === 'duck' ? zone.duckUnits : zone.gooseUnits)
  return all.filter(s => s.state === zone.state && s.group === group && s.units.some(u => units.has(u)))
}

export const isOpenOn = (s: MapSeason, day: string) => s.start <= day && day <= s.end

/** open: a regular season is open. special: only teal, youth, veterans or falconry days are. */
export function zoneStatus(seasons: MapSeason[], day: string): ZoneStatus {
  if (seasons.length === 0) return 'none'
  const open = seasons.filter(s => isOpenOn(s, day))
  if (open.some(s => !isSpecialSeason(s))) return 'open'
  if (open.length > 0) return 'special'
  return 'closed'
}

/** One row per season: species seasons stored twice (blue-winged and green-winged teal) collapse. */
export function dedupeSeasons(seasons: MapSeason[]): MapSeason[] {
  const seen = new Map<string, MapSeason>()
  for (const s of seasons) {
    const key = `${s.name}|${s.start}|${s.end}`
    if (!seen.has(key)) seen.set(key, s)
  }
  return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
}

/** The next day a closed zone opens, and the day an open one's regular season ends. */
export function nextChange(seasons: MapSeason[], day: string): { opens?: string; closes?: string } {
  const regular = seasons.filter(s => !isSpecialSeason(s))
  const openNow = regular.filter(s => isOpenOn(s, day))
  if (openNow.length > 0) {
    // Follow back-to-back splits: the season ends on the last day no regular season covers the next.
    let end = openNow.reduce((a, s) => (s.end > a ? s.end : a), day)
    for (;;) {
      const next = addDays(end, 1)
      const cont = regular.filter(s => isOpenOn(s, next))
      if (cont.length === 0) break
      end = cont.reduce((a, s) => (s.end > a ? s.end : a), next)
    }
    return { closes: end }
  }
  const upcoming = regular.filter(s => s.start > day).map(s => s.start).sort()
  return upcoming.length > 0 ? { opens: upcoming[0] } : {}
}
