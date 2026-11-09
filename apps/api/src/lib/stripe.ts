import { createHmac, timingSafeEqual } from 'node:crypto'

// The few Stripe calls HuntStack makes, over Stripe's REST API: start a Checkout for the
// $5.99/month plan, open the billing portal (cancel, change card, invoices), read a subscription,
// and check webhook signatures. Card details never touch HuntStack; Stripe's pages collect them.
//
// Env: STRIPE_SECRET_KEY, STRIPE_PRICE_ID (the monthly price), STRIPE_WEBHOOK_SECRET.

const STRIPE_API = 'https://api.stripe.com/v1'

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET)
}

/** Stripe's form encoding: nested objects and arrays as a[b][0]=c */
export function formEncode(value: unknown, prefix = '', out = new URLSearchParams()): URLSearchParams {
  if (value === undefined || value === null) return out
  if (Array.isArray(value)) {
    value.forEach((v, i) => formEncode(v, `${prefix}[${i}]`, out))
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      formEncode(v, prefix ? `${prefix}[${k}]` : k, out)
    }
  } else {
    out.append(prefix, String(value))
  }
  return out
}

async function stripe<T>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' && params ? formEncode(params).toString() : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const body = (await res.json()) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${body.error?.message ?? 'request failed'}`)
  return body
}

export async function createCheckoutSession(input: {
  userId: string
  email: string | null
  customerId: string | null
  appUrl: string
}): Promise<string> {
  const session = await stripe<{ url: string }>('POST', '/checkout/sessions', {
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${input.appUrl}/settings?billing=success`,
    cancel_url: `${input.appUrl}/settings?billing=cancelled`,
    client_reference_id: input.userId,
    ...(input.customerId ? { customer: input.customerId } : input.email ? { customer_email: input.email } : {}),
    subscription_data: { metadata: { user_id: input.userId } },
    allow_promotion_codes: true,
  })
  return session.url
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await stripe<{ url: string }>('POST', '/billing_portal/sessions', {
    customer: customerId,
    return_url: returnUrl,
  })
  return session.url
}

export interface StripeSubscription {
  id: string
  customer: string
  status: string
  cancel_at_period_end: boolean
  current_period_end?: number
  metadata?: Record<string, string>
  items?: { data?: Array<{ current_period_end?: number }> }
}

export function getSubscription(id: string): Promise<StripeSubscription> {
  return stripe<StripeSubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`)
}

/** Period end in ISO; newer API versions moved it from the subscription onto its items */
export function periodEndOf(sub: StripeSubscription): string | null {
  const ts = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end
  return ts ? new Date(ts * 1000).toISOString() : null
}

/**
 * Check a Stripe-Signature header ("t=...,v1=...") against the raw request body.
 * Rejects signatures older than the tolerance, so a captured event cannot be replayed later.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  header: string | undefined,
  secret: string,
  nowMs = Date.now(),
  toleranceSec = 300,
): boolean {
  if (!header || !secret) return false
  let timestamp: string | undefined
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2)
    if (k === 't') timestamp = v
    if (k === 'v1' && v) signatures.push(v)
  }
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSec) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest()
  return signatures.some(sig => {
    const given = Buffer.from(sig, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}
