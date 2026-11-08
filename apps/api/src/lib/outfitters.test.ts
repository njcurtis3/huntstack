import { describe, expect, it } from 'vitest'
import {
  buildDailyStats,
  filterListings,
  slugify,
  statesFacet,
  toPublicListing,
  uniqueSlug,
  validateClaimInput,
  validateInquiryBody,
  validateListingInput,
  validateReplyBody,
  validateSubmissionRequest,
} from './outfitters.js'
import { createMemoryOutfitterStore, type OutfitterRecord } from './outfitter-store.js'

const PUBLIC_KEYS = [
  'claimed', 'city', 'description', 'huntTypes', 'id', 'isVerified', 'name', 'phone', 'priceNote', 'priceRange',
  'rating', 'reviewCount', 'slug', 'speciesOffered', 'state', 'statesServed', 'website',
].sort()

const good = {
  name: 'Prairie Wing Outfitters',
  city: 'Amarillo',
  state: 'TX',
  statesServed: ['TX', 'NM'],
  huntTypes: ['guided', 'semi-guided'],
  speciesOffered: ['Mallard', 'Snow Goose'],
  priceRange: '$$',
  priceNote: 'Call for rates',
  description: 'Guided waterfowl hunts across the Texas Panhandle playas.',
  phone: '(806) 555-0100',
  website: 'https://example.com',
}

function rec(over: Partial<OutfitterRecord>): OutfitterRecord {
  return {
    id: crypto.randomUUID(), name: 'X', slug: 'x', city: 'Lubbock', state: 'TX', statesServed: ['TX'], speciesOffered: ['Mallard'],
    huntTypes: ['guided'], priceRange: '$$', priceNote: null, rating: null, reviewCount: 0, description: 'd', website: null,
    phone: null, isVerified: true, isActive: true, ownerId: null, legacyId: null, ...over,
  }
}

describe('validateListingInput', () => {
  it('accepts a good listing and normalises it', () => {
    const r = validateListingInput({ ...good, name: '  Prairie Wing Outfitters ', speciesOffered: ['Mallard', ' mallard ', 'Teal'] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.name).toBe('Prairie Wing Outfitters')
      expect(r.value.speciesOffered).toEqual(['Mallard', 'Teal'])
    }
  })

  it('treats missing optional fields as null', () => {
    const { priceNote, phone, website, ...rest } = good
    void priceNote; void phone; void website
    const r = validateListingInput(rest)
    expect(r.ok && [r.value.priceNote, r.value.phone, r.value.website]).toEqual([null, null, null])
  })

  it.each([
    ['unknown property', { ownerId: 'x' }],
    ['name too short', { name: 'A' }],
    ['name too long', { name: 'A'.repeat(121) }],
    ['no city', { city: '  ' }],
    ['state not allowed', { state: 'CA' }],
    ['statesServed missing the home state', { statesServed: ['NM'] }],
    ['statesServed unknown code', { statesServed: ['TX', 'CA'] }],
    ['no hunt types', { huntTypes: [] }],
    ['unknown hunt type', { huntTypes: ['yacht'] }],
    ['no species', { speciesOffered: [] }],
    ['21 species', { speciesOffered: Array.from({ length: 21 }, (_, i) => `s${i}`) }],
    ['species too long', { speciesOffered: ['x'.repeat(41)] }],
    ['bad price range', { priceRange: '$$$$$' }],
    ['price note too long', { priceNote: 'x'.repeat(121) }],
    ['description too short', { description: 'too short' }],
    ['description too long', { description: 'x'.repeat(2001) }],
    ['phone with letters', { phone: '555-CALL-NOW' }],
    ['phone too short', { phone: '12345' }],
    ['website without scheme', { website: 'example.com' }],
    ['website javascript url', { website: 'javascript:alert(1)' }],
    ['website too long', { website: `https://example.com/${'a'.repeat(200)}` }],
  ])('rejects %s', (_name, patch) => {
    expect(validateListingInput({ ...good, ...patch }).ok).toBe(false)
  })

  it('rejects a non-object', () => {
    expect(validateListingInput(null).ok).toBe(false)
    expect(validateListingInput([]).ok).toBe(false)
  })
})

describe('other validators', () => {
  const claim = { outfitterId: '33333333-3333-4333-8333-333333333333', role: 'Owner', contactPhone: null, contactEmail: 'a@b.co', note: '' }

  it('claim input', () => {
    expect(validateClaimInput(claim).ok).toBe(true)
    expect(validateClaimInput({ ...claim, outfitterId: 'tx-01' }).ok).toBe(false)
    expect(validateClaimInput({ ...claim, role: 'O' }).ok).toBe(false)
    expect(validateClaimInput({ ...claim, contactEmail: 'nope' }).ok).toBe(false)
    expect(validateClaimInput({ ...claim, note: 'x'.repeat(1001) }).ok).toBe(false)
    expect(validateClaimInput({ ...claim, extra: 1 }).ok).toBe(false)
  })

  it('submission request needs a known kind and the matching payload', () => {
    expect(validateSubmissionRequest({ kind: 'new_listing', listing: good }).ok).toBe(true)
    expect(validateSubmissionRequest({ kind: 'edit', listing: good }).ok).toBe(true)
    expect(validateSubmissionRequest({ kind: 'claim', claim }).ok).toBe(true)
    expect(validateSubmissionRequest({ kind: 'review_reply', listing: good }).ok).toBe(false)
    expect(validateSubmissionRequest({ kind: 'edit', claim }).ok).toBe(false)
    expect(validateSubmissionRequest({ kind: 'edit', listing: good, isAdmin: true }).ok).toBe(false)
  })

  it('reply body is 1..1500 characters', () => {
    expect(validateReplyBody({ body: 'Thanks!' }).ok).toBe(true)
    expect(validateReplyBody({ body: '  ' }).ok).toBe(false)
    expect(validateReplyBody({ body: 'x'.repeat(1501) }).ok).toBe(false)
  })

  it('inquiry body: 10-char minimum message and bounded extras', () => {
    expect(validateInquiryBody({ message: '123456789' }).ok).toBe(false)
    expect(validateInquiryBody({ message: '1234567890' }).ok).toBe(true)
    expect(validateInquiryBody({ message: '1234567890', partySize: 51 }).ok).toBe(false)
    expect(validateInquiryBody({ message: '1234567890', partySize: 2.5 }).ok).toBe(false)
    expect(validateInquiryBody({ message: '1234567890', name: 'x'.repeat(81) }).ok).toBe(false)
    expect(validateInquiryBody({ message: '1234567890', hunterEmail: 'evil@example.com' }).ok).toBe(false)
  })
})

