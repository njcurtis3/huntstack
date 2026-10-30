import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { isConfigured, generateChatWithWebSearch } from '../lib/together.js'
import { isEmbeddingConfigured, generateEmbedding } from '../lib/embeddings.js'
import { searchChunks, type ChunkFilters } from '../lib/retrieval.js'
import { getDb } from '../lib/db.js'
import { sql } from 'drizzle-orm'
import { getPushFactorsForStates, pushFactorLabel } from '../lib/weather.js'
import { chatRequestSchema } from '@huntstack/shared'
import { decodeJsonbField, decodePoint } from '../lib/jsonb.js'

// Fastify/AJV (schema.body below) is what actually enforces validation at
// runtime; this type keeps the handler's view of the body in sync with that
// same shape instead of via a hand-maintained duplicate.
type ChatRequestBody = z.infer<typeof chatRequestSchema>

// ─── Entity aliases for query matching ───────────────────────────────────────

const STATE_ALIASES: Record<string, string> = {
  texas: 'TX', tx: 'TX',
  // Panhandle places hunters name instead of the state ("snow geese near Amarillo")
  amarillo: 'TX', lubbock: 'TX', 'texas panhandle': 'TX', 'south plains': 'TX',
  arkansas: 'AR', ar: 'AR',
  louisiana: 'LA', la: 'LA',
  'new mexico': 'NM', nm: 'NM',
  kansas: 'KS', ks: 'KS',
  oklahoma: 'OK', ok: 'OK',
  colorado: 'CO', co: 'CO',
  missouri: 'MO', mo: 'MO',
  montana: 'MT', mt: 'MT',
  wyoming: 'WY', wy: 'WY',
}

const SPECIES_ALIASES: Record<string, string> = {
  mallard: 'mallard', mallards: 'mallard',
  pintail: 'pintail', pintails: 'pintail', 'northern pintail': 'pintail',
  'green-winged teal': 'green-winged-teal', 'greenwing': 'green-winged-teal', 'gw teal': 'green-winged-teal',
  'blue-winged teal': 'blue-winged-teal', 'bluewing': 'blue-winged-teal', 'bw teal': 'blue-winged-teal',
  'snow goose': 'snow-goose', 'snow geese': 'snow-goose', 'light goose': 'snow-goose', 'light geese': 'snow-goose',
  'canada goose': 'canada-goose', 'canada geese': 'canada-goose', 'honker': 'canada-goose', 'honkers': 'canada-goose',
  'ross goose': 'ross-goose', "ross's goose": 'ross-goose', 'ross geese': 'ross-goose',
  'white-fronted goose': 'white-fronted-goose', 'specklebelly': 'white-fronted-goose', 'speck': 'white-fronted-goose', 'specks': 'white-fronted-goose',
  'wood duck': 'wood-duck', 'woodie': 'wood-duck', 'woodies': 'wood-duck',
  gadwall: 'gadwall', gadwalls: 'gadwall',
  wigeon: 'american-wigeon', 'american wigeon': 'american-wigeon', baldpate: 'american-wigeon',
  shoveler: 'northern-shoveler', 'northern shoveler': 'northern-shoveler', spoonbill: 'northern-shoveler', shovelers: 'northern-shoveler',
  canvasback: 'canvasback', canvasbacks: 'canvasback', can: 'canvasback', cans: 'canvasback',
  redhead: 'redhead', redheads: 'redhead',
  scaup: 'scaup', bluebill: 'scaup', bluebills: 'scaup',
  'ring-necked duck': 'ring-necked-duck', ringneck: 'ring-necked-duck', ringnecks: 'ring-necked-duck', ringbill: 'ring-necked-duck',
  bufflehead: 'bufflehead', buffleheads: 'bufflehead', butterball: 'bufflehead',
  'ruddy duck': 'ruddy-duck', ruddy: 'ruddy-duck',
  'mottled duck': 'mottled-duck',
  elk: 'elk',
  'mule deer': 'mule-deer', 'muley': 'mule-deer', 'muleys': 'mule-deer',
  'whitetail': 'whitetail-deer', 'white-tailed deer': 'whitetail-deer', 'whitetail deer': 'whitetail-deer',
  pronghorn: 'pronghorn', antelope: 'pronghorn',
  'black bear': 'black-bear', bear: 'black-bear',
  turkey: 'wild-turkey', 'wild turkey': 'wild-turkey',
  quail: 'northern-bobwhite-quail', bobwhite: 'northern-bobwhite-quail',
  pheasant: 'ring-necked-pheasant', 'ring-necked pheasant': 'ring-necked-pheasant',
}

