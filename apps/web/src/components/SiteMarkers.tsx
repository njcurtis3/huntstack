import type { MouseEvent, ReactNode } from 'react'
import { useMapContext } from 'react-simple-maps'

// Places with counts, drawn on the Migration page's state map:
//   survey     a survey site with its own point: a dot ringed in its migration-status color
//   statewide  a statewide or regional survey with no point of its own (AGFC): a square at
//              the state's center
//   ebird      an eBird place (birders' sightings, not a survey): a small purple diamond
//   quiet      an eBird place with no duck or goose reports in 14 days: a hollow grey diamond
//   report     hunter reports in one map cell (unverified, not a count): an amber triangle
// Survey sites closer together than a few pixels merge into one numbered circle, eBird places
// into a purple one, so a river with 25 sites reads as a few circles until the map is zoomed
// in. No map library: positions come from the map's own projection.

export type MapSite = {
  id: string
  name: string
  state: string
  lat: number
  lng: number
  totalBirds: number
  color: string
  isStale: boolean
  kind: 'survey' | 'statewide' | 'ebird' | 'quiet' | 'report'
}

export const EBIRD_COLOR = '#8250df'
export const REPORT_COLOR = '#d97706'

type Projected = MapSite & { x: number; y: number }

export type SiteCluster = { x: number; y: number; sites: Projected[] }

const CLUSTER_PX = 26 // on screen, at any zoom
const DOT_PX = 5
const MAX_ZOOM = 12

/** Greedy clustering: the largest site seeds a cluster and takes every free site within `radius`. */
export function clusterSites(points: Projected[], radius: number): SiteCluster[] {
  const sorted = [...points].sort((a, b) => b.totalBirds - a.totalBirds)
  const taken = new Set<string>()
  const clusters: SiteCluster[] = []
  for (const seed of sorted) {
    if (taken.has(seed.id)) continue
    const members = sorted.filter(p =>
      !taken.has(p.id) && Math.hypot(p.x - seed.x, p.y - seed.y) <= radius)
    members.forEach(p => taken.add(p.id))
    clusters.push({ x: seed.x, y: seed.y, sites: members })
  }
  return clusters
}

/** Center (in map pixels) and zoom that fit these points in a width × height map, with a margin. */
export function fitPoints(
  points: Array<[number, number]>,
  width: number,
  height: number,
): { x: number; y: number; k: number } | null {
  if (points.length === 0) return null
  const xs = points.map(p => p[0])
  const ys = points.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  // A lone site or a tight group still gets a sensible box (about one state wide)
  const bw = Math.max(maxX - minX, 60)
  const bh = Math.max(maxY - minY, 60)
  const k = Math.min(MAX_ZOOM, Math.max(1, 0.75 * Math.min(width / bw, height / bh)))
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, k }
}

/** Zooms everything inside it to fit `target` (the whole map when it's null or empty). */
export function ZoomGroup({ target, children }: {
  target: Array<{ lng: number; lat: number }> | null
  children: (k: number) => ReactNode
}) {
  const { projection, width, height } = useMapContext()
  const points = (target ?? [])
    .map(t => projection([t.lng, t.lat]))
    .filter((p): p is [number, number] => !!p)
  const fit = fitPoints(points, width, height)
  const k = fit?.k ?? 1
  const zoomed = !!fit && k > 1
  // A CSS transform (not the SVG attribute) so the zoom animates
  const transform = zoomed
    ? `translate(${width / 2}px, ${height / 2}px) scale(${k}) translate(${-fit.x}px, ${-fit.y}px)`
    : 'none'
  return (
    <g style={{ transform, transformOrigin: '0 0', transition: 'transform 350ms ease' }}>
      {children(zoomed ? k : 1)}
    </g>
  )
}

