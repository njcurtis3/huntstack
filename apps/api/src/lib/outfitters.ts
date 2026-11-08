import type { AuthUser } from './auth-guard.js'
import {
  UUID_RE,
  isUniqueViolation,
  type InquiryRecord,
  type ListingInput,
  type OutfitterRecord,
  type OutfitterStore,
  type OutfitterTx,
  type SubmissionRecord,
  type ViewKind,
} from './outfitter-store.js'

// Rules for the outfitter directory: input validation, the public shape, and the submit / approve /
// reject / inquiry flows. Every check-then-write runs inside store.transaction under a per-user
// advisory lock, so concurrent requests cannot slip past a limit or double-claim a listing.
// Validation here is mirrored client-side in apps/web/src/lib/outfitterAccount.ts (copied, not shared).

export const STATE_CODES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO'] as const
export const HUNT_TYPES = ['guided', 'semi-guided', 'diy-support'] as const
export const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'] as const

export const SUBMISSIONS_PER_DAY = 20
export const INQUIRIES_PER_DAY = 5
export const INQUIRIES_PER_OUTFITTER_PER_WEEK = 2

const DAY_MS = 24 * 60 * 60 * 1000
const PHONE_RE = /^[0-9 ()+\-.]+$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface PublicListing {
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
  claimed: boolean
}

/** The only mapping from a stored row to what the public sees: no owner id, metadata or legacy id. */
export function toPublicListing(r: OutfitterRecord): PublicListing {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    city: r.city,
    state: r.state,
    statesServed: r.statesServed,
    speciesOffered: r.speciesOffered,
    huntTypes: r.huntTypes,
    priceRange: r.priceRange,
    priceNote: r.priceNote,
    rating: r.rating,
    reviewCount: r.reviewCount,
    description: r.description,
    website: r.website,
    phone: r.phone,
    isVerified: r.isVerified,
    claimed: r.ownerId !== null,
  }
}

export interface DirectoryQuery {
  q?: string
  state?: string
  species?: string
  priceRange?: string
}

/** Same filter semantics as the old hardcoded list: state matches primary or served, the rest are substrings. */
export function filterListings(all: OutfitterRecord[], { q, state, species, priceRange }: DirectoryQuery): OutfitterRecord[] {
  let results = [...all]
  if (state) {
    const code = state.toUpperCase()
    results = results.filter(o => o.state === code || o.statesServed.includes(code))
  }
  if (species) {
    const needle = species.toLowerCase()
    results = results.filter(o => o.speciesOffered.some(s => s.toLowerCase().includes(needle)))
  }
  if (priceRange) results = results.filter(o => o.priceRange === priceRange)
  if (q) {
    const needle = q.toLowerCase()
    results = results.filter(o =>
      o.name.toLowerCase().includes(needle) ||
      o.city.toLowerCase().includes(needle) ||
      o.state.toLowerCase().includes(needle) ||
      o.speciesOffered.some(s => s.toLowerCase().includes(needle)))
  }
  // Verified first, then alphabetical
  results.sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return results
}

// Includes both each outfitter's primary state and any additional states it serves, since filtering
// by `state` matches on both - otherwise a state-served-but-not-primary outfitter shows up in results
// for a state that never appeared in the dropdown facet.
export function statesFacet(all: OutfitterRecord[]): string[] {
  return [...new Set(all.flatMap(o => [o.state, ...o.statesServed]))].filter(Boolean).sort()
}

export const listingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    statesServed: { type: 'array', items: { type: 'string' } },
    speciesOffered: { type: 'array', items: { type: 'string' } },
    huntTypes: { type: 'array', items: { type: 'string' } },
    priceRange: { type: 'string', nullable: true },
    priceNote: { type: 'string', nullable: true },
    rating: { type: 'number', nullable: true },
    reviewCount: { type: 'integer' },
    description: { type: 'string', nullable: true },
    website: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    isVerified: { type: 'boolean' },
    claimed: { type: 'boolean' },
  },
} as const

