import { sql } from 'drizzle-orm'
import { getDb } from './db.js'
import type { Provider } from './user-llm.js'

// Database access for accounts: chat counts, users' own AI keys (sealed, see secret-box.ts) and
// Stripe subscriptions. Tables: scripts/add-accounts-billing.sql. Raw SQL, like the rest of the
// API's newer tables; dates are passed as ISO strings (drizzle does not serialize a Date in sql``).

export interface StoredAiKey {
  provider: Provider
  sealedKey: string
  last4: string
  model: string
  updatedAt: string
}

export interface StoredSubscription {
  userId: string
  customerId: string
  subscriptionId: string | null
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export interface AccountStore {
  usageCount(subject: string, period: string): Promise<number>
  /** Count one question if under the limit. Returns the new count, or null when the limit is reached. */
  reserveChat(subject: string, period: string, limit: number): Promise<number | null>
  /** Give back a question that failed */
  releaseChat(subject: string, period: string): Promise<void>
  getAiKey(userId: string): Promise<StoredAiKey | null>
  setAiKey(userId: string, key: Omit<StoredAiKey, 'updatedAt'>): Promise<StoredAiKey>
  deleteAiKey(userId: string): Promise<void>
  getSubscription(userId: string): Promise<StoredSubscription | null>
  findSubscriptionUserByCustomer(customerId: string): Promise<string | null>
  upsertSubscription(sub: StoredSubscription): Promise<void>
}

const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString())

export function drizzleAccountStore(): AccountStore {
  const db = () => getDb()
  return {
    async usageCount(subject, period) {
      const rows = await db().execute(sql`
        SELECT count FROM chat_usage WHERE subject = ${subject} AND period = ${period}
      `)
      return Number((rows[0] as { count?: number } | undefined)?.count ?? 0)
    },

    async reserveChat(subject, period, limit) {
      // One statement, so two questions sent at once cannot both take the last free one
      const rows = await db().execute(sql`
        INSERT INTO chat_usage (subject, period, count)
        SELECT ${subject}, ${period}, 1 WHERE ${limit} > 0
        ON CONFLICT (subject, period) DO UPDATE
          SET count = chat_usage.count + 1, updated_at = now()
          WHERE chat_usage.count < ${limit}
        RETURNING count
      `)
      const row = rows[0] as { count?: number } | undefined
      return row ? Number(row.count) : null
    },

    async releaseChat(subject, period) {
      await db().execute(sql`
        UPDATE chat_usage SET count = GREATEST(count - 1, 0), updated_at = now()
        WHERE subject = ${subject} AND period = ${period}
      `)
    },

    async getAiKey(userId) {
      const rows = await db().execute(sql`
        SELECT provider, sealed_key, key_last4, model, updated_at FROM user_ai_keys WHERE user_id = ${userId}
      `)
      const r = rows[0] as Record<string, unknown> | undefined
      if (!r) return null
      return {
        provider: r.provider as Provider,
        sealedKey: String(r.sealed_key),
        last4: String(r.key_last4),
        model: String(r.model),
        updatedAt: iso(r.updated_at)!,
      }
    },

    async setAiKey(userId, key) {
      const rows = await db().execute(sql`
        INSERT INTO user_ai_keys (user_id, provider, sealed_key, key_last4, model)
        VALUES (${userId}, ${key.provider}, ${key.sealedKey}, ${key.last4}, ${key.model})
        ON CONFLICT (user_id) DO UPDATE SET
          provider = EXCLUDED.provider, sealed_key = EXCLUDED.sealed_key,
          key_last4 = EXCLUDED.key_last4, model = EXCLUDED.model, updated_at = now()
        RETURNING updated_at
      `)
      return { ...key, updatedAt: iso((rows[0] as Record<string, unknown>).updated_at)! }
    },

    async deleteAiKey(userId) {
      await db().execute(sql`DELETE FROM user_ai_keys WHERE user_id = ${userId}`)
    },

    async getSubscription(userId) {
      const rows = await db().execute(sql`
        SELECT user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end
        FROM subscriptions WHERE user_id = ${userId}
      `)
      const r = rows[0] as Record<string, unknown> | undefined
      if (!r) return null
      return {
        userId: String(r.user_id),
        customerId: String(r.stripe_customer_id),
        subscriptionId: (r.stripe_subscription_id as string | null) ?? null,
        status: String(r.status),
        currentPeriodEnd: iso(r.current_period_end),
        cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
      }
    },

    async findSubscriptionUserByCustomer(customerId) {
      const rows = await db().execute(sql`
        SELECT user_id FROM subscriptions WHERE stripe_customer_id = ${customerId}
      `)
      const r = rows[0] as { user_id?: string } | undefined
      return r?.user_id ?? null
    },

    async upsertSubscription(s) {
      await db().execute(sql`
        INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end)
        VALUES (${s.userId}, ${s.customerId}, ${s.subscriptionId}, ${s.status}, ${s.currentPeriodEnd}, ${s.cancelAtPeriodEnd})
        ON CONFLICT (user_id) DO UPDATE SET
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          status = EXCLUDED.status,
          current_period_end = EXCLUDED.current_period_end,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          updated_at = now()
      `)
    },
  }
}
