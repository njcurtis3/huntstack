import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from 'drizzle-orm'
import {
  outfitterInquiries,
  outfitterSubmissions,
  outfitterViewCounts,
  outfitters,
  reviewReplies,
  reviews,
} from '@huntstack/db/schema'
import { getDb } from './db.js'
import { decodeJsonbField } from './jsonb.js'

// Persistence for the outfitter directory and its self-service flows. The business rules (limits,
// who may do what, approval) live in outfitters.ts and run against OutfitterTx, so the same rules
// execute over the Drizzle implementation below and over the in-memory one the tests use.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SubmissionKind = 'new_listing' | 'edit' | 'claim' | 'review_reply'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'
export type InquiryStatus = 'new' | 'read' | 'archived'
export type ViewKind = 'impression' | 'detail' | 'contact'

/** The fields an outfitter controls on their listing (new_listing and edit payload). */
export interface ListingInput {
  name: string
  city: string
  state: string
  statesServed: string[]
  huntTypes: string[]
  speciesOffered: string[]
  priceRange: string
  priceNote: string | null
  description: string
  phone: string | null
  website: string | null
}

export interface OutfitterRecord {
  id: string
  name: string
  slug: string
  city: string
  state: string
  statesServed: string[]
  speciesOffered: string[]
  huntTypes: string[]
  priceRange: string | null
  priceNote: string | null
  rating: number | null
  reviewCount: number
  description: string | null
  website: string | null
  phone: string | null
  isVerified: boolean
  isActive: boolean
  ownerId: string | null
  legacyId: string | null
}

export interface SubmissionRecord {
  id: string
  kind: SubmissionKind
  status: SubmissionStatus
  userId: string
  submitterEmail: string | null
  outfitterId: string | null
  reviewId: string | null
  payload: unknown
  rejectReason: string | null
  reviewedBy: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface NewSubmission {
  kind: SubmissionKind
  userId: string
  submitterEmail: string | null
  outfitterId: string | null
  reviewId: string | null
  payload: unknown
  now: Date
}

export interface ReviewRecord {
  id: string
  outfitterId: string
  rating: number
  title: string | null
  content: string | null
  huntDate: Date | null
  createdAt: Date
  reply: { body: string; updatedAt: Date } | null
}

export interface InquiryRecord {
  id: string
  outfitterId: string
  userId: string
  hunterEmail: string
  hunterName: string | null
  hunterPhone: string | null
  preferredDates: string | null
  partySize: number | null
  message: string
  status: InquiryStatus
  createdAt: Date
}

export type NewInquiry = Omit<InquiryRecord, 'id' | 'status'>

export interface ViewDelta {
  outfitterId: string
  day: string
  kind: ViewKind
  n: number
}

export interface Decision {
  status: 'approved' | 'rejected'
  rejectReason: string | null
  reviewedBy: string
  now: Date
  outfitterId?: string | null
}

export interface OutfitterTx {
  /** Per-key advisory lock held to the end of the surrounding transaction */
  lockKey(key: string): Promise<void>

  listActive(): Promise<OutfitterRecord[]>
  listAll(): Promise<OutfitterRecord[]>
  /** Active listings only: id, slug or legacy tx-NN id */
  findActive(idOrSlug: string): Promise<OutfitterRecord | null>
  findById(id: string): Promise<OutfitterRecord | null>
  findByOwner(userId: string): Promise<OutfitterRecord | null>
  slugExists(slug: string): Promise<boolean>
  insertListing(fields: ListingInput, extra: { slug: string; ownerId: string; isVerified: boolean; now: Date }): Promise<OutfitterRecord>
  updateListing(id: string, fields: ListingInput, now: Date): Promise<OutfitterRecord | null>
  /** Sets the owner only while owner_id is still NULL; null when it was not */
  claimListing(id: string, ownerId: string, markVerified: boolean, now: Date): Promise<OutfitterRecord | null>
  setActive(id: string, isActive: boolean, now: Date): Promise<OutfitterRecord | null>
  releaseOwner(id: string, now: Date): Promise<OutfitterRecord | null>

