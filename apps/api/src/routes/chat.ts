import { FastifyPluginAsync } from 'fastify'
import { isConfigured, generateEmbedding, generateChatResponse } from '../lib/together.js'
import { getDb } from '../lib/db.js'
import { sql } from 'drizzle-orm'

// ─── Entity aliases for query matching ───────────────────────────────────────

const STATE_ALIASES: Record<string, string> = {
  texas: 'TX', tx: 'TX',
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
const MIGRATION_KEYWORDS = ['migration', 'migrating', 'flying', 'counts', 'refuge', 'survey', 'birds moving', 'what\'s flying']
const LOCATION_KEYWORDS = ['where to hunt', 'where should i hunt', 'public land', 'public hunting', 'wma', 'wildlife management area', 'national forest', 'blm', 'wildlife refuge', 'hunting area', 'hunting location', 'place to hunt', 'spots to hunt']

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExtractedEntities {
  stateCodes: string[]
  speciesSlugs: string[]
  isWaterfowl: boolean
  isMigrationQuery: boolean
  isLocationQuery: boolean
}

interface StructuredContext {
  seasons: Array<Record<string, unknown>>
  licenses: Array<Record<string, unknown>>
  regulations: Array<Record<string, unknown>>
  refugeCounts: Array<Record<string, unknown>>
  locations: Array<Record<string, unknown>>
  sources: Array<{ title: string; url?: string; snippet: string }>
}

// ─── Route handler ───────────────────────────────────────────────────────────

export const chatRoutes: FastifyPluginAsync = async (app) => {
  // Chat completion with RAG
  app.post('/', {
    schema: {
      tags: ['chat'],
      summary: 'Ask a question with AI-powered RAG response',
      body: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'User question' },
          conversationId: { type: 'string', description: 'Optional conversation ID for context' },
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
                },
              },
            },
            conversationId: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { message, conversationId } = request.body as {
      message: string
      conversationId?: string
    }

    if (!isConfigured()) {
      return reply.status(503).send({
        error: true,
        message: 'AI service not configured. Please set TOGETHER_API_KEY.',
      })
    }

    try {
      // Step 1: Extract entities from the user's query
      const entities = extractEntities(message)

      // Step 2: Retrieve context from both sources in parallel
      const [vectorContext, structuredCtx] = await Promise.all([
        retrieveContext(message),
        retrieveStructuredContext(entities),
      ])

      // Step 3: Build system prompt with both context types
      const structuredText = formatStructuredContext(structuredCtx)
      const systemPrompt = buildSystemPrompt(vectorContext, structuredText)
      const responseText = await generateChatResponse(message, systemPrompt)

      // Step 4: Merge sources from both retrievals
      const allSources = [
        ...structuredCtx.sources,
        ...vectorContext.sources,
      ]
      // Deduplicate by URL
      const seen = new Set<string>()
      const dedupedSources = allSources.filter(s => {
        const key = s.url || s.title
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      return {
        response: responseText,
        sources: dedupedSources,
        conversationId: conversationId || generateConversationId(),
      }
    } catch (error) {
      app.log.error(error)
      return reply.status(500).send({
        error: true,
        message: 'Failed to generate response',
      })
    }
  })

  // Get conversation history
  app.get('/history/:conversationId', {
    schema: {
      tags: ['chat'],
      summary: 'Get conversation history',
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
        },
        required: ['conversationId'],
      },
    },
  }, async (request) => {
    const { conversationId } = request.params as { conversationId: string }

    // TODO: Fetch from database/Redis
    return {
      conversationId,
      messages: [],
    }
  })
}

// ─── Entity extraction ───────────────────────────────────────────────────────

function extractEntities(query: string): ExtractedEntities {
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

  return {
    stateCodes: [...stateCodes],
    speciesSlugs: [...speciesSlugs],
    isWaterfowl,
    isMigrationQuery,
    isLocationQuery,
  }
}

// ─── Vector context retrieval (existing, unchanged) ──────────────────────────

