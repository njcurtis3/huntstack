// Build waterfowl season zone shapes for the HuntStack map, from what fetch-sources.mjs saved.
//
// Output: apps/web/public/data/waterfowl-zones-<year>.json, one GeoJSON FeatureCollection. Each feature is the smallest piece of a state that has
// one set of season zones, with `units` listing every seasons.units value that applies there
// (always including "Statewide"). A duck zone and a goose zone that overlap become one piece.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as turf from '@turf/turf'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CACHE = path.join(HERE, '.cache')
const OUT = path.join(HERE, '../../apps/web/public/data/waterfowl-zones-2026.json')

const read = (f) => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'))
const states = read('states.json')
const counties = read('counties.json')
const flyways = read('flyways.json')
const txDuck = read('tx-duck.json')
const txGoose = read('tx-goose.json')
const ks = read('ks.json')

const stateShape = (code) => states.features.find((f) => f.properties.STUSAB === code)
const county = (stateFips, name) => {
  const f = counties.features.find((c) => c.properties.STATE === stateFips && c.properties.NAME === name)
  if (!f) throw new Error(`county ${name} not found`)
  return f
}
const union = (fs_) => (fs_.length === 1 ? fs_[0] : turf.union(turf.featureCollection(fs_)))
const intersect = (a, b) => turf.intersect(turf.featureCollection([a, b]))
const minus = (a, b) => turf.difference(turf.featureCollection([a, b]))

// ---------- highway lines ----------

const dist = (a, b) => turf.distance(turf.point(a), turf.point(b))

/** Road segments for one route, without business routes and old alignments. */
function segments(key) {
  const fc = read(`roads-${key}.json`)
  const out = []
  for (const f of fc.features) {
    const name = f.properties.NAME
    if (/Bus|Old/.test(name)) continue
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const l of lines) if (l.length > 1) out.push(l)
  }
  return out
}

/** The two closest vertices between route A and route B: where the routes meet. */
function junction(a, b) {
  let best = null
  for (const la of a) for (const p of la) for (const lb of b) for (const q of lb) {
    const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
    if (!best || d < best.d) best = { d, p, q }
  }
  return [(best.p[0] + best.q[0]) / 2, (best.p[1] + best.q[1]) / 2]
}

/**
 * Walk a route from `start` to `end`: from the current tip, take the segment whose near end is
 * closest, as long as its far end gets closer to `end`. Gaps (a concurrency the route shares
 * under another name) are bridged with a straight line.
 */
function walk(segs, start, end) {
  const used = new Set()
  const path = [start]
  let tip = start
  for (let guard = 0; guard < 5000; guard++) {
    if (dist(tip, end) < 0.5) break
    let best = null
    segs.forEach((s, i) => {
      if (used.has(i)) return
      for (const [near, far, coords] of [[s[0], s[s.length - 1], s], [s[s.length - 1], s[0], [...s].reverse()]]) {
        if (dist(far, end) >= dist(tip, end) - 0.05) continue
        const d = dist(tip, near)
        if (!best || d < best.d) best = { d, i, coords }
      }
    })
    if (!best) break
    used.add(best.i)
    path.push(...best.coords)
    tip = path[path.length - 1]
  }
  path.push(end)
  return path
}

/** Polygon on one side of a line: the line, then `closing` points around that side. */
const sidePolygon = (line, closing) => turf.polygon([[...line, ...closing, line[0]]])

// ---------- per state ----------

/**
 * Remove zero-width spikes: a ring that runs out along a line and straight back (left where two
 * sources trace the same border a few metres apart). The renderer can fill them as long wedges.
 */
function despike(ring) {
  let r = ring.slice(0, -1)
  for (let changed = true; changed && r.length > 3;) {
    changed = false
    for (let i = 0; i < r.length && r.length > 3; i++) {
      const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length]
      const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]]
      const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2)
      if (l1 === 0 || l2 === 0 || (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2) < -0.9999) {
        r.splice(i, 1)
        changed = true
        i--
      }
    }
  }
  return [...r, r[0]]
}

