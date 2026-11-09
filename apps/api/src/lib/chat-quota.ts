// Who may ask the AI how many questions. Decided 2026-11-08:
//   visitor (not signed in)  3 questions in total, then sign up
//   free account             10 questions per calendar month (UTC), then subscribe
//   subscriber ($5.99/month) no monthly cap (the hourly rate limit still applies)
//   own AI key               no cap; the user's provider bills them, HuntStack pays nothing
// Counts live in chat_usage, keyed by subject ('user:<id>' or 'visitor:<hmac of IP>') and period.

export const VISITOR_CHATS = 3
export const FREE_MONTHLY_CHATS = 10
export const VISITOR_PERIOD = 'all'

export type Plan = 'visitor' | 'free' | 'pro' | 'own_key'

export interface ChatUsage {
  plan: Plan
  used: number
  /** null = no cap */
  limit: number | null
  /** When the count starts over; null for visitors and uncapped plans */
  resetsAt: string | null
}

/** Calendar month in UTC, e.g. "2026-11" */
export function usagePeriod(now: Date): string {
  return now.toISOString().slice(0, 7)
}

/** First moment of the next UTC month */
export function nextReset(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
}

/**
 * Stripe statuses that still get the paid plan. past_due is included: Stripe retries a failed
 * card for a while, and cutting someone off on the first decline is worse than a few free chats.
 */
export function isSubscriptionActive(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

export type ChatAccess =
  | { plan: 'own_key' }
  | { plan: 'pro' }
  | { plan: 'free' | 'visitor'; subject: string; period: string; limit: number }

export function chatAccessFor(input: {
  userId: string | null
  visitor: string
  hasOwnKey: boolean
  subscriptionStatus: string | null
  now: Date
}): ChatAccess {
  if (input.userId && input.hasOwnKey) return { plan: 'own_key' }
  if (input.userId && isSubscriptionActive(input.subscriptionStatus)) return { plan: 'pro' }
  if (input.userId) {
    return { plan: 'free', subject: `user:${input.userId}`, period: usagePeriod(input.now), limit: FREE_MONTHLY_CHATS }
  }
  return { plan: 'visitor', subject: `visitor:${input.visitor}`, period: VISITOR_PERIOD, limit: VISITOR_CHATS }
}

export function usageFor(access: ChatAccess, used: number, now: Date): ChatUsage {
  if (access.plan === 'own_key' || access.plan === 'pro') {
    return { plan: access.plan, used, limit: null, resetsAt: null }
  }
  return {
    plan: access.plan,
    used,
    limit: access.limit,
    resetsAt: access.plan === 'free' ? nextReset(now) : null,
  }
}

/** What to tell someone who has used up their questions */
export function limitMessage(plan: 'free' | 'visitor', limit: number): string {
  return plan === 'visitor'
    ? `You've used your ${limit} free questions. Create a free account to get ${FREE_MONTHLY_CHATS} questions a month.`
    : `You've used your ${limit} free questions this month. Subscribe for unlimited questions, or add your own AI key in Settings.`
}
