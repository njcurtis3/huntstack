-- ===========================================
-- Texas 2026-27 waterfowl seasons, hand-entered from the TPWD Outdoor Annual (2026-10-26)
--
-- Replaces the LLM-extracted TX year=2026 rows, which had wrong dates and limits:
-- North/South Zone openers and youth days, no split segments, dusky ducks under mallard
-- with a 6-bird limit (it is 1), goose possession 5 (it is 15), no white-fronted cap in the
-- Eastern Zone, falconry in the HPMMU (TPWD lists none), and no September teal season.
-- Verified against:
--   https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck
--   https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose
--   https://tpwd.texas.gov/regulations/outdoor-annual/regs/counties/colorado  (teal, Eastern Zone)
--   https://tpwd.texas.gov/regulations/outdoor-annual/regs/counties/foard     (HPMMU, Western Zone)
-- Not included: light goose conservation order (no dates on these pages), sandhill crane
-- (no crane species in the species table yet).
--
-- Model: one row per season segment. Seasons that cover every duck carry
-- metadata.appliesTo = 'ducks' and hang off mallard (seasons.species_id is NOT NULL);
-- the API treats them as open for any duck species (hunt.ts) and labels them "All ducks"
-- (chat.ts). bag_limit.speciesLimits holds the per-species caps inside the 6-duck aggregate.
-- Backup of the replaced rows: taken before running (see CURRENT_STATE.md).
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

DELETE FROM seasons se USING states s
WHERE se.state_id = s.id AND s.code = 'TX' AND se.year = 2026;