/** Drop slivers and pinholes (under 20 km²) left where two sources' borders don't quite meet. */
function clean(geom) {
  const raw = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  const polys = raw.map((p) => p.map(despike))
  const kept = polys
    .filter((p) => turf.area(turf.polygon([p[0]])) > 2e7)
    .map((p) => [p[0], ...p.slice(1).filter((h) => turf.area(turf.polygon([h])) > 2e7)])
  if (kept.length === 0) return null
  return kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept }
}

const features = []
// `units` applies to both ducks and geese; a state whose duck and goose zones share names but not
// lines (Illinois) passes duckUnits and gooseUnits instead.
const add = (state, id, geom, { duckZone, gooseZone, units = [], duckUnits = units, gooseUnits = units, source }) => {
  if (!geom) return
  const cleaned = clean(geom.geometry)
  if (!cleaned) return
  features.push(turf.feature(cleaned, {
    id, state, duckZone, gooseZone,
    duckUnits: [...duckUnits, 'Statewide'], gooseUnits: [...gooseUnits, 'Statewide'], source,
  }))
}

// ---------- multi-road lines ----------

/** Vertex of a route that is furthest in one direction, e.g. (p) => p[0] for the east end. */
const extreme = (segs, score) => segs.flat().reduce((a, b) => (score(b) > score(a) ? b : a))

/** Follow routes in order: leg i runs from where it meets leg i-1 to where it meets leg i+1. */
function route(legs, start, end) {
  const sets = legs.map((k) => (Array.isArray(k) ? k.flatMap(segments) : segments(k)))
  const stops = [start]
  for (let i = 0; i < sets.length - 1; i++) stops.push(junction(sets[i], sets[i + 1]))
  stops.push(end)
  return sets.flatMap((s, i) => walk(s, stops[i], stops[i + 1]))
}

const lines = {} // for the preview: every line drawn by route()

// Texas: TPWD's own duck and goose zone layers, intersected.
{
  const duck = { South: 'South Zone', North: 'North Zone', 'High Plain Mallard Management Unit': 'High Plains Mallard Management Unit' }
  const goose = { Eastern: 'Eastern Zone', Western: 'Western Zone' }
  for (const d of txDuck.features) for (const g of txGoose.features) {
    const dz = duck[d.properties.Zone]
    const gz = goose[g.properties.Zone]
    add('TX', `TX-${d.properties.AltLabel}-${g.properties.Zone}`.replace(/\s+/g, ''), intersect(d, g), {
      duckZone: dz, gooseZone: gz, units: [dz, gz], source: 'TPWD duck and goose zone layers',
    })
  }
}

// Kansas: KDWP's duck zone layer. Geese are statewide.
{
  const m = {
    'Low Plains Early Zone': ['Low Plains Early Zone', 'Low Plains Unit'],
    'Low Plains Late Zone': ['Low Plains Late Zone', 'Low Plains Unit'],
    'Southeast Zone': ['Low Plains Southeast Zone', 'Low Plains Unit'],
    'High Plains Zone': ['High Plains Unit'],
  }
  for (const f of ks.features) {
    const units = m[f.properties.Duck_Zones]
    if (!units) throw new Error('KS zone ' + f.properties.Duck_Zones)
    add('KS', `KS-${f.properties.Duck_Zones}`.replace(/\s+/g, ''), f, {
      duckZone: units[0], gooseZone: 'Statewide', units, source: 'KDWP waterfowl zone layer',
    })
  }
}

