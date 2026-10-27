-- ===========================================
-- Data pipeline run log (2026-10-27)
--
-- One row per job run by `python -m huntstack_scrapers.pipeline` (apps/scrapers-python/
-- huntstack_scrapers/pipeline/). `update all` reads the last good run of each job to
-- decide what is due; `status` shows it. Written only by the pipeline; the API does not
-- read it. Not in the Drizzle schema (raw SQL only, like every schema change here).
--
-- status: running (in progress or crashed mid-run), success, warning (ran, but a check
-- flagged something: unknown species names, nothing parsed, stale data...), failed.
--
-- Additive and idempotent.
-- ===========================================
\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job          text NOT NULL,
  trigger      text NOT NULL CHECK (trigger IN ('update-all', 'named', 'forced')),
  status       text NOT NULL CHECK (status IN ('running', 'success', 'warning', 'failed')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  items        integer,
  rows_written integer,
  message      text,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS pipeline_runs_job_started_idx ON pipeline_runs (job, started_at DESC);

SELECT count(*) AS pipeline_runs_rows FROM pipeline_runs;