async function retrieveContext(query: string): Promise<{
  documents: Array<{ content: string; metadata: Record<string, unknown> }>
  sources: Array<{ title: string; url?: string; snippet: string }>
}> {
  try {
    const queryEmbedding = await generateEmbedding(query)
    const db = getDb()
    const results = await db.execute(sql`
      SELECT
        dc.id,
        dc.content,
        dc.metadata AS chunk_metadata,
        d.title,
        d.source_url,
        d.document_type,
        d.metadata AS doc_metadata,
        1 - (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT 5
    `)

    const rows = results as unknown as Array<{
      id: string
      content: string
      chunk_metadata: Record<string, unknown> | null
      title: string
      source_url: string | null
      document_type: string
      doc_metadata: Record<string, unknown> | null
      similarity: number
    }>

    const relevant = rows.filter(r => r.similarity > 0.3)

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
    locations: [],
    sources: [],
  }

  const { stateCodes, speciesSlugs, isWaterfowl, isMigrationQuery, isLocationQuery } = entities

  // No entities detected — skip structured queries
  if (stateCodes.length === 0 && speciesSlugs.length === 0 && !isWaterfowl && !isMigrationQuery) {
    return result
  }

  try {
    const queries: Promise<void>[] = []

    // ── Seasons ──────────────────────────────────────────────────────────
    if (stateCodes.length > 0 || speciesSlugs.length > 0) {
      queries.push((async () => {
        const stateFilter = stateCodes.length > 0
          ? sql`st.code IN (${sql.join(stateCodes.map(c => sql`${c}`), sql`, `)})`
          : sql`TRUE`
        const speciesFilter = speciesSlugs.length > 0
          ? sql`sp.slug IN (${sql.join(speciesSlugs.map(s => sql`${s}`), sql`, `)})`
          : sql`TRUE`

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
            sp.name AS species_name
          FROM seasons se
          JOIN states st ON se.state_id = st.id
          JOIN species sp ON se.species_id = sp.id
          WHERE (${stateFilter}) AND (${speciesFilter})
          ORDER BY se.start_date DESC
          LIMIT 15
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
    if (stateCodes.length > 0) {
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
    if (stateCodes.length > 0 || speciesSlugs.length > 0) {
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
    if (isMigrationQuery || isWaterfowl || speciesSlugs.length > 0) {
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
            ${speciesFilter}
          ORDER BY rc.location_id, rc.species_id, rc.survey_date DESC
          LIMIT 20
        `)
        result.refugeCounts = rows as unknown as Array<Record<string, unknown>>
      })())
    }

    // ── Locations (public hunting areas) ────────────────────────────────
    if (isLocationQuery || stateCodes.length > 0) {
      queries.push((async () => {
        const conditions = [
          sql`l.name NOT LIKE '%% - Statewide MWI'`,
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
      const restrictions = s.restrictions ? `, restrictions: ${(s.restrictions as string).substring(0, 100)}` : ''
      return `- ${s.state_code} | ${s.species_name}: ${s.season_name} (${startDate} - ${endDate})${bag}${hours}${restrictions}`
    })
    sections.push(`## Current Seasons\n${lines.join('\n')}`)
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

  // Locations
  if (ctx.locations.length > 0) {
    const lines = ctx.locations.map(l => {
      const type = (l.location_type as string || '').replace(/_/g, ' ')
      const acres = l.acreage ? `, ${Number(l.acreage).toLocaleString()} acres` : ''
      const desc = l.description ? ` — ${(l.description as string).substring(0, 100)}` : ''
      const flyway = (l.metadata as Record<string, unknown> | null)?.flyway
      const flywayStr = flyway ? `, ${flyway} flyway` : ''
      const restrictions = l.restrictions ? `, restrictions: ${(l.restrictions as string).substring(0, 80)}` : ''
      return `- ${l.name} (${l.state_code}, ${type}${acres}${flywayStr})${desc}${restrictions}`
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

  return sections.join('\n\n')
}

function formatBagLimit(bagLimit: unknown): string {
  if (!bagLimit) return ''
  // Handle string-encoded JSONB (Drizzle double-encoding)
  let bl: Record<string, unknown>
  if (typeof bagLimit === 'string') {
    try { bl = JSON.parse(bagLimit) } catch { return '' }
  } else if (typeof bagLimit === 'object') {
    bl = bagLimit as Record<string, unknown>
  } else {
    return ''
  }
  const fmt = (v: unknown): string => {
    if (v == null) return 'none'
    if (typeof v === 'number' || typeof v === 'string') return String(v)
    return JSON.stringify(v)
  }
  const parts: string[] = []
  if ('daily' in bl) parts.push(`daily: ${fmt(bl.daily)}`)
  if ('possession' in bl) parts.push(`possession: ${fmt(bl.possession)}`)
  if ('season' in bl) parts.push(`season: ${fmt(bl.season)}`)
  return parts.length > 0 ? `, bag limit: ${parts.join(', ')}` : ''
}

function formatShootingHours(hours: unknown): string {
  if (!hours) return ''
  let h: Record<string, unknown>
  if (typeof hours === 'string') {
    try { h = JSON.parse(hours) } catch { return hours }
  } else if (typeof hours === 'object') {
    h = hours as Record<string, unknown>
  } else {
    return String(hours)
  }
  if (h.start && h.end) return `${h.start} to ${h.end}`
  return JSON.stringify(h)
}

// ─── Build system prompt ─────────────────────────────────────────────────────

function buildSystemPrompt(
  vectorContext: {
    documents: Array<{ content: string; metadata: Record<string, unknown> }>
    sources: Array<{ title: string; url?: string; snippet: string }>
  },
  structuredText: string,
): string {
  const vectorText = vectorContext.documents
    .map(doc => doc.content)
    .join('\n\n---\n\n')

  return `You are HuntStack AI, a helpful assistant specializing in hunting regulations, seasons, locations, and wildlife information across the United States.

Your role is to:
1. Answer questions about hunting regulations accurately
2. Provide information about seasons, bag limits, and license requirements
3. Help users find hunting locations and outfitters
4. Explain migratory bird patterns and flyway information
5. Always remind users to verify regulations with official state sources

Important guidelines:
- Answer ONLY using the provided context
- If the answer is not in the context, say "I don't have that information in my database. Please check the official state wildlife agency website."
- Be accurate and specific when citing regulations
- Always mention which state's regulations you're referencing
- Be helpful and conversational while remaining informative
- When providing season dates, bag limits, or license prices, use the STRUCTURED DATA section first — it contains verified, structured records from state agencies
- When explaining regulations in detail, use the DOCUMENT CONTEXT section for additional details

${structuredText ? `=== STRUCTURED DATA (verified records from our database) ===

${structuredText}

` : ''}${vectorText ? `=== DOCUMENT CONTEXT (scraped regulation pages and PDFs) ===

${vectorText}

` : ''}${!structuredText && !vectorText ? 'Note: No specific context was retrieved for this query. Provide general guidance and encourage the user to search for specific state regulations.\n' : ''}Use the above information to provide an accurate response. Do not fabricate details not present in the context.`
}

function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
