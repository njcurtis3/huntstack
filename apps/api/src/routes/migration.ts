import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { getPushFactorsForStates, pushFactorLabel } from '../lib/weather.js'
import { defaultModel, generateChatResponse, isConfigured } from '../lib/together.js'
import { loadLatestSummary, saveSummary, summaryScope, type SummaryOutcome } from '../lib/summary-store.js'
import { STATE_FLYWAY, getEBirdHotspots, packHotspots } from '../lib/ebird.js'
import { getStateActivity, type StateSpeciesActivity } from '../lib/ebird-activity.js'
import { BoundedCache } from '../lib/cache.js'
import { decodeJsonbField, decodePoint } from '../lib/jsonb.js'
import { loadLatestCounts, loadSurveyAverages } from '../lib/survey-data.js'
import {
  buildSiteFacts, moveFacts, pickSites, siteFact, stateNotes, summaryProblems, templateSummary, tidySummary,
  toSummaryCounts, type Fact,
  type SiteFact,
} from '../lib/weekly-summary.js'

// The states HuntStack covers: the default for push factors and statewide eBird activity
// (Illinois and Iowa were missing, so the map's Migration Index and the Migration page left them out)
const V1_STATES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO', 'IL', 'IA']

// Approximate state centroids (latitude) for N→S ordering
// Used when a location doesn't have a precise center_point
const STATE_LATITUDES: Record<string, number> = {
  MO: 38.5,
  KS: 38.7,
  OK: 35.5,
  AR: 34.8,
  TX: 31.5,
  NM: 34.5,
  LA: 30.9,
  ND: 47.5,
  SD: 44.3,
  NE: 41.5,
  IA: 42.0,
  MN: 46.4,
  WI: 44.8,
  IL: 40.6,
  MS: 32.3,
}

// ─── Weekly summary cache (6h TTL) ───────────────────────────────────────────

interface SummaryCache {
  summary: string
  generatedAt: string
  expiresAt: number
}

const summaryCache = new BoundedCache<SummaryCache>()
const SUMMARY_TTL = 6 * 60 * 60 * 1000  // 6 hours

// Floor on how often `?refresh=true` may actually force a regeneration. The summary is a shared
// artifact keyed only by flyway/species — it is not per-user — so regenerating it more than once
// every 15 minutes produces no new information regardless of who asked. Without this, `refresh`
// bypassed the cache entirely on an unauthenticated route whose only ceiling was the global
// 100 req/min, i.e. up to 100 forced LLM generations per minute. A regeneration floor is
// preferable to an IP rate limit here because it cannot be evaded by rotating IPs.
// See INFRASTRUCTURE_COSTS.md section 5.2.
const REFRESH_MIN_AGE_MS = 15 * 60 * 1000  // 15 minutes

function getCachedSummary(key: string): SummaryCache | null {
  return summaryCache.get(key)
}

/**
 * The model's summary, held to the facts (weekly-summary.ts summaryProblems): a draft that fails
 * is written again once, told what was wrong, and if it still fails the summary is the template.
 */
async function writeCheckedSummary(
  userPrompt: string,
  systemPrompt: string,
  factsText: string,
  facts: Fact[],
  sites: SiteFact[],
  notes: string[],
  log: FastifyBaseLogger,
): Promise<{ text: string; outcome: SummaryOutcome; problems: string[] }> {
  const problemsOf = (t: string) => summaryProblems(t, factsText, facts, sites)
  let text = tidySummary(await generateChatResponse(userPrompt, systemPrompt))
  const first = problemsOf(text)
  if (first.length === 0) return { text, outcome: 'first_draft', problems: [] }
  log.warn({ bad: first, text }, 'weekly summary: draft not backed by the facts, writing it again')

  const retry = `${userPrompt}

Your previous draft said things the facts do not contain: ${first.join('; ')}. Write it again using only what the facts above say.`
  text = tidySummary(await generateChatResponse(retry, systemPrompt))
  const second = problemsOf(text)
  if (second.length === 0) return { text, outcome: 'retry', problems: first }
  log.warn({ bad: second, text }, 'weekly summary: second draft failed the check, using the template')
  return { text: templateSummary(sites, notes), outcome: 'template', problems: [...first, ...second] }
}

