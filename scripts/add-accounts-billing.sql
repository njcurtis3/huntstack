-- Accounts and billing (2026-11-08): chat allowance counts, users' own AI keys, Stripe subscriptions.
-- Additive and idempotent. Run before deploying the API that reads these tables; until then the
-- chat answers without the allowance check (it fails open, logged).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/add-accounts-billing.sql
--
-- Row level security is on with no policies: only the API (database owner) can read these tables,
-- never the browser's Supabase anon key. user_ai_keys holds keys sealed with USER_KEY_SECRET,
-- which only the API has.

BEGIN;

-- Questions asked per person per period. subject = 'user:<auth user id>' (period 'YYYY-MM', UTC)
-- or 'visitor:<HMAC of IP>' (period 'all'). No IP addresses are stored.
CREATE TABLE IF NOT EXISTS chat_usage (
  subject    text        NOT NULL,
  period     varchar(10) NOT NULL,
  count      integer     NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject, period)
);

-- A user's own AI provider key, encrypted (AES-256-GCM). The API never returns it; only the last 4.
CREATE TABLE IF NOT EXISTS user_ai_keys (
  user_id    uuid        PRIMARY KEY,
  provider   varchar(20) NOT NULL CHECK (provider IN ('anthropic', 'openai', 'openrouter')),
  sealed_key text        NOT NULL,
  key_last4  varchar(4)  NOT NULL,
  model      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per user who ever started a subscription. status is Stripe's (active, trialing,
-- past_due, canceled, unpaid, incomplete, ...), copied from Stripe on every webhook.
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                uuid        PRIMARY KEY,
  stripe_customer_id     text        NOT NULL UNIQUE,
  stripe_subscription_id text        UNIQUE,
  status                 varchar(30) NOT NULL,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean     NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_usage    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

COMMIT;
