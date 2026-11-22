import { groupForSpecies, isoDay } from './zoneSeasons'

// The Map page keeps what is on screen in its address, so a view can be linked, bookmarked or
// shared. Parameters (all optional):
//   at=lat,lng,zoom      the camera
//   layers=a,b,c         the layers that are on, only when they differ from the defaults
//   base=satellite       the basemap, when not the plain map
//   sel=kind:id          the open details (an area, zone, survey site, state, eBird place)
//   in=ST, sp=slug       for sel=area: the state and species of the Where to Hunt list the area
//                        came from, so the map can find an area that isn't one of its own pins
//   date, birds, zone    as before (zone= is the Regulations page's link)

export type MapView = { lat: number; lng: number; zoom: number }

/** "35.1990,-101.8330,8.25" -> a view; null when malformed or out of range */
export function parseMapView(at: string | null): MapView | null {
  if (!at) return null
  const parts = at.split(',').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null
  const [lat, lng, zoom] = parts
  if (Math.abs(lat) > 85 || Math.abs(lng) > 180 || zoom < 0 || zoom > 22) return null
  return { lat, lng, zoom }
}

export function formatMapView(v: MapView): string {
  return `${v.lat.toFixed(4)},${v.lng.toFixed(4)},${v.zoom.toFixed(2)}`
}

/** "area:abc" -> { kind, id }; the id may itself contain a colon ("ebird:L123") */
export function parseMapSelection(sel: string | null): { kind: string; id: string } | null {
  if (!sel) return null
  const i = sel.indexOf(':')
  if (i <= 0 || i === sel.length - 1) return null
  return { kind: sel.slice(0, i), id: sel.slice(i + 1) }
}

/** A link to one Where to Hunt area on the Map, with its details open. */
export function mapAreaLink(area: { id: string; state: string }, opts: { date?: string; species?: string | null } = {}): string {
  const p = new URLSearchParams({ sel: `area:${area.id}`, in: area.state })
  if (opts.species) {
    p.set('sp', opts.species)
    if (groupForSpecies(opts.species) === 'goose') p.set('birds', 'goose')
  }
  if (opts.date && opts.date !== isoDay(new Date())) p.set('date', opts.date)
  return `/map?${p}`
}