export const migrationRoutes: FastifyPluginAsync = async (app) => {
  // Push factors: weather signals that indicate birds are likely moving
  app.get('/push-factors', {
    schema: {
      tags: ['migration'],
      summary: 'Weather push factors indicating bird movement potential per state',
      querystring: {
        type: 'object',
        properties: {
          states: {
            type: 'string',
            description: 'Comma-separated state codes. Defaults to all V1 states.',
          },
        },
      },
    },
  }, async (request, reply) => {
    const { states: statesParam } = request.query as { states?: string }

    const stateCodes = statesParam
      ? statesParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 2)
      : V1_STATES

    if (statesParam && stateCodes.length === 0) {
      return reply.status(400).send({ error: true, message: 'states parameter must contain at least one valid 2-letter state code' })
    }

    const db = getDb()
    // Get ALL refuge centerPoints per state for multi-point push scoring
    const refugeRows = await db.execute(sql`
      SELECT
        s.code AS state_code,
        l.center_point
      FROM locations l
      JOIN states s ON l.state_id = s.id
      WHERE l.location_type = 'wildlife_refuge'
        AND l.center_point IS NOT NULL
        AND l.name NOT LIKE '% - Statewide MWI'
        AND s.code IN (${sql.join(stateCodes.map(c => sql`${c}`), sql`, `)})
      ORDER BY s.code, l.name
    `)

    const refugesByState = new Map<string, { lat: number; lng: number }[]>()
    for (const row of refugeRows as unknown as Array<{ state_code: string; center_point: unknown }>) {
      const cp = decodePoint(row.center_point)
      if (cp) {
        if (!refugesByState.has(row.state_code)) refugesByState.set(row.state_code, [])
        refugesByState.get(row.state_code)!.push(cp)
      }
    }

    const { pushFactors, regionalPushFactors, highPushStates } = await getPushFactorsForStates(stateCodes, refugesByState)

    return {
      pushFactors,
      // Sub-state regions scored on their own points (today: the Texas High Plains duck zone)
      regionalPushFactors,
      highPushStates,
      fetchedAt: new Date().toISOString(),
    }
  })

  // Weekly Migration Summary — LLM-generated narrative, cached 6h
  app.get('/weekly-summary', {
    schema: {
      tags: ['migration'],
      summary: 'LLM-generated weekly migration intelligence summary',
      querystring: {
        type: 'object',
        properties: {
          flyway: { type: 'string', description: 'Filter by flyway (central, mississippi, etc.)' },
          species: { type: 'string', description: 'Filter by species slug' },
          refresh: { type: 'boolean', description: 'Force regenerate (bypass cache)' },
        },
      },
    },
  }, async (request, reply) => {
    const { flyway, species, refresh: refreshParam } = request.query as {
      flyway?: string
      species?: string
      refresh?: string | boolean
    }
    // Query string values arrive as strings regardless of schema type declaration.
    // Explicitly parse so ?refresh=false does not bypass the cache.
    const refresh = refreshParam === true || refreshParam === 'true'

    const cacheKey = summaryScope(flyway, species)

    // Return the cached summary when it is fresh, and also when a forced refresh arrives before
    // the regeneration floor has elapsed (see REFRESH_MIN_AGE_MS). After a restart, or on another
    // API instance, the memory cache is empty: the newest saved summary stands in for it.
    let cached = getCachedSummary(cacheKey)
    if (!cached) {
      const saved = await loadLatestSummary(cacheKey, SUMMARY_TTL)
      if (saved) {
        cached = {
          summary: saved.summary,
          generatedAt: saved.generatedAt.toISOString(),
          expiresAt: saved.generatedAt.getTime() + SUMMARY_TTL,
        }
        summaryCache.set(cacheKey, cached, cached.expiresAt - Date.now())
      }
    }
    if (cached) {
      const ageMs = Date.now() - new Date(cached.generatedAt).getTime()
      if (!refresh || ageMs < REFRESH_MIN_AGE_MS) {
        return { summary: cached.summary, generatedAt: cached.generatedAt, cached: true }
      }
    }

    if (!isConfigured()) {
      return reply.status(503).send({
        error: true,
        message: 'AI service not configured.',
      })
    }

    const db = getDb()

    // The same counts the Migration page's cards show, grouped per site with the arithmetic done
    // here (weekly-summary.ts): the model only writes them up.
    let rawCounts = await loadLatestCounts(db, species)
    if (flyway) {
      const want = flyway.toLowerCase()
      rawCounts = rawCounts.filter(r =>
        decodeJsonbField<{ flyway?: string }>(r.location_metadata)?.flyway?.toLowerCase() === want)
    }
    const averages = await loadSurveyAverages(db, species)
    const allSites = buildSiteFacts(toSummaryCounts(rawCounts), averages)

    if (allSites.length === 0) {
      return {
        summary: templateSummary([], []),
        generatedAt: new Date().toISOString(),
        cached: false,
      }
    }

    const sites = pickSites(allSites)
    const notes = stateNotes(allSites)

    // Also fetch push factors for weather context
    const statesInData = [...new Set(sites.map(s => s.state))]
    const weatherFacts: Fact[] = []

    if (statesInData.length > 0) {
      try {
        const refugePoints = await db.execute(sql`
          SELECT
            s.code AS state_code, l.center_point
          FROM locations l
          JOIN states s ON l.state_id = s.id
          WHERE l.location_type = 'wildlife_refuge'
            AND l.center_point IS NOT NULL
            AND l.name NOT LIKE '% - Statewide MWI'
            AND s.code IN (${sql.join(statesInData.map(c => sql`${c}`), sql`, `)})
          ORDER BY s.code, l.name
        `)

        const refugesByState = new Map<string, { lat: number; lng: number }[]>()
        for (const row of refugePoints as unknown as Array<{ state_code: string; center_point: unknown }>) {
          const cp = decodePoint(row.center_point)
          if (cp) {
            if (!refugesByState.has(row.state_code)) refugesByState.set(row.state_code, [])
            refugesByState.get(row.state_code)!.push(cp)
          }
        }

        const { pushFactors, regionalPushFactors } = await getPushFactorsForStates(statesInData, refugesByState)
        // Only weather strong enough to move birds: given a push score of 1, the model advised
        // hunters to "consider the north winds" despite being told not to below 2
        for (const pf of [...pushFactors, ...regionalPushFactors].filter(pf => pf.pushScore >= 2)) {
          const signals = [
            pf.coldFrontPresent && 'cold front present',
            pf.coldFrontIncoming && 'cold front incoming (48h)',
            pf.windIsFromNorth && `north winds (${pf.windDirection})`,
            pf.temperature !== null && pf.temperature < 32 && `sub-freezing (${pf.temperature}°${pf.temperatureUnit})`,
          ].filter(Boolean).join(', ')
          weatherFacts.push({
            kind: 'weather', state: pf.stateCode,
            text: `- ${pushFactorLabel(pf)}: push score ${pf.pushScore}/3${signals ? ' | Push signals: ' + signals : ''}`,
          })
        }
      } catch {
        // Weather context is optional — proceed without it
      }
    }

    // eBird community context: where birds are being reported statewide, to supplement refuge data
    const ebirdFacts: Fact[] = []
    if (statesInData.length > 0 && process.env.EBIRD_API_KEY) {
      try {
        const activity = summarizeStateActivity(await getStateActivity(statesInData))
          .filter(sa => sa.totalCurrentCount > 0)
          .sort((a, b) => b.totalPlaces - a.totalPlaces)
          .map(sa => {
            const trend = sa.overallDeltaPercent !== null
              ? `, ${sa.overallDeltaPercent >= 0 ? '+' : ''}${sa.overallDeltaPercent.toFixed(0)}% vs two weeks earlier`
              : ''
            const top = sa.topSpecies.map(t => `${t.speciesName} at ${t.places} places`).join(', ')
            return {
              kind: 'ebird' as const, state: sa.state,
              text: `- ${sa.state}: waterfowl reported at ${sa.totalPlaces} places in the last 14 days${trend}; most reported: ${top}`,
            }
          })
        ebirdFacts.push(...activity)
      } catch {
        // eBird context is optional — proceed without it
      }
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const systemPrompt = `You are a waterfowl migration analyst writing the weekly report for HuntStack, a hunting intelligence site. Write in plain prose: no markdown, bold, bullet points or headers. Write plainly for duck and goose hunters.

Rules:
- Use only the facts you are given. Every number you write must appear in the facts; round it if you like ("1.4 million"), but never add numbers together or work out a percentage of your own.
- Name only places that appear in the facts. Do not name rivers, regions or areas that are not listed.
- Each change is already described ("up 41% since Nov 3", "up from 205 on Oct 28"); keep its dates and wording. Where the facts give no percentage, do not invent one.
- Where a site has a long-term average, it says more about the season than the change since the previous survey; say it.
- If a state note says the count is partial, do not describe that state as a whole from it.
- Give hunting advice only from the weather lines (push score 2 or higher). With no weather lines, just report the counts, and do not mention weather or advice. Never give generic advice such as "watch the wind" or "check eBird".
- Never mention these rules.`

    // Each line keeps its subject, so the check can tell a site's number from an eBird one
    const moves = moveFacts(sites)
    const siteFacts = sites.map(siteFact)
    const section = (title: string, lines: Fact[], note = '') =>
      lines.length ? `${title}\n${lines.map(f => f.text).join('\n')}${note}\n\n` : ''
    const facts = [
      section('Largest movements since the previous survey, in birds:', moves),
      section('Survey sites, current counts, largest first:', siteFacts),
      notes.length ? `State notes:\n${notes.map(x => `- ${x}`).join('\n')}\n\n` : '',
      section('Current weather/push conditions:', weatherFacts),
      section('eBird birder reports (latest report at each place, last 14 days):', ebirdFacts,
        '\nNote: these are birder reports, not surveys; they show where birds are being seen and supplement official refuge counts.'),
    ].join('').trim()
    const factLines = [...moves, ...siteFacts, ...weatherFacts, ...ebirdFacts]

    const userPrompt = `Today is ${today}. Write the weekly migration summary for waterfowl hunters${flyway ? ' in the ' + flyway + ' flyway' : ''}${species ? ', about ' + species.replace(/-/g, ' ') : ''}: one or two short paragraphs, under 150 words. Open with the largest movements of birds from the survey counts, then the long-term comparison if there is one. eBird reports come last, if at all.

${facts}`

    const written = await writeCheckedSummary(userPrompt, systemPrompt, facts, factLines, sites, notes, request.log)

    const now = new Date()
    const result: SummaryCache = {
      summary: written.text.trim(),
      generatedAt: now.toISOString(),
      expiresAt: now.getTime() + SUMMARY_TTL,
    }

    summaryCache.set(cacheKey, result, SUMMARY_TTL)
    saveSummary({
      scope: cacheKey, flyway: flyway?.toLowerCase() || null, speciesSlug: species || null,
      summary: result.summary, outcome: written.outcome, problems: written.problems,
      facts, model: defaultModel(),
    }, now)

    return {
      summary: result.summary,
      generatedAt: result.generatedAt,
      cached: false,
    }
  })

  // Flyway Progression — weekly count time-series grouped by state, ordered N→S
  app.get('/flyway-progression', {
    schema: {
      tags: ['migration'],
      summary: 'Weekly count progression by state, ordered N→S to visualize migration movement',
      querystring: {
        type: 'object',
        properties: {
          species: { type: 'string', description: 'Species slug filter' },
          flyway: { type: 'string', description: 'Flyway filter (central, mississippi, etc.)' },
          year: { type: 'number', description: 'Season year (uses current year if omitted)' },
          seasons: { type: 'number', description: 'Number of recent seasons to include (default 1, max 3)' },
        },
      },
    },
  }, async (request) => {
    const { species, flyway, year, seasons } = request.query as {
      species?: string
      flyway?: string
      year?: number
      seasons?: number
    }

    const db = getDb()

    // Season window: Oct 1 of (year-1) through Mar 31 of year (duck season spans Nov-Jan)
    const currentYear = new Date().getFullYear()
    const seasonYear = year ?? (new Date().getMonth() >= 9 ? currentYear + 1 : currentYear)
    const numSeasons = Math.min(3, Math.max(1, seasons ?? 1))

    const startYear = seasonYear - numSeasons
    const startDate = `${startYear}-09-01`
    const endDate = `${seasonYear}-04-30`

    const speciesFilter = species ? sql`AND sp.slug = ${species}` : sql``
    const flywayFilter = flyway ? sql`AND l.metadata->>'flyway' ILIKE ${flyway}` : sql``

    const rows = await db.execute(sql`
      SELECT
        s.code AS state_code,
        s.name AS state_name,
        DATE_TRUNC('week', rc.survey_date) AS week_start,
        SUM(rc.count) AS total_count,
        COALESCE(
          AVG((l.center_point->>'lat')::numeric),
          NULL
        ) AS avg_lat
      FROM refuge_counts rc
      JOIN locations l ON rc.location_id = l.id
      JOIN states s ON l.state_id = s.id
      JOIN species sp ON rc.species_id = sp.id
      WHERE l.name NOT LIKE '% - Statewide MWI'
        -- survey-only rows (AGFC survey zones, TPWD High Plains) are already in a statewide count
        AND (l.metadata->>'survey_only') IS DISTINCT FROM 'true'
        AND rc.survey_date BETWEEN ${startDate}::date AND ${endDate}::date
        ${speciesFilter}
        ${flywayFilter}
      GROUP BY s.code, s.name, DATE_TRUNC('week', rc.survey_date)
      ORDER BY s.code, week_start
    `)

    type ProgressionRow = {
      state_code: string
      state_name: string
      week_start: string
      total_count: string | number
      avg_lat: string | number | null
    }

    const rawRows = rows as unknown as ProgressionRow[]

    // Build per-state series
    const stateMap = new Map<string, {
      stateCode: string
      stateName: string
      latitude: number
      weeks: Array<{ weekStart: string; totalCount: number }>
      peakWeek: string | null
      peakCount: number
    }>()

    for (const row of rawRows) {
      const count = Number(row.total_count)
      const lat = row.avg_lat !== null
        ? Number(row.avg_lat)
        : (STATE_LATITUDES[row.state_code] ?? 35)

      if (!stateMap.has(row.state_code)) {
        stateMap.set(row.state_code, {
          stateCode: row.state_code,
          stateName: row.state_name,
          latitude: lat,
          weeks: [],
          peakWeek: null,
          peakCount: 0,
        })
      }

      const entry = stateMap.get(row.state_code)!
      const weekStr = new Date(row.week_start).toISOString().slice(0, 10)
      entry.weeks.push({ weekStart: weekStr, totalCount: count })

      if (count > entry.peakCount) {
        entry.peakCount = count
        entry.peakWeek = weekStr
      }

      // Prefer real lat over hardcoded centroid once we see data
      if (row.avg_lat !== null) {
        entry.latitude = lat
      }
    }

    // Sort states N→S (descending latitude)
    const states = [...stateMap.values()].sort((a, b) => b.latitude - a.latitude)

    // Build a unified week axis (union of all weeks, sorted)
    const allWeeks = [...new Set(rawRows.map(r => new Date(r.week_start).toISOString().slice(0, 10)))].sort()

    return {
      seasonYear,
      seasonWindow: { start: startDate, end: endDate },
      weeks: allWeeks,
      states,
      species: species ?? null,
      flyway: flyway ?? null,
    }
  })

  // Regional Activity — statewide eBird community observation totals with trends
  app.get('/regional-activity', {
    schema: {
      tags: ['migration'],
      summary: 'State-level eBird activity: places reporting each species in the last 14 days, birds in each place\'s latest report, and the change since the snapshot ~14 days earlier',
      querystring: {
        type: 'object',
        properties: {
          flyway: {
            type: 'string',
            enum: ['central', 'mississippi', 'pacific', 'atlantic'],
            description: 'Filter states by flyway',
          },
          species: { type: 'string', description: 'Species slug filter (e.g., snow-goose)' },
          states: { type: 'string', description: 'Comma-separated state codes, e.g. TX,NM,AR. Defaults to all V1 states.' },
        },
      },
    },
  }, async (request) => {
    const { flyway, species, states: statesParam } = request.query as {
      flyway?: string
      species?: string
      states?: string
    }

    const empty = {
      stateActivity: [],
      flywayRollup: [],
      fetchedAt: new Date().toISOString(),
      source: 'ebird',
      attribution: 'Community observations via eBird (Cornell Lab of Ornithology)',
    }

    if (!process.env.EBIRD_API_KEY) return empty

    // Determine target states
    let targetStates = statesParam
      ? statesParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 2)
      : V1_STATES

    // Apply flyway filter using STATE_FLYWAY lookup
    if (flyway) {
      targetStates = targetStates.filter(s => STATE_FLYWAY[s] === flyway)
    }

    if (targetStates.length === 0) return empty

    const stateActivity = summarizeStateActivity(await getStateActivity(targetStates, species ? [species] : undefined))

    // Flyway rollup; a change only when every state in the flyway has an earlier snapshot
    const flywayTotals = new Map<string, { current: number; previous: number | null; places: number }>()
    for (const sa of stateActivity) {
      if (!sa.flyway) continue
      if (!flywayTotals.has(sa.flyway)) flywayTotals.set(sa.flyway, { current: 0, previous: 0, places: 0 })
      const ft = flywayTotals.get(sa.flyway)!
      ft.current += sa.totalCurrentCount
      ft.places += sa.totalPlaces
      ft.previous = ft.previous === null || sa.totalPreviousCount === null ? null : ft.previous + sa.totalPreviousCount
    }

    const flywayRollup = [...flywayTotals.entries()].map(([fw, totals]) => ({
      flyway: fw,
      totalCurrentCount: totals.current,
      totalPlaces: totals.places,
      totalPreviousCount: totals.previous,
      delta: totals.previous === null ? null : totals.current - totals.previous,
      deltaPercent: totals.previous ? Math.round(((totals.current - totals.previous) / totals.previous) * 1000) / 10 : null,
    }))

    return {
      stateActivity,
      flywayRollup,
      fetchedAt: new Date().toISOString(),
      source: 'ebird',
      attribution: 'Community observations via eBird (Cornell Lab of Ornithology)',
    }
  })

  // eBird for the Map page: every public hotspot with a duck or goose report in the last 14 days
  // in the states whose eBird answers are kept fresh (STATE_FLYWAY, refreshed every 6 hours), and
  // each state's activity for every species. Read from the same cached answers as
  // /regional-activity, so it asks eBird for nothing the refresh hasn't already.
  app.get('/ebird-map', {
    schema: {
      tags: ['migration'],
      summary: 'eBird hotspots with duck or goose reports in the last 14 days (latest report per species), and statewide activity per species',
    },
  }, async () => {
    const states = Object.keys(STATE_FLYWAY)
    const base = {
      states,
      days: 14,
      source: 'ebird',
      attribution: 'Community observations via eBird (Cornell Lab of Ornithology)',
    }
    if (!process.env.EBIRD_API_KEY) return { ...base, hotspots: packHotspots([]), stateSpecies: [], fetchedAt: new Date().toISOString() }
    const [places, activity] = await Promise.all([getEBirdHotspots(states), getStateActivity(states)])
    return {
      ...base,
      hotspots: packHotspots(places),
      stateSpecies: activity.map(a => ({
        state: a.state,
        species: a.species,
        speciesName: a.speciesName,
        places: a.places,
        birds: a.currentCount,
        deltaPercent: a.deltaPercent,
        trend: a.trend,
        topPlaces: a.topPlaces,
      })),
      fetchedAt: new Date().toISOString(),
    }
  })
}

