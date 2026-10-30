-- ===========================================
-- eBird statewide activity snapshots (2026-10-30)
--
-- One row per state, species and day: how many places reported the species in the last
-- 14 days and the birds in each place's latest report (apps/api/src/lib/ebird-activity.ts).
-- eBird only returns the latest report at each place, so "last 14 days vs the 14 before"
-- cannot be asked of eBird; the Migration page's trend compares today's row with the one
-- saved about 14 days earlier. Written by the API, the first refresh of each day.
-- Not in the Drizzle schema (raw SQL only, like every schema change here).
--
-- Additive and idempotent.
-- ===========================================
\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS ebird_activity_snapshots (
  state_code    char(2)     NOT NULL,
  species_slug  text        NOT NULL,
  snapshot_date date        NOT NULL,
  places        integer     NOT NULL,
  birds         integer     NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (state_code, species_slug, snapshot_date)
);