/** PublicListing plus the fields only an owner or admin sees. */
export const privateListingSchema = {
  ...listingSchema,
  properties: {
    ...listingSchema.properties,
    isActive: { type: 'boolean' },
    ownerId: { type: 'string', nullable: true },
  },
} as const

export const ownListingSchema = {
  ...listingSchema,
  properties: { ...listingSchema.properties, isActive: { type: 'boolean' } },
} as const

export const submissionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    kind: { type: 'string' },
    status: { type: 'string' },
    outfitterId: { type: 'string', nullable: true },
    reviewId: { type: 'string', nullable: true },
    payload: {},
    rejectReason: { type: 'string', nullable: true },
    createdAt: { type: 'string' },
    reviewedAt: { type: 'string', nullable: true },
  },
} as const

export function toSubmissionJson(s: SubmissionRecord) {
  return {
    id: s.id,
    kind: s.kind,
    status: s.status,
    outfitterId: s.outfitterId,
    reviewId: s.reviewId,
    payload: s.payload,
    rejectReason: s.rejectReason,
    createdAt: s.createdAt.toISOString(),
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
  }
}

// ---- validation ----

export type Validation<T> = { ok: true; value: T } | { ok: false; message: string }

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message })

function isObject(body: unknown): body is Record<string, unknown> {
  return !!body && typeof body === 'object' && !Array.isArray(body)
}

function unknownKey(b: Record<string, unknown>, allowed: readonly string[]): string | null {
  return Object.keys(b).find(k => !allowed.includes(k)) ?? null
}

/** A required trimmed string with a length range, or an error message. */
function text(value: unknown, label: string, min: number, max: number): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== 'string') return fail(`${label} is required`)
  const v = value.trim()
  if (v.length < min || v.length > max) return fail(min === max ? `${label} must be ${min} characters` : `${label} must be ${min} to ${max} characters`)
  return { ok: true, value: v }
}

/** Optional string: undefined, null and blank are null; otherwise a trimmed string of at most max. */
function optionalText(value: unknown, label: string, max: number): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return fail(`${label} must be text`)
  const v = value.trim()
  if (v.length > max) return fail(`${label} must be at most ${max} characters`)
  return { ok: true, value: v === '' ? null : v }
}

function optionalPhone(value: unknown, label: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const t = optionalText(value, label, 30)
  if (!t.ok || t.value === null) return t
  if (t.value.length < 7 || !PHONE_RE.test(t.value)) return fail(`${label} must be 7 to 30 digits, spaces or ( ) + - .`)
  return t
}

const LISTING_KEYS = ['name', 'city', 'state', 'statesServed', 'huntTypes', 'speciesOffered', 'priceRange', 'priceNote', 'description', 'phone', 'website']