// Broad category keywords that indicate waterfowl interest
const WATERFOWL_KEYWORDS = ['duck', 'ducks', 'goose', 'geese', 'waterfowl', 'teal']
const MIGRATION_KEYWORDS = ['migration', 'migrating', 'flying', 'counts', 'refuge', 'survey', 'birds moving', 'what\'s flying', 'push', 'numbers', 'population']
// Questions about the rules. On these, survey and area reports are left out of document
// search (lib/retrieval.ts REPORT_PATTERN) unless the question also asks about birds or places.
// Word starts, so "seasons", "closing" and "required" count but "relationship" isn't HIP.
const REGULATION_PATTERN = /\b(bag|limits?\b|possession|seasons?\b|open(s|er|ers|ing)?\b|clos(e|es|ed|ing)\b|dates?\b|licen[cs]e|stamps?\b|permits?\b|hip\b|regulation|rules?\b|legal|shooting (hours|time)|steel shot|non-?toxic|youth|zones?\b|split|fees?\b|cost|price|how much|requir|allowed)/
const LOCATION_KEYWORDS = ['where to hunt', 'where should i hunt', 'public land', 'public hunting', 'wma', 'wildlife management area', 'national forest', 'blm', 'wildlife refuge', 'hunting area', 'hunting location', 'place to hunt', 'spots to hunt']
const WEATHER_KEYWORDS = ['weather', 'forecast', 'temperature', 'wind', 'cold front', 'rain', 'snow', 'freeze', 'conditions', 'hunting conditions', 'front']
// Questions about birds being somewhere now ("where are the snow geese right now?"), which ask
// for counts and push factors without using a migration keyword.
const BIRDS_NOW_PATTERN = /\b(where are|right now|this (week|weekend)|today|tomorrow|moving|arriv|showed up|how many|how'?s the hunting|how is the hunting)/

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExtractedEntities {
  stateCodes: string[]
  speciesSlugs: string[]
  isWaterfowl: boolean
  isMigrationQuery: boolean
  isLocationQuery: boolean
  isWeatherQuery: boolean
  isRegulationQuery: boolean
  isBirdsNowQuery: boolean
}

interface StructuredContext {
  seasons: Array<Record<string, unknown>>
  licenses: Array<Record<string, unknown>>
  regulations: Array<Record<string, unknown>>
  refugeCounts: Array<Record<string, unknown>>
  /** Sub-state midwinter survey series per year (today: TPWD High Plains, 1997–2018) */
  midwinterHistory: Array<{ region: string; year: number; species: string | null; total: number }>
  surveyZones: SurveyZoneRow[]
  locations: Array<Record<string, unknown>>
  weather: Array<Record<string, unknown>>
  pushFactors: Array<{ stateCode: string; regionName?: string; pushScore: number; coldFrontPresent: boolean; coldFrontIncoming: boolean; windDirection: string | null; windIsFromNorth: boolean; temperature: number | null }>
  sources: Array<{ title: string; url?: string; snippet: string }>
  lastScrapedByState: Record<string, string | null>
}

// ─── Route handler ───────────────────────────────────────────────────────────

export const chatRoutes: FastifyPluginAsync = async (app) => {
  // Chat completion with RAG
  app.post('/', {
    // Tighter per-IP limit than the global 100/min (index.ts). This endpoint is unauthenticated
    // and calls Together.ai on every request (real per-call LLM cost), so a script looping it
    // could run up the bill and starve real users. 20 requests/hour/IP is generous for a person
    // asking a handful of questions but stops automated abuse. Per-route config overrides the
    // global rate limit for this route only; keys on the real client IP via trustProxy (index.ts).
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 hour',
        errorResponseBuilder: (_req, context) => ({
          error: true,
          statusCode: 429,
          message: `You've reached the limit of ${context.max} questions per hour. Please wait a bit and try again.`,
        }),
      },
    },
    schema: {
      tags: ['chat'],
      summary: 'Ask a question with AI-powered RAG response',
      body: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'User question', minLength: 1, maxLength: 4000 },
          conversationId: { type: 'string', description: 'Optional conversation ID for context', maxLength: 200 },
          history: {
            type: 'array',
            description: 'Prior conversation turns (last N messages)',
            maxItems: 20,
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string', maxLength: 4000 },
              },
              required: ['role', 'content'],
            },
          },
        },
        required: ['message'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            response: { type: 'string' },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  url: { type: 'string' },
                  snippet: { type: 'string' },
                  // 'web' = found by the web search for this question; 'database' = HuntStack's own records
                  kind: { type: 'string', enum: ['web', 'database'] },
                },
              },
            },
            conversationId: { type: 'string' },
            dataFreshnessNote: { type: 'string', nullable: true },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { message, conversationId, history } = request.body as ChatRequestBody

    if (!isConfigured()) {
      return reply.status(503).send({
        error: true,
        message: 'AI service not configured. Please set LLM_API_KEY.',
      })
    }

    try {
      // Step 1: Extract entities from the user's query
      const entities = extractEntities(message)

      // Step 2: Retrieve context from both sources in parallel
      const [vectorContext, structuredCtx] = await Promise.all([
        needsDocuments(entities)
          ? retrieveContext(message, documentFilters(entities))
          : Promise.resolve({ documents: [], sources: [] }),
        retrieveStructuredContext(entities),
      ])

      // Step 3: Build system prompt with both context types; the model call also searches the web
      // (OpenRouter's web plugin) and attaches those results after this prompt
      const now = new Date()
      const structuredText = formatStructuredContext(structuredCtx)
      const systemPrompt = buildSystemPrompt(vectorContext, structuredText, now)
      const { text: responseText, citations } = await generateChatWithWebSearch(
        message, systemPrompt, truncateHistory(history), webSearchPrompt(now),
      )

      // Step 4: Sources — web pages first, then HuntStack's database
      const allSources = [
        ...citations.map(c => ({ ...c, kind: 'web' as const })),
        ...structuredCtx.sources.map(s => ({ ...s, kind: 'database' as const })),
        ...vectorContext.sources.map(s => ({ ...s, kind: 'database' as const })),
      ]
      // Deduplicate by URL
      const seen = new Set<string>()
      const dedupedSources = allSources.filter(s => {
        const key = s.url || s.title
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Build data freshness note
      const freshnessEntries = Object.entries(structuredCtx.lastScrapedByState)
      let dataFreshnessNote: string | null = null
      if (freshnessEntries.length > 0) {
        const parts = freshnessEntries
          .filter(([, date]) => date)
          .map(([code, date]) => `${code}: ${new Date(date!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`)
        if (parts.length > 0) dataFreshnessNote = `Data last updated — ${parts.join(', ')}`
      }

      return {
        response: responseText,
        sources: dedupedSources,
        conversationId: conversationId || generateConversationId(),
        dataFreshnessNote,
      }
    } catch (error) {
      app.log.error(error)
      return reply.status(500).send({
        error: true,
        message: 'Failed to generate response',
      })
    }
  })

}

// ─── Entity extraction ───────────────────────────────────────────────────────

// The request schema allows up to 20 history messages of 4,000 chars each (~20k tokens),
// and history is resent in full on every turn. Unbounded, that makes a crafted request roughly
// 7x more expensive than a normal one on an unauthenticated, LLM-backed endpoint — see
// INFRASTRUCTURE_COSTS.md section 5.1. Trimming server-side caps the blast radius regardless of
// what the client sends, and also keeps the model focused on retrieved context rather than a
// long tail of prior turns.
export const MAX_HISTORY_MESSAGES = 6
export const MAX_HISTORY_CHARS = 1000