WITH
duck_bag AS (SELECT jsonb_build_object(
  'daily', 6, 'possession', 18,
  'speciesLimits', jsonb_build_object('mallard', 5, 'wood-duck', 3, 'pintail', 3, 'redhead', 2,
                                      'canvasback', 2, 'scaup', 1, 'mottled-duck', 1),
  'notes', 'No more than 2 of the 5 mallards may be hens. Includes mergansers. All other species: 6.'
) AS b),
v(name, slug, season_type, start_date, end_date, units, bag, restrictions, applies_to, source_url) AS (VALUES
  -- ── Ducks: High Plains Mallard Management Unit ────────────────────────────
  ('Youth-Only Duck Season - High Plains Mallard Management Unit', 'mallard', 'youth', DATE '2026-10-17', DATE '2026-10-18', 'High Plains Mallard Management Unit', NULL::jsonb,
   'Youth hunters 16 and under; same bag limits as the regular season.', 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Veterans and Active Duty Military Duck Season - High Plains Mallard Management Unit', 'mallard', 'special', DATE '2026-10-17', DATE '2026-10-18', 'High Plains Mallard Management Unit', NULL,
   'Veterans and active-duty military; same bag limits as the regular season.', 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Regular Duck Season (Split 1) - High Plains Mallard Management Unit', 'mallard', 'general', DATE '2026-10-24', DATE '2026-10-25', 'High Plains Mallard Management Unit', NULL, NULL, 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Regular Duck Season (Split 2) - High Plains Mallard Management Unit', 'mallard', 'general', DATE '2026-10-30', DATE '2027-01-31', 'High Plains Mallard Management Unit', NULL, NULL, 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  -- ── Ducks: North Zone ──────────────────────────────────────────────────────
  ('Youth-Only Duck Season - North Zone', 'mallard', 'youth', DATE '2026-11-07', DATE '2026-11-08', 'North Zone', NULL,
   'Youth hunters 16 and under; same bag limits as the regular season.', 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Veterans and Active Duty Military Duck Season - North Zone', 'mallard', 'special', DATE '2026-11-07', DATE '2026-11-08', 'North Zone', NULL,
   'Veterans and active-duty military; same bag limits as the regular season.', 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Regular Duck Season (Split 1) - North Zone', 'mallard', 'general', DATE '2026-11-14', DATE '2026-11-29', 'North Zone', NULL, NULL, 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Regular Duck Season (Split 2) - North Zone', 'mallard', 'general', DATE '2026-12-05', DATE '2027-01-31', 'North Zone', NULL, NULL, 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Falconry Duck Season - North Zone', 'mallard', 'falconry', DATE '2027-02-01', DATE '2027-02-21', 'North Zone',
   '{"daily": 3, "possession": 9, "notes": "Migratory game birds, singly or in the aggregate."}'::jsonb, 'Falconry only.', 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  -- ── Ducks: South Zone ──────────────────────────────────────────────────────
  ('Youth-Only Duck Season - South Zone', 'mallard', 'youth', DATE '2026-10-31', DATE '2026-11-01', 'South Zone', NULL,
   'Youth hunters 16 and under; same bag limits as the regular season.', 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Veterans and Active Duty Military Duck Season - South Zone', 'mallard', 'special', DATE '2026-10-31', DATE '2026-11-01', 'South Zone', NULL,
   'Veterans and active-duty military; same bag limits as the regular season.', 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Regular Duck Season (Split 1) - South Zone', 'mallard', 'general', DATE '2026-11-07', DATE '2026-11-29', 'South Zone', NULL, NULL, 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Regular Duck Season (Split 2) - South Zone', 'mallard', 'general', DATE '2026-12-12', DATE '2027-01-31', 'South Zone', NULL, NULL, 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Falconry Duck Season - South Zone', 'mallard', 'falconry', DATE '2027-02-01', DATE '2027-02-21', 'South Zone',
   '{"daily": 3, "possession": 9, "notes": "Migratory game birds, singly or in the aggregate."}'::jsonb, 'Falconry only.', 'ducks', 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  -- ── Dusky ducks (mottled, Mexican-like, black ducks and hybrids) ──────────
  ('Dusky Duck - High Plains Mallard Management Unit', 'mottled-duck', 'general', DATE '2026-10-31', DATE '2027-01-31', 'High Plains Mallard Management Unit',
   '{"daily": 1, "possession": 3}'::jsonb, 'Mottled, Mexican-like and black ducks and their hybrids; 1 per day within the 6-duck aggregate. Closed the first five days of the season.', NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Dusky Duck (Split 1) - North Zone', 'mottled-duck', 'general', DATE '2026-11-19', DATE '2026-11-29', 'North Zone',
   '{"daily": 1, "possession": 3}'::jsonb, 'Mottled, Mexican-like and black ducks and their hybrids; 1 per day within the 6-duck aggregate. Closed the first five days of the season.', NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Dusky Duck (Split 2) - North Zone', 'mottled-duck', 'general', DATE '2026-12-05', DATE '2027-01-31', 'North Zone',
   '{"daily": 1, "possession": 3}'::jsonb, 'Mottled, Mexican-like and black ducks and their hybrids; 1 per day within the 6-duck aggregate.', NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Dusky Duck (Split 1) - South Zone', 'mottled-duck', 'general', DATE '2026-11-12', DATE '2026-11-29', 'South Zone',
   '{"daily": 1, "possession": 3}'::jsonb, 'Mottled, Mexican-like and black ducks and their hybrids; 1 per day within the 6-duck aggregate. Closed the first five days of the season.', NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  ('Dusky Duck (Split 2) - South Zone', 'mottled-duck', 'general', DATE '2026-12-12', DATE '2027-01-31', 'South Zone',
   '{"daily": 1, "possession": 3}'::jsonb, 'Mottled, Mexican-like and black ducks and their hybrids; 1 per day within the 6-duck aggregate.', NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck'),
  -- ── September teal (statewide) ─────────────────────────────────────────────
  ('September Teal-Only Season - Statewide', 'blue-winged-teal', 'teal', DATE '2026-09-19', DATE '2026-09-27', 'Statewide',
   '{"daily": 6, "possession": 18, "notes": "Teal only (blue-winged, green-winged, cinnamon), in the aggregate."}'::jsonb, 'Teal only.', NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/counties/colorado'),
  ('September Teal-Only Season - Statewide', 'green-winged-teal', 'teal', DATE '2026-09-19', DATE '2026-09-27', 'Statewide',
   '{"daily": 6, "possession": 18, "notes": "Teal only (blue-winged, green-winged, cinnamon), in the aggregate."}'::jsonb, 'Teal only.', NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/counties/colorado'),
  -- ── Geese: Eastern Zone ────────────────────────────────────────────────────
  ('Early Canada Geese - Eastern Zone', 'canada-goose', 'general', DATE '2026-09-12', DATE '2026-09-27', 'Eastern Zone',
   '{"daily": 5, "possession": 15}'::jsonb, NULL, NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose'),
  ('Dark Geese - Eastern Zone', 'canada-goose', 'general', DATE '2026-11-07', DATE '2027-01-31', 'Eastern Zone',
   '{"daily": 5, "possession": 15, "speciesLimits": {"white-fronted-goose": 2}, "notes": "5 dark geese in the aggregate, no more than 2 white-fronted geese."}'::jsonb, 'No more than 2 white-fronted geese per day.', NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose'),
  ('Dark Geese - Eastern Zone', 'white-fronted-goose', 'general', DATE '2026-11-07', DATE '2027-01-31', 'Eastern Zone',
   '{"daily": 2, "possession": 6, "notes": "Within the 5 dark-goose aggregate."}'::jsonb, 'No more than 2 white-fronted geese per day.', NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose'),
  ('Light Geese - Eastern Zone', 'snow-goose', 'general', DATE '2026-11-07', DATE '2027-02-19', 'Eastern Zone',
   '{"daily": 5, "possession": 15, "notes": "Light geese in the aggregate."}'::jsonb, NULL, NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose'),
  ('Light Geese - Eastern Zone', 'ross-goose', 'general', DATE '2026-11-07', DATE '2027-02-19', 'Eastern Zone',
   '{"daily": 5, "possession": 15, "notes": "Light geese in the aggregate."}'::jsonb, NULL, NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose'),
  -- ── Geese: Western Zone (includes the Panhandle) ───────────────────────────
  ('Dark Geese - Western Zone', 'canada-goose', 'general', DATE '2026-11-07', DATE '2027-02-07', 'Western Zone',
   '{"daily": 5, "possession": 15, "notes": "Dark geese in the aggregate."}'::jsonb, NULL, NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose'),
  ('Dark Geese - Western Zone', 'white-fronted-goose', 'general', DATE '2026-11-07', DATE '2027-02-07', 'Western Zone',
   '{"daily": 5, "possession": 15, "notes": "Dark geese in the aggregate."}'::jsonb, NULL, NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose'),
  ('Light Geese - Western Zone', 'snow-goose', 'general', DATE '2026-11-07', DATE '2027-02-07', 'Western Zone',
   '{"daily": 5, "possession": 15, "notes": "Light geese in the aggregate."}'::jsonb, NULL, NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose'),
  ('Light Geese - Western Zone', 'ross-goose', 'general', DATE '2026-11-07', DATE '2027-02-07', 'Western Zone',
   '{"daily": 5, "possession": 15, "notes": "Light geese in the aggregate."}'::jsonb, NULL, NULL, 'https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose')
)
INSERT INTO seasons (state_id, species_id, name, season_type, start_date, end_date, year,
                     bag_limit, shooting_hours, restrictions, units, source_url, metadata)
SELECT s.id, sp.id, v.name, v.season_type, v.start_date, v.end_date, 2026,
       COALESCE(v.bag, (SELECT b FROM duck_bag)),
       jsonb_build_object('start', 'one-half hour before sunrise', 'end', 'sunset'),
       COALESCE(v.restrictions,
         CASE WHEN v.applies_to = 'ducks' THEN
           '6 ducks in the aggregate, including mergansers: no more than 5 mallards (only 2 hens), 3 wood ducks, 3 pintails, 2 redheads, 2 canvasbacks, 1 scaup and 1 "dusky" duck. Dusky ducks are closed the first five days of the season in each zone.'
         END),
       jsonb_build_array(v.units), v.source_url,
       jsonb_strip_nulls(jsonb_build_object('appliesTo', v.applies_to, 'source', 'tpwd',
                                            'enteredFrom', 'TPWD Outdoor Annual, verified 2026-10-26'))
FROM v
JOIN states s ON s.code = 'TX'
JOIN species sp ON sp.slug = v.slug;

DO $$ DECLARE n int; d int; BEGIN
  SELECT count(*) INTO n FROM seasons se JOIN states s ON s.id = se.state_id WHERE s.code = 'TX' AND se.year = 2026;
  SELECT count(*) INTO d FROM seasons se JOIN states s ON s.id = se.state_id
    WHERE s.code = 'TX' AND se.year = 2026 AND se.metadata->>'appliesTo' = 'ducks';
  IF n <> 30 OR d <> 14 THEN RAISE EXCEPTION 'expected 30 TX 2026 seasons (14 all-duck), got % (%)', n, d; END IF;
END $$;

SELECT se.name, sp.slug, se.start_date::date, se.end_date::date, se.bag_limit->>'daily' AS daily
FROM seasons se JOIN states s ON s.id = se.state_id JOIN species sp ON sp.id = se.species_id
WHERE s.code = 'TX' AND se.year = 2026 ORDER BY se.units->>0, se.start_date, sp.slug;

COMMIT;