export function validateListingInput(body: unknown): Validation<ListingInput> {
  if (!isObject(body)) return fail('Listing must be an object')
  const extra = unknownKey(body, LISTING_KEYS)
  if (extra) return fail(`Unknown field: ${extra}`)

  const name = text(body.name, 'Business name', 2, 120)
  if (!name.ok) return name
  const city = text(body.city, 'City', 1, 80)
  if (!city.ok) return city

  if (typeof body.state !== 'string' || !(STATE_CODES as readonly string[]).includes(body.state)) {
    return fail(`State must be one of ${STATE_CODES.join(', ')}`)
  }
  const state = body.state

  if (!Array.isArray(body.statesServed) || body.statesServed.length < 1 || body.statesServed.length > STATE_CODES.length ||
      body.statesServed.some(s => typeof s !== 'string' || !(STATE_CODES as readonly string[]).includes(s))) {
    return fail('Choose at least one state you serve')
  }
  const statesServed = [...new Set(body.statesServed as string[])]
  if (!statesServed.includes(state)) return fail('States served must include your state')

  if (!Array.isArray(body.huntTypes) || body.huntTypes.length < 1 || body.huntTypes.length > HUNT_TYPES.length ||
      body.huntTypes.some(h => typeof h !== 'string' || !(HUNT_TYPES as readonly string[]).includes(h))) {
    return fail('Choose one to three hunt types')
  }
  const huntTypes = [...new Set(body.huntTypes as string[])]

  if (!Array.isArray(body.speciesOffered) || body.speciesOffered.length < 1 || body.speciesOffered.length > 20) {
    return fail('List one to 20 species')
  }
  const seen = new Set<string>()
  const speciesOffered: string[] = []
  for (const raw of body.speciesOffered) {
    if (typeof raw !== 'string') return fail('Each species must be text')
    const s = raw.trim()
    if (s.length < 1 || s.length > 40) return fail('Each species must be 1 to 40 characters')
    if (!seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase())
      speciesOffered.push(s)
    }
  }

  if (typeof body.priceRange !== 'string' || !(PRICE_RANGES as readonly string[]).includes(body.priceRange)) {
    return fail('Choose a price range')
  }

  const priceNote = optionalText(body.priceNote, 'Price note', 120)
  if (!priceNote.ok) return priceNote
  const description = text(body.description, 'Description', 20, 2000)
  if (!description.ok) return description
  const phone = optionalPhone(body.phone, 'Phone')
  if (!phone.ok) return phone

  const site = optionalText(body.website, 'Website', 200)
  if (!site.ok) return site
  if (site.value !== null) {
    let url: URL | null = null
    try { url = new URL(site.value) } catch { url = null }
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return fail('Website must start with http:// or https://')
  }

  return {
    ok: true,
    value: {
      name: name.value, city: city.value, state, statesServed, huntTypes, speciesOffered,
      priceRange: body.priceRange, priceNote: priceNote.value, description: description.value,
      phone: phone.value, website: site.value,
    },
  }
}

export interface ClaimInput {
  outfitterId: string
  role: string
  contactPhone: string | null
  contactEmail: string | null
  note: string
}

export function validateClaimInput(body: unknown): Validation<ClaimInput> {
  if (!isObject(body)) return fail('Claim must be an object')
  const extra = unknownKey(body, ['outfitterId', 'role', 'contactPhone', 'contactEmail', 'note'])
  if (extra) return fail(`Unknown field: ${extra}`)
  if (typeof body.outfitterId !== 'string' || !UUID_RE.test(body.outfitterId)) return fail('Choose the listing you want to claim')
  const role = text(body.role, 'Your role', 2, 80)
  if (!role.ok) return role
  const contactPhone = optionalPhone(body.contactPhone, 'Contact phone')
  if (!contactPhone.ok) return contactPhone
  const contactEmail = optionalText(body.contactEmail, 'Contact email', 200)
  if (!contactEmail.ok) return contactEmail
  if (contactEmail.value !== null && !EMAIL_RE.test(contactEmail.value)) return fail('Contact email is not a valid email address')
  const note = optionalText(body.note, 'Note', 1000)
  if (!note.ok) return note
  return {
    ok: true,
    value: { outfitterId: body.outfitterId.toLowerCase(), role: role.value, contactPhone: contactPhone.value, contactEmail: contactEmail.value, note: note.value ?? '' },
  }
}

export type SubmissionRequest =
  | { kind: 'new_listing'; listing: ListingInput }
  | { kind: 'edit'; listing: ListingInput }
  | { kind: 'claim'; claim: ClaimInput }

export function validateSubmissionRequest(body: unknown): Validation<SubmissionRequest> {
  if (!isObject(body)) return fail('Body must be an object')
  if (body.kind === 'new_listing' || body.kind === 'edit') {
    const extra = unknownKey(body, ['kind', 'listing'])
    if (extra) return fail(`Unknown field: ${extra}`)
    const listing = validateListingInput(body.listing)
    return listing.ok ? { ok: true, value: { kind: body.kind, listing: listing.value } } : listing
  }
  if (body.kind === 'claim') {
    const extra = unknownKey(body, ['kind', 'claim'])
    if (extra) return fail(`Unknown field: ${extra}`)
    const claim = validateClaimInput(body.claim)
    return claim.ok ? { ok: true, value: { kind: 'claim', claim: claim.value } } : claim
  }
  return fail('kind must be new_listing, edit or claim')
}

