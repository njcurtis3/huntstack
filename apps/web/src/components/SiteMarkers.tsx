import type { MouseEvent, ReactNode } from 'react'
import { useMapContext } from 'react-simple-maps'

// Places with counts, drawn on the Migration page's state map:
//   survey     a survey site with its own point: a dot ringed in its migration-status color
//   statewide  a statewide or regional survey with no point of its own (AGFC): a square at
//              the state's center
//   ebird      an eBird place (birders' sightings, not a survey): a small purple diamond
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
  kind: 'survey' | 'statewide' | 'ebird'
}

export const EBIRD_COLOR = '#8250df'

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
  // Survey sites and eBird places cluster separately; statewide surveys never merge
  const clusters = [
    ...clusterSites(projected.filter(p => p.kind === 'ebird'), radius),
    ...clusterSites(projected.filter(p => p.kind === 'survey'), radius),
    ...projected.filter(p => p.kind === 'statewide').map(p => ({ x: p.x, y: p.y, sites: [p] })),
  ]

  return (
    <g>
      {clusters.map(c => {
        if (c.sites.length === 1) {
          const s = c.sites[0]
          const selected = s.id === selectedId
          const title = s.kind === 'ebird'
            ? `${s.name}: latest eBird sightings (not a survey count)`
            : `${s.name}${s.kind === 'statewide' ? ' (statewide survey)' : ''}: ${s.totalBirds.toLocaleString()} birds${s.isStale ? ' (old survey)' : ''}`
          const onClick = (e: MouseEvent) => { e.stopPropagation(); onSiteClick(s) }
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
        return (
          <g
            key={c.sites[0].id}
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onClusterClick(c.sites) }}
          >
            <title>{ebird
              ? `${n} eBird places (sightings, not survey counts). Click to zoom in.`
              : `${n} survey sites: ${birds.toLocaleString()} birds. Click to zoom in.`}</title>
            <circle cx={c.x} cy={c.y} r={r} fill={ebird ? EBIRD_COLOR : '#24292f'} fillOpacity={0.88} stroke="#fff" strokeWidth={1.5 / k} />
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
