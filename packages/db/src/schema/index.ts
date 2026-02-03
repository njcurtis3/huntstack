import { pgTable, text, timestamp, uuid, jsonb, boolean, integer, real, varchar, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ============================================
// USERS & AUTH (Supabase handles most of this)
// ============================================

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // References Supabase auth.users
  email: text('email').notNull(),
  displayName: text('display_name'),
  userType: varchar('user_type', { length: 20 }).notNull().default('hunter'), // 'hunter' | 'outfitter'
  avatarUrl: text('avatar_url'),
  location: jsonb('location'), // { state, city, coordinates }
  preferences: jsonb('preferences'), // { species, notifications, etc. }
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ============================================
// SPECIES
// ============================================

export const species = pgTable('species', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: text('name').notNull(),
  scientificName: text('scientific_name'),
  category: varchar('category', { length: 50 }).notNull(), // 'big-game', 'waterfowl', 'upland', 'small-game', 'migratory'
  description: text('description'),
  habitat: text('habitat'),
  isMigratory: boolean('is_migratory').default(false),
  flyways: jsonb('flyways'), // ['pacific', 'central', 'mississippi', 'atlantic']
  imageUrl: text('image_url'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index('species_category_idx').on(table.category),
  slugIdx: uniqueIndex('species_slug_idx').on(table.slug),
}))

// ============================================
// STATES
// ============================================

export const states = pgTable('states', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 2 }).notNull().unique(), // e.g., 'CO', 'MT'
  name: text('name').notNull(),
  agencyName: text('agency_name'), // e.g., 'Colorado Parks and Wildlife'
  agencyUrl: text('agency_url'),
  regulationsUrl: text('regulations_url'),
  licenseUrl: text('license_url'),
  lastScraped: timestamp('last_scraped'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ============================================
// REGULATIONS
// ============================================

export const regulations = pgTable('regulations', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: uuid('state_id').notNull().references(() => states.id),
  speciesId: uuid('species_id').references(() => species.id),
  category: varchar('category', { length: 50 }).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(), // Full regulation text
  summary: text('summary'), // AI-generated summary
  seasonYear: integer('season_year'),
  effectiveDate: timestamp('effective_date'),
  expirationDate: timestamp('expiration_date'),
  sourceUrl: text('source_url'),
  sourceDocument: text('source_document'), // PDF filename
  version: integer('version').default(1),
  isActive: boolean('is_active').default(true),
  metadata: jsonb('metadata'), // bag limits, shooting hours, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  stateIdx: index('regulations_state_idx').on(table.stateId),
  speciesIdx: index('regulations_species_idx').on(table.speciesId),
  categoryIdx: index('regulations_category_idx').on(table.category),
  activeIdx: index('regulations_active_idx').on(table.isActive),
}))

// ============================================
// SEASONS
// ============================================

export const seasons = pgTable('seasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: uuid('state_id').notNull().references(() => states.id),
  speciesId: uuid('species_id').notNull().references(() => species.id),
  name: text('name').notNull(), // e.g., 'General Rifle Season', 'First Segment'
  seasonType: varchar('season_type', { length: 50 }), // 'archery', 'muzzleloader', 'rifle', 'general'
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  year: integer('year').notNull(),
  bagLimit: jsonb('bag_limit'), // { daily: 2, season: 4, possession: 4 }
  shootingHours: jsonb('shooting_hours'), // { start: '30 min before sunrise', end: 'sunset' }
  restrictions: text('restrictions'),
  units: jsonb('units'), // Game management units where this applies
  sourceUrl: text('source_url'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  stateIdx: index('seasons_state_idx').on(table.stateId),
  speciesIdx: index('seasons_species_idx').on(table.speciesId),
  yearIdx: index('seasons_year_idx').on(table.year),
  dateRangeIdx: index('seasons_date_range_idx').on(table.startDate, table.endDate),
}))

// ============================================
// LICENSES
// ============================================

export const licenses = pgTable('licenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateId: uuid('state_id').notNull().references(() => states.id),
  name: text('name').notNull(),
  licenseType: varchar('license_type', { length: 50 }).notNull(), // 'base', 'species', 'stamp', 'permit'
  description: text('description'),
  isResidentOnly: boolean('is_resident_only').default(false),
  priceResident: real('price_resident'),
  priceNonResident: real('price_non_resident'),
  validFor: jsonb('valid_for'), // Species/categories this license covers
  requirements: jsonb('requirements'), // Age, education, etc.
  applicationDeadline: timestamp('application_deadline'),
  purchaseUrl: text('purchase_url'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  stateIdx: index('licenses_state_idx').on(table.stateId),
  typeIdx: index('licenses_type_idx').on(table.licenseType),
}))

// ============================================
// OUTFITTERS
// ============================================

export const outfitters = pgTable('outfitters', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => profiles.id),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 200 }).notNull().unique(),
  description: text('description'),
  location: jsonb('location').notNull(), // { address, city, state, zip, coordinates }
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  website: text('website'),
  huntTypes: jsonb('hunt_types'), // ['guided', 'semi-guided', 'diy-support']
  speciesOffered: jsonb('species_offered'), // Array of species slugs
  statesServed: jsonb('states_served'), // Array of state codes
  priceRange: varchar('price_range', { length: 10 }), // '$', '$$', '$$$', '$$$$'
  amenities: jsonb('amenities'),
  images: jsonb('images'), // Array of image URLs
  isVerified: boolean('is_verified').default(false),
  isActive: boolean('is_active').default(true),
  rating: real('rating'),
  reviewCount: integer('review_count').default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: uniqueIndex('outfitters_slug_idx').on(table.slug),
  locationIdx: index('outfitters_location_idx').on(table.location),
  ratingIdx: index('outfitters_rating_idx').on(table.rating),
  activeIdx: index('outfitters_active_idx').on(table.isActive),
}))