export function validateReplyBody(body: unknown): Validation<string> {
  if (!isObject(body)) return fail('Body must be an object')
  const extra = unknownKey(body, ['body'])
  if (extra) return fail(`Unknown field: ${extra}`)
  const reply = text(body.body, 'Reply', 1, 1500)
  return reply.ok ? { ok: true, value: reply.value } : reply
}

export function validateRejectReason(body: unknown): Validation<string> {
  if (!isObject(body)) return fail('A reason is required')
  const extra = unknownKey(body, ['reason'])
  if (extra) return fail(`Unknown field: ${extra}`)
  const reason = text(body.reason, 'Reason', 3, 500)
  return reason.ok ? { ok: true, value: reason.value } : reason
}

export interface InquiryInput {
  message: string
  name: string | null
  phone: string | null
  preferredDates: string | null
  partySize: number | null
}

export function validateInquiryBody(body: unknown): Validation<InquiryInput> {
  if (!isObject(body)) return fail('Body must be an object')
  const extra = unknownKey(body, ['message', 'name', 'phone', 'preferredDates', 'partySize'])
  if (extra) return fail(`Unknown field: ${extra}`)
  const message = text(body.message, 'Message', 10, 2000)
  if (!message.ok) return message
  const name = optionalText(body.name, 'Name', 80)
  if (!name.ok) return name
  const phone = optionalPhone(body.phone, 'Phone')
  if (!phone.ok) return phone
  const preferredDates = optionalText(body.preferredDates, 'Preferred dates', 100)
  if (!preferredDates.ok) return preferredDates
  let partySize: number | null = null
  if (body.partySize !== undefined && body.partySize !== null) {
    const n = body.partySize
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 50) return fail('Party size must be a whole number from 1 to 50')
    partySize = n
  }
  return { ok: true, value: { message: message.value, name: name.value, phone: phone.value, preferredDates: preferredDates.value, partySize } }
}

// ---- slugs ----

export function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '')
  return base || 'outfitter'
}

/** slugify(name), with a -2/-3 suffix while the slug is taken. */
export async function uniqueSlug(tx: OutfitterTx, name: string): Promise<string> {
  const base = slugify(name)
  let slug = base
  for (let n = 2; await tx.slugExists(slug); n++) slug = `${base}-${n}`
  return slug
}

// ---- submission flows ----

export type Outcome<T> = ({ ok: true } & T) | { ok: false; status: number; message: string }

const refuse = (status: number, message: string): { ok: false; status: number; message: string } => ({ ok: false, status, message })

const CONFLICT = 'That conflicts with another listing. Refresh and try again.'

/** A unique-index race (two requests past the same check) surfaces as a 409, not a 500. */
async function mapConflict<T>(run: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
  try {
    return await run()
  } catch (err) {
    if (isUniqueViolation(err)) return refuse(409, CONFLICT)
    throw err
  }
}

async function underSubmissionLimit(tx: OutfitterTx, userId: string, now: Date): Promise<boolean> {
  return (await tx.countSubmissionsSince(userId, new Date(now.getTime() - DAY_MS))) < SUBMISSIONS_PER_DAY
}

const LIMITED = refuse(429, `You can send ${SUBMISSIONS_PER_DAY} changes a day. Please try again later.`)