// Oklahoma (MGBH memo 2026-01). High Plains = Beaver, Cimarron and Texas counties. Low Plains
// Zone 1 is north of a line from the Texas border along OK 33, OK 47, US 183, I-40, US 177, OK 33,
// OK 18, OK 51, I-35, US 412 and OK 132 to Kansas; Zone 2 is the rest. Geese are statewide. ODWC
// gave Zones 1 and 2 the same dates for 2026-27, so their season rows say "Zones 1 and 2" and
// both pieces carry that name as well as their own.
{
  // Built from counties on both sides, so the Panhandle line is the same line in both pieces.
  const names = ['Beaver County', 'Cimarron County', 'Texas County']
  const okCounties = counties.features.filter((c) => c.properties.STATE === '40')
  const panhandle = union(okCounties.filter((c) => names.includes(c.properties.NAME)))
  const rest = union(okCounties.filter((c) => !names.includes(c.properties.NAME)))
  add('OK', 'OK-Panhandle', panhandle, {
    duckZone: 'Panhandle Counties', gooseZone: 'Statewide', units: ['Panhandle Counties'], source: 'Census counties',
  })

  // Main routes only: the Census layers also return OK 47 Alt and the OK 33 Cushing bypass
  const main = (key) => {
    const fc = read(`roads-${key}.json`)
    return fc.features
      .filter((f) => !/Alt|Byp|Bus|Old/.test(f.properties.NAME))
      .flatMap((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates))
      .filter((l) => l.length > 1)
  }
  const keys = ['ok-33w', 'ok-47', 'ok-us183', 'ok-i40', 'ok-us177', 'ok-33e', 'ok-18', 'ok-51', 'ok-i35', 'ok-us412', 'ok-132']
  const sets = keys.map(main)
  // OK 33 where it crosses the Texas border (100th meridian), and OK 132 at the Kansas border
  const start = sets[0].flat().reduce((a, b) => (Math.abs(b[0] + 100) < Math.abs(a[0] + 100) ? b : a))
  const end = extreme(sets[sets.length - 1], (p) => p[1])
  const stops = [start]
  for (let i = 0; i < sets.length - 1; i++) stops.push(junction(sets[i], sets[i + 1]))
  stops.push(end)
  const line = [
    [start[0] - 0.3, start[1]],
    ...sets.flatMap((s, i) => walk(s, stops[i], stops[i + 1])),
    [end[0], end[1] + 0.3],
  ]
  lines.ok = line
  const north = sidePolygon(line, [[end[0], 37.4], [start[0] - 0.3, 37.4]])
  const zone1 = intersect(rest, north)
  const src = 'Census roads (OK 33, OK 47, US 183, I-40, US 177, OK 18, OK 51, I-35, US 412, OK 132)'
  add('OK', 'OK-Zone1', zone1, {
    duckZone: 'Low Plains Zone 1', gooseZone: 'Statewide', units: ['Zones 1 and 2', 'Zone 1', 'Low Plains Zone 1'], source: src,
  })
  add('OK', 'OK-Zone2', minus(rest, zone1), {
    duckZone: 'Low Plains Zone 2', gooseZone: 'Statewide', units: ['Zones 1 and 2', 'Zone 2', 'Low Plains Zone 2'], source: src,
  })
}

// New Mexico: Continental Divide splits the flyways (USFWS flyway layer); I-40 from Arizona to
// Tucumcari, then US 54 to Texas, splits north from south; MRGV = Valencia, Socorro, Sierra.
{
  const nm = stateShape('NM')
  const central = intersect(nm, flyways.features.find((f) => f.properties.NAME === 'Central Flyway'))
  const pacific = intersect(nm, flyways.features.find((f) => f.properties.NAME === 'Pacific Flyway'))
  const i40 = segments('nm-i40')
  const us54 = segments('nm-us54')
  const tucumcari = junction(i40, us54)
  const west = [-109.3, 35.15]
  const line = [
    ...walk(i40, [-109.06, 35.2], tucumcari),
    ...walk(us54, tucumcari, [-103.03, 36.0]),
  ]
  // Extend past both borders so the cut crosses the whole state.
  line.unshift(west)
  line.push([-102.8, 36.2])
  const north = sidePolygon(line, [[-102.8, 37.5], [-109.3, 37.5]])
  const mrgv = union(['Valencia County', 'Socorro County', 'Sierra County'].map((n) => county('35', n)))
  const cfNorth = intersect(central, north)
  const cfSouth = minus(central, north)
  const both = 'Central Flyway (North and South Zones)'
  const outside = 'Central Flyway (North and South Zones, outside the MRGV)'
  const mrgvName = 'Middle Rio Grande Valley (Valencia, Socorro and Sierra counties)'
  add('NM', 'NM-CF-North', minus(cfNorth, mrgv), {
    duckZone: 'Central Flyway North Zone', gooseZone: 'Central Flyway', units: ['Central Flyway North Zone', both, outside],
    source: 'USFWS flyways; Census I-40 and US 54',
  })
  add('NM', 'NM-CF-South', minus(cfSouth, mrgv), {
    duckZone: 'Central Flyway South Zone', gooseZone: 'Central Flyway', units: ['Central Flyway South Zone', both, outside],
    source: 'USFWS flyways; Census I-40 and US 54',
  })
  add('NM', 'NM-MRGV', intersect(cfSouth, mrgv), {
    duckZone: 'Central Flyway South Zone', gooseZone: 'Middle Rio Grande Valley', units: ['Central Flyway South Zone', both, mrgvName],
    source: 'USFWS flyways; Census counties and I-40',
  })
  add('NM', 'NM-PF-North', intersect(pacific, north), {
    duckZone: 'Pacific Flyway', gooseZone: 'Pacific Flyway North Zone', units: ['Pacific Flyway North Zone', 'Pacific Flyway (North and South Zones)'],
    source: 'USFWS flyways; Census I-40',
  })
  add('NM', 'NM-PF-South', minus(pacific, north), {
    duckZone: 'Pacific Flyway', gooseZone: 'Pacific Flyway South Zone', units: ['Pacific Flyway South Zone', 'Pacific Flyway (North and South Zones)'],
    source: 'USFWS flyways; Census I-40',
  })
}

