import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSession } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// ---- Types, declared locally from the API contract ----

export const STATE_CODES = ['TX', 'NM', 'AR', 'LA', 'KS', 'OK', 'MO'] as const
export const HUNT_TYPE_OPTIONS = [
  { value: 'guided', label: 'Fully Guided' },
  { value: 'semi-guided', label: 'Semi-Guided' },
  { value: 'diy-support', label: 'DIY Support' },
] as const
export const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'] as const

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

export interface ClaimInput {
  outfitterId: string
  role: string
  contactPhone: string | null
  contactEmail: string | null
  note: string
}

export interface MyListing extends ListingInput {
  id: string
  slug: string
  rating: number | null
  reviewCount: number
  isVerified: boolean
  claimed: boolean
  isActive: boolean
}

export type SubmissionKind = 'new_listing' | 'edit' | 'claim' | 'review_reply'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface Submission {
  id: string
  kind: SubmissionKind
  status: SubmissionStatus
  outfitterId: string | null
  reviewId: string | null
  payload: Record<string, unknown>
  rejectReason: string | null
  createdAt: string
  reviewedAt: string | null
}

export interface MyOutfitter {
  listing: MyListing | null
  pending: Submission | null
  lastDecision: Submission | null
}

export interface ClaimableListing {
  id: string
  slug: string
  name: string
  city: string
  state: string
}

export type StatsDays = 7 | 30 | 90

export interface MyStats {
  days: number
  totals: { impression: number; detail: number; contact: number }
  daily: { day: string; impression: number; detail: number; contact: number }[]
}

export interface MyReview {
  id: string
  rating: number
  title: string | null
  content: string | null
  huntDate: string | null
  createdAt: string
  reply: { body: string; updatedAt: string } | null
  pendingReply: { submissionId: string; body: string; createdAt: string } | null
}

export type InquiryStatus = 'new' | 'read' | 'archived'

export interface MyInquiry {
  id: string
  hunterName: string | null
  hunterEmail: string
  hunterPhone: string | null
  preferredDates: string | null
  partySize: number | null
  message: string
  status: InquiryStatus
  createdAt: string
}

export interface MyInquiries {
  inquiries: MyInquiry[]
  unread: number
}

// ---- Request helpers ----

export class AccountApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Authed fetch for the /api/me routes. Together with lib/fieldReports.ts this is one of the only
 * places the web client sends the Supabase access token; it is read at call time and never stored.
 */
async function authedRequest<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const session = await getSession()
  if (!session?.access_token) throw new AccountApiError(401, 'Sign in to continue')

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new AccountApiError(0, 'Could not reach HuntStack. Check your connection and try again.')
  }

  if (!response.ok) {
    let message = ''
    try {
      const data = (await response.json()) as { message?: unknown }
      if (typeof data.message === 'string') message = data.message
    } catch {
      // body was not JSON; fall through to the generic message
    }
    if (!message) message = 'Something went wrong. Please try again.'
    throw new AccountApiError(response.status, message)
  }
  return (await response.json()) as T
}

export function getMyOutfitter() {
  return authedRequest<MyOutfitter>('/api/me/outfitter')
}

export function submitListing(kind: 'new_listing' | 'edit', listing: ListingInput) {
  return authedRequest<Submission>('/api/me/outfitter/submissions', { method: 'POST', body: { kind, listing } })
}

export function submitClaim(claim: ClaimInput) {
  return authedRequest<Submission>('/api/me/outfitter/submissions', { method: 'POST', body: { kind: 'claim', claim } })
}

export function withdrawSubmission(id: string) {
  return authedRequest<Submission>(`/api/me/outfitter/submissions/${encodeURIComponent(id)}/withdraw`, {
    method: 'POST',
  })
}

export function getMyStats(days: StatsDays) {
  return authedRequest<MyStats>(`/api/me/outfitter/stats?days=${days}`)
}

export function getMyReviews() {
  return authedRequest<{ reviews: MyReview[] }>('/api/me/outfitter/reviews')
}

export function replyToReview(reviewId: string, body: string) {
  return authedRequest<Submission>(`/api/me/outfitter/reviews/${encodeURIComponent(reviewId)}/reply`, {
    method: 'POST',
    body: { body },
  })
}