export function SiteMarkers({ sites, k, screenScale = 1, selectedId, onSiteClick, onClusterClick }: {
  sites: MapSite[]
  k: number
  /** Map units per screen pixel (above 1 on a phone), so markers stay a tappable size */
  screenScale?: number
  selectedId: string | null
  onSiteClick: (site: MapSite) => void
  onClusterClick: (sites: MapSite[]) => void
}) {
  const { projection } = useMapContext()
  // Stop merging once the map can't zoom any closer
  const atMaxZoom = k >= MAX_ZOOM
  // Everything below is sized in screen pixels: divide out the zoom, multiply back the shrink
  k = k / screenScale
  const projected: Projected[] = []
  for (const s of sites) {
    const p = projection([s.lng, s.lat])
    if (p) projected.push({ ...s, x: p[0], y: p[1] })
  }
  const radius = atMaxZoom ? 0 : CLUSTER_PX / k
  // Survey sites and eBird places cluster separately; statewide surveys never merge, and
  // quiet places (drawn first, underneath) never merge into a count of places with sightings
  const clusters = [
    ...projected.filter(p => p.kind === 'quiet').map(p => ({ x: p.x, y: p.y, sites: [p] })),
    ...clusterSites(projected.filter(p => p.kind === 'ebird'), radius),
    ...clusterSites(projected.filter(p => p.kind === 'survey'), radius),
    ...projected.filter(p => p.kind === 'statewide').map(p => ({ x: p.x, y: p.y, sites: [p] })),
    // Hunter reports cluster only with each other and are drawn last, on top
    ...clusterSites(projected.filter(p => p.kind === 'report'), radius),
  ]

  return (
    <g>
      {clusters.map(c => {
        if (c.sites.length === 1) {
          const s = c.sites[0]
          const selected = s.id === selectedId
          const title = s.kind === 'report'
            ? `${s.totalBirds} hunter ${s.totalBirds === 1 ? 'report' : 'reports'} (unverified)`
            : s.kind === 'quiet'
            ? `${s.name}: no ducks or geese reported to eBird in the last 14 days (groups of 5 or more)`
            : s.kind === 'ebird'
            ? `${s.name}: latest eBird sightings (not a survey count)`
            : `${s.name}${s.kind === 'statewide' ? ' (statewide survey)' : ''}: ${s.totalBirds.toLocaleString()} birds${s.isStale ? ' (old survey)' : ''}`
          const onClick = (e: MouseEvent) => { e.stopPropagation(); onSiteClick(s) }
          if (s.kind === 'report') {
            const h = (selected ? 8 : 6.5) / k
            return (
              <polygon
                key={s.id}
                points={`${c.x},${c.y - h} ${c.x + h},${c.y + h * 0.8} ${c.x - h},${c.y + h * 0.8}`}
                fill={REPORT_COLOR}
                stroke="#fff"
                strokeWidth={1.5 / k}
                style={{ cursor: 'pointer' }}
                onClick={onClick}
              >
                <title>{title}</title>
              </polygon>
            )
          }
          if (s.kind === 'quiet') {
            const h = (selected ? 6 : 4.5) / k
            return (
              <polygon
                key={s.id}
                points={`${c.x},${c.y - h} ${c.x + h},${c.y} ${c.x},${c.y + h} ${c.x - h},${c.y}`}
                fill="#fff"
                stroke={s.color}
                strokeWidth={1.5 / k}
                style={{ cursor: 'pointer' }}
                onClick={onClick}
              >
                <title>{title}</title>
              </polygon>
            )
          }
          if (s.kind === 'ebird') {
            const h = (selected ? 6 : 4.5) / k
            return (
              <polygon
                key={s.id}
                points={`${c.x},${c.y - h} ${c.x + h},${c.y} ${c.x},${c.y + h} ${c.x - h},${c.y}`}
                fill={EBIRD_COLOR}
                stroke="#fff"
                strokeWidth={1.2 / k}
                style={{ cursor: 'pointer' }}
                onClick={onClick}
              >
                <title>{title}</title>
              </polygon>
            )
          }
          if (s.kind === 'statewide') {
            const h = (selected ? 8 : 6.5) / k
            return (
              <rect
                key={s.id}
                x={c.x - h}
                y={c.y - h}
                width={2 * h}
                height={2 * h}
                rx={1.5 / k}
                fill="#fff"
                stroke={s.isStale ? '#9ca3af' : s.color}
                strokeWidth={3 / k}
                style={{ cursor: 'pointer' }}
                onClick={onClick}
              >
                <title>{title}</title>
              </rect>
            )
          }
          return (
            <circle
              key={s.id}
              cx={c.x}
              cy={c.y}
              r={(selected ? DOT_PX + 2 : DOT_PX) / k}
              // White center and a status-colored ring: shows on any state color
              fill="#fff"
              stroke={s.isStale ? '#9ca3af' : s.color}
              strokeWidth={(selected ? 4 : 3) / k}
              style={{ cursor: 'pointer' }}
              onClick={onClick}
            >
              <title>{title}</title>
            </circle>
          )
        }
        const n = c.sites.length
        const r = (9 + Math.min(8, Math.log2(n) * 2)) / k
        const birds = c.sites.reduce((t, s) => t + (s.isStale ? 0 : s.totalBirds), 0)
        const ebird = c.sites[0].kind === 'ebird'
        const report = c.sites[0].kind === 'report'
        return (
          <g
            key={c.sites[0].id}
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onClusterClick(c.sites) }}
          >
            <title>{report
              ? `${n} places with hunter reports (unverified). Click to zoom in.`
              : ebird
              ? `${n} eBird places (sightings, not survey counts). Click to zoom in.`
              : `${n} survey sites: ${birds.toLocaleString()} birds. Click to zoom in.`}</title>
            <circle cx={c.x} cy={c.y} r={r} fill={report ? REPORT_COLOR : ebird ? EBIRD_COLOR : '#24292f'} fillOpacity={0.88} stroke="#fff" strokeWidth={1.5 / k} />
            <text
              x={c.x}
              y={c.y}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 10 / k, fontWeight: 700, fill: '#fff', pointerEvents: 'none', userSelect: 'none' }}
            >
              {n}
            </text>
          </g>
        )
      })}
    </g>
  )
}