// Louisiana: East Zone begins at the Arkansas border, south on US 79 to LA 9, LA 9 to LA 147,
// LA 147 to US 167, US 167 to US 90, US 90 to the Mississippi line (MGBH memo 2026-01).
{
  const la = stateShape('LA')
  const us79 = segments('la-us79')
  const la9 = segments('la-la9')
  const la147 = segments('la-la147')
  const us167 = [...segments('la-us167'), ...segments('la-i49')]
  const us90 = segments('la-us90')
  // Northernmost point of US 79 in the bbox: where it crosses from Arkansas.
  const all79 = us79.flat()
  const start = all79.reduce((a, b) => (b[1] > a[1] ? b : a))
  const j1 = junction(us79, la9)
  const j2 = junction(la9, la147)
  const j3 = junction(la147, segments('la-us167'))
  const j4 = junction(segments('la-us167'), us90)
  const all90 = us90.flat()
  const end = all90.reduce((a, b) => (b[0] > a[0] ? b : a))
  const line = [
    [start[0], 33.3],
    ...walk(us79, start, j1),
    ...walk(la9, j1, j2),
    ...walk(la147, j2, j3),
    ...walk(us167, j3, j4),
    ...walk(us90, j4, end),
    [end[0] + 0.3, end[1]],
  ]
  const east = sidePolygon(line, [[-88.0, end[1]], [-88.0, 33.3]])
  const src = 'Census US 79, LA 9, LA 147, US 167, US 90'
  add('LA', 'LA-East', intersect(la, east), { duckZone: 'East Zone', gooseZone: 'Statewide', units: ['East Zone'], source: src })
  add('LA', 'LA-West', minus(la, east), { duckZone: 'West Zone', gooseZone: 'Statewide', units: ['West Zone'], source: src })
}

// Missouri: MDC's zone layer. Its description still says 2021-25, but its North line is the 2026
// one (MGBH memo 2026-01: Lock and Dam 25, Sandy Slough Road, Lincoln County Hwy N, MO 79, MO 47,
// I-70, US 63, US 24, MO 10, US 69, MO 116, US 59). Drawing that line from Census roads here and
// comparing is the check: they must agree. Geese use the same zones.
{
  const mo = stateShape('MO')
  const mdc = (zone) => read('mo-mdc.json').features.find((f) => f.properties.Zone === zone)
  const lockAndDam25 = extreme(segments('mo-sandyslough'), (p) => p[0])
  const atchison = extreme(segments('mo-us59'), (p) => -p[0])
  const line = [
    [lockAndDam25[0] + 0.2, lockAndDam25[1]],
    ...route(['mo-sandyslough', 'mo-hwyn', 'mo-79', 'mo-47', 'mo-i70', 'mo-us63', 'mo-us24', 'mo-10', 'mo-us69', 'mo-116', 'mo-us59'], lockAndDam25, atchison),
    [atchison[0] - 0.3, atchison[1]],
  ]
  lines.mo = line
  const drawn = intersect(mo, sidePolygon(line, [[-96.0, atchison[1]], [-96.0, 41.0], [-89.0, 41.0], [-89.0, lockAndDam25[1]]]))
  const north = intersect(mo, mdc('North Zone'))
  const off = [minus(drawn, north), minus(north, drawn)].reduce((a, g) => a + (g ? turf.area(g) : 0), 0) / 1e6
  if (off > 200) throw new Error(`Missouri North line from Census roads differs from MDC's by ${off.toFixed(0)} km2: has MDC changed it?`)
  const south = intersect(mo, mdc('South Zone'))
  const middle = intersect(mo, mdc('Middle Zone'))
  const src = "MDC's zone layer"
  add('MO', 'MO-North', north, { duckZone: 'North Zone', gooseZone: 'North Zone', units: ['North Zone'], source: src })
  add('MO', 'MO-Middle', middle, { duckZone: 'Middle Zone', gooseZone: 'Middle Zone', units: ['Middle Zone'], source: src })
  add('MO', 'MO-South', south, { duckZone: 'South Zone', gooseZone: 'South Zone', units: ['South Zone'], source: src })
  console.log(`MO North: Census-road line and MDC layer differ by ${off.toFixed(0)} km2`)
}