// ============================================
// REVIEWS
// ============================================

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  outfitterId: uuid('outfitter_id').notNull().references(() => outfitters.id),
  userId: uuid('user_id').notNull().references(() => profiles.id),
  rating: integer('rating').notNull(), // 1-5
  title: text('title'),
  content: text('content'),
  huntDate: timestamp('hunt_date'),
  species: jsonb('species'), // What they hunted
  isVerified: boolean('is_verified').default(false),
  helpfulCount: integer('helpful_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  outfitterIdx: index('reviews_outfitter_idx').on(table.outfitterId),
  userIdx: index('reviews_user_idx').on(table.userId),
  ratingIdx: index('reviews_rating_idx').on(table.rating),
}))

// ============================================
// LOCATIONS (Public Lands, WMAs, etc.)
// ============================================

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  locationType: varchar('location_type', { length: 50 }).notNull(), // 'national_forest', 'blm', 'wma', 'wildlife_refuge', 'state_park'
  stateId: uuid('state_id').notNull().references(() => states.id),
  description: text('description'),
  acreage: integer('acreage'),
  boundaryGeojson: jsonb('boundary_geojson'), // GeoJSON polygon
  centerPoint: jsonb('center_point'), // { lat, lng }
  accessPoints: jsonb('access_points'), // Array of { name, coordinates, type }
  allowedHunting: jsonb('allowed_hunting'), // Species/seasons allowed
  restrictions: text('restrictions'),
  websiteUrl: text('website_url'),
  mapUrl: text('map_url'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  stateIdx: index('locations_state_idx').on(table.stateId),
  typeIdx: index('locations_type_idx').on(table.locationType),
}))

// ============================================
// DOCUMENTS (for RAG)
// ============================================

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  documentType: varchar('document_type', { length: 50 }).notNull(), // 'regulation', 'guide', 'faq', etc.
  sourceUrl: text('source_url'),
  sourceType: varchar('source_type', { length: 50 }), // 'state_agency', 'federal', 'usfws', etc.
  stateId: uuid('state_id').references(() => states.id),
  speciesId: uuid('species_id').references(() => species.id),
  metadata: jsonb('metadata'),
  lastIndexed: timestamp('last_indexed'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  typeIdx: index('documents_type_idx').on(table.documentType),
  stateIdx: index('documents_state_idx').on(table.stateId),
}))

// ============================================
// DOCUMENT CHUNKS (for vector search)
// ============================================

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  // Note: pgvector column will be added via raw SQL migration
  // embedding: vector('embedding', { dimensions: 1536 }),
  tokenCount: integer('token_count'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  documentIdx: index('chunks_document_idx').on(table.documentId),
  chunkIdx: index('chunks_chunk_idx').on(table.documentId, table.chunkIndex),
}))

// ============================================
// RELATIONS
// ============================================

export const profilesRelations = relations(profiles, ({ many }) => ({
  reviews: many(reviews),
  outfitters: many(outfitters),
}))

export const statesRelations = relations(states, ({ many }) => ({
  regulations: many(regulations),
  seasons: many(seasons),
  licenses: many(licenses),
  locations: many(locations),
  documents: many(documents),
}))

export const speciesRelations = relations(species, ({ many }) => ({
  regulations: many(regulations),
  seasons: many(seasons),
  documents: many(documents),
}))

export const regulationsRelations = relations(regulations, ({ one }) => ({
  state: one(states, {
    fields: [regulations.stateId],
    references: [states.id],
  }),
  species: one(species, {
    fields: [regulations.speciesId],
    references: [species.id],
  }),
}))

export const seasonsRelations = relations(seasons, ({ one }) => ({
  state: one(states, {
    fields: [seasons.stateId],
    references: [states.id],
  }),
  species: one(species, {
    fields: [seasons.speciesId],
    references: [species.id],
  }),
}))

export const licensesRelations = relations(licenses, ({ one }) => ({
  state: one(states, {
    fields: [licenses.stateId],
    references: [states.id],
  }),
}))

export const outfittersRelations = relations(outfitters, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [outfitters.ownerId],
    references: [profiles.id],
  }),
  reviews: many(reviews),
}))

export const reviewsRelations = relations(reviews, ({ one }) => ({
  outfitter: one(outfitters, {
    fields: [reviews.outfitterId],
    references: [outfitters.id],
  }),
  user: one(profiles, {
    fields: [reviews.userId],
    references: [profiles.id],
  }),
}))

export const locationsRelations = relations(locations, ({ one }) => ({
  state: one(states, {
    fields: [locations.stateId],
    references: [states.id],
  }),
}))

export const documentsRelations = relations(documents, ({ one, many }) => ({
  state: one(states, {
    fields: [documents.stateId],
    references: [states.id],
  }),
  species: one(species, {
    fields: [documents.speciesId],
    references: [species.id],
  }),
  chunks: many(documentChunks),
}))

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
}))
