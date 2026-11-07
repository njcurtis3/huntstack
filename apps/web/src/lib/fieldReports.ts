import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSession } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export type BirdGroup = 'duck' | 'goose'
export type CountBucket = '1-10' | '10-50' | '50-200' | '200+'
export type Activity = 'flying' | 'on_water' | 'in_field'

export interface SpeciesOption {
  /** Stable key for the picker: the slug, or `<group>-unsure`. */
  key: string
  label: string
  birdGroup: BirdGroup
  /** null means "not sure" within the group. */
  speciesSlug: string | null
}

// Copied from the API allowlist (apps/api/src/lib/field-reports.ts): same slugs, grouped the same way.
export const SPECIES_OPTIONS: SpeciesOption[] = [
  { key: 'mallard', label: 'Mallard', birdGroup: 'duck', speciesSlug: 'mallard' },
  { key: 'gadwall', label: 'Gadwall', birdGroup: 'duck', speciesSlug: 'gadwall' },
  { key: 'green-winged-teal', label: 'Green-winged Teal', birdGroup: 'duck', speciesSlug: 'green-winged-teal' },
  { key: 'blue-winged-teal', label: 'Blue-winged Teal', birdGroup: 'duck', speciesSlug: 'blue-winged-teal' },
  { key: 'pintail', label: 'Pintail', birdGroup: 'duck', speciesSlug: 'pintail' },
  { key: 'american-wigeon', label: 'American Wigeon', birdGroup: 'duck', speciesSlug: 'american-wigeon' },
  { key: 'northern-shoveler', label: 'Northern Shoveler', birdGroup: 'duck', speciesSlug: 'northern-shoveler' },
  { key: 'wood-duck', label: 'Wood Duck', birdGroup: 'duck', speciesSlug: 'wood-duck' },
  { key: 'duck-unsure', label: 'Ducks (not sure)', birdGroup: 'duck', speciesSlug: null },
  { key: 'canada-goose', label: 'Canada Goose', birdGroup: 'goose', speciesSlug: 'canada-goose' },
  { key: 'snow-goose', label: 'Snow Goose', birdGroup: 'goose', speciesSlug: 'snow-goose' },
  { key: 'ross-goose', label: "Ross's Goose", birdGroup: 'goose', speciesSlug: 'ross-goose' },
  { key: 'white-fronted-goose', label: 'White-fronted Goose', birdGroup: 'goose', speciesSlug: 'white-fronted-goose' },
  { key: 'goose-unsure', label: 'Geese (not sure)', birdGroup: 'goose', speciesSlug: null },
]

export const COUNT_BUCKETS: { value: CountBucket; label: string; min: number; max: number }[] = [
  { value: '1-10', label: '1-10', min: 1, max: 10 },
  { value: '10-50', label: '10-50', min: 11, max: 50 },
  { value: '50-200', label: '50-200', min: 51, max: 200 },
  { value: '200+', label: '200+', min: 201, max: 250000 },
]

export const ACTIVITIES: { value: Activity; label: string }[] = [
  { value: 'flying', label: 'Flying' },
  { value: 'on_water', label: 'On water' },
  { value: 'in_field', label: 'In a field' },
]

export interface FieldReportInput {
  lat: number
  lng: number
  birdGroup: BirdGroup
  speciesSlug: string | null
  countBucket: CountBucket
  countExact?: number
  activity?: Activity
  /** ISO-8601 with offset. */
  observedAt: string
}

/** The rounded shape the API returns, even to the author. */
export interface FieldReportPublic {
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

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'The report was not accepted. Check the location, time and count, then try again.'
    case 401:
      return 'Your session expired. Please sign in again.'
    case 429:
      return "You've sent the most reports allowed for now. Please try again later."
    case 503:
      return 'Reporting is temporarily unavailable. Please try again later.'
    default:
      return 'Something went wrong sending the report. Please try again.'
  }
}

/**
 * POST a report. This is the only place the web client sends the Supabase access
 * token to the API; it is read at call time and never stored here.
 */
export async function postFieldReport(input: FieldReportInput): Promise<FieldReportPublic> {
  const session = await getSession()
  if (!session?.access_token) throw new Error('Please sign in to report birds.')

  let response: Response
  try {
    response = await fetch(`${API_URL}/api/field-reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Could not reach HuntStack. Check your connection and try again.')
  }

  if (!response.ok) throw new Error(messageForStatus(response.status))
  return (await response.json()) as FieldReportPublic
}

/** Submit hook: invalidates the ['field-reports'] prefix so any displayed reports refetch. */
export function useSubmitFieldReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: postFieldReport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field-reports'] }),
  })
}