  getSubmission(id: string): Promise<SubmissionRecord | null>
  /** Row-locks the submission (SELECT ... FOR UPDATE) */
  lockSubmission(id: string): Promise<SubmissionRecord | null>
  insertSubmission(input: NewSubmission): Promise<SubmissionRecord>
  replacePayload(id: string, payload: unknown, now: Date): Promise<SubmissionRecord>
  pendingForUser(userId: string): Promise<SubmissionRecord | null>
  pendingEditFor(outfitterId: string): Promise<SubmissionRecord | null>
  pendingReplyFor(reviewId: string): Promise<SubmissionRecord | null>
  pendingRepliesFor(outfitterId: string): Promise<SubmissionRecord[]>
  countSubmissionsSince(userId: string, since: Date): Promise<number>
  withdraw(id: string, userId: string, now: Date): Promise<SubmissionRecord | null>
  decide(id: string, decision: Decision): Promise<SubmissionRecord>
  lastDecision(userId: string): Promise<SubmissionRecord | null>
  listSubmissions(scope: 'pending' | 'decided'): Promise<SubmissionRecord[]>

  listReviews(outfitterId: string): Promise<ReviewRecord[]>
  getReview(id: string): Promise<{ id: string; outfitterId: string; rating: number; title: string | null; content: string | null } | null>
  upsertReply(reviewId: string, outfitterId: string, body: string, now: Date): Promise<void>

  countInquiriesSince(userId: string, since: Date, outfitterId?: string): Promise<number>
  insertInquiry(input: NewInquiry): Promise<InquiryRecord>
  listInquiries(outfitterId: string, status: InquiryStatus | 'all'): Promise<InquiryRecord[]>
  setInquiryStatus(id: string, outfitterId: string, status: InquiryStatus): Promise<boolean>

  addViews(deltas: ViewDelta[]): Promise<void>
  viewCounts(outfitterId: string, fromDay: string, toDay: string): Promise<Array<{ day: string; kind: ViewKind; count: number }>>
}

export interface OutfitterStore extends OutfitterTx {
  transaction<T>(fn: (tx: OutfitterTx) => Promise<T>): Promise<T>
}

/** Postgres unique_violation, e.g. a second listing for one owner or a duplicate slug */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

// ---------------------------------------------------------------------------------------------
// Drizzle implementation
// ---------------------------------------------------------------------------------------------

type Database = ReturnType<typeof getDb>
type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'execute'>

function stringList(value: unknown): string[] {
  const decoded = decodeJsonbField<unknown>(value)
  return Array.isArray(decoded) ? decoded.filter((x): x is string => typeof x === 'string') : []
}

function toRecord(row: typeof outfitters.$inferSelect): OutfitterRecord {
  const location = decodeJsonbField<{ city?: unknown; state?: unknown }>(row.location) ?? {}
  const meta = decodeJsonbField<{ legacyId?: unknown; priceNote?: unknown }>(row.metadata) ?? {}
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: typeof location.city === 'string' ? location.city : '',
    state: typeof location.state === 'string' ? location.state : '',
    statesServed: stringList(row.statesServed),
    speciesOffered: stringList(row.speciesOffered),
    huntTypes: stringList(row.huntTypes),
    priceRange: row.priceRange,
    priceNote: typeof meta.priceNote === 'string' ? meta.priceNote : null,
    rating: row.rating,
    reviewCount: row.reviewCount ?? 0,
    description: row.description,
    website: row.website,
    phone: row.contactPhone,
    isVerified: row.isVerified ?? false,
    isActive: row.isActive ?? true,
    ownerId: row.ownerId,
    legacyId: typeof meta.legacyId === 'string' ? meta.legacyId : null,
  }
}

