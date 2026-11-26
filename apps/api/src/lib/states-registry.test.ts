/**
 * Guards for the state registry (packages/shared/src/states.json).
 *
 * 1. No new hard-coded list of covered states: an array literal or Set of 3+ state codes, mostly
 *    covered ones, in the API, website or shared package fails, unless its file is allowed below (source-specific
 *    lists that say which states a source covers, not which states HuntStack covers).
 * 2. The generated data files agree with the registry: every state in them is covered, and every
 *    covered state has towns (towns are what Where to Hunt names its areas after).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COVERED_STATES, REGISTRY_STATES } from '@huntstack/shared/states'
import { PLACES } from '../data/places.js'
import { PUBLIC_LANDS } from '../data/public-lands.js'
import { RIVER_GAUGES } from '../data/river-gauges.js'

const ROOT = resolve(__dirname, '../../../..')

// Files where a list of state codes is right: the registry, tests, generated data, and
// all-50-states tables (names, FIPS) that are not about coverage.
const ALLOWED = [
  'packages/shared/src/states.json',
  'packages/shared/src/index.ts', // US_STATES: all 50 names, for input checks
  'apps/api/src/data/',
  'apps/web/src/lib/migrationGroups.ts', // FLYWAY_STATE_ORDER: flyway geography, north to south
  'apps/web/src/pages/RegulationsPage.tsx', // all 50 names, for the US map
  'apps/web/src/pages/MigrationReportPage.tsx', // all 50 names
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('state registry', () => {
  it('has unique codes and slugs, and a centre inside the US for each state', () => {
    const codes = REGISTRY_STATES.map(s => s.code)
    expect(new Set(codes).size).toBe(codes.length)
    const slugs = REGISTRY_STATES.map(s => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of REGISTRY_STATES) {
      expect(s.code).toMatch(/^[A-Z]{2}$/)
      const [lng, lat] = s.center
      expect(lng).toBeGreaterThan(-125)
      expect(lng).toBeLessThan(-66)
      expect(lat).toBeGreaterThan(24)
      expect(lat).toBeLessThan(50)
      if (s.covered) expect(s.agency).not.toBeNull()
    }
  })

  it('no file hard-codes a list of covered states', () => {
    const covered = new Set(COVERED_STATES)
    // An array or Set literal of quoted two-letter codes
    const list = /[[(]\s*((?:['"][A-Z]{2}['"]\s*,\s*){2,}['"][A-Z]{2}['"])\s*,?\s*[\])]/g
    const offenders: string[] = []
    for (const dir of ['apps/api/src', 'apps/web/src', 'packages/shared/src']) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const rel = relative(ROOT, file).replace(/\\/g, '/')
        if (ALLOWED.some(a => rel === a || (a.endsWith('/') && rel.startsWith(a)))) continue
        const text = readFileSync(file, 'utf-8')
        for (const m of text.matchAll(list)) {
          const codes = m[1].match(/[A-Z]{2}/g) ?? []
          // Mostly covered states: a coverage list (a list of ambiguous two-letter words is not)
          const n = codes.filter(c => covered.has(c)).length
          if (n >= 3 && n * 2 >= codes.length) offenders.push(`${rel}: ${m[0].slice(0, 60)}`)
        }
      }
    }
    expect(offenders, 'read the states from @huntstack/shared/states (website: src/lib/states.ts)').toEqual([])
  })

  it('generated data files hold only covered states, and every covered state has towns', () => {
    const covered = new Set(COVERED_STATES)
    const placeStates = new Set(PLACES.map(p => p[1]))
    expect([...placeStates].filter(s => !covered.has(s))).toEqual([])
    expect(COVERED_STATES.filter(s => !placeStates.has(s))).toEqual([])
    expect([...new Set(PUBLIC_LANDS.map(p => p[3]))].filter(s => !covered.has(s))).toEqual([])
    expect([...new Set(RIVER_GAUGES.map(g => g[2]))].filter(s => !covered.has(s))).toEqual([])
  })

  it('scraper source lists name only registry states', () => {
    const registry = new Set(REGISTRY_STATES.map(s => s.code))
    for (const file of [
      'apps/scrapers-python/huntstack_scrapers/extract_regulations.py',
      'apps/scrapers-python/huntstack_scrapers/pipeline/registry.py',
    ]) {
      const m = readFileSync(join(ROOT, file), 'utf-8').match(/V1_STATES = \[([^\]]*)\]/)
      expect(m, file).not.toBeNull()
      const codes = m![1].match(/[A-Z]{2}/g) ?? []
      expect(codes.filter(c => !registry.has(c)), file).toEqual([])
    }
  })
})