// Per-state cards for the Migration page's Regional Activity and the weekly summary
export function summarizeStateActivity(rows: StateSpeciesActivity[]) {
  const LEVEL_ORDER = { high: 0, moderate: 1, low: 2 } as const
  const byState = new Map<string, StateSpeciesActivity[]>()
  for (const r of rows) {
    if (!byState.has(r.state)) byState.set(r.state, [])
    byState.get(r.state)!.push(r)
  }
  return [...byState.entries()]
    .map(([state, counts]) => {
      const totalCurrent = counts.reduce((n, c) => n + c.currentCount, 0)
      const totalPlaces = counts.reduce((n, c) => n + c.places, 0)
      // A change only when every species has an earlier snapshot to compare with
      const totalPrevious = counts.every(c => c.previousCount !== null)
        ? counts.reduce((n, c) => n + (c.previousCount ?? 0), 0)
        : null
      const overallDelta = totalPrevious === null ? null : totalCurrent - totalPrevious
      const overallDeltaPercent = totalPrevious ? Math.round(((totalCurrent - totalPrevious) / totalPrevious) * 1000) / 10 : null
      const activityLevel: 'high' | 'moderate' | 'low' =
        counts.some(c => c.activityLevel === 'high') ? 'high'
          : counts.some(c => c.activityLevel === 'moderate') ? 'moderate' : 'low'
      return {
        state,
        flyway: STATE_FLYWAY[state] ?? null,
        totalCurrentCount: totalCurrent,
        totalPlaces,
        totalPreviousCount: totalPrevious,
        overallDelta,
        overallDeltaPercent,
        activityLevel,
        topSpecies: [...counts]
          .sort((a, b) => b.places - a.places)
          .slice(0, 3)
          .map(c => ({
            species: c.species,
            speciesName: c.speciesName,
            count: c.currentCount,
            places: c.places,
            trend: c.trend,
            delta: c.delta,
            deltaPercent: c.deltaPercent,
            activityLevel: c.activityLevel,
          })),
        fetchedAt: counts[0]?.fetchedAt ?? new Date().toISOString(),
      }
    })
    .sort((a, b) => {
      const levelDiff = LEVEL_ORDER[a.activityLevel] - LEVEL_ORDER[b.activityLevel]
      return levelDiff !== 0 ? levelDiff : b.totalPlaces - a.totalPlaces
    })
}
