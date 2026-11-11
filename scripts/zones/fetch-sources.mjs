// Download the public boundary data the season-zone map is built from, into scripts/zones/.cache.
// Run: cd scripts/zones && npm install && node fetch-sources.mjs && node build-zones.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache')
fs.mkdirSync(CACHE, { recursive: true })

const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb'

// Agency zone layers (ArcGIS Online), the USFWS flyway layer, and Census outlines.
const layers = [
  ['tx-duck', 'https://services1.arcgis.com/1mtXwieMId59thmg/arcgis/rest/services/Duck_Zones/FeatureServer/0', '1=1', null, '0.003'],
  ['tx-goose', 'https://services1.arcgis.com/1mtXwieMId59thmg/arcgis/rest/services/Goose_Zones/FeatureServer/0', '1=1', null, '0.003'],
  ['ks', 'https://services1.arcgis.com/q2CglofYX6ACNEeu/arcgis/rest/services/Waterfowl_Zones/FeatureServer/0', '1=1', null, '0.003'],
  ['flyways', 'https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/FWS_HQ_MB_Waterfowl_Flyway_Boundaries/FeatureServer/0', '1=1', [-109.1, 31.3, -103, 37.1]],
  // MDC's zone layer. Its description says 2021-25, but it was redrawn for 2026; build-zones.mjs
  // checks its North line against one drawn from Census roads.
  ['mo-mdc', 'https://gisblue.mdc.mo.gov/arcgis/rest/services/Boundaries/Hunting_Zones/MapServer/1', '1=1'],
  ['states', `${TIGER}/State_County/MapServer/0`, "STUSAB IN ('OK','NM','LA','AR','TX','KS','MO','IL','IA')"],
  ['counties', `${TIGER}/State_County/MapServer/1`, "STATE IN ('40','35')"],
]

// Highways that zone lines follow, by route type and number, inside a box.
const routes = [
  ['la-us79', 'U', '79', [-93.6, 32.5, -92.6, 33.1]],
  ['la-la9', 'S', '9', [-93.3, 32.2, -92.7, 33.1]],
  ['la-la147', 'S', '147', [-93.2, 32.0, -92.3, 32.8]],
  ['la-us167', 'U', '167', [-93.0, 30.0, -91.8, 33.1]],
  ['la-i49', 'I', '49', [-92.3, 30.1, -91.8, 30.8]], // US 167 runs on I-49 from Opelousas to Lafayette
  ['la-us90', 'U', '90', [-92.2, 29.4, -89.4, 30.4]],
  ['nm-i40', 'I', '40', [-109.2, 34.6, -102.9, 35.6]],
  ['nm-us54', 'U', '54', [-103.8, 35.0, -102.9, 36.2]],
]

