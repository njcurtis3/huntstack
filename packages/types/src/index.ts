// ===========================================
// User & Auth Types
// ===========================================

export interface User {
  id: string
  email: string
  displayName?: string
  userType: 'hunter' | 'outfitter'
  avatarUrl?: string
  location?: UserLocation
  preferences?: UserPreferences
  createdAt: string
  updatedAt: string
}

export interface UserLocation {
  state?: string
  city?: string
  coordinates?: Coordinates
}

export interface UserPreferences {
  favoriteSpecies?: string[]
  favoriteStates?: string[]
  notifications?: NotificationPreferences
}

export interface NotificationPreferences {
  seasonAlerts: boolean
  regulationChanges: boolean
  emailDigest: 'daily' | 'weekly' | 'never'
}

// ===========================================
// Species Types
// ===========================================

export type SpeciesCategory = 'big-game' | 'waterfowl' | 'upland' | 'small-game' | 'migratory'

export interface Species {
  id: string
  slug: string
  name: string
  scientificName?: string
  category: SpeciesCategory
  description?: string
  habitat?: string
  isMigratory: boolean
  flyways?: Flyway[]
  imageUrl?: string
}

export type Flyway = 'pacific' | 'central' | 'mississippi' | 'atlantic'

// ===========================================
// State & Regulation Types
// ===========================================

export interface State {
  id: string
  code: string // e.g., 'CO', 'MT'
  name: string
  agencyName?: string
  agencyUrl?: string
  regulationsUrl?: string
  licenseUrl?: string
  lastScraped?: string
}

export interface Regulation {
  id: string
  stateId: string
  speciesId?: string
  category: string
  title: string
  content: string
  summary?: string
  seasonYear?: number
  effectiveDate?: string
  expirationDate?: string
  sourceUrl?: string
  isActive: boolean
  metadata?: RegulationMetadata
}

export interface RegulationMetadata {
  bagLimit?: BagLimit
  shootingHours?: ShootingHours
  weaponRestrictions?: string[]
  areaRestrictions?: string[]
  [key: string]: unknown
}

// ===========================================
// Season Types
// ===========================================

export interface Season {
  id: string
  stateId: string
  speciesId: string
  name: string
  seasonType?: SeasonType
  startDate: string
  endDate: string
  year: number
  bagLimit?: BagLimit
  shootingHours?: ShootingHours
  restrictions?: string
  units?: string[] // Game management units
  sourceUrl?: string
}

export type SeasonType = 'archery' | 'muzzleloader' | 'rifle' | 'shotgun' | 'general' | 'youth' | 'primitive'

export interface BagLimit {
  daily?: number
  season?: number
  possession?: number
}

export interface ShootingHours {
  start: string // e.g., '30 minutes before sunrise'
  end: string   // e.g., 'sunset'
}

// ===========================================
// License Types
// ===========================================

export interface License {
  id: string
  stateId: string
  name: string
  licenseType: LicenseType
  description?: string
  isResidentOnly: boolean
  priceResident?: number
  priceNonResident?: number
  validFor?: string[] // Species or categories
  requirements?: LicenseRequirements
  applicationDeadline?: string
  purchaseUrl?: string
}

export type LicenseType = 'base' | 'species' | 'stamp' | 'permit' | 'tag'

export interface LicenseRequirements {
  minAge?: number
  maxAge?: number
  hunterEducation?: boolean
  residencyYears?: number
  otherRequirements?: string[]
}

// ===========================================
// Outfitter Types
// ===========================================

export interface Outfitter {
  id: string
  ownerId?: string
  name: string
  slug: string
  description?: string
  location: OutfitterLocation
  contactEmail?: string
  contactPhone?: string
  website?: string
  huntTypes?: HuntType[]
  speciesOffered?: string[]
  statesServed?: string[]
  priceRange?: PriceRange
  amenities?: string[]
  images?: string[]
  isVerified: boolean
  isActive: boolean
  rating?: number
  reviewCount: number
}

export interface OutfitterLocation {
  address?: string
  city: string
  state: string
  zip?: string
  coordinates?: Coordinates
}

export type HuntType = 'guided' | 'semi-guided' | 'diy-support' | 'drop-camp'
export type PriceRange = '$' | '$$' | '$$$' | '$$$$'

export interface Review {
  id: string
  outfitterId: string
  userId: string
  rating: number // 1-5
  title?: string
  content?: string
  huntDate?: string
  species?: string[]
  isVerified: boolean
  helpfulCount: number
  createdAt: string
}

// ===========================================
// Location Types
// ===========================================

export interface HuntingLocation {
  id: string
  name: string
  locationType: LocationType
  stateId: string
  description?: string
  acreage?: number
  boundaryGeojson?: GeoJSON.Geometry
  centerPoint?: Coordinates
  accessPoints?: AccessPoint[]
  allowedHunting?: string[]
  restrictions?: string
  websiteUrl?: string
  mapUrl?: string
}

export type LocationType = 'national_forest' | 'blm' | 'wma' | 'wildlife_refuge' | 'state_park' | 'private'

export interface Coordinates {
  lat: number
  lng: number
}

export interface AccessPoint {
  name: string
  coordinates: Coordinates
  type: 'trailhead' | 'parking' | 'boat_ramp' | 'gate'
  notes?: string
}

// ===========================================
// Search & API Types
// ===========================================

export interface SearchQuery {
  q: string
  type?: 'all' | 'regulations' | 'species' | 'outfitters' | 'locations'
  state?: string
  species?: string
  limit?: number
  offset?: number
}

export interface SearchResult<T = unknown> {
  results: T[]
  total: number
  query: string
  filters?: Record<string, unknown>
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// ===========================================
// Chat/RAG Types
// ===========================================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  sources?: ChatSource[]
}

export interface ChatSource {
  title: string
  url?: string
  snippet: string
}

export interface ChatRequest {
  message: string
  conversationId?: string
}

export interface ChatResponse {
  response: string
  sources: ChatSource[]
  conversationId: string
}

// ===========================================
// API Response Types
// ===========================================

export interface ApiError {
  error: true
  message: string
  statusCode: number
  details?: unknown
}

export interface ApiSuccess<T> {
  data: T
  meta?: {
    timestamp: string
    [key: string]: unknown
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError
