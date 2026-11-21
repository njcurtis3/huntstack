-- ===========================================
-- Weekly migration summaries (2026-11-21)
--
-- One row per summary the API writes (apps/api/src/routes/migration.ts, /weekly-summary), so:
--   - a restart or a second API instance serves the summary already written instead of paying
--     for a new one, and
--   - there is a record of what readers were shown, the facts it was written from, and whether
--     the model's first draft passed the check, needed a retry, or was replaced by the template.
-- scope is 'summary:<flyway|all>:<species|all>', the same key as the in-memory cache.
--
-- Row level security ENABLED with no policies and anon/authenticated grants revoked: only the
-- API's server connection reads or writes it (CONSTRAINTS.md 3.2a). The API works without the
-- table (summaries are then kept in memory only). Applied by hand, never drizzle-kit push.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/add-weekly-summaries-table.sql
--
-- Additive and idempotent.
-- ===========================================
\set ON_ERROR_STOP on

BEGIN;

CREATE TABLE IF NOT EXISTS weekly_summaries (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text         NOT NULL,
  flyway        text,
  species_slug  varchar(100),
  summary       text         NOT NULL,
  outcome       text         NOT NULL CONSTRAINT weekly_summaries_outcome_check
                             CHECK (outcome IN ('first_draft', 'retry', 'template')),
  problems      jsonb        NOT NULL DEFAULT '[]'::jsonb,  -- what the check found in rejected drafts
  facts         text,                                       -- the facts the model was given
  model         text,
  generated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weekly_summaries_scope_generated_idx ON weekly_summaries (scope, generated_at DESC);

ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON weekly_summaries FROM anon, authenticated;

COMMIT;