// The 2026 zone lines in Missouri, Illinois and Iowa, leg by leg (MGBH memo 2026-01). Each leg is
// [key, where, bbox]; these also search local roads (layer 8), where county roads and lettered
// Missouri routes are filed.
const S = (n) => `RTTYP='S' AND BASENAME='${n}'`
const U = (n) => `RTTYP='U' AND BASENAME='${n}'`
const I = (n) => `RTTYP='I' AND BASENAME='${n}'`
const named = (...names) => names.map((n) => `UPPER(NAME) LIKE '%${n}%'`).join(' OR ')
const legs = [
  // Missouri North Zone line: Lock and Dam 25 west to the Kansas border
  ['mo-sandyslough', named('SANDY SLOUGH'), [-91.0, 38.85, -90.55, 39.15]],
  ['mo-hwyn', S('N'), [-91.0, 38.85, -90.6, 39.15]],
  ['mo-79', S('79'), [-91.2, 38.8, -90.6, 39.3]],
  ['mo-47', S('47'), [-91.3, 38.7, -90.7, 39.1]],
  ['mo-i70', I('70'), [-92.6, 38.7, -90.9, 39.1]],
  ['mo-us63', U('63'), [-92.6, 38.85, -92.2, 39.6]],
  ['mo-us24', U('24'), [-94.5, 39.0, -92.3, 39.6]],
  ['mo-10', S('10'), [-94.3, 39.1, -93.3, 39.5]],
  ['mo-us69', U('69'), [-94.6, 39.1, -94.0, 39.8]],
  ['mo-116', S('116'), [-95.0, 39.4, -94.0, 39.8]],
  ['mo-us59', U('59'), [-95.2, 39.2, -94.6, 39.8]],
  // Illinois North duck line: Indiana border west to the Mississippi
  ['il-peotonebeecher', named('PEOTONE BEECHER', 'PEOTONE-BEECHER'), [-87.8, 41.25, -87.5, 41.4]],
  ['il-50', S('50'), [-87.85, 41.2, -87.7, 41.4]],
  ['il-wilmingtonpeotone', named('WILMINGTON PEOTONE', 'WILMINGTON-PEOTONE'), [-88.2, 41.25, -87.7, 41.4]],
  ['il-53', S('53'), [-88.25, 41.2, -88.0, 41.45]],
  ['il-newriver', named('NEW RIVER'), [-88.3, 41.2, -88.0, 41.5]],
  ['il-i55', I('55'), [-88.4, 41.2, -88.0, 41.5]],
  ['il-pinebluff', `(${named('PINE BLUFF', 'LORENZO')}) AND NOT UPPER(NAME) LIKE '%OLD%'`, [-88.5, 41.2, -88.1, 41.4]],
  ['il-47', S('47'), [-88.5, 41.2, -88.3, 41.5]],
  ['il-i80', I('80'), [-89.2, 41.2, -87.5, 41.6]],
  ['il-i39', I('39'), [-89.2, 41.0, -88.9, 41.5]],
  ['il-18', S('18'), [-90.0, 40.9, -89.0, 41.3]],
  ['il-29', S('29'), [-89.7, 40.9, -89.3, 41.3]],
  ['il-17', S('17'), [-91.1, 40.9, -89.3, 41.3]],
  // Illinois Central/South line: Indiana border along I-70 to the Modoc ferry
  ['il-i70', I('70'), [-89.9, 38.7, -87.5, 39.5]],
  ['il-4', S('4'), [-90.0, 38.4, -89.6, 39.1]],
  ['il-161', S('161'), [-90.0, 38.4, -89.7, 38.65]],
  ['il-158', S('158'), [-90.15, 38.3, -89.8, 38.65]],
  ['il-159', S('159'), [-90.15, 38.0, -89.8, 38.65]],
  ['il-3', S('3'), [-90.25, 37.9, -89.85, 38.35]],
  ['il-stleo', named('SAINT LEO', 'ST LEO'), [-90.1, 37.95, -89.9, 38.15]],
  ['il-modoc', named('MODOC'), [-90.15, 37.95, -89.9, 38.15]],
  ['il-levee', named('LEVEE'), [-90.15, 37.95, -89.95, 38.1]],
  ['il-cr12', `RTTYP='C' AND BASENAME='12'`, [-90.15, 37.95, -89.95, 38.1]],
  // Iowa: I-29 and US 20 (North), I-29 and IA 92 (South)
  ['ia-i29', I('29'), [-96.7, 40.5, -95.7, 42.6]],
  ['ia-us20', U('20'), [-96.6, 42.2, -90.5, 42.6]],
  ['ia-92', S('92'), [-96.1, 41.0, -90.9, 41.5]],
]

async function query(url, where, bbox, offset = '0.002') {
  const p = new URLSearchParams({
    where, outFields: '*', outSR: '4326', geometryPrecision: '5', f: 'geojson',
  })
  if (offset) p.set('maxAllowableOffset', offset)
  if (bbox) {
    p.set('geometry', bbox.join(','))
    p.set('geometryType', 'esriGeometryEnvelope')
    p.set('inSR', '4326')
    p.set('spatialRel', 'esriSpatialRelIntersects')
  }
  const res = await fetch(`${url}/query?${p}`)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const j = await res.json()
  if (j.error) throw new Error(`${url}: ${JSON.stringify(j.error)}`)
  return j
}

for (const [name, url, where, bbox, offset] of layers) {
  const j = await query(url, where, bbox, offset)
  fs.writeFileSync(path.join(CACHE, `${name}.json`), JSON.stringify(j))
  console.log(name.padEnd(10), j.features.length, 'features')
}

for (const [key, rttyp, base, bbox] of routes) {
  const features = []
  for (const layer of [2, 6]) { // primary roads, and secondary roads at the most detailed scale
    const j = await query(`${TIGER}/Transportation/MapServer/${layer}`, `RTTYP='${rttyp}' AND BASENAME='${base}'`, bbox, '')
    features.push(...j.features)
  }
  fs.writeFileSync(path.join(CACHE, `roads-${key}.json`), JSON.stringify({ type: 'FeatureCollection', features }))
  console.log(key.padEnd(10), features.length, 'road segments')
}

for (const [key, where, bbox] of legs) {
  const features = []
  for (const layer of [2, 6, 8]) {
    const j = await query(`${TIGER}/Transportation/MapServer/${layer}`, where, bbox, '')
    features.push(...j.features)
  }
  if (features.length === 0) throw new Error(`${key}: no road segments found`)
  fs.writeFileSync(path.join(CACHE, `roads-${key}.json`), JSON.stringify({ type: 'FeatureCollection', features }))
  console.log(key.padEnd(20), features.length, 'road segments', [...new Set(features.map((f) => f.properties.NAME))].slice(0, 4).join(' ; '))
}
