import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { fieldReports } from '@huntstack/db/schema'
import { getDb } from './db.js'

// Hunter field reports. Exact coordinates are stored but never served: every read goes through
// PUBLIC_COLUMNS (cell centre only) and the route's response schema drops anything else.

export type BirdGroup = 'duck' | 'goose'
export type CountBucket = '1-10' | '10-50' | '50-200' | '200+'
export type Activity = 'flying' | 'on_water' | 'in_field'

/** Species allowlist. Copied (same slugs and labels) into apps/web/src/lib/fieldReports.ts. */
export const SPECIES: Record<string, { label: string; group: BirdGroup }> = {
  'mallard': { label: 'Mallard', group: 'duck' },
  'gadwall': { label: 'Gadwall', group: 'duck' },
  'green-winged-teal': { label: 'Green-winged Teal', group: 'duck' },
  'blue-winged-teal': { label: 'Blue-winged Teal', group: 'duck' },
  'pintail': { label: 'Pintail', group: 'duck' },
  'american-wigeon': { label: 'American Wigeon', group: 'duck' },
  'northern-shoveler': { label: 'Northern Shoveler', group: 'duck' },
  'wood-duck': { label: 'Wood Duck', group: 'duck' },
  'canada-goose': { label: 'Canada Goose', group: 'goose' },
  'snow-goose': { label: 'Snow Goose', group: 'goose' },
  'ross-goose': { label: "Ross's Goose", group: 'goose' },
  'white-fronted-goose': { label: 'White-fronted Goose', group: 'goose' },
}

export const NOT_SURE_LABEL: Record<BirdGroup, string> = {
  duck: 'Ducks (not sure)',
  goose: 'Geese (not sure)',
}

export const BUCKETS: Record<CountBucket, { min: number; max: number }> = {
  '1-10': { min: 1, max: 10 },
  '10-50': { min: 11, max: 50 },
  '50-200': { min: 51, max: 200 },
  '200+': { min: 201, max: 250000 },
}

export const ACTIVITIES: readonly Activity[] = ['flying', 'on_water', 'in_field']
export const MAX_COUNT_EXACT = 250000
export const MAX_AGE_MS = 72 * 60 * 60 * 1000
export const FUTURE_SKEW_MS = 5 * 60 * 1000
export const LAT_RANGE = { min: 18, max: 72 } as const
export const LNG_RANGE = { min: -180, max: -64 } as const
export const USER_LIMIT_PER_HOUR = 10
export const USER_LIMIT_PER_DAY = 30
export const MAX_LIST_ROWS = 1000
export const REPORTS_LABEL = 'Hunter reports, unverified'

const CELL = 0.05

/** Centre of the 0.05-degree grid cell containing x (35.123456 -> 35.125). */
export function roundToCell(x: number): number {
  return Math.round((Math.floor(x / CELL) * CELL + CELL / 2) * 1000) / 1000
}

export interface NewReport {
  userId: string
  birdGroup: BirdGroup
  speciesSlug: string | null
  countBucket: CountBucket
  countExact: number | null
  activity: Activity | null
  lat: number
  lng: number
  latCell: number
  lngCell: number
  observedAt: Date
}

/** What the public sees. lat/lng here are the CELL values. */
export interface PublicReport {
  id: string
  lat: number
  lng: number
  birdGroup: BirdGroup
  speciesSlug: string | null
  speciesLabel: string
  countBucket: CountBucket
  countExact: number | null
  activity: Activity | null
  observedAt: string
}

/** Row as read back from the store: cell columns only, never lat/lng/user_id. */
export interface StoredPublicRow {
  id: string
  latCell: number
  lngCell: number
  birdGroup: string
  speciesSlug: string | null
  countBucket: string
  countExact: number | null
  activity: string | null
  observedAt: Date
}

export function toPublic(row: StoredPublicRow): PublicReport {
  const slug = row.speciesSlug
  const group = row.birdGroup as BirdGroup
  return {
    id: row.id,
    lat: row.latCell,
    lng: row.lngCell,
    birdGroup: group,
    speciesSlug: slug,
    speciesLabel: slug && SPECIES[slug] ? SPECIES[slug].label : NOT_SURE_LABEL[group],
    countBucket: row.countBucket as CountBucket,
    countExact: row.countExact,
    activity: row.activity as Activity | null,
    observedAt: row.observedAt.toISOString(),
  }
}

/** Windows for the per-user cap, counted from created_at (the server clock) */
export interface UserLimits {
  now: Date
  perHour: number
  perDay: number
}

export type InsertResult = { limited: false; row: StoredPublicRow } | { limited: true }

export interface FieldReportStore {
  /**
   * Count the user's reports in the last hour and day and insert only if under both caps.
   * Must be atomic per user: concurrent calls for one user may never store more than the caps.
   */
  insertIfUnderLimits(report: NewReport, limits: UserLimits): Promise<InsertResult>
  listSince(since: Date, limit: number): Promise<StoredPublicRow[]>
}

const BODY_KEYS = ['lat', 'lng', 'birdGroup', 'speciesSlug', 'countBucket', 'countExact', 'activity', 'observedAt']
const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i

export type ValidationResult =
  | { ok: true; value: Omit<NewReport, 'userId'> }
  | { ok: false; message: string }

