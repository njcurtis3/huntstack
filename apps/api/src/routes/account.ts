import type { FastifyPluginAsync } from 'fastify'
import { decorateAuthUser, parseAdminIds, requireUser, type VerifyUser } from '../lib/auth-guard.js'
import { drizzleAccountStore, type AccountStore, type StoredAiKey } from '../lib/account-store.js'
import { chatAccessFor, isSubscriptionActive, usageFor } from '../lib/chat-quota.js'
import { isSecretConfigured, seal } from '../lib/secret-box.js'
import * as stripeApi from '../lib/stripe.js'
import { verifyAccessTokenUser } from '../lib/supabase-auth.js'
import { PROVIDERS, checkModel, exchangeOpenRouterCode, isProvider, verifyKey, UserKeyError } from '../lib/user-llm.js'

// The signed-in user's settings: plan and chat usage, their own AI key, and billing.
// Everything is scoped by the verified user id; a stored key is never sent back, only its
// provider, model and last four characters.

export interface AccountDeps {
  store: AccountStore
  verifyUser: VerifyUser
  now: () => Date
  /** Admins (ADMIN_USER_IDS) have unlimited questions and are never billed */
  isAdmin: (userId: string) => boolean
  /** Where Stripe sends people back to, e.g. https://huntstack.net */
  appUrl: () => string
  verifyKey: typeof verifyKey
  exchangeOpenRouterCode: typeof exchangeOpenRouterCode
  stripe: Pick<typeof stripeApi, 'isStripeConfigured' | 'createCheckoutSession' | 'createPortalSession' | 'getSubscription'>
}

const errorBody = (statusCode: number, message: string) => ({ error: true, statusCode, message })

function keyView(k: StoredAiKey | null) {
  return k ? { provider: k.provider, model: k.model, last4: k.last4, updatedAt: k.updatedAt } : null
}

/** The first allowed web origin; Stripe returns people here */
export function defaultAppUrl(): string {
  const configured = process.env.APP_URL || (process.env.CORS_ORIGIN || '').split(',')[0]
  return (configured || 'http://localhost:3000').trim().replace(/\/+$/, '')
}

export function buildAccountRoutes(deps: AccountDeps): FastifyPluginAsync {
  const { store } = deps
  return async (app) => {
    decorateAuthUser(app)
    app.addHook('preHandler', requireUser({ verifyUser: deps.verifyUser }))

    app.get('/', { schema: { tags: ['account'], summary: 'My plan, chat usage, AI key and billing' } }, async (request) => {
      const { id, email } = request.authUser
      const now = deps.now()
      const [aiKey, sub] = await Promise.all([store.getAiKey(id), store.getSubscription(id)])
      const access = chatAccessFor({ userId: id, visitor: '', hasOwnKey: !!aiKey, subscriptionStatus: sub?.status ?? null, isAdmin: deps.isAdmin(id), now })
      const used = access.plan === 'free' ? await store.usageCount(access.subject, access.period) : 0
      return {
        email,
        usage: usageFor(access, used, now),
        subscription: sub
          ? {
              status: sub.status,
              active: isSubscriptionActive(sub.status),
              currentPeriodEnd: sub.currentPeriodEnd,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            }
          : null,
        aiKey: keyView(aiKey),
        billingAvailable: deps.stripe.isStripeConfigured(),
        ownKeysAvailable: isSecretConfigured(),
        providers: Object.values(PROVIDERS),
      }
    })

    // Save a key, or change the model of the saved one (omit apiKey)
    app.put('/ai-key', {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags: ['account'],
        summary: 'Save my own AI key',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            provider: { type: 'string', enum: ['anthropic', 'openai', 'openrouter'] },
            apiKey: { type: 'string', minLength: 10, maxLength: 300 },
            model: { type: 'string', maxLength: 100 },
          },
          required: ['provider'],
        },
      },
    }, async (request, reply) => {
      if (!isSecretConfigured()) return reply.status(503).send(errorBody(503, 'Own AI keys are not available right now'))
      const body = request.body as { provider: string; apiKey?: string; model?: string }
      if (!isProvider(body.provider)) return reply.status(400).send(errorBody(400, 'Unknown provider'))
      const model = checkModel(body.provider, body.model)
      if (!model.ok) return reply.status(400).send(errorBody(400, model.message))

      const userId = request.authUser.id
      const apiKey = body.apiKey?.trim()
      if (!apiKey) {
        const existing = await store.getAiKey(userId)
        if (!existing || existing.provider !== body.provider) {
          return reply.status(400).send(errorBody(400, 'Paste your API key'))
        }
        const saved = await store.setAiKey(userId, { ...existing, model: model.model })
        return { aiKey: keyView(saved) }
      }
      if (/\s/.test(apiKey)) return reply.status(400).send(errorBody(400, 'That key has spaces in it; copy it again'))
      const check = await deps.verifyKey(body.provider, apiKey)
      if (!check.ok) return reply.status(400).send(errorBody(400, check.message))
      const saved = await store.setAiKey(userId, {
        provider: body.provider,
        sealedKey: seal(apiKey),
        last4: apiKey.slice(-4),
        model: model.model,
      })
      return { aiKey: keyView(saved) }
    })

    // Finish "Connect OpenRouter": trade the sign-in code for a key and save it
    app.post('/ai-key/openrouter', {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags: ['account'],
        summary: 'Connect my OpenRouter account',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            code: { type: 'string', minLength: 1, maxLength: 500 },
            codeVerifier: { type: 'string', minLength: 43, maxLength: 128 },
            model: { type: 'string', maxLength: 100 },
          },
          required: ['code', 'codeVerifier'],
        },
      },
    }, async (request, reply) => {
      if (!isSecretConfigured()) return reply.status(503).send(errorBody(503, 'Own AI keys are not available right now'))
      const body = request.body as { code: string; codeVerifier: string; model?: string }
      const model = checkModel('openrouter', body.model)
      if (!model.ok) return reply.status(400).send(errorBody(400, model.message))
      let apiKey: string
      try {
        apiKey = await deps.exchangeOpenRouterCode(body.code, body.codeVerifier)
      } catch (err) {
        if (err instanceof UserKeyError) return reply.status(400).send(errorBody(400, err.message))
        throw err
      }
      const saved = await store.setAiKey(request.authUser.id, {
        provider: 'openrouter',
        sealedKey: seal(apiKey),
        last4: apiKey.slice(-4),
        model: model.model,
      })
      return { aiKey: keyView(saved) }
    })

    app.delete('/ai-key', { schema: { tags: ['account'], summary: 'Remove my own AI key' } }, async (request) => {
      await store.deleteAiKey(request.authUser.id)
      return { aiKey: null }
    })

    app.post('/billing/checkout', {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: { tags: ['account'], summary: 'Start a subscription (returns a Stripe Checkout link)' },
    }, async (request, reply) => {
      if (!deps.stripe.isStripeConfigured()) return reply.status(503).send(errorBody(503, 'Subscriptions are not available yet'))
      const { id, email } = request.authUser
      // Admin accounts are HuntStack's own: never charged
      if (deps.isAdmin(id)) return reply.status(409).send(errorBody(409, 'Admin accounts have unlimited questions and are not billed.'))
      const sub = await store.getSubscription(id)
      if (sub && isSubscriptionActive(sub.status)) {
        return reply.status(409).send(errorBody(409, 'You already have a subscription. Use Manage billing to change it.'))
      }
      const url = await deps.stripe.createCheckoutSession({ userId: id, email, customerId: sub?.customerId ?? null, appUrl: deps.appUrl() })
      return { url }
    })

    app.post('/billing/portal', {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: { tags: ['account'], summary: 'Manage my subscription (returns a Stripe billing portal link)' },
    }, async (request, reply) => {
      if (!deps.stripe.isStripeConfigured()) return reply.status(503).send(errorBody(503, 'Subscriptions are not available yet'))
      const sub = await store.getSubscription(request.authUser.id)
      if (!sub) return reply.status(404).send(errorBody(404, 'You have no subscription yet'))
      const url = await deps.stripe.createPortalSession(sub.customerId, `${deps.appUrl()}/settings`)
      return { url }
    })
  }
}

