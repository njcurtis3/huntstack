import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { createHmac, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAccountRoutes, buildBillingWebhookRoutes, type AccountDeps } from './account.js'
import { buildChatRoutes } from './chat.js'
import type { AccountStore, StoredAiKey, StoredSubscription } from '../lib/account-store.js'
import type { AuthUser } from '../lib/auth-guard.js'
import { open, visitorId } from '../lib/secret-box.js'
import type { StripeSubscription } from '../lib/stripe.js'

const NOW = new Date('2026-11-08T15:00:00Z')
const USER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const users: Record<string, AuthUser> = {
  user: { id: USER, email: 'hunter@example.com' },
  other: { id: OTHER, email: 'other@example.com' },
}
const verifyUser = async (t: string) => users[t] ?? null
const as = (t: string) => ({ authorization: `Bearer ${t}` })

function memoryStore() {
  const usage = new Map<string, number>()
  const keys = new Map<string, StoredAiKey>()
  const subs = new Map<string, StoredSubscription>()
  const store: AccountStore = {
    async usageCount(s, p) { return usage.get(`${s}|${p}`) ?? 0 },
    async reserveChat(s, p, limit) {
      const n = usage.get(`${s}|${p}`) ?? 0
      if (n >= limit) return null
      usage.set(`${s}|${p}`, n + 1)
      return n + 1
    },
    async releaseChat(s, p) { usage.set(`${s}|${p}`, Math.max(0, (usage.get(`${s}|${p}`) ?? 0) - 1)) },
    async getAiKey(u) { return keys.get(u) ?? null },
    async setAiKey(u, k) { const v = { ...k, updatedAt: NOW.toISOString() }; keys.set(u, v); return v },
    async deleteAiKey(u) { keys.delete(u) },
    async getSubscription(u) { return subs.get(u) ?? null },
    async findSubscriptionUserByCustomer(c) { return [...subs.values()].find(s => s.customerId === c)?.userId ?? null },
    async upsertSubscription(s) { subs.set(s.userId, s) },
  }
  return { store, usage, keys, subs }
}

const SECRET = randomBytes(32).toString('base64')
let savedSecret: string | undefined
beforeAll(() => { savedSecret = process.env.USER_KEY_SECRET; process.env.USER_KEY_SECRET = SECRET })
afterAll(() => { process.env.USER_KEY_SECRET = savedSecret })

async function build() {
  const mem = memoryStore()
  const stripeSubs = new Map<string, StripeSubscription>()
  const stripe = {
    isStripeConfigured: () => true,
    createCheckoutSession: vi.fn(async () => 'https://checkout.stripe.test/c/1'),
    createPortalSession: vi.fn(async () => 'https://billing.stripe.test/p/1'),
    getSubscription: vi.fn(async (id: string) => stripeSubs.get(id)!),
  }
  const deps: AccountDeps = {
    store: mem.store,
    verifyUser,
    now: () => NOW,
    appUrl: () => 'https://huntstack.net',
    verifyKey: vi.fn(async (_p, key: string) => (key.endsWith('good') ? { ok: true as const } : { ok: false as const, message: 'Anthropic rejected your key.' })),
    exchangeOpenRouterCode: vi.fn(async () => 'sk-or-v1-fromoauthgood'),
    stripe,
  }
  const app = Fastify()
  await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
  await app.register(buildAccountRoutes(deps), { prefix: '/api/account' })
  await app.register(buildBillingWebhookRoutes({ store: mem.store, stripe, webhookSecret: () => 'whsec_test' }), { prefix: '/api/billing' })
  await app.register(buildChatRoutes({ store: mem.store, verifyUser, now: () => NOW }), { prefix: '/api/chat' })
  return { app, mem, deps, stripe, stripeSubs }
}