function toSubmission(row: typeof outfitterSubmissions.$inferSelect): SubmissionRecord {
  return {
    id: row.id,
    kind: row.kind as SubmissionKind,
    status: row.status as SubmissionStatus,
    userId: row.userId,
    submitterEmail: row.submitterEmail,
    outfitterId: row.outfitterId,
    reviewId: row.reviewId,
    payload: decodeJsonbField<unknown>(row.payload),
    rejectReason: row.rejectReason,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toInquiry(row: typeof outfitterInquiries.$inferSelect): InquiryRecord {
  return { ...row, status: row.status as InquiryStatus }
}

function listingColumns(fields: ListingInput) {
  return {
    name: fields.name,
    description: fields.description,
    contactPhone: fields.phone,
    website: fields.website,
    huntTypes: fields.huntTypes,
    speciesOffered: fields.speciesOffered,
    statesServed: fields.statesServed,
    priceRange: fields.priceRange,
  }
}

const pendingKinds: SubmissionKind[] = ['new_listing', 'claim']

function makeOps(db: Executor): OutfitterTx {
  const one = async <T>(rows: Promise<T[]>): Promise<T | null> => (await rows)[0] ?? null

  return {
    async lockKey(key) {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
    },

    async listActive() {
      const rows = await db.select().from(outfitters).where(eq(outfitters.isActive, true))
      return rows.map(toRecord)
    },
    async listAll() {
      const rows = await db.select().from(outfitters).orderBy(asc(outfitters.name))
      return rows.map(toRecord)
    },
    async findActive(idOrSlug) {
      const match = UUID_RE.test(idOrSlug)
        ? eq(outfitters.id, idOrSlug.toLowerCase())
        : sql`(${outfitters.slug} = ${idOrSlug} or ${outfitters.metadata}->>'legacyId' = ${idOrSlug})`
      const row = await one(db.select().from(outfitters).where(and(eq(outfitters.isActive, true), match)).limit(1))
      return row ? toRecord(row) : null
    },
    async findById(id) {
      const row = await one(db.select().from(outfitters).where(eq(outfitters.id, id)).limit(1))
      return row ? toRecord(row) : null
    },
    async findByOwner(userId) {
      const row = await one(db.select().from(outfitters).where(eq(outfitters.ownerId, userId)).limit(1))
      return row ? toRecord(row) : null
    },
    async slugExists(slug) {
      return (await one(db.select({ id: outfitters.id }).from(outfitters).where(eq(outfitters.slug, slug)).limit(1))) !== null
    },
    async insertListing(fields, { slug, ownerId, isVerified, now }) {
      const [row] = await db.insert(outfitters).values({
        ...listingColumns(fields),
        slug,
        ownerId,
        isVerified,
        isActive: true,
        location: { city: fields.city, state: fields.state },
        metadata: { priceNote: fields.priceNote },
        createdAt: now,
        updatedAt: now,
      }).returning()
      return toRecord(row)
    },
    async updateListing(id, fields, now) {
      const row = await one(db.update(outfitters).set({
        ...listingColumns(fields),
        // merge so keys this form does not own (address, zip, legacyId) survive an edit
        location: sql`coalesce(${outfitters.location}, '{}'::jsonb) || ${JSON.stringify({ city: fields.city, state: fields.state })}::jsonb`,
        metadata: sql`coalesce(${outfitters.metadata}, '{}'::jsonb) || ${JSON.stringify({ priceNote: fields.priceNote })}::jsonb`,
        updatedAt: now,
      }).where(eq(outfitters.id, id)).returning())
      return row ? toRecord(row) : null
    },
    async claimListing(id, ownerId, markVerified, now) {
      const row = await one(db.update(outfitters).set({
        ownerId,
        ...(markVerified ? { isVerified: true } : {}),
        updatedAt: now,
      }).where(and(eq(outfitters.id, id), isNull(outfitters.ownerId))).returning())
      return row ? toRecord(row) : null
    },
    async setActive(id, isActive, now) {
      const row = await one(db.update(outfitters).set({ isActive, updatedAt: now }).where(eq(outfitters.id, id)).returning())
      return row ? toRecord(row) : null
    },
    async releaseOwner(id, now) {
      const row = await one(db.update(outfitters).set({ ownerId: null, updatedAt: now }).where(eq(outfitters.id, id)).returning())
      return row ? toRecord(row) : null
    },

    async getSubmission(id) {
      const row = await one(db.select().from(outfitterSubmissions).where(eq(outfitterSubmissions.id, id)).limit(1))
      return row ? toSubmission(row) : null
    },
    async lockSubmission(id) {
      const row = await one(db.select().from(outfitterSubmissions).where(eq(outfitterSubmissions.id, id)).limit(1).for('update'))
      return row ? toSubmission(row) : null
    },
    async insertSubmission(input) {
      const [row] = await db.insert(outfitterSubmissions).values({
        kind: input.kind,
        userId: input.userId,
        submitterEmail: input.submitterEmail,
        outfitterId: input.outfitterId,
        reviewId: input.reviewId,
        payload: input.payload,
        createdAt: input.now,
        updatedAt: input.now,
      }).returning()
      return toSubmission(row)
    },
    async replacePayload(id, payload, now) {
      const [row] = await db.update(outfitterSubmissions).set({ payload, updatedAt: now }).where(eq(outfitterSubmissions.id, id)).returning()
      return toSubmission(row)
    },
    async pendingForUser(userId) {
      const row = await one(db.select().from(outfitterSubmissions).where(and(
        eq(outfitterSubmissions.userId, userId),
        eq(outfitterSubmissions.status, 'pending'),
        inArray(outfitterSubmissions.kind, pendingKinds),
      )).limit(1))
      return row ? toSubmission(row) : null
    },
    async pendingEditFor(outfitterId) {
      const row = await one(db.select().from(outfitterSubmissions).where(and(
        eq(outfitterSubmissions.outfitterId, outfitterId),
        eq(outfitterSubmissions.status, 'pending'),
        eq(outfitterSubmissions.kind, 'edit'),
      )).limit(1))
      return row ? toSubmission(row) : null
    },
    async pendingReplyFor(reviewId) {
      const row = await one(db.select().from(outfitterSubmissions).where(and(
        eq(outfitterSubmissions.reviewId, reviewId),
        eq(outfitterSubmissions.status, 'pending'),
        eq(outfitterSubmissions.kind, 'review_reply'),
      )).limit(1))
      return row ? toSubmission(row) : null
    },
    async pendingRepliesFor(outfitterId) {
      const rows = await db.select().from(outfitterSubmissions).where(and(
        eq(outfitterSubmissions.outfitterId, outfitterId),
        eq(outfitterSubmissions.status, 'pending'),
        eq(outfitterSubmissions.kind, 'review_reply'),
      ))
      return rows.map(toSubmission)
    },
    async countSubmissionsSince(userId, since) {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(outfitterSubmissions)
        .where(and(eq(outfitterSubmissions.userId, userId), gte(outfitterSubmissions.createdAt, since)))
      return row.n
    },
    async withdraw(id, userId, now) {
      const row = await one(db.update(outfitterSubmissions).set({ status: 'withdrawn', updatedAt: now }).where(and(
        eq(outfitterSubmissions.id, id),
        eq(outfitterSubmissions.userId, userId),
        eq(outfitterSubmissions.status, 'pending'),
      )).returning())
      return row ? toSubmission(row) : null
    },
    async decide(id, d) {
      const [row] = await db.update(outfitterSubmissions).set({
        status: d.status,
        rejectReason: d.rejectReason,
        reviewedBy: d.reviewedBy,
        reviewedAt: d.now,
        updatedAt: d.now,
        ...(d.outfitterId ? { outfitterId: d.outfitterId } : {}),
      }).where(eq(outfitterSubmissions.id, id)).returning()
      return toSubmission(row)
    },
    async lastDecision(userId) {
      const row = await one(db.select().from(outfitterSubmissions).where(and(
        eq(outfitterSubmissions.userId, userId),
        inArray(outfitterSubmissions.status, ['approved', 'rejected']),
        ne(outfitterSubmissions.kind, 'review_reply'),
      )).orderBy(desc(outfitterSubmissions.reviewedAt)).limit(1))
      return row ? toSubmission(row) : null
    },
    async listSubmissions(scope) {
      const rows = scope === 'pending'
        ? await db.select().from(outfitterSubmissions).where(eq(outfitterSubmissions.status, 'pending')).orderBy(asc(outfitterSubmissions.createdAt))
        : await db.select().from(outfitterSubmissions).where(ne(outfitterSubmissions.status, 'pending')).orderBy(desc(outfitterSubmissions.updatedAt)).limit(100)
      return rows.map(toSubmission)
    },

    async listReviews(outfitterId) {
      const rows = await db
        .select({
          id: reviews.id,
          outfitterId: reviews.outfitterId,
          rating: reviews.rating,
          title: reviews.title,
          content: reviews.content,
          huntDate: reviews.huntDate,
          createdAt: reviews.createdAt,
          replyBody: reviewReplies.body,
          replyUpdatedAt: reviewReplies.updatedAt,
        })
        .from(reviews)
        .leftJoin(reviewReplies, eq(reviewReplies.reviewId, reviews.id))
        .where(eq(reviews.outfitterId, outfitterId))
        .orderBy(desc(reviews.createdAt))
      return rows.map(r => ({
        id: r.id,
        outfitterId: r.outfitterId,
        rating: r.rating,
        title: r.title,
        content: r.content,
        huntDate: r.huntDate,
        createdAt: r.createdAt,
        reply: r.replyBody !== null && r.replyUpdatedAt !== null ? { body: r.replyBody, updatedAt: r.replyUpdatedAt } : null,
      }))
    },
    async getReview(id) {
      return one(db.select({
        id: reviews.id, outfitterId: reviews.outfitterId, rating: reviews.rating, title: reviews.title, content: reviews.content,
      }).from(reviews).where(eq(reviews.id, id)).limit(1))
    },
    async upsertReply(reviewId, outfitterId, body, now) {
      await db.insert(reviewReplies).values({ reviewId, outfitterId, body, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: reviewReplies.reviewId, set: { body, outfitterId, updatedAt: now } })
    },

    async countInquiriesSince(userId, since, outfitterId) {
      const conds: SQL[] = [eq(outfitterInquiries.userId, userId), gte(outfitterInquiries.createdAt, since)]
      if (outfitterId) conds.push(eq(outfitterInquiries.outfitterId, outfitterId))
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(outfitterInquiries).where(and(...conds))
      return row.n
    },
    async insertInquiry(input) {
      const [row] = await db.insert(outfitterInquiries).values(input).returning()
      return toInquiry(row)
    },
    async listInquiries(outfitterId, status) {
      const where = status === 'all'
        ? eq(outfitterInquiries.outfitterId, outfitterId)
        : and(eq(outfitterInquiries.outfitterId, outfitterId), eq(outfitterInquiries.status, status))
      const rows = await db.select().from(outfitterInquiries).where(where).orderBy(desc(outfitterInquiries.createdAt)).limit(500)
      return rows.map(toInquiry)
    },
    async setInquiryStatus(id, outfitterId, status) {
      const rows = await db.update(outfitterInquiries).set({ status })
        .where(and(eq(outfitterInquiries.id, id), eq(outfitterInquiries.outfitterId, outfitterId)))
        .returning({ id: outfitterInquiries.id })
      return rows.length > 0
    },

    async addViews(deltas) {
      if (deltas.length === 0) return
      await db.insert(outfitterViewCounts)
        .values(deltas.map(d => ({ outfitterId: d.outfitterId, day: d.day, kind: d.kind, count: d.n })))
        .onConflictDoUpdate({
          target: [outfitterViewCounts.outfitterId, outfitterViewCounts.day, outfitterViewCounts.kind],
          set: { count: sql`${outfitterViewCounts.count} + excluded.count` },
        })
    },
    async viewCounts(outfitterId, fromDay, toDay) {
      const rows = await db.select().from(outfitterViewCounts).where(and(
        eq(outfitterViewCounts.outfitterId, outfitterId),
        gte(outfitterViewCounts.day, fromDay),
        lte(outfitterViewCounts.day, toDay),
      ))
      return rows.map(r => ({ day: r.day, kind: r.kind as ViewKind, count: r.count }))
    },
  }
}

// The database is injected so a test can run this real SQL path against a stand-in driver.
export function createDrizzleOutfitterStore(database: () => Database): OutfitterStore {
  // Resolved on first use, so importing this module never needs DATABASE_URL.
  const lazyDb = new Proxy({} as Executor, { get: (_target, prop) => Reflect.get(database(), prop) })
  return {
    ...makeOps(lazyDb),
    transaction: (fn) => database().transaction(async (tx) => fn(makeOps(tx as unknown as Executor))),
  }
}

export const drizzleOutfitterStore = createDrizzleOutfitterStore(getDb)

// ---------------------------------------------------------------------------------------------
// In-memory implementation: what route and rule tests run against (no DB, no network)
// ---------------------------------------------------------------------------------------------

export interface MemoryState {
  listings: OutfitterRecord[]
  submissions: SubmissionRecord[]
  reviews: Array<Omit<ReviewRecord, 'reply'>>
  replies: Array<{ reviewId: string; outfitterId: string; body: string; updatedAt: Date }>
  inquiries: InquiryRecord[]
  views: Array<{ outfitterId: string; day: string; kind: ViewKind; count: number }>
}

export function createMemoryOutfitterStore(initial: Partial<MemoryState> = {}): OutfitterStore & { state: MemoryState } {
  const state: MemoryState = {
    listings: [], submissions: [], reviews: [], replies: [], inquiries: [], views: [], ...initial,
  }
  let chain: Promise<unknown> = Promise.resolve()
  const uid = () => crypto.randomUUID()
  const sub = (id: string) => state.submissions.find(s => s.id === id)
  const copy = <T>(v: T): T => structuredClone(v)

  const ops: OutfitterTx = {
    async lockKey() {},

    async listActive() { return copy(state.listings.filter(l => l.isActive)) },
    async listAll() { return copy([...state.listings].sort((a, b) => a.name.localeCompare(b.name))) },
    async findActive(idOrSlug) {
      const x = idOrSlug.toLowerCase()
      const l = state.listings.find(o => o.isActive && (o.id === x || o.slug === idOrSlug || o.legacyId === idOrSlug))
      return l ? copy(l) : null
    },
    async findById(id) { return copy(state.listings.find(l => l.id === id) ?? null) },
    async findByOwner(userId) { return copy(state.listings.find(l => l.ownerId === userId) ?? null) },
    async slugExists(slug) { return state.listings.some(l => l.slug === slug) },
    async insertListing(fields, { slug, ownerId, isVerified }) {
      if (state.listings.some(l => l.ownerId === ownerId)) throw Object.assign(new Error('duplicate owner'), { code: '23505' })
      const row: OutfitterRecord = {
        id: uid(), slug, ownerId, isVerified, isActive: true, rating: null, reviewCount: 0, legacyId: null,
        name: fields.name, city: fields.city, state: fields.state, statesServed: fields.statesServed,
        speciesOffered: fields.speciesOffered, huntTypes: fields.huntTypes, priceRange: fields.priceRange,
        priceNote: fields.priceNote, description: fields.description, website: fields.website, phone: fields.phone,
      }
      state.listings.push(row)
      return copy(row)
    },
    async updateListing(id, fields) {
      const l = state.listings.find(o => o.id === id)
      if (!l) return null
      Object.assign(l, fields)
      return copy(l)
    },
    async claimListing(id, ownerId, markVerified) {
      const l = state.listings.find(o => o.id === id)
      if (!l || l.ownerId !== null) return null
      if (state.listings.some(o => o.ownerId === ownerId)) throw Object.assign(new Error('duplicate owner'), { code: '23505' })
      l.ownerId = ownerId
      if (markVerified) l.isVerified = true
      return copy(l)
    },
    async setActive(id, isActive) {
      const l = state.listings.find(o => o.id === id)
      if (!l) return null
      l.isActive = isActive
      return copy(l)
    },
    async releaseOwner(id) {
      const l = state.listings.find(o => o.id === id)
      if (!l) return null
      l.ownerId = null
      return copy(l)
    },

    async getSubmission(id) { return copy(sub(id) ?? null) },
    async lockSubmission(id) { return copy(sub(id) ?? null) },
    async insertSubmission(input) {
      const row: SubmissionRecord = {
        id: uid(), kind: input.kind, status: 'pending', userId: input.userId, submitterEmail: input.submitterEmail,
        outfitterId: input.outfitterId, reviewId: input.reviewId, payload: copy(input.payload),
        rejectReason: null, reviewedBy: null, reviewedAt: null, createdAt: input.now, updatedAt: input.now,
      }
      state.submissions.push(row)
      return copy(row)
    },
    async replacePayload(id, payload, now) {
      const s = sub(id)!
      s.payload = copy(payload)
      s.updatedAt = now
      return copy(s)
    },
    async pendingForUser(userId) {
      return copy(state.submissions.find(s => s.userId === userId && s.status === 'pending' && (s.kind === 'new_listing' || s.kind === 'claim')) ?? null)
    },
    async pendingEditFor(outfitterId) {
      return copy(state.submissions.find(s => s.outfitterId === outfitterId && s.status === 'pending' && s.kind === 'edit') ?? null)
    },
    async pendingReplyFor(reviewId) {
      return copy(state.submissions.find(s => s.reviewId === reviewId && s.status === 'pending' && s.kind === 'review_reply') ?? null)
    },
    async pendingRepliesFor(outfitterId) {
      return copy(state.submissions.filter(s => s.outfitterId === outfitterId && s.status === 'pending' && s.kind === 'review_reply'))
    },
    async countSubmissionsSince(userId, since) {
      return state.submissions.filter(s => s.userId === userId && s.createdAt >= since).length
    },
    async withdraw(id, userId, now) {
      const s = sub(id)
      if (!s || s.userId !== userId || s.status !== 'pending') return null
      s.status = 'withdrawn'
      s.updatedAt = now
      return copy(s)
    },
    async decide(id, d) {
      const s = sub(id)!
      s.status = d.status
      s.rejectReason = d.rejectReason
      s.reviewedBy = d.reviewedBy
      s.reviewedAt = d.now
      s.updatedAt = d.now
      if (d.outfitterId) s.outfitterId = d.outfitterId
      return copy(s)
    },
    async lastDecision(userId) {
      const done = state.submissions
        .filter(s => s.userId === userId && (s.status === 'approved' || s.status === 'rejected') && s.kind !== 'review_reply')
        .sort((a, b) => (b.reviewedAt?.getTime() ?? 0) - (a.reviewedAt?.getTime() ?? 0))
      return copy(done[0] ?? null)
    },
    async listSubmissions(scope) {
      if (scope === 'pending') {
        return copy(state.submissions.filter(s => s.status === 'pending').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()))
      }
      return copy(state.submissions.filter(s => s.status !== 'pending').sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 100))
    },

    async listReviews(outfitterId) {
      return copy(state.reviews.filter(r => r.outfitterId === outfitterId).map(r => {
        const rep = state.replies.find(x => x.reviewId === r.id)
        return { ...r, reply: rep ? { body: rep.body, updatedAt: rep.updatedAt } : null }
      }))
    },
    async getReview(id) {
      const r = state.reviews.find(x => x.id === id)
      return r ? { id: r.id, outfitterId: r.outfitterId, rating: r.rating, title: r.title, content: r.content } : null
    },
    async upsertReply(reviewId, outfitterId, body, now) {
      const existing = state.replies.find(r => r.reviewId === reviewId)
      if (existing) Object.assign(existing, { body, outfitterId, updatedAt: now })
      else state.replies.push({ reviewId, outfitterId, body, updatedAt: now })
    },

    async countInquiriesSince(userId, since, outfitterId) {
      return state.inquiries.filter(i => i.userId === userId && i.createdAt >= since && (!outfitterId || i.outfitterId === outfitterId)).length
    },
    async insertInquiry(input) {
      const row: InquiryRecord = { ...input, id: uid(), status: 'new' }
      state.inquiries.push(row)
      return copy(row)
    },
    async listInquiries(outfitterId, status) {
      return copy(state.inquiries
        .filter(i => i.outfitterId === outfitterId && (status === 'all' || i.status === status))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()))
    },
    async setInquiryStatus(id, outfitterId, status) {
      const i = state.inquiries.find(x => x.id === id && x.outfitterId === outfitterId)
      if (!i) return false
      i.status = status
      return true
    },

    async addViews(deltas) {
      for (const d of deltas) {
        const row = state.views.find(v => v.outfitterId === d.outfitterId && v.day === d.day && v.kind === d.kind)
        if (row) row.count += d.n
        else state.views.push({ outfitterId: d.outfitterId, day: d.day, kind: d.kind, count: d.n })
      }
    },
    async viewCounts(outfitterId, fromDay, toDay) {
      return state.views.filter(v => v.outfitterId === outfitterId && v.day >= fromDay && v.day <= toDay)
        .map(v => ({ day: v.day, kind: v.kind, count: v.count }))
    },
  }

  return {
    ...ops,
    state,
    // One transaction at a time, like the advisory lock: a rule that checks then writes cannot interleave.
    transaction<T>(fn: (tx: OutfitterTx) => Promise<T>): Promise<T> {
      const run = chain.then(() => fn(ops))
      chain = run.catch(() => undefined)
      return run
    },
  }
}