/** A hunter or outfitter proposes a new listing, an edit to their listing, or a claim. Nothing goes live. */
export async function submitChange(store: OutfitterStore, user: AuthUser, request: SubmissionRequest, now: Date): Promise<Outcome<{ submission: SubmissionRecord }>> {
  return mapConflict(() => store.transaction(async (tx) => {
    await tx.lockKey(user.id)
    if (!(await underSubmissionLimit(tx, user.id, now))) return LIMITED
    const owned = await tx.findByOwner(user.id)

    if (request.kind === 'edit') {
      if (!owned) return refuse(404, 'You do not have a listing yet')
      const pending = await tx.pendingEditFor(owned.id)
      if (pending) return { ok: true as const, submission: await tx.replacePayload(pending.id, request.listing, now) }
      const submission = await tx.insertSubmission({
        kind: 'edit', userId: user.id, submitterEmail: user.email, outfitterId: owned.id, reviewId: null, payload: request.listing, now,
      })
      return { ok: true as const, submission }
    }

    if (owned) return refuse(409, 'You already have a listing')
    if (await tx.pendingForUser(user.id)) return refuse(409, 'You already have a request waiting for review')

    if (request.kind === 'new_listing') {
      const submission = await tx.insertSubmission({
        kind: 'new_listing', userId: user.id, submitterEmail: user.email, outfitterId: null, reviewId: null, payload: request.listing, now,
      })
      return { ok: true as const, submission }
    }

    const target = await tx.findById(request.claim.outfitterId)
    if (!target || !target.isActive) return refuse(404, 'Listing not found')
    if (target.ownerId !== null) return refuse(409, 'This listing has already been claimed')
    const submission = await tx.insertSubmission({
      kind: 'claim', userId: user.id, submitterEmail: user.email, outfitterId: target.id, reviewId: null, payload: request.claim, now,
    })
    return { ok: true as const, submission }
  }))
}

/** An owner replies to a review on their own listing; the reply stays pending until an admin approves it. */
export async function submitReply(store: OutfitterStore, user: AuthUser, reviewId: string, body: string, now: Date): Promise<Outcome<{ submission: SubmissionRecord }>> {
  if (!UUID_RE.test(reviewId)) return refuse(404, 'Review not found')
  return mapConflict(() => store.transaction(async (tx) => {
    await tx.lockKey(user.id)
    if (!(await underSubmissionLimit(tx, user.id, now))) return LIMITED
    const owned = await tx.findByOwner(user.id)
    const review = owned ? await tx.getReview(reviewId.toLowerCase()) : null
    if (!owned || !review || review.outfitterId !== owned.id) return refuse(404, 'Review not found')
    const pending = await tx.pendingReplyFor(review.id)
    if (pending) return { ok: true as const, submission: await tx.replacePayload(pending.id, { body }, now) }
    const submission = await tx.insertSubmission({
      kind: 'review_reply', userId: user.id, submitterEmail: user.email, outfitterId: owned.id, reviewId: review.id, payload: { body }, now,
    })
    return { ok: true as const, submission }
  }))
}

/** An admin approves a pending submission and applies it. Locks the submission row and re-checks it is still pending. */
export async function approveSubmission(
  store: OutfitterStore,
  adminId: string,
  submissionId: string,
  markVerified: boolean,
  now: Date,
): Promise<Outcome<{ submission: SubmissionRecord; outfitter: OutfitterRecord | null }>> {
  if (!UUID_RE.test(submissionId)) return refuse(404, 'Submission not found')
  return mapConflict(() =>
    store.transaction(async (tx) => {
      const s = await tx.lockSubmission(submissionId.toLowerCase())
      if (!s) return refuse(404, 'Submission not found')
      if (s.status !== 'pending') return refuse(409, 'This request was already decided')
      await tx.lockKey(s.userId)
      const decide = (outfitterId?: string | null) => tx.decide(s.id, { status: 'approved', rejectReason: null, reviewedBy: adminId, now, outfitterId })

      if (s.kind === 'new_listing') {
        if (await tx.findByOwner(s.userId)) return refuse(409, 'The submitter already owns a listing')
        const listing = validateListingInput(s.payload)
        if (!listing.ok) return refuse(409, `The submitted listing is no longer valid: ${listing.message}`)
        const created = await tx.insertListing(listing.value, { slug: await uniqueSlug(tx, listing.value.name), ownerId: s.userId, isVerified: markVerified, now })
        return { ok: true as const, submission: await decide(created.id), outfitter: created }
      }

      if (s.kind === 'claim') {
        if (await tx.findByOwner(s.userId)) return refuse(409, 'The submitter already owns a listing')
        const target = s.outfitterId ? await tx.findById(s.outfitterId) : null
        if (!target) return refuse(404, 'Listing not found')
        const claimed = await tx.claimListing(target.id, s.userId, markVerified, now)
        if (!claimed) return refuse(409, 'This listing has already been claimed')
        return { ok: true as const, submission: await decide(), outfitter: claimed }
      }

      const target = s.outfitterId ? await tx.findById(s.outfitterId) : null
      if (!target) return refuse(404, 'Listing not found')
      if (target.ownerId !== s.userId) return refuse(409, 'The submitter no longer owns this listing')

      if (s.kind === 'edit') {
        const listing = validateListingInput(s.payload)
        if (!listing.ok) return refuse(409, `The submitted edit is no longer valid: ${listing.message}`)
        const updated = await tx.updateListing(target.id, listing.value, now)
        return { ok: true as const, submission: await decide(), outfitter: updated }
      }

      const reply = validateReplyBody(s.payload)
      if (!reply.ok || !s.reviewId) return refuse(409, 'The submitted reply is no longer valid')
      await tx.upsertReply(s.reviewId, target.id, reply.value, now)
      return { ok: true as const, submission: await decide(), outfitter: null }
    }))
}