export function getMyInquiries(status: InquiryStatus | 'all') {
  return authedRequest<MyInquiries>(`/api/me/outfitter/inquiries?status=${status}`)
}

export function setInquiryStatus(id: string, status: InquiryStatus) {
  return authedRequest<{ id: string; status: InquiryStatus }>(
    `/api/me/outfitter/inquiries/${encodeURIComponent(id)}/status`,
    { method: 'POST', body: { status } },
  )
}

/** Public, no Authorization header: unclaimed listings a person could claim. */
export async function getClaimable(): Promise<ClaimableListing[]> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/api/outfitters/claimable`)
  } catch {
    throw new AccountApiError(0, 'Could not reach HuntStack. Check your connection and try again.')
  }
  if (!response.ok) throw new AccountApiError(response.status, 'Could not load listings. Please try again.')
  const data = (await response.json()) as { outfitters: ClaimableListing[] }
  return data.outfitters
}

// ---- React-query hooks (keys per the contract) ----

export function useMyOutfitter(enabled: boolean) {
  return useQuery({ queryKey: ['me', 'outfitter'], queryFn: getMyOutfitter, enabled, retry: false })
}

export function useClaimable() {
  return useQuery({ queryKey: ['outfitters', 'claimable'], queryFn: getClaimable })
}

export function useMyStats(days: StatsDays, enabled: boolean) {
  return useQuery({
    queryKey: ['me', 'outfitter', 'stats', days],
    queryFn: () => getMyStats(days),
    enabled,
    retry: false,
  })
}

export function useMyReviews(enabled: boolean) {
  return useQuery({ queryKey: ['me', 'outfitter', 'reviews'], queryFn: getMyReviews, enabled, retry: false })
}

export function useMyInquiries(status: InquiryStatus | 'all', enabled: boolean) {
  return useQuery({
    queryKey: ['me', 'outfitter', 'inquiries', status],
    queryFn: () => getMyInquiries(status),
    enabled,
    retry: false,
  })
}

/** Every write refreshes the ['me','outfitter'] prefix so nothing stale is shown as current. */
function useOutfitterMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me', 'outfitter'] }),
  })
}

export const useSubmitListing = () =>
  useOutfitterMutation((v: { kind: 'new_listing' | 'edit'; listing: ListingInput }) =>
    submitListing(v.kind, v.listing),
  )
export const useSubmitClaim = () => useOutfitterMutation(submitClaim)
export const useWithdraw = () => useOutfitterMutation(withdrawSubmission)
export const useReplyToReview = () =>
  useOutfitterMutation((v: { reviewId: string; body: string }) => replyToReview(v.reviewId, v.body))
export const useSetInquiryStatus = () =>
  useOutfitterMutation((v: { id: string; status: InquiryStatus }) => setInquiryStatus(v.id, v.status))

// ---- Shared form helpers ----

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

export const PHONE_PATTERN = /^[0-9 ()+\-.]{7,30}$/
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const fieldClass =
  'block w-full min-h-11 px-3 py-2 rounded-md text-base border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
export const fieldStyle = {
  backgroundColor: 'rgb(var(--color-bg-primary))',
  borderColor: 'rgb(var(--color-border-primary))',
  color: 'rgb(var(--color-text-primary))',
} as const
export const labelClass = 'block text-base font-medium mb-1'
export const primaryText = { color: 'rgb(var(--color-text-primary))' } as const
export const secondaryText = { color: 'rgb(var(--color-text-secondary))' } as const
export const panelStyle = {
  backgroundColor: 'rgb(var(--color-bg-elevated))',
  borderColor: 'rgb(var(--color-border-primary))',
} as const
/** Sticky-on-mobile footer for a form's primary action; inline from md up. */
export const stickyBarClass =
  'sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t md:static md:mx-0 md:px-0 md:pb-0 md:border-0 md:pt-2 flex flex-col gap-2 md:flex-row'
export const stickyBarStyle = { backgroundColor: 'rgb(var(--color-bg-primary))', borderColor: 'rgb(var(--color-border-primary))' } as const
export const btnPrimary = 'btn-primary min-h-11 text-base focus-visible:ring-2 focus-visible:ring-accent-500'
export const btnSecondary = 'btn-secondary min-h-11 text-base focus-visible:ring-2 focus-visible:ring-accent-500'