describe('/api/account', () => {
  let ctx: Awaited<ReturnType<typeof build>>
  beforeEach(async () => { ctx = await build() })

  it('needs a signed-in user', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/account' })).statusCode).toBe(401)
    expect((await ctx.app.inject({ method: 'PUT', url: '/api/account/ai-key', payload: { provider: 'openai' } })).statusCode).toBe(401)
    expect((await ctx.app.inject({ method: 'POST', url: '/api/account/billing/checkout' })).statusCode).toBe(401)
  })

  it('shows a new account on the free plan with 10 questions', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/account', headers: as('user') })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.usage).toEqual({ plan: 'free', used: 0, limit: 10, resetsAt: '2026-12-01T00:00:00.000Z' })
    expect(body.aiKey).toBeNull()
    expect(body.subscription).toBeNull()
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual(['anthropic', 'openai', 'openrouter'])
  })

  it('checks a key before saving it, stores it sealed and never returns it', async () => {
    const bad = await ctx.app.inject({ method: 'PUT', url: '/api/account/ai-key', headers: as('user'), payload: { provider: 'anthropic', apiKey: 'sk-ant-api03-bad' } })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().message).toMatch(/rejected/)
    expect(ctx.mem.keys.size).toBe(0)

    const res = await ctx.app.inject({ method: 'PUT', url: '/api/account/ai-key', headers: as('user'), payload: { provider: 'anthropic', apiKey: 'sk-ant-api03-xyzgood' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('sk-ant-api03-xyzgood')
    expect(res.json().aiKey).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5', last4: 'good', updatedAt: NOW.toISOString() })
    const stored = ctx.mem.keys.get(USER)!
    expect(stored.sealedKey).not.toContain('xyzgood')
    expect(open(stored.sealedKey, SECRET)).toBe('sk-ant-api03-xyzgood')

    const account = await ctx.app.inject({ method: 'GET', url: '/api/account', headers: as('user') })
    expect(account.body).not.toContain('xyzgood')
    expect(account.json().usage.plan).toBe('own_key')
  })

  it('changes the model without re-entering the key, and removes the key', async () => {
    await ctx.app.inject({ method: 'PUT', url: '/api/account/ai-key', headers: as('user'), payload: { provider: 'anthropic', apiKey: 'sk-ant-api03-xyzgood' } })
    const res = await ctx.app.inject({ method: 'PUT', url: '/api/account/ai-key', headers: as('user'), payload: { provider: 'anthropic', model: 'claude-haiku-5-5' } })
    expect(res.json().aiKey.model).toBe('claude-haiku-5-5')
    expect(open(ctx.mem.keys.get(USER)!.sealedKey, SECRET)).toBe('sk-ant-api03-xyzgood')

    const wrongProvider = await ctx.app.inject({ method: 'PUT', url: '/api/account/ai-key', headers: as('user'), payload: { provider: 'openai', model: 'gpt-5' } })
    expect(wrongProvider.statusCode).toBe(400)

    await ctx.app.inject({ method: 'DELETE', url: '/api/account/ai-key', headers: as('user') })
    expect(ctx.mem.keys.has(USER)).toBe(false)
  })

  it('keeps one user from touching another user\'s key', async () => {
    await ctx.app.inject({ method: 'PUT', url: '/api/account/ai-key', headers: as('user'), payload: { provider: 'anthropic', apiKey: 'sk-ant-api03-xyzgood' } })
    const other = await ctx.app.inject({ method: 'GET', url: '/api/account', headers: as('other') })
    expect(other.json().aiKey).toBeNull()
    await ctx.app.inject({ method: 'DELETE', url: '/api/account/ai-key', headers: as('other') })
    expect(ctx.mem.keys.has(USER)).toBe(true)
  })

  it('connects OpenRouter from a sign-in code', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/account/ai-key/openrouter', headers: as('user'),
      payload: { code: 'abc', codeVerifier: 'v'.repeat(64) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().aiKey).toMatchObject({ provider: 'openrouter', last4: 'good' })
    expect(ctx.deps.exchangeOpenRouterCode).toHaveBeenCalledWith('abc', 'v'.repeat(64))
  })

  it('starts Checkout for the signed-in user only, and not twice', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/account/billing/checkout', headers: as('user') })
    expect(res.json()).toEqual({ url: 'https://checkout.stripe.test/c/1' })
    expect(ctx.stripe.createCheckoutSession).toHaveBeenCalledWith({ userId: USER, email: 'hunter@example.com', customerId: null, appUrl: 'https://huntstack.net' })

    ctx.mem.subs.set(USER, { userId: USER, customerId: 'cus_1', subscriptionId: 'sub_1', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false })
    expect((await ctx.app.inject({ method: 'POST', url: '/api/account/billing/checkout', headers: as('user') })).statusCode).toBe(409)
    const portal = await ctx.app.inject({ method: 'POST', url: '/api/account/billing/portal', headers: as('user') })
    expect(portal.json()).toEqual({ url: 'https://billing.stripe.test/p/1' })
    expect(ctx.stripe.createPortalSession).toHaveBeenCalledWith('cus_1', 'https://huntstack.net/settings')
    expect((await ctx.app.inject({ method: 'POST', url: '/api/account/billing/portal', headers: as('other') })).statusCode).toBe(404)
  })
})