// Illinois (MGBH memo 2026-01). The North duck line runs from Indiana on Peotone-Beecher Road,
// IL 50, Wilmington-Peotone Road, IL 53, New River Road, I-55, Pine Bluff-Lorenzo Road and IL 47
// to I-80; the North goose line starts on I-80 at Indiana. Both then follow I-80, I-39, IL 18,
// IL 29 and IL 17 to the Mississippi. Central/South (ducks and geese): I-70 from Indiana, IL 4,
// IL 161, IL 158, IL 159, IL 3, St. Leo's Road, Modoc Road, Modoc Ferry Road, Levee Road and
// County Route 12 to the Modoc ferry.
{
  const il = stateShape('IL')
  const west = ['il-i80', 'il-i39', 'il-18', 'il-29', 'il-17']
  const river = extreme(segments('il-17'), (p) => -p[0])
  const northSide = (line, start) => sidePolygon(line, [[-91.7, river[1]], [-91.7, 42.7], [-87.0, 42.7], [-87.0, start[1]]])

  const duckStart = extreme(segments('il-peotonebeecher'), (p) => p[0])
  const duckLine = [[duckStart[0] + 0.2, duckStart[1]],
    ...route(['il-peotonebeecher', 'il-50', 'il-wilmingtonpeotone', 'il-53', 'il-newriver', 'il-i55', 'il-pinebluff', 'il-47', ...west], duckStart, river),
    [river[0] - 0.3, river[1]]]
  const gooseStart = extreme(segments('il-i80'), (p) => p[0])
  const gooseLine = [[gooseStart[0] + 0.2, gooseStart[1]], ...route(west, gooseStart, river), [river[0] - 0.3, river[1]]]

  const i70Start = extreme(segments('il-i70'), (p) => p[0])
  const modoc = extreme(segments('il-cr12'), (p) => -p[1]) // the ferry landing, at County Route 12's south end
  const southLine = [[i70Start[0] + 0.2, i70Start[1]],
    ...route(['il-i70', 'il-4', 'il-161', 'il-158', 'il-159', 'il-3', 'il-stleo', 'il-modoc', 'il-levee', 'il-cr12'], i70Start, modoc),
    [modoc[0] - 0.08, modoc[1] - 0.05], // the ferry route, southwest across the river
    [modoc[0] - 0.4, modoc[1] - 0.05]]
  lines.ilDuck = duckLine
  lines.ilGoose = gooseLine
  lines.ilSouth = southLine

  const duckNorth = intersect(il, northSide(duckLine, duckStart))
  const gooseNorth = intersect(il, northSide(gooseLine, gooseStart))
  const south = intersect(il, sidePolygon(southLine, [[-90.7, modoc[1] - 0.05], [-90.7, 36.8], [-87.0, 36.8], [-87.0, i70Start[1]]]))
  const src = 'Census roads'
  // Pieces: south (same for ducks and geese), the goose North, the band that is North for ducks
  // but Central for geese, and the rest of Central.
  const both = { source: src }
  add('IL', 'IL-North', intersect(duckNorth, gooseNorth), { ...both, duckZone: 'North Zone', gooseZone: 'North Zone', units: ['North Zone'] })
  add('IL', 'IL-North-duck-Central-goose', minus(duckNorth, gooseNorth), { ...both, duckZone: 'North Zone', gooseZone: 'Central Zone', duckUnits: ['North Zone'], gooseUnits: ['Central Zone'] })
  add('IL', 'IL-Central-duck-North-goose', minus(gooseNorth, duckNorth), { ...both, duckZone: 'Central Zone', gooseZone: 'North Zone', duckUnits: ['Central Zone'], gooseUnits: ['North Zone'] })
  add('IL', 'IL-Central', minus(minus(minus(il, duckNorth), gooseNorth), south), { ...both, duckZone: 'Central Zone', gooseZone: 'Central Zone', units: ['Central Zone'] })
  add('IL', 'IL-South', south, { ...both, duckZone: 'South Zone', gooseZone: 'South Zone', units: ['South Zone'] })
}

