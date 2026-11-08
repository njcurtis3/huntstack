import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSession } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export type SubmissionKind = 'new_listing' | 'edit' | 'claim' | 'review_reply'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface AdminListing {
  id: string
  name: string
  slug: string
  city: string
  state: string
  statesServed: string[]
  speciesOffered: string[]
  huntTypes: string[]
  priceRange: string
  priceNote: string | null
  rating: number | null
  reviewCount: number
  description: string
  website: string | null
  phone: string | null
  isVerified: boolean
  claimed: boolean
  isActive: boolean
  ownerId: string | null
}

export interface AdminSubmission {
  id: string
  kind: SubmissionKind
  status: SubmissionStatus
  outfitterId: string | null
  reviewId: string | null
  payload: Record<string, unknown>
  rejectReason: string | null
  createdAt: string
  reviewedAt: string | null
  submitterEmail: string | null
  userId: string
  current: AdminListing | null
  review: { id: string; rating: number; title: string | null; content: string | null } | null
}

export type SubmissionFilter = 'pending' | 'decided'

export class AdminApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Every admin call goes through here. This is the only place the web client sends
 * the Supabase access token to the admin endpoints; it is read at call time and
 * never stored. The API's 403 is the real gate, the UI hiding is cosmetic.
 */
async function adminFetch<T>(path: string, init?: { method?: 'POST'; body?: unknown }): Promise<T> {
  const session = await getSession()
  if (!session?.access_token) throw new AdminApiError(401, 'Sign in to continue')

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new AdminApiError(0, 'Could not reach HuntStack. Check your connection and try again.')
  }

  if (!response.ok) {
    let message = 'Something went wrong. Please try again.'
    try {
      const data = (await response.json()) as { message?: unknown }
      if (typeof data.message === 'string' && data.message) message = data.message
    } catch {
      // keep the generic message
    }
    throw new AdminApiError(response.status, message)
  }
  return (await response.json()) as T
}

/** Who am I. Used only to decide whether to show the page; the API enforces admin on every call. */
export function useAdminMe(userId: string | null) {
  return useQuery({
    queryKey: ['me', userId],
    enabled: !!userId,
    queryFn: () => adminFetch<{ userId: string; email: string | null; isAdmin: boolean }>('/api/me'),
    retry: false,
    staleTime: 60_000,
  })
}

export function useAdminSubmissions(userId: string | null, status: SubmissionFilter, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', userId, 'submissions', status],
    queryFn: async () =>
      (await adminFetch<{ submissions: AdminSubmission[] }>(`/api/admin/submissions?status=${status}`)).submissions,
    enabled,
    retry: false,
  })
}

export function useAdminOutfitters(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', userId, 'outfitters'],
    queryFn: async () => (await adminFetch<{ outfitters: AdminListing[] }>('/api/admin/outfitters')).outfitters,
    enabled,
    retry: false,
  })
}

export function useApproveSubmission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, markVerified }: { id: string; markVerified?: boolean }) =>
      adminFetch<unknown>(`/api/admin/submissions/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        body: markVerified === undefined ? {} : { markVerified },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useRejectSubmission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminFetch<unknown>(`/api/admin/submissions/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        body: { reason },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useSetOutfitterActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch<unknown>(`/api/admin/outfitters/${encodeURIComponent(id)}/active`, {
        method: 'POST',
        body: { isActive },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useReleaseOutfitter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      adminFetch<unknown>(`/api/admin/outfitters/${encodeURIComponent(id)}/release`, { method: 'POST', body: {} }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

/**
 * Drops every cached admin and identity query whenever the signed-in user changes
 * (including sign-out), so one account's data can never be served to another.
 */
export function useClearAdminCacheOnUserChange(userId: string | null) {
  const queryClient = useQueryClient()
  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: ['admin'] })
      queryClient.removeQueries({ queryKey: ['me'] })
    }
  }, [userId, queryClient])
}