describe('/api/billing/webhook', () => {
  let ctx: Awaited<ReturnType<typeof build>>
  beforeEach(async () => { ctx = await build() })

  const post = (event: object, secret = 'whsec_test', at = Date.now()) => {
    const body = JSON.stringify(event)
    const t = Math.floor(at / 1000)
    const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
    return ctx.app.inject({ method: 'POST', url: '/api/billing/webhook', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, payload: body })
  }

  it('rejects an unsigned or wrongly signed event', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/billing/webhook', headers: { 'content-type': 'application/json' }, payload: '{}' })
    expect(res.statusCode).toBe(400)
    expect((await post({ type: 'x', data: { object: {} } }, 'whsec_wrong')).statusCode).toBe(400)
  })

  it('records a subscription from Stripe\'s current state, not the event\'s', async () => {
    ctx.stripeSubs.set('sub_1', { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, metadata: { user_id: USER }, items: { data: [{ current_period_end: 1_800_000_000 }] } })
    const res = await post({ type: 'checkout.session.completed', data: { object: { subscription: 'sub_1', client_reference_id: USER, customer: 'cus_1' } } })
    expect(res.statusCode).toBe(200)
    expect(ctx.mem.subs.get(USER)).toEqual({ userId: USER, customerId: 'cus_1', subscriptionId: 'sub_1', status: 'active', currentPeriodEnd: '2027-01-15T08:00:00.000Z', cancelAtPeriodEnd: false })

    // A late "updated" event after cancellation still ends at the true (canceled) state
    ctx.stripeSubs.set('sub_1', { ...ctx.stripeSubs.get('sub_1')!, status: 'canceled' })
    await post({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active' } } })
    expect(ctx.mem.subs.get(USER)!.status).toBe('canceled')
  })

  it('finds the user by customer when the subscription has no user id', async () => {
    ctx.mem.subs.set(USER, { userId: USER, customerId: 'cus_9', subscriptionId: null, status: 'canceled', currentPeriodEnd: null, cancelAtPeriodEnd: false })
    ctx.stripeSubs.set('sub_9', { id: 'sub_9', customer: 'cus_9', status: 'active', cancel_at_period_end: true })
    await post({ type: 'customer.subscription.created', data: { object: { id: 'sub_9' } } })
    expect(ctx.mem.subs.get(USER)).toMatchObject({ subscriptionId: 'sub_9', status: 'active', cancelAtPeriodEnd: true })
  })

  it('ignores events it does not use', async () => {
    const res = await post({ type: 'invoice.paid', data: { object: { id: 'in_1' } } })
    expect(res.statusCode).toBe(200)
    expect(ctx.stripe.getSubscription).not.toHaveBeenCalled()
  })
})

describe('/api/chat allowance', () => {
  let ctx: Awaited<ReturnType<typeof build>>
  beforeEach(async () => { ctx = await build() })
  const ask = (headers: Record<string, string> = {}) =>
    ctx.app.inject({ method: 'POST', url: '/api/chat', headers, payload: { message: 'hi' }, remoteAddress: '203.0.113.9' })

  // No model is configured in tests, so a question that gets past the allowance answers 503
  // and gives its question back
  let savedLlm: [string | undefined, string | undefined]
  beforeAll(() => {
    savedLlm = [process.env.LLM_API_KEY, process.env.TOGETHER_API_KEY]
    delete process.env.LLM_API_KEY
    delete process.env.TOGETHER_API_KEY
  })
  afterAll(() => {
    if (savedLlm[0] !== undefined) process.env.LLM_API_KEY = savedLlm[0]
    if (savedLlm[1] !== undefined) process.env.TOGETHER_API_KEY = savedLlm[1]
  })

  it('gives back a question that could not be answered', async () => {
    expect((await ask()).statusCode).toBe(503)
    expect(ctx.mem.usage.get(`visitor:${visitorId('203.0.113.9')}|all`)).toBe(0)
  })

  it('stops a visitor after 3 questions with a sign-up message', async () => {
    ctx.mem.usage.set(`visitor:${visitorId('203.0.113.9')}|all`, 3)
    const res = await ask()
    expect(res.statusCode).toBe(402)
    expect(res.json()).toMatchObject({ code: 'chat_limit', usage: { plan: 'visitor', used: 3, limit: 3 } })
    expect(res.json().message).toMatch(/Create a free account/)
  })

  it('stops a free account after 10 in the month with a subscribe message', async () => {
    ctx.mem.usage.set(`user:${USER}|2026-11`, 10)
    const res = await ask(as('user'))
    expect(res.statusCode).toBe(402)
    expect(res.json().message).toMatch(/Subscribe/)
    expect(res.json().usage).toMatchObject({ plan: 'free', used: 10, limit: 10 })
  })

  it('refuses a token that does not verify instead of counting it as a visitor', async () => {
    const res = await ask(as('nobody'))
    expect(res.statusCode).toBe(401)
    expect(ctx.mem.usage.size).toBe(0)
  })

  it('does not stop a subscriber at the free limit', async () => {
    ctx.mem.usage.set(`user:${USER}|2026-11`, 10)
    ctx.mem.subs.set(USER, { userId: USER, customerId: 'cus_1', subscriptionId: 'sub_1', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false })
    const res = await ask(as('user'))
    expect(res.statusCode).toBe(503) // past the allowance; no model in tests
    expect(ctx.mem.usage.get(`user:${USER}|2026-11`)).toBe(10)
  })
})
