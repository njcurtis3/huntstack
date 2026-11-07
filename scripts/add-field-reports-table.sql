-- ===========================================
-- Hunter field reports (2026-11-07)
--
-- One row per bird report a signed-in hunter submits (apps/api/src/routes/field-reports.ts).
-- lat/lng hold the exact point the hunter gave and are NEVER read for output; the API
-- snaps them to the centre of a 0.05-degree grid cell on insert (lat_cell/lng_cell) and
-- serves only that. user_id is a Supabase auth user id; there is deliberately no FK
-- (no code path creates profiles rows). Applied by hand, never drizzle-kit push.
--
-- Additive and idempotent.
-- ===========================================
\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS field_reports (
  id            uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid             NOT NULL,
  bird_group    text             NOT NULL CONSTRAINT field_reports_bird_group_check CHECK (bird_group IN ('duck', 'goose')),
  species_slug  varchar(100),
  count_bucket  text             NOT NULL CONSTRAINT field_reports_count_bucket_check CHECK (count_bucket IN ('1-10', '10-50', '50-200', '200+')),
  count_exact   integer          CONSTRAINT field_reports_count_exact_check CHECK (count_exact BETWEEN 1 AND 250000),
  activity      text             CONSTRAINT field_reports_activity_check CHECK (activity IN ('flying', 'on_water', 'in_field')),
  lat           double precision NOT NULL,
  lng           double precision NOT NULL,
  lat_cell      double precision NOT NULL,
  lng_cell      double precision NOT NULL,
  observed_at   timestamptz      NOT NULL,
  created_at    timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS field_reports_observed_idx ON field_reports (observed_at DESC);
CREATE INDEX IF NOT EXISTS field_reports_user_created_idx ON field_reports (user_id, created_at DESC);