const fail = (message: string): ValidationResult => ({ ok: false, message })

export function validateReport(body: unknown, now: Date): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Body must be an object')
  const b = body as Record<string, unknown>

  const extra = Object.keys(b).filter(k => !BODY_KEYS.includes(k))
  if (extra.length > 0) return fail(`Unknown field: ${extra[0]}`)

  const { lat, lng } = b
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail('lat and lng must be numbers')
  }
  if (lat < LAT_RANGE.min || lat > LAT_RANGE.max || lng < LNG_RANGE.min || lng > LNG_RANGE.max) {
    return fail('Location must be in the United States')
  }

  if (b.birdGroup !== 'duck' && b.birdGroup !== 'goose') return fail('birdGroup must be duck or goose')
  const birdGroup: BirdGroup = b.birdGroup

  let speciesSlug: string | null = null
  if (b.speciesSlug !== null && b.speciesSlug !== undefined) {
    if (typeof b.speciesSlug !== 'string' || !Object.hasOwn(SPECIES, b.speciesSlug)) return fail('Unknown species')
    if (SPECIES[b.speciesSlug].group !== birdGroup) return fail('Species does not match birdGroup')
    speciesSlug = b.speciesSlug
  }

  if (typeof b.countBucket !== 'string' || !Object.hasOwn(BUCKETS, b.countBucket)) return fail('Unknown countBucket')
  const countBucket = b.countBucket as CountBucket

  let countExact: number | null = null
  if (b.countExact !== null && b.countExact !== undefined) {
    const n = b.countExact
    if (typeof n !== 'number' || !Number.isInteger(n)) return fail('countExact must be a whole number')
    if (n < 1 || n > MAX_COUNT_EXACT) return fail(`countExact must be between 1 and ${MAX_COUNT_EXACT}`)
    const { min, max } = BUCKETS[countBucket]
    if (n < min || n > max) return fail('countExact is outside the chosen countBucket')
    countExact = n
  }

  let activity: Activity | null = null
  if (b.activity !== null && b.activity !== undefined) {
    if (typeof b.activity !== 'string' || !ACTIVITIES.includes(b.activity as Activity)) return fail('Unknown activity')
    activity = b.activity as Activity
  }

  if (typeof b.observedAt !== 'string' || !OFFSET_RE.test(b.observedAt)) {
    return fail('observedAt must be an ISO-8601 time with an offset')
  }
  const observedAt = new Date(b.observedAt)
  if (Number.isNaN(observedAt.getTime())) return fail('observedAt is not a valid time')
  if (observedAt.getTime() > now.getTime() + FUTURE_SKEW_MS) return fail('observedAt cannot be in the future')
  if (observedAt.getTime() < now.getTime() - MAX_AGE_MS) return fail('observedAt cannot be more than 72 hours ago')

  return {
    ok: true,
    value: {
      birdGroup, speciesSlug, countBucket, countExact, activity, lat, lng,
      latCell: roundToCell(lat), lngCell: roundToCell(lng), observedAt,
    },
  }
}

// Only the cell columns: lat, lng, user_id and created_at are never selected for output.
const PUBLIC_COLUMNS = {
  id: fieldReports.id,
  latCell: fieldReports.latCell,
  lngCell: fieldReports.lngCell,
  birdGroup: fieldReports.birdGroup,
  speciesSlug: fieldReports.speciesSlug,
  countBucket: fieldReports.countBucket,
  countExact: fieldReports.countExact,
  activity: fieldReports.activity,
  observedAt: fieldReports.observedAt,
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// The database is injected so a test can run this real SQL path against a stand-in driver.
export function createDrizzleFieldReportStore(database: () => ReturnType<typeof getDb>): FieldReportStore {
  return {
    async insertIfUnderLimits(report, { now, perHour, perDay }) {
      return database().transaction(async (tx) => {
        // Per-user advisory lock held to the end of the transaction: the count and the insert below
        // cannot interleave with another request from the same user.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${report.userId}))`)
        // Dates go in as ISO strings: drizzle does not serialize a Date interpolated into raw sql``,
        // and postgres-js would reject it. Column-bound values (gte on a column) are mapped by drizzle.
        const dayStart = new Date(now.getTime() - DAY_MS)
        const hourStart = new Date(now.getTime() - HOUR_MS).toISOString()
        const [counts] = await tx
          .select({
            day: sql<number>`count(*)::int`,
            hour: sql<number>`count(*) filter (where ${fieldReports.createdAt} >= ${hourStart}::timestamptz)::int`,
          })
          .from(fieldReports)
          .where(and(eq(fieldReports.userId, report.userId), gte(fieldReports.createdAt, dayStart)))
        if (counts.hour >= perHour || counts.day >= perDay) return { limited: true as const }
        const [row] = await tx.insert(fieldReports).values(report).returning(PUBLIC_COLUMNS)
        return { limited: false as const, row }
      })
    },
    async listSince(since, limit) {
      return database()
        .select(PUBLIC_COLUMNS)
        .from(fieldReports)
        .where(gte(fieldReports.observedAt, since))
        .orderBy(desc(fieldReports.observedAt))
        .limit(limit)
    },
  }
}

export const drizzleFieldReportStore = createDrizzleFieldReportStore(getDb)