describe('public mapping and filtering', () => {
  it('toPublicListing has exactly the contract keys and no owner, metadata or legacy id', () => {
    const out = toPublicListing(rec({ ownerId: 'someone', legacyId: 'tx-01' }))
    expect(Object.keys(out).sort()).toEqual(PUBLIC_KEYS)
    expect(out.claimed).toBe(true)
    expect(toPublicListing(rec({ ownerId: null })).claimed).toBe(false)
  })

  const a = rec({ name: 'Zulu', city: 'Lubbock', state: 'TX', statesServed: ['TX', 'NM'], speciesOffered: ['Mallard'], priceRange: '$$', isVerified: true })
  const b = rec({ name: 'Alpha', city: 'Santa Fe', state: 'NM', statesServed: ['NM'], speciesOffered: ['Sandhill Crane'], priceRange: '$$$', isVerified: false })
  const c = rec({ name: 'Bravo', city: 'Abilene', state: 'TX', statesServed: ['TX'], speciesOffered: ['Dove'], priceRange: '$', isVerified: true })
  const all = [a, b, c]

  it('sorts verified first, then by name', () => {
    expect(filterListings(all, {}).map(o => o.name)).toEqual(['Bravo', 'Zulu', 'Alpha'])
  })

  it('filters by state (primary or served, case-insensitive), species, price range and q', () => {
    expect(filterListings(all, { state: 'nm' }).map(o => o.name)).toEqual(['Zulu', 'Alpha'])
    expect(filterListings(all, { state: 'TX' }).map(o => o.name)).toEqual(['Bravo', 'Zulu'])
    expect(filterListings(all, { species: 'crane' }).map(o => o.name)).toEqual(['Alpha'])
    expect(filterListings(all, { priceRange: '$' }).map(o => o.name)).toEqual(['Bravo'])
    expect(filterListings(all, { q: 'santa' }).map(o => o.name)).toEqual(['Alpha'])
    expect(filterListings(all, { q: 'dove' }).map(o => o.name)).toEqual(['Bravo'])
    expect(filterListings(all, { q: 'tx', state: 'TX', species: 'mall' }).map(o => o.name)).toEqual(['Zulu'])
  })

  it('statesFacet is the sorted union of primary and served states', () => {
    expect(statesFacet(all)).toEqual(['NM', 'TX'])
  })
})

describe('slugs', () => {
  it('slugify keeps a-z, 0-9 and hyphens', () => {
    expect(slugify("Joe's  Duck & Goose Camp!")).toBe('joe-s-duck-goose-camp')
    expect(slugify('!!!')).toBe('outfitter')
  })

  it('uniqueSlug adds -2, -3 on conflict', async () => {
    const store = createMemoryOutfitterStore({ listings: [rec({ slug: 'duck-camp' }), rec({ slug: 'duck-camp-2' })] })
    expect(await uniqueSlug(store, 'Duck Camp')).toBe('duck-camp-3')
    expect(await uniqueSlug(store, 'Other Camp')).toBe('other-camp')
  })
})

describe('buildDailyStats', () => {
  const now = new Date('2026-11-07T15:00:00Z')

  it.each([7, 30, 90])('zero-fills %i days, oldest first, ending today', (days) => {
    const daily = buildDailyStats([], days, now)
    expect(daily).toHaveLength(days)
    expect(daily[days - 1].day).toBe('2026-11-07')
    expect(daily[0].day < daily[1].day).toBe(true)
    expect(daily.every(d => d.impression === 0 && d.detail === 0 && d.contact === 0)).toBe(true)
  })

  it('places counts on their day and ignores days outside the window', () => {
    const daily = buildDailyStats([
      { day: '2026-11-07', kind: 'detail', count: 3 },
      { day: '2026-11-05', kind: 'impression', count: 9 },
      { day: '2026-10-01', kind: 'contact', count: 5 },
    ], 7, now)
    expect(daily[6]).toEqual({ day: '2026-11-07', impression: 0, detail: 3, contact: 0 })
    expect(daily[4]).toEqual({ day: '2026-11-05', impression: 9, detail: 0, contact: 0 })
    expect(daily.reduce((n, d) => n + d.contact, 0)).toBe(0)
  })
})