export function truncateHistory(
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Array<{ role: 'user' | 'assistant'; content: string }> | undefined {
  if (!history || history.length === 0) return undefined
  return history.slice(-MAX_HISTORY_MESSAGES).map(m => ({
    role: m.role,
    content: m.content.length > MAX_HISTORY_CHARS
      ? m.content.slice(0, MAX_HISTORY_CHARS)
      : m.content,
  }))
}

export function extractEntities(query: string): ExtractedEntities {
  const lower = query.toLowerCase()
  const stateCodes = new Set<string>()
  const speciesSlugs = new Set<string>()

  // Match state names and codes (longer phrases first to avoid false positives)
  const sortedStateKeys = Object.keys(STATE_ALIASES).sort((a, b) => b.length - a.length)
  for (const alias of sortedStateKeys) {
    // Word boundary check: alias must be surrounded by non-letter chars or string edges
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`)
    if (re.test(lower)) {
      stateCodes.add(STATE_ALIASES[alias])
    }
  }

  // Match species names and aliases (longer phrases first)
  const sortedSpeciesKeys = Object.keys(SPECIES_ALIASES).sort((a, b) => b.length - a.length)
  for (const alias of sortedSpeciesKeys) {
    if (lower.includes(alias)) {
      speciesSlugs.add(SPECIES_ALIASES[alias])
    }
  }

  // Check for broad category keywords
  const isWaterfowl = WATERFOWL_KEYWORDS.some(kw => lower.includes(kw)) || speciesSlugs.size > 0
  const isMigrationQuery = MIGRATION_KEYWORDS.some(kw => lower.includes(kw))
  const isLocationQuery = LOCATION_KEYWORDS.some(kw => lower.includes(kw))
  const isWeatherQuery = WEATHER_KEYWORDS.some(kw => lower.includes(kw))
  const isRegulationQuery = REGULATION_PATTERN.test(lower)
  const isBirdsNowQuery = BIRDS_NOW_PATTERN.test(lower)

  return {
    stateCodes: [...stateCodes],
    speciesSlugs: [...speciesSlugs],
    isWaterfowl,
    isMigrationQuery,
    isLocationQuery,
    isWeatherQuery,
    isRegulationQuery,
    isBirdsNowQuery,
  }
}

/**
 * Whether document search can help. Our documents are state regulations and survey reports, so
 * a question with no state that asks neither about rules nor about where birds are ("what decoy
 * spread works for mallards?") only matched them loosely (similarity ~0.55, old weekly reports)
 * and listed them as sources. A fixed similarity cut can't separate those: relevant Texas
 * regulation pages score 0.57-0.62.
 */
export function needsDocuments(e: ExtractedEntities): boolean {
  return e.stateCodes.length > 0 || e.isRegulationQuery
    || e.isMigrationQuery || e.isLocationQuery || e.isWeatherQuery || e.isBirdsNowQuery
}

/** Which HuntStack records a question needs. Each one also becomes a "From HuntStack data" source. */
export interface StructuredPlan {
  seasons: boolean
  licenses: boolean
  regulations: boolean
  refugeCounts: boolean
  locations: boolean
  weather: boolean
  pushFactors: boolean
}

/**
 * Pick the records a question needs. A general question ("what decoy spread works for
 * mallards?") names a species but no state and asks neither about rules nor about where the
 * birds are now: it gets nothing, so the answer comes from the web and the sources list no
 * unrelated season pages. Before this, any species name pulled up to 40 season rows from every
 * state, and the word "duck" alone pulled refuge counts and a 7-state weather check.
 */
export function structuredPlan(e: ExtractedEntities): StructuredPlan {
  const hasState = e.stateCodes.length > 0
  const hasSubject = e.isWaterfowl || e.speciesSlugs.length > 0
  const birds = e.isMigrationQuery || e.isLocationQuery || e.isWeatherQuery || e.isBirdsNowQuery
  const rules = hasState || (e.isRegulationQuery && e.speciesSlugs.length > 0)
  // "Kansas duck bag limit": about the rules only, not about where birds are
  const rulesOnly = e.isRegulationQuery && !birds
  const birdsHere = hasSubject && (birds || (hasState && !rulesOnly))
  return {
    seasons: rules,
    licenses: hasState,
    regulations: rules,
    refugeCounts: e.isMigrationQuery || e.isLocationQuery || birdsHere,
    // Area lists help "where" questions; on a rules question about a state they were 15
    // refuge web pages in the sources that the answer didn't use.
    locations: e.isLocationQuery || (hasState && !rulesOnly),
    weather: e.isWeatherQuery || e.isMigrationQuery,
    pushFactors: e.isMigrationQuery || e.isWeatherQuery || birdsHere,
  }
}

/**
 * Document-search filters for a question: only the states it names, and no survey or area
 * reports when it asks about rules but not about birds or places.
 */
export function documentFilters(entities: ExtractedEntities): ChunkFilters {
  return {
    stateCodes: entities.stateCodes,
    skipReports: entities.isRegulationQuery && !entities.isMigrationQuery && !entities.isLocationQuery,
  }
}

// ─── Vector context retrieval ────────────────────────────────────────────────

const CONTEXT_CHUNKS = 5

async function retrieveContext(query: string, filters: ChunkFilters): Promise<{
  documents: Array<{ content: string; metadata: Record<string, unknown> }>
  sources: Array<{ title: string; url?: string; snippet: string }>
}> {
  // Without an embeddings key, chat still answers from structured data; skip rather than log a
  // failure on every message.
  if (!isEmbeddingConfigured()) {
    return { documents: [], sources: [] }
  }
  try {
    const queryEmbedding = await generateEmbedding(query)
    const relevant = await searchChunks(getDb(), queryEmbedding, CONTEXT_CHUNKS, filters)

    return {
      documents: relevant.map(r => ({
        content: r.content,
        metadata: {
          title: r.title,
          sourceUrl: r.source_url,
          documentType: r.document_type,
          ...(r.doc_metadata || {}),
          ...(r.chunk_metadata || {}),
        },
      })),
      sources: relevant.map(r => ({
        title: r.title,
        url: r.source_url || undefined,
        snippet: r.content.substring(0, 200) + (r.content.length > 200 ? '...' : ''),
      })),
    }
  } catch (error) {
    console.error('retrieveContext error:', error)
    return { documents: [], sources: [] }
  }
}

// ─── Structured context retrieval (NEW) ──────────────────────────────────────

async function retrieveStructuredContext(entities: ExtractedEntities): Promise<StructuredContext> {
  const db = getDb()
  const result: StructuredContext = {
    seasons: [],
    licenses: [],
    regulations: [],
    refugeCounts: [],
    midwinterHistory: [],
    surveyZones: [],
    locations: [],
    weather: [],
    pushFactors: [],
    sources: [],
    lastScrapedByState: {},
  }

  const { stateCodes, speciesSlugs } = entities
  const plan = structuredPlan(entities)

  // Nothing in our records fits the question; it's answered from the web
  if (!Object.values(plan).some(Boolean)) {
    return result
  }

  try {
    const queries: Promise<void>[] = []

    // ── State freshness ───────────────────────────────────────────────────
    if (stateCodes.length > 0) {
      queries.push((async () => {
        const rows = await db.execute(sql`
          SELECT code, last_scraped FROM states
          WHERE code IN (${sql.join(stateCodes.map(c => sql`${c}`), sql`, `)})
        `)
        for (const row of rows as unknown as Array<{ code: string; last_scraped: string | null }>) {
          result.lastScrapedByState[row.code] = row.last_scraped
        }
      })())
    }

    // ── Seasons ──────────────────────────────────────────────────────────
    if (plan.seasons) {
      queries.push((async () => {
        const stateFilter = stateCodes.length > 0
          ? sql`st.code IN (${sql.join(stateCodes.map(c => sql`${c}`), sql`, `)})`
          : sql`TRUE`
        // A question about one duck (pintails, teal) is also answered by the all-duck seasons,
        // which are stored once on mallard with metadata.appliesTo = 'ducks'.
        const speciesFilter = speciesSlugs.length > 0
          ? sql`(sp.slug IN (${sql.join(speciesSlugs.map(s => sql`${s}`), sql`, `)}) OR se.metadata->>'appliesTo' = 'ducks')`
          : sql`TRUE`
        // Season year = the year the season opens; from August on, that's this calendar year.
        const now = new Date()
        const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1

        // Only each state's current season (its latest year up to seasonYear), in date order.
        // Without the year filter and with newest-first ordering capped at 15 rows, older years
        // crowded in and the earliest-opening seasons — Texas's Panhandle opener among them —
        // were the ones cut, so chat answered "dates vary by zone" without giving any.
        const rows = await db.execute(sql`
          SELECT
            se.name AS season_name,
            se.season_type,
            se.start_date,
            se.end_date,
            se.year,
            se.bag_limit,
            se.shooting_hours,
            se.restrictions,
            se.source_url,
            st.code AS state_code,
            CASE WHEN se.metadata->>'appliesTo' = 'ducks' THEN 'All ducks' ELSE sp.name END AS species_name
          FROM seasons se
          JOIN states st ON se.state_id = st.id
          JOIN species sp ON se.species_id = sp.id
          WHERE (${stateFilter}) AND (${speciesFilter})
            AND se.year = (
              SELECT max(se2.year) FROM seasons se2
              WHERE se2.state_id = se.state_id AND se2.year <= ${seasonYear}
            )
          ORDER BY st.code, se.start_date ASC
          LIMIT 40
        `)
        result.seasons = rows as unknown as Array<Record<string, unknown>>

        // Add source URLs
        for (const row of result.seasons) {
          if (row.source_url) {
            result.sources.push({
              title: `${row.state_code} ${row.season_name} Season`,
              url: row.source_url as string,
              snippet: `${row.species_name} season in ${row.state_code}: ${row.season_name}`,
            })
          }
        }
      })())
    }

    // ── Licenses ─────────────────────────────────────────────────────────
    if (plan.licenses) {
      queries.push((async () => {
        const stateFilter = sql`st.code IN (${sql.join(stateCodes.map(c => sql`${c}`), sql`, `)})`

        const rows = await db.execute(sql`
          SELECT
            l.name AS license_name,
            l.license_type,
            l.description,
            l.price_resident,
            l.price_non_resident,
            l.is_resident_only,
            l.requirements,
            l.purchase_url,
            st.code AS state_code
          FROM licenses l
          JOIN states st ON l.state_id = st.id
          WHERE ${stateFilter}
          ORDER BY l.license_type, l.name
          LIMIT 15
        `)
        result.licenses = rows as unknown as Array<Record<string, unknown>>

        for (const row of result.licenses) {
          if (row.purchase_url) {
            result.sources.push({
              title: `${row.state_code} ${row.license_name}`,
              url: row.purchase_url as string,
              snippet: `License: ${row.license_name} in ${row.state_code}`,
            })
          }
        }
      })())
    }

    // ── Regulations ──────────────────────────────────────────────────────
    if (plan.regulations) {
      queries.push((async () => {
        const conditions: ReturnType<typeof sql>[] = [sql`r.is_active = true`]

        if (stateCodes.length > 0) {
          conditions.push(sql`st.code IN (${sql.join(stateCodes.map(c => sql`${c}`), sql`, `)})`)
        }
        if (speciesSlugs.length > 0) {
          // Filter by waterfowl categories if species are waterfowl
          conditions.push(sql`(r.category ILIKE '%waterfowl%' OR r.category ILIKE '%migratory%')`)
        }

        const rows = await db.execute(sql`
          SELECT
            r.title,
            r.summary,
            r.category,
            r.source_url,
            st.code AS state_code
          FROM regulations r
          JOIN states st ON r.state_id = st.id
          WHERE ${sql.join(conditions, sql` AND `)}
          ORDER BY r.updated_at DESC
          LIMIT 8
        `)
        result.regulations = rows as unknown as Array<Record<string, unknown>>

        for (const row of result.regulations) {
          if (row.source_url) {
            result.sources.push({
              title: `${row.state_code} Regulation: ${row.title}`,
              url: row.source_url as string,
              snippet: (row.summary as string || row.title as string).substring(0, 150),
            })
          }
        }
      })())
    }

    // ── Refuge Counts (migration data) ───────────────────────────────────
    if (plan.refugeCounts) {
      queries.push((async () => {
        const speciesFilter = speciesSlugs.length > 0
          ? sql`AND sp.slug IN (${sql.join(speciesSlugs.map(s => sql`${s}`), sql`, `)})`
          : sql``

        const rows = await db.execute(sql`
          SELECT DISTINCT ON (rc.location_id, rc.species_id)
            l.name AS refuge_name,
            st.code AS state_code,
            sp.name AS species_name,
            rc.count,
            rc.survey_date,
            rc.survey_type,
            rc.source_url
          FROM refuge_counts rc
          JOIN locations l ON rc.location_id = l.id
          JOIN states st ON l.state_id = st.id
          JOIN species sp ON rc.species_id = sp.id
          WHERE l.name NOT LIKE '%% - Statewide MWI'
            AND (l.metadata->>'survey_only') IS DISTINCT FROM 'true'
            ${speciesFilter}
          ORDER BY rc.location_id, rc.species_id, rc.survey_date DESC
          LIMIT 20
        `)
        result.refugeCounts = rows as unknown as Array<Record<string, unknown>>
      })())

      // Long-run winter numbers for a sub-state region, as context for "is this a good
      // area?" — kept out of the recent counts above, since the newest year is 2018
      if (stateCodes.includes('TX')) {
        queries.push((async () => {
          const rows = await db.execute(sql`
            SELECT l.metadata->>'regionLabel' AS region,
                   EXTRACT(YEAR FROM rc.survey_date)::int AS year,
                   ${speciesSlugs.length > 0 ? sql`sp.name` : sql`NULL`} AS species,
                   SUM(rc.count)::bigint AS total
            FROM refuge_counts rc
            JOIN locations l ON rc.location_id = l.id
            JOIN states st ON l.state_id = st.id
            JOIN species sp ON rc.species_id = sp.id
            WHERE rc.survey_type = 'annual_midwinter'
              AND l.metadata->>'regionLabel' IS NOT NULL
              AND st.code = 'TX'
              ${speciesSlugs.length > 0 ? sql`AND sp.slug IN (${sql.join(speciesSlugs.map(s => sql`${s}`), sql`, `)})` : sql``}
            GROUP BY 1, 2, 3
            ORDER BY 1, 3, 2
          `)
          result.midwinterHistory = (rows as unknown as Array<Record<string, unknown>>).map(r => ({
            region: r.region as string,
            year: Number(r.year),
            species: (r.species as string | null) ?? null,
            total: Number(r.total),
          }))
        })())
      }

      // Where in Arkansas AGFC's newest survey found ducks, zone by zone, against each zone's
      // average for that survey period ("is the Cache holding birds this year?")
      if (stateCodes.includes('AR')) {
        queries.push((async () => {
          const rows = await db.execute(sql`
            WITH z AS (
              SELECT l.metadata->>'region' AS region, l.metadata->>'zone' AS zone,
                     (l.metadata->>'zoneOrder')::int AS zone_order,
                     rc.metadata->>'period' AS period, rc.survey_date,
                     rc.count AS mallards, (rc.metadata->>'totalDucks')::int AS total_ducks
              FROM refuge_counts rc
              JOIN locations l ON l.id = rc.location_id
              JOIN species sp ON sp.id = rc.species_id
              WHERE l.location_type = 'survey_zone' AND sp.slug = 'mallard'
            )
            SELECT z.region, z.zone, z.period, z.survey_date, z.mallards, z.total_ducks,
                   (SELECT round(avg(h.mallards))::int FROM z h WHERE h.zone = z.zone
                      AND split_part(h.period, '-', 1) = split_part(z.period, '-', 1)
                      AND h.survey_date < z.survey_date) AS avg_mallards,
                   (SELECT round(avg(h.total_ducks))::int FROM z h WHERE h.zone = z.zone
                      AND split_part(h.period, '-', 1) = split_part(z.period, '-', 1)
                      AND h.survey_date < z.survey_date) AS avg_total_ducks
            FROM z
            WHERE z.survey_date = (SELECT max(survey_date) FROM z)
            ORDER BY z.zone_order
          `)
          result.surveyZones = (rows as unknown as Array<Record<string, unknown>>).map(r => ({
            region: r.region as string,
            zone: r.zone as string,
            period: r.period as string,
            surveyDate: String(r.survey_date),
            mallards: Number(r.mallards),
            totalDucks: r.total_ducks == null ? null : Number(r.total_ducks),
            avgMallards: r.avg_mallards == null ? null : Number(r.avg_mallards),
            avgTotalDucks: r.avg_total_ducks == null ? null : Number(r.avg_total_ducks),
          }))
        })())
      }
    }

    // ── Locations (public hunting areas) ────────────────────────────────
    if (plan.locations) {
      queries.push((async () => {
        const conditions = [
          sql`l.name NOT LIKE '%% - Statewide MWI'`,
          sql`l.location_type <> 'survey_zone'`,
        ]

        if (stateCodes.length > 0) {
          conditions.push(sql`st.code IN (${sql.join(stateCodes.map(c => sql`${c}`), sql`, `)})`)
        }

        const rows = await db.execute(sql`
          SELECT
            l.name,
            l.location_type,
            l.description,
            l.acreage,
            l.website_url,
            l.restrictions,
            l.center_point,
            l.metadata,
            st.code AS state_code,
            st.name AS state_name
          FROM locations l
          JOIN states st ON l.state_id = st.id
          WHERE ${sql.join(conditions, sql` AND `)}
          ORDER BY l.location_type, l.name
          LIMIT 15
        `)
        result.locations = rows as unknown as Array<Record<string, unknown>>

        for (const row of result.locations) {
          if (row.website_url) {
            result.sources.push({
              title: `${row.name} (${row.state_code})`,
              url: row.website_url as string,
              snippet: `${row.location_type}: ${row.name} in ${row.state_name}`,
            })
          }
        }
      })())
    }

    // ── Weather conditions ────────────────────────────────────────────────
    if (plan.weather) {
      queries.push((async () => {
        try {
          const stateFilter = stateCodes.length > 0
            ? sql`st.code IN (${sql.join(stateCodes.map(c => sql`${c}`), sql`, `)})`
            : sql`TRUE`

          const refuges = await db.execute(sql`
            SELECT l.id, l.name, l.center_point, st.code as state_code
            FROM locations l
            JOIN states st ON l.state_id = st.id
            WHERE l.location_type = 'wildlife_refuge'
              AND l.center_point IS NOT NULL
              AND l.name NOT LIKE '%% - Statewide MWI'
              AND ${stateFilter}
            LIMIT 3
          `)

          const { getHuntingConditions } = await import('../lib/weather.js')

          const weatherResults = await Promise.all(
            (refuges as unknown as Array<Record<string, unknown>>).map(async (r) => {
              const cp = decodePoint(r.center_point)
              if (!cp) return null
              try {
                const conditions = await getHuntingConditions(cp.lat, cp.lng, r.state_code as string)
                if (!conditions) return null
                return {
                  refuge_name: r.name,
                  state_code: r.state_code,
                  temperature: conditions.temperature,
                  temperatureUnit: conditions.temperatureUnit,
                  windSpeed: conditions.windSpeed,
                  windDirection: conditions.windDirection,
                  windCategory: conditions.windCategory,
                  conditions: conditions.conditions,
                  precipitationChance: conditions.precipitationChance,
                  huntingRating: conditions.huntingRating,
                  huntingNotes: conditions.huntingNotes,
                }
              } catch {
                return null
              }
            })
          )

          result.weather = weatherResults.filter(Boolean) as Array<Record<string, unknown>>
        } catch (error) {
          console.error('Weather retrieval error:', error)
        }
      })())
    }

    // ── Push factors (migration pressure signals) ─────────────────────────
    // Weather questions too: "any cold front in the Panhandle?" is a push-factor question
    if (plan.pushFactors) {
      queries.push((async () => {
        try {
          const targetStates = stateCodes.length > 0 ? stateCodes : ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO']
          const stateFilter = sql`st.code IN (${sql.join(targetStates.map(c => sql`${c}`), sql`, `)})`

          const refugeRows = await db.execute(sql`
            SELECT
              st.code AS state_code,
              l.center_point
            FROM locations l
            JOIN states st ON l.state_id = st.id
            WHERE l.location_type = 'wildlife_refuge'
              AND l.center_point IS NOT NULL
              AND l.name NOT LIKE '%% - Statewide MWI'
              AND ${stateFilter}
            ORDER BY st.code, l.name
          `)

          const refugesByState = new Map<string, { lat: number; lng: number }[]>()
          for (const row of refugeRows as unknown as Array<{ state_code: string; center_point: unknown }>) {
            const cp = decodePoint(row.center_point)
            if (cp) {
              if (!refugesByState.has(row.state_code)) refugesByState.set(row.state_code, [])
              refugesByState.get(row.state_code)!.push(cp)
            }
          }

          const { pushFactors, regionalPushFactors } = await getPushFactorsForStates(targetStates, refugesByState)
          result.pushFactors = [...pushFactors, ...regionalPushFactors].map(pf => ({
            stateCode: pf.stateCode,
            regionName: pf.regionName,
            pushScore: pf.pushScore,
            coldFrontPresent: pf.coldFrontPresent,
            coldFrontIncoming: pf.coldFrontIncoming,
            windDirection: pf.windDirection,
            windIsFromNorth: pf.windIsFromNorth,
            temperature: pf.temperature,
          }))
        } catch (error) {
          console.error('Push factor retrieval error:', error)
        }
      })())
    }

    await Promise.all(queries)
  } catch (error) {
    console.error('retrieveStructuredContext error:', error)
  }

  return result
}

// ─── Format structured context for LLM ───────────────────────────────────────

function formatStructuredContext(ctx: StructuredContext): string {
  const sections: string[] = []

  // Seasons
  if (ctx.seasons.length > 0) {
    const lines = ctx.seasons.map(s => {
      const startDate = s.start_date ? new Date(s.start_date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?'
      const endDate = s.end_date ? new Date(s.end_date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?'
      const bag = s.bag_limit ? formatBagLimit(s.bag_limit) : ''
      const hours = s.shooting_hours ? `, hours: ${formatShootingHours(s.shooting_hours)}` : ''
      // 400, not 100: Texas's restriction sentence lists the duck caps, and cutting it after
      // "3 wood ducks" left the model to guess the pintail limit (it guessed wrong).
      const restrictions = s.restrictions ? `, restrictions: ${(s.restrictions as string).substring(0, 400)}` : ''
      return `- ${s.state_code} | ${s.species_name}: ${s.season_name} (${startDate} - ${endDate})${bag}${hours}${restrictions}`
    })
    // Zone names alone don't tell the model where a hunter is; say where the Panhandle zone is
    const zoneNote = ctx.seasons.some(s => String(s.season_name).includes('High Plains Mallard Management Unit'))
      ? '\nTexas duck zones: the High Plains Mallard Management Unit covers the Texas Panhandle and South Plains (e.g. Amarillo, Lubbock). Give the dates for the zone the user asks about.'
      : ''
    sections.push(`## Current Seasons\n${lines.join('\n')}${zoneNote}`)
  }

  // Licenses
  if (ctx.licenses.length > 0) {
    const lines = ctx.licenses.map(l => {
      const res = l.price_resident != null ? `$${Number(l.price_resident).toFixed(2)}` : 'N/A'
      const nonRes = l.price_non_resident != null ? `$${Number(l.price_non_resident).toFixed(2)}` : 'N/A'
      const resOnly = l.is_resident_only ? ' (residents only)' : ''
      const desc = l.description ? ` — ${(l.description as string).substring(0, 80)}` : ''
      return `- ${l.state_code} | ${l.license_name} [${l.license_type}]: resident ${res}, non-resident ${nonRes}${resOnly}${desc}`
    })
    sections.push(`## License Requirements\n${lines.join('\n')}`)
  }

  // Refuge Counts
  if (ctx.refugeCounts.length > 0) {
    // Group by refuge for cleaner display
    const byRefuge = new Map<string, Array<Record<string, unknown>>>()
    for (const rc of ctx.refugeCounts) {
      const key = rc.refuge_name as string
      if (!byRefuge.has(key)) byRefuge.set(key, [])
      byRefuge.get(key)!.push(rc)
    }

    const lines: string[] = []
    for (const [refuge, counts] of byRefuge) {
      const stateCode = counts[0].state_code
      const surveyDate = counts[0].survey_date
        ? new Date(counts[0].survey_date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '?'
      const speciesList = counts
        .map(c => `${c.species_name}: ${Number(c.count).toLocaleString()}`)
        .join(', ')
      lines.push(`- ${refuge} (${stateCode}, ${surveyDate}): ${speciesList}`)
    }
    sections.push(`## Recent Bird Survey Counts\n${lines.join('\n')}`)
  }

  if (ctx.midwinterHistory.length > 0) {
    sections.push(`## Long-Term Winter Survey History\n${formatMidwinterHistory(ctx.midwinterHistory)}`)
  }

  if (ctx.surveyZones.length > 0) {
    sections.push(`## Arkansas Survey Zones\n${formatSurveyZones(ctx.surveyZones)}`)
  }

  // Locations
  if (ctx.locations.length > 0) {
    const lines = ctx.locations.map(l => {
      const type = (l.location_type as string || '').replace(/_/g, ' ')
      const acres = l.acreage ? `, ${Number(l.acreage).toLocaleString()} acres` : ''
      const desc = l.description ? ` — ${(l.description as string).substring(0, 100)}` : ''
      const meta = decodeJsonbField<Record<string, unknown>>(l.metadata)
      const flywayStr = meta?.flyway ? `, ${meta.flyway} flyway` : ''
      // Season zones the location lies in, so the model can pick that zone's dates
      const zones = Array.isArray(meta?.huntZones) ? (meta!.huntZones as string[]) : []
      const zoneStr = zones.length > 0 ? `, season zones: ${zones.join(' / ')}` : ''
      const restrictions = l.restrictions ? `, restrictions: ${(l.restrictions as string).substring(0, 80)}` : ''
      return `- ${l.name} (${l.state_code}, ${type}${acres}${flywayStr}${zoneStr})${desc}${restrictions}`
    })
    sections.push(`## Public Hunting Locations\n${lines.join('\n')}`)
  }

  // Regulations (summaries only — full text is in vector chunks)
  if (ctx.regulations.length > 0) {
    const lines = ctx.regulations.map(r => {
      const summary = (r.summary as string || '').substring(0, 200)
      return `- ${r.state_code} [${r.category}] ${r.title}${summary ? ': ' + summary : ''}`
    })
    sections.push(`## Relevant Regulations\n${lines.join('\n')}`)
  }

  // Weather Conditions
  if (ctx.weather.length > 0) {
    const lines = ctx.weather.map(w => {
      const notes = (w.huntingNotes as string[])?.join('; ') || ''
      return `- ${w.refuge_name} (${w.state_code}): ${w.temperature}°${w.temperatureUnit}, ` +
        `wind ${w.windSpeed} ${w.windDirection} (${w.windCategory}), ` +
        `${w.conditions}, precip: ${w.precipitationChance ?? 'N/A'}%, ` +
        `hunting rating: ${w.huntingRating}${notes ? '. ' + notes : ''}`
    })
    sections.push(`## Current Weather Conditions\n${lines.join('\n')}`)
  }

  // Migration Push Factors
  if (ctx.pushFactors.length > 0) {
    const lines = ctx.pushFactors.map(pf => {
      const signals: string[] = []
      if (pf.coldFrontPresent) signals.push('cold front arriving now')
      if (pf.coldFrontIncoming) signals.push('cold front expected within 48 hours')
      if (pf.windIsFromNorth) signals.push(`north wind (${pf.windDirection})`)
      if (pf.temperature !== null && pf.temperature < 32) signals.push(`sub-freezing (${pf.temperature}°F)`)
      // Scores step by 0.5 (an incoming front counts half), so compare with >= rather than ===
      const label = pf.pushScore >= 3 ? 'HIGH' : pf.pushScore >= 2 ? 'MODERATE' : pf.pushScore > 0 ? 'LOW' : 'NONE'
      const signalStr = signals.length > 0 ? ` — ${signals.join(', ')}` : ' — no active push signals'
      return `- ${pushFactorLabel(pf)}: push score ${pf.pushScore}/3 (${label})${signalStr}`
    })
    const regionNote = ctx.pushFactors.some(pf => pf.regionName)
      ? '\nA line marked "only" covers just that part of the state and is scored from its own weather; the state line is the statewide majority. For a location inside the region, use the region line.'
      : ''
    sections.push(`## Migration Push Factors\nHigher push scores mean birds are more likely to be actively moving. Cold fronts, north winds, and sub-freezing temps are the primary triggers.${regionNote}\n${lines.join('\n')}`)
  }

  return sections.join('\n\n')
}

/** One line per region (and species, when asked about one): "1997 401k, 1998 612k, …". */
export type SurveyZoneRow = {
  region: string
  zone: string
  period: string
  surveyDate: string
  mallards: number
  totalDucks: number | null
  avgMallards: number | null
  avgTotalDucks: number | null
}

const PERIOD_NAMES: Record<string, string> = {
  Nov: 'late-November', Dec: 'December', MWS: 'early-January midwinter', Jan: 'late-January',
}

/** AGFC's newest survey by zone, busiest first, each against its average for that period. */
export function formatSurveyZones(rows: SurveyZoneRow[]): string {
  const vsAvg = (n: number | null, avg: number | null) =>
    n == null || !avg ? '' : ` (${n >= avg ? '+' : ''}${Math.round(((n - avg) / avg) * 100)}% vs avg)`
  const first = rows[0]
  const kind = PERIOD_NAMES[first.period.split('-')[0]] ?? first.period
  const lines = [...rows]
    .sort((a, b) => (b.totalDucks ?? b.mallards) - (a.totalDucks ?? a.mallards))
    .map(r => `- ${r.zone} (${r.region}): `
      + (r.totalDucks != null ? `${r.totalDucks.toLocaleString('en-US')} ducks${vsAvg(r.totalDucks, r.avgTotalDucks)}, ` : '')
      + `${r.mallards.toLocaleString('en-US')} mallards${vsAvg(r.mallards, r.avgMallards)}`)
  return [
    `AGFC aerial survey estimates by survey zone, ${kind} survey ending ${first.surveyDate.slice(0, 10)} (newest AGFC survey; `
      + 'averages are the same survey period in earlier years since 2011). These are parts of the statewide AGFC count, not additional birds.',
    ...lines,
  ].join('\n')
}

export function formatMidwinterHistory(
  rows: Array<{ region: string; year: number; species: string | null; total: number }>,
): string {
  const series = new Map<string, Array<{ year: number; total: number }>>()
  for (const r of rows) {
    const key = r.species ? `${r.region} — ${r.species}` : `${r.region} — all ducks and geese`
    if (!series.has(key)) series.set(key, [])
    series.get(key)!.push({ year: r.year, total: r.total })
  }
  const short = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
  const lines = [...series].map(([key, pts]) => {
    pts.sort((a, b) => a.year - b.year)
    return `- ${key}: ${pts.map(p => `${p.year} ${short(p.total)}`).join(', ')}`
  })
  return [
    'TPWD aerial midwinter survey estimates (January). Annual, not current-season data; TPWD has not published regional estimates after 2018.',
    ...lines,
  ].join('\n')
}

export function formatBagLimit(bagLimit: unknown): string {
  const bl = decodeJsonbField(bagLimit)
  if (!bl) return ''
  const fmt = (v: unknown): string => {
    if (v == null) return 'none'
    if (typeof v === 'number' || typeof v === 'string') return String(v)
    return JSON.stringify(v)
  }
  const parts: string[] = []
  if ('daily' in bl) parts.push(`daily: ${fmt(bl.daily)}`)
  if ('possession' in bl) parts.push(`possession: ${fmt(bl.possession)}`)
  if ('season' in bl) parts.push(`season: ${fmt(bl.season)}`)
  // Per-species caps inside an aggregate (Texas: 6 ducks, no more than 5 mallards, 3 pintails...).
  // Spelled out per species, largest first: jsonb reorders keys (shortest first), and a bare
  // "scaup 1, mallard 5, pintail 3" list led the model to shift a number onto the wrong species.
  const limits = bl.speciesLimits as Record<string, unknown> | undefined
  if (limits && typeof limits === 'object' && Object.keys(limits).length > 0) {
    const caps = Object.entries(limits)
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .map(([slug, n]) => `${slug.replace(/-/g, ' ')}: ${fmt(n)} per day`)
    parts.push(`within that, no more than ${caps.join('; ')}`)
  }
  if (typeof bl.notes === 'string' && bl.notes) parts.push(bl.notes)
  return parts.length > 0 ? `, bag limit: ${parts.join(', ')}` : ''
}

export function formatShootingHours(hours: unknown): string {
  const h = decodeJsonbField(hours)
  if (!h) return typeof hours === 'string' ? hours : ''
  if (h.start && h.end) return `${h.start} to ${h.end}`
  return JSON.stringify(h)
}

// ─── Build system prompt ─────────────────────────────────────────────────────

/** The waterfowl season a date falls in, e.g. "2026-27" from July 2026 through June 2027. */
export function currentSeasonLabel(now: Date): string {
  const start = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return `${start}-${String(start + 1).slice(2)}`
}

/** Heading OpenRouter puts above the web results it attaches to the conversation. */
export function webSearchPrompt(now: Date): string {
  return `=== WEB SEARCH RESULTS (searched ${now.toISOString().slice(0, 10)}) ===
Cite each result you use as a markdown link named by its domain, e.g. [ksoutdoors.gov](https://ksoutdoors.gov/...).`
}

function buildSystemPrompt(
  vectorContext: {
    documents: Array<{ content: string; metadata: Record<string, unknown> }>
    sources: Array<{ title: string; url?: string; snippet: string }>
  },
  structuredText: string,
  now: Date,
): string {
  const vectorText = vectorContext.documents
    .map(doc => {
      const title = doc.metadata.title ? `[${doc.metadata.title}${doc.metadata.sourceUrl ? ` — ${doc.metadata.sourceUrl}` : ''}]\n` : ''
      return title + doc.content
    })
    .join('\n\n---\n\n')

  return `You are HuntStack AI, a hunting assistant for waterfowl and other game across the United States. Today is ${now.toISOString().slice(0, 10)}; the current waterfowl season is ${currentSeasonLabel(now)}.

You get three kinds of information:
1. WEB SEARCH RESULTS: pages found by searching the internet for this question, attached after these instructions when available. Use them as your main source for anything the database below does not cover.
2. STRUCTURED DATA: HuntStack's own records, entered from state agency sources: season dates, bag limits, licenses, refuge bird counts, weather and migration scores. When it covers the question, its numbers are the most reliable.
3. DOCUMENT CONTEXT: excerpts from state agency pages and PDFs saved in HuntStack's database. Use them to support and add detail.

Guidelines:
- For season dates, bag limits and license prices, use STRUCTURED DATA first. If a web result gives a different number for the same season, give both and name each source.
- Check which season a web page or document is about before using its dates. Do not present a past season's dates as this season's; label them if you use them at all.
- For rules, prefer the state wildlife agency's own pages over third-party sites. Treat forums, outfitter, app and news sites as reports, not as the rules.
- Cite web results inline as markdown links, e.g. [ksoutdoors.gov](https://ksoutdoors.gov/...).
- If nothing here answers the question, say so plainly and point the user to the state wildlife agency. General hunting knowledge (gear, tactics, bird ID) is fine, but never invent dates, limits, prices or counts.
- Always say which state's rules you mean, and remind users to confirm regulations with the official state agency.
- When answering "where should I hunt?" or "are conditions good?", prioritize states with: (1) high push score, (2) arriving/building migration status, (3) high bird counts. A push score of 2–3 with arriving birds is the strongest buy signal.
- NEVER repeat or reference labels like "STRUCTURED DATA", "DOCUMENT CONTEXT" or "WEB SEARCH RESULTS" in your answer; they are internal.
- Be conversational and specific. Format with markdown: **bold** for emphasis, numbered lists for rankings, bullet lists for details.

${structuredText ? `=== STRUCTURED DATA (HuntStack records) ===

${structuredText}

` : ''}${vectorText ? `=== DOCUMENT CONTEXT (saved agency pages and PDFs) ===

${vectorText}

` : ''}`
}

function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