// Towns drawn when the map is zoomed in, so a hunter can tell where a site is. The map has no
// basemap on purpose (HuntStack doesn't compete on maps); a few known places are enough to
// read "that cluster is just north of St. Louis".
const REFERENCE_TOWNS: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'St. Louis', lat: 38.627, lng: -90.199 },
  { name: 'Kansas City', lat: 39.0997, lng: -94.5786 },
  { name: 'St. Joseph', lat: 39.7675, lng: -94.8467 },
  { name: 'Hannibal', lat: 39.7084, lng: -91.3585 },
  { name: 'Columbia', lat: 38.9517, lng: -92.3341 },
  { name: 'Springfield, MO', lat: 37.209, lng: -93.2923 },
  { name: 'Peoria', lat: 40.6936, lng: -89.589 },
  { name: 'Quincy', lat: 39.9356, lng: -91.4099 },
  { name: 'Springfield, IL', lat: 39.7817, lng: -89.6501 },
  { name: 'Burlington', lat: 40.8075, lng: -91.1129 },
  { name: 'Little Rock', lat: 34.7465, lng: -92.2896 },
  { name: 'Stuttgart', lat: 34.5004, lng: -91.5526 },
  { name: 'Jonesboro', lat: 35.8423, lng: -90.7043 },
  { name: 'Memphis', lat: 35.1495, lng: -90.049 },
  { name: 'Lake Charles', lat: 30.2266, lng: -93.2174 },
  { name: 'Lafayette', lat: 30.2241, lng: -92.0198 },
  { name: 'Baton Rouge', lat: 30.4515, lng: -91.1871 },
  { name: 'Monroe', lat: 32.5093, lng: -92.1193 },
  { name: 'Houston', lat: 29.7604, lng: -95.3698 },
  { name: 'Dallas', lat: 32.7767, lng: -96.797 },
  { name: 'Sherman', lat: 33.6357, lng: -96.6089 },
  { name: 'Amarillo', lat: 35.222, lng: -101.8313 },
  { name: 'Lubbock', lat: 33.5779, lng: -101.8552 },
  { name: 'Corpus Christi', lat: 27.8006, lng: -97.3964 },
  { name: 'Oklahoma City', lat: 35.4676, lng: -97.5164 },
  { name: 'Tulsa', lat: 36.154, lng: -95.9928 },
  { name: 'Enid', lat: 36.3956, lng: -97.8784 },
  { name: 'Wichita', lat: 37.6872, lng: -97.3301 },
  { name: 'Great Bend', lat: 38.3645, lng: -98.7648 },
  { name: 'Albuquerque', lat: 35.0844, lng: -106.6504 },
  { name: 'Roswell', lat: 33.3943, lng: -104.523 },
  { name: 'Socorro', lat: 34.0584, lng: -106.8914 },
]

/** Town dots and names, sized in screen pixels; only drawn when zoomed in (k > 1.5). */
export function ReferenceTowns({ k, screenScale = 1 }: { k: number; screenScale?: number }) {
  const { projection } = useMapContext()
  if (k <= 1.5) return null
  const px = screenScale / k
  return (
    <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
      {REFERENCE_TOWNS.map(t => {
        const p = projection([t.lng, t.lat])
        if (!p) return null
        return (
          <g key={t.name}>
            <circle cx={p[0]} cy={p[1]} r={2.5 * px} fill="#57606a" stroke="#fff" strokeWidth={1 * px} />
            <text
              x={p[0] + 5 * px}
              y={p[1] + 4 * px}
              style={{ fontSize: 11 * px, fill: '#24292f', stroke: '#fff', strokeWidth: 3 * px, paintOrder: 'stroke', fontWeight: 600 }}
            >
              {t.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}