/**
 * Stripe webhook. Each event only says which subscription changed; the current state is read
 * back from Stripe, so events that arrive late or out of order cannot leave a stale status.
 */
export function buildBillingWebhookRoutes(deps: Pick<AccountDeps, 'store' | 'stripe'> & { webhookSecret: () => string | undefined }): FastifyPluginAsync {
  return async (app) => {
    // The signature covers the exact bytes Stripe sent, so keep the body raw in this plugin only
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

    app.post('/webhook', { schema: { tags: ['account'], summary: 'Stripe webhook', hide: true } }, async (request, reply) => {
      const secret = deps.webhookSecret()
      if (!secret) return reply.status(503).send(errorBody(503, 'Billing is not configured'))
      const raw = request.body as Buffer
      const signature = request.headers['stripe-signature']
      if (!stripeApi.verifyWebhookSignature(raw, typeof signature === 'string' ? signature : undefined, secret)) {
        return reply.status(400).send(errorBody(400, 'Bad signature'))
      }

      const event = JSON.parse(raw.toString('utf8')) as {
        type: string
        data: { object: { id?: string; subscription?: string | null; customer?: string | null; client_reference_id?: string | null } }
      }
      const obj = event.data.object
      let subscriptionId: string | null = null
      let userHint: string | null = null
      if (event.type === 'checkout.session.completed') {
        subscriptionId = obj.subscription ?? null
        userHint = obj.client_reference_id ?? null
      } else if (event.type.startsWith('customer.subscription.')) {
        subscriptionId = obj.id ?? null
      }
      if (!subscriptionId) return { received: true }

      const sub = await deps.stripe.getSubscription(subscriptionId)
      const userId = sub.metadata?.user_id || userHint || (await deps.store.findSubscriptionUserByCustomer(sub.customer))
      if (!userId) {
        request.log.warn({ subscriptionId }, 'Stripe subscription with no HuntStack user')
        return { received: true }
      }
      await deps.store.upsertSubscription({
        userId,
        customerId: sub.customer,
        subscriptionId: sub.id,
        status: sub.status,
        currentPeriodEnd: stripeApi.periodEndOf(sub),
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      })
      return { received: true }
    })
  }
}

const liveDeps: AccountDeps = {
  store: drizzleAccountStore(),
  verifyUser: verifyAccessTokenUser,
  now: () => new Date(),
  isAdmin: (id) => parseAdminIds(process.env.ADMIN_USER_IDS).has(id.toLowerCase()),
  appUrl: defaultAppUrl,
  verifyKey,
  exchangeOpenRouterCode,
  stripe: stripeApi,
}

export const accountRoutes = buildAccountRoutes(liveDeps)
export const billingWebhookRoutes = buildBillingWebhookRoutes({
  store: liveDeps.store,
  stripe: stripeApi,
  webhookSecret: () => process.env.STRIPE_WEBHOOK_SECRET,
})