// Iowa (MGBH memo 2026-01; Iowa DNR map book: the South Zone "includes all areas west of I-29
// and south of Highway 92"). North: I-29 from South Dakota to US 20 at Sioux City, then US 20 to
// Illinois. South: west of I-29 below Sioux City, plus south of IA 92. Geese use the same zones.
{
  const ia = stateShape('IA')
  const i29 = segments('ia-i29')
  const us20 = segments('ia-us20')
  const ia92 = segments('ia-92')
  const siouxCity = junction(i29, us20)
  const dubuque = extreme(us20, (p) => p[0])
  const northLine = [[siouxCity[0] - 0.4, siouxCity[1]], ...walk(us20, siouxCity, dubuque), [dubuque[0] + 0.3, dubuque[1]]]
  const muscatine = extreme(ia92, (p) => p[0])
  const j92 = junction(i29, ia92)
  const southLine = [...walk(i29, siouxCity, j92), ...walk(ia92, j92, muscatine), [muscatine[0] + 0.3, muscatine[1]]]
  lines.iaNorth = northLine
  lines.iaSouth = southLine
  const north = intersect(ia, sidePolygon(northLine, [[dubuque[0] + 0.3, 43.8], [siouxCity[0] - 0.4, 43.8]]))
  const south = minus(intersect(ia, sidePolygon(southLine, [[muscatine[0] + 0.3, 40.0], [-96.9, 40.0], [-96.9, siouxCity[1]]])), north)
  const src = 'Census I-29, US 20 and IA 92'
  add('IA', 'IA-North', north, { duckZone: 'North Zone', gooseZone: 'North Zone', units: ['North Zone'], source: src })
  add('IA', 'IA-Central', minus(minus(ia, north), south), { duckZone: 'Central Zone', gooseZone: 'Central Zone', units: ['Central Zone'], source: src })
  add('IA', 'IA-South', south, { duckZone: 'South Zone', gooseZone: 'South Zone', units: ['South Zone'], source: src })
}

// Arkansas: every season is statewide.
add('AR', 'AR', stateShape('AR'), { duckZone: 'Statewide', gooseZone: 'Statewide', units: [], source: 'Census state outline' })

// ---------- output ----------

const round = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4] : c.map(round))
const out = turf.featureCollection(features.map((f) => {
  const s = turf.simplify(f, { tolerance: 0.003, highQuality: true })
  s.geometry.coordinates = round(s.geometry.coordinates)
  return s
}))
fs.writeFileSync(OUT, JSON.stringify(out))
fs.writeFileSync(path.join(CACHE, 'lines.json'), JSON.stringify(lines)) // for checking the road lines by eye
for (const f of out.features) {
  const { id, duckUnits, gooseUnits } = f.properties
  const same = duckUnits.join() === gooseUnits.join()
  console.log(id.padEnd(30), (turf.area(f) / 1e6).toFixed(0).padStart(8), 'km2', JSON.stringify(duckUnits), same ? '' : `geese ${JSON.stringify(gooseUnits)}`)
}
console.log('wrote', path.relative(process.cwd(), OUT), fs.statSync(OUT).size, 'bytes')
