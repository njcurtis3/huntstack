-- ===========================================
-- Normalize double-encoded locations.metadata (2026-10-26)
--
-- 29 of 41 locations stored metadata as a JSON *string* ("{\"flyway\":...}") instead of a
-- jsonb object, so SQL like metadata->>'flyway' returned NULL for them: the flyway filters on
-- the dashboard, weekly summary and flyway progression silently dropped most refuges.
-- Same fix as center_point earlier the same day. Values are unchanged, only the encoding.
-- Run outside the Supabase SQL editor is fine; it is a single transaction.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

UPDATE locations
SET metadata = (metadata #>> '{}')::jsonb, updated_at = now()
WHERE jsonb_typeof(metadata) = 'string';

DO $$ DECLARE s int; o int; BEGIN
  SELECT count(*) INTO s FROM locations WHERE jsonb_typeof(metadata) = 'string';
  SELECT count(*) INTO o FROM locations WHERE metadata IS NOT NULL AND jsonb_typeof(metadata) <> 'object';
  IF s <> 0 OR o <> 0 THEN RAISE EXCEPTION 'still % string and % non-object metadata rows', s, o; END IF;
END $$;

SELECT metadata->>'flyway' AS flyway, count(*) FROM locations GROUP BY 1 ORDER BY 1;
COMMIT;
