-- eBird answers kept across API restarts (2026-11-09). See apps/api/src/lib/ebird-store.ts.
-- A restart reads these instead of re-asking eBird for every state and species at once, and
-- when eBird refuses requests, pages show the last saved numbers (up to a week old).
-- Additive and idempotent; the API works without it (answers are then kept in memory only).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/add-ebird-cache-table.sql

BEGIN;

CREATE TABLE IF NOT EXISTS ebird_cache (
  key        text        PRIMARY KEY,  -- e.g. 'ebird:sp:US-TX:mallar3:14d' or 'ebird:obs:35.20:-101.83:50'
  data       jsonb       NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- Only the API (database owner) reads it, never the browser's anon key
ALTER TABLE ebird_cache ENABLE ROW LEVEL SECURITY;

COMMIT;
