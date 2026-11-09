import { createHmac, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { chatAccessFor, isSubscriptionActive, limitMessage, nextReset, usageFor, usagePeriod } from './chat-quota.js'
import { open, seal, visitorId } from './secret-box.js'
import { formEncode, periodEndOf, verifyWebhookSignature } from './stripe.js'
import { checkModel } from './user-llm.js'

const SECRET = randomBytes(32).toString('base64')
const NOW = new Date('2026-11-08T15:00:00Z')

describe('secret-box', () => {
  it('seals and opens a key, and the sealed form does not contain it', () => {
    const sealed = seal('sk-ant-api03-abcdef123456', SECRET)
    expect(sealed).not.toContain('abcdef')
    expect(open(sealed, SECRET)).toBe('sk-ant-api03-abcdef123456')
  })

  it('seals the same key differently each time', () => {
    expect(seal('same', SECRET)).not.toBe(seal('same', SECRET))
  })

  it('refuses a tampered value or the wrong secret', () => {
    const sealed = seal('sk-test-key-123', SECRET)
    const parts = sealed.split('.')
    const body = Buffer.from(parts[3], 'base64url')
    body[0] ^= 1
    expect(() => open([...parts.slice(0, 3), body.toString('base64url')].join('.'), SECRET)).toThrow()
    expect(() => open(sealed, randomBytes(32).toString('base64'))).toThrow()
  })

  it('needs a 32-byte secret', () => {
    expect(() => seal('x', Buffer.from('short').toString('base64'))).toThrow(/32 bytes/)
  })

  it('gives a visitor id that is stable and is not the IP', () => {
    const a = visitorId('203.0.113.9', SECRET)
    expect(a).toBe(visitorId('203.0.113.9', SECRET))
    expect(a).not.toBe(visitorId('203.0.113.10', SECRET))
    expect(a).not.toContain('203')
  })
})

describe('chat allowance', () => {
  const base = { visitor: 'v1', hasOwnKey: false, subscriptionStatus: null, now: NOW }

  it('gives visitors 3 questions in total', () => {
    expect(chatAccessFor({ ...base, userId: null })).toEqual({ plan: 'visitor', subject: 'visitor:v1', period: 'all', limit: 3 })
  })

  it('gives free accounts 10 a month, counted per UTC month', () => {
    expect(chatAccessFor({ ...base, userId: 'u1' })).toEqual({ plan: 'free', subject: 'user:u1', period: '2026-11', limit: 10 })
    expect(usagePeriod(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12')
    expect(nextReset(NOW)).toBe('2026-12-01T00:00:00.000Z')
    expect(nextReset(new Date('2026-12-15T00:00:00Z'))).toBe('2027-01-01T00:00:00.000Z')
  })

  it('has no cap for subscribers or own keys, and an own key wins', () => {
    expect(chatAccessFor({ ...base, userId: 'u1', subscriptionStatus: 'active' })).toEqual({ plan: 'pro' })
    expect(chatAccessFor({ ...base, userId: 'u1', subscriptionStatus: 'active', hasOwnKey: true })).toEqual({ plan: 'own_key' })
    expect(chatAccessFor({ ...base, userId: 'u1', hasOwnKey: true })).toEqual({ plan: 'own_key' })
  })

  it('ignores an own key or subscription without a signed-in user', () => {
    expect(chatAccessFor({ ...base, userId: null, hasOwnKey: true, subscriptionStatus: 'active' }).plan).toBe('visitor')
  })

  it('treats active, trialing and past_due as paid; canceled and unpaid as not', () => {
    for (const s of ['active', 'trialing', 'past_due']) expect(isSubscriptionActive(s)).toBe(true)
    for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', null]) expect(isSubscriptionActive(s)).toBe(false)
  })

  it('reports usage and says what to do at the limit', () => {
    expect(usageFor({ plan: 'free', subject: 's', period: 'p', limit: 10 }, 4, NOW)).toEqual({
      plan: 'free', used: 4, limit: 10, resetsAt: '2026-12-01T00:00:00.000Z',
    })
    expect(usageFor({ plan: 'pro' }, 0, NOW)).toEqual({ plan: 'pro', used: 0, limit: null, resetsAt: null })
    expect(limitMessage('visitor', 3)).toMatch(/Create a free account/)
    expect(limitMessage('free', 10)).toMatch(/Subscribe/)
  })
})

describe('stripe helpers', () => {
  it('form-encodes nested params the way Stripe reads them', () => {
    const params = formEncode({
      mode: 'subscription',
      line_items: [{ price: 'price_1', quantity: 1 }],
      subscription_data: { metadata: { user_id: 'u1' } },
      skipped: undefined,
    })
    expect(params.toString()).toBe(
      'mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&subscription_data%5Bmetadata%5D%5Buser_id%5D=u1',
    )
  })

  const secret = 'whsec_test'
  const payload = '{"type":"customer.subscription.updated"}'
  const sign = (t: number, body = payload, key = secret) => createHmac('sha256', key).update(`${t}.${body}`).digest('hex')
  const nowMs = 1_800_000_000_000
  const t = nowMs / 1000

  it('accepts a correct, recent signature', () => {
    expect(verifyWebhookSignature(payload, `t=${t},v1=${sign(t)}`, secret, nowMs)).toBe(true)
    expect(verifyWebhookSignature(Buffer.from(payload), `t=${t},v1=deadbeef,v1=${sign(t)}`, secret, nowMs)).toBe(true)
  })

  it('rejects a wrong secret, a changed body, an old event or a missing header', () => {
    expect(verifyWebhookSignature(payload, `t=${t},v1=${sign(t, payload, 'other')}`, secret, nowMs)).toBe(false)
    expect(verifyWebhookSignature(payload + ' ', `t=${t},v1=${sign(t)}`, secret, nowMs)).toBe(false)
    expect(verifyWebhookSignature(payload, `t=${t - 600},v1=${sign(t - 600)}`, secret, nowMs)).toBe(false)
    expect(verifyWebhookSignature(payload, undefined, secret, nowMs)).toBe(false)
    expect(verifyWebhookSignature(payload, `v1=${sign(t)}`, secret, nowMs)).toBe(false)
  })

  it('reads the period end from the subscription or, on newer API versions, its item', () => {
    expect(periodEndOf({ id: 's', customer: 'c', status: 'active', cancel_at_period_end: false, current_period_end: 1_800_000_000 }))
      .toBe('2027-01-15T08:00:00.000Z')
    expect(periodEndOf({ id: 's', customer: 'c', status: 'active', cancel_at_period_end: false, items: { data: [{ current_period_end: 1_800_000_000 }] } }))
      .toBe('2027-01-15T08:00:00.000Z')
    expect(periodEndOf({ id: 's', customer: 'c', status: 'active', cancel_at_period_end: false })).toBeNull()
  })
})

describe('own key model choice', () => {
  it('limits Claude to the listed models and defaults the rest', () => {
    expect(checkModel('anthropic', undefined)).toEqual({ ok: true, model: 'claude-opus-5-5' })
    expect(checkModel('anthropic', 'claude-haiku-5-5')).toEqual({ ok: true, model: 'claude-haiku-5-5' })
    expect(checkModel('anthropic', 'gpt-5').ok).toBe(false)
    expect(checkModel('openrouter', 'anthropic/claude-sonnet-5.5')).toEqual({ ok: true, model: 'anthropic/claude-sonnet-5.5' })
    expect(checkModel('openai', 'gpt 5; drop table').ok).toBe(false)
  })
})
