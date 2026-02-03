import { z } from 'zod'

// ===========================================
// Validation Schemas
// ===========================================

export const stateCodeSchema = z.string().length(2).toUpperCase()

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
})

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(['all', 'regulations', 'species', 'outfitters', 'locations']).optional(),
  state: stateCodeSchema.optional(),
  species: z.string().optional(),
}).merge(paginationSchema)

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().optional(),
})

// ===========================================
// Constants
// ===========================================

export const US_STATES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

export const SPECIES_CATEGORIES = [
  'big-game',
  'waterfowl',
  'upland',
  'small-game',
  'migratory',
] as const

export const FLYWAYS = [
  'pacific',
  'central',
  'mississippi',
  'atlantic',
] as const

export const SEASON_TYPES = [
  'archery',
  'muzzleloader',
  'rifle',
  'shotgun',
  'general',
  'youth',
  'primitive',
] as const

export const LICENSE_TYPES = [
  'base',
  'species',
  'stamp',
  'permit',
  'tag',
] as const

export const LOCATION_TYPES = [
  'national_forest',
  'blm',
  'wma',
  'wildlife_refuge',
  'state_park',
  'private',
] as const

// Priority states for MVP
export const MVP_STATES = {
  bigGame: ['CO', 'MT', 'WY', 'ID', 'NM'],
  waterfowl: ['AR', 'LA', 'TX', 'SD', 'ND'],
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Get state name from code
 */
export function getStateName(code: string): string | undefined {
  return US_STATES[code.toUpperCase()]
}

/**
 * Get state code from name
 */
export function getStateCode(name: string): string | undefined {
  const entry = Object.entries(US_STATES).find(
    ([_, stateName]) => stateName.toLowerCase() === name.toLowerCase()
  )
  return entry?.[0]
}

/**
 * Format date range for display
 */
export function formatDateRange(startDate: string | Date, endDate: string | Date): string {
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const yearOptions: Intl.DateTimeFormatOptions = { ...options, year: 'numeric' }
  
  // Same year
  if (start.getFullYear() === end.getFullYear()) {
    // Same month
    if (start.getMonth() === end.getMonth()) {
      return `${start.toLocaleDateString('en-US', options)} - ${end.getDate()}, ${end.getFullYear()}`
    }
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', yearOptions)}`
  }
  
  return `${start.toLocaleDateString('en-US', yearOptions)} - ${end.toLocaleDateString('en-US', yearOptions)}`
}

/**
 * Check if a date is within a season
 */
export function isInSeason(startDate: string | Date, endDate: string | Date, checkDate?: Date): boolean {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const check = checkDate || new Date()
  
  return check >= start && check <= end
}

/**
 * Format price for display
 */
export function formatPrice(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

/**
 * Create URL-friendly slug from text
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in miles
 */
export function calculateDistance(
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number {
  const R = 3959 // Earth's radius in miles
  const dLat = toRad(coord2.lat - coord1.lat)
  const dLng = toRad(coord2.lng - coord1.lng)
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Parse bag limit string into structured object
 */
export function parseBagLimit(text: string): { daily?: number; season?: number; possession?: number } {
  const result: { daily?: number; season?: number; possession?: number } = {}
  
  const dailyMatch = text.match(/(\d+)\s*(?:per\s*)?day/i)
  if (dailyMatch) result.daily = parseInt(dailyMatch[1], 10)
  
  const seasonMatch = text.match(/(\d+)\s*(?:per\s*)?season/i)
  if (seasonMatch) result.season = parseInt(seasonMatch[1], 10)
  
  const possessionMatch = text.match(/(\d+)\s*(?:in\s*)?possession/i)
  if (possessionMatch) result.possession = parseInt(possessionMatch[1], 10)
  
  return result
}

// Re-export zod for convenience
export { z }