export async function rejectSubmission(store: OutfitterStore, adminId: string, submissionId: string, reason: string, now: Date): Promise<Outcome<{ submission: SubmissionRecord }>> {
  if (!UUID_RE.test(submissionId)) return refuse(404, 'Submission not found')
  return store.transaction(async (tx) => {
    const s = await tx.lockSubmission(submissionId.toLowerCase())
    if (!s) return refuse(404, 'Submission not found')
    if (s.status !== 'pending') return refuse(409, 'This request was already decided')
    const submission = await tx.decide(s.id, { status: 'rejected', rejectReason: reason, reviewedBy: adminId, now })
    return { ok: true as const, submission }
  })
}

// ---- inquiries ----

export async function createInquiry(
  store: OutfitterStore,
  user: AuthUser & { email: string },
  outfitterId: string,
  input: InquiryInput,
  now: Date,
): Promise<Outcome<{ inquiry: InquiryRecord }>> {
  return store.transaction(async (tx) => {
    await tx.lockKey(user.id)
    const day = await tx.countInquiriesSince(user.id, new Date(now.getTime() - DAY_MS))
    if (day >= INQUIRIES_PER_DAY) return refuse(429, `You can send ${INQUIRIES_PER_DAY} inquiries a day. Please try again later.`)
    const week = await tx.countInquiriesSince(user.id, new Date(now.getTime() - 7 * DAY_MS), outfitterId)
    if (week >= INQUIRIES_PER_OUTFITTER_PER_WEEK) return refuse(429, 'You have already contacted this outfitter this week. Please wait for their reply.')
    const inquiry = await tx.insertInquiry({
      outfitterId,
      userId: user.id,
      // the verified account email, never a body field
      hunterEmail: user.email,
      hunterName: input.name,
      hunterPhone: input.phone,
      preferredDates: input.preferredDates,
      partySize: input.partySize,
      message: input.message,
      createdAt: now,
    })
    return { ok: true as const, inquiry }
  })
}

// ---- stats ----

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export interface DailyStats {
  day: string
  impression: number
  detail: number
  contact: number
}

/** Zero-filled, oldest first, ending today (UTC). */
export function buildDailyStats(rows: Array<{ day: string; kind: ViewKind; count: number }>, days: number, now: Date): DailyStats[] {
  const byDay = new Map<string, DailyStats>()
  const daily: DailyStats[] = []
  for (let i = days - 1; i >= 0; i--) {
    const entry = { day: utcDay(new Date(now.getTime() - i * DAY_MS)), impression: 0, detail: 0, contact: 0 }
    byDay.set(entry.day, entry)
    daily.push(entry)
  }
  for (const r of rows) {
    const entry = byDay.get(r.day)
    if (entry) entry[r.kind] += r.count
  }
  return daily
}
