-- ===========================================
-- Louisiana 2026-27 waterfowl seasons, hand-entered from LDWF's 2026-2027 Louisiana
-- Hunting Regulations (2026-10-27)
--
-- Source: https://www.wlf.louisiana.gov/assets/Resources/Publications/Regulations/26LAHD.pdf
--   pp. 33-34: "2026-2027 Migratory Game Bird Schedule", "Ducks, Coots and Mergansers",
--   "Geese". The site refuses automated requests; the PDF was downloaded by the owner.
--
-- Replaces the 14 LLM-extracted LA year=2026 rows. What was wrong: youth/veterans "days"
-- stored as whole-season ranges (West Nov 7-Jan 30, East Nov 14-Feb 6); duck seasons with
-- no splits; falconry missing its December and January segments; Canada goose limit 1 but
-- no possession; light geese and white-fronted geese with no split; conservation order
-- Jan 7-Mar 7 (it is Dec 7-18 and Feb 8-Mar 7); no teal season; no source URLs.
--
-- Mottled ducks and scaup have their own rows because their limits change on day 16 of
-- each zone's season: mottled ducks closed the first 15 days then 1/day; scaup 1/day the
-- first 15 days then 2/day. East opens Nov 21 (days 1-15 = Nov 21-Dec 5); West opens
-- Nov 14 (days 1-15 = Nov 14-28).
-- Not included (no species row): black-bellied whistling duck (Oct 3-11, 4/day, permit),
-- coot, rails, gallinules, snipe, woodcock, doves. Black duck cap (1) is in the notes.
-- Backup of the replaced rows: scratchpad seasons-ar-ks-la-nm-ok-2026-backup.csv.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

DELETE FROM seasons se USING states s
WHERE se.state_id = s.id AND s.code = 'LA' AND se.year = 2026;

WITH
duck_bag AS (SELECT jsonb_build_object(
  'daily', 6, 'possession', 18,
  'speciesLimits', jsonb_build_object('mallard', 4, 'wood-duck', 3, 'pintail', 3, 'canvasback', 2, 'redhead', 2),
  'notes', 'No more than 2 of the 4 mallards may be female and 1 of the 3 pintails female; 1 black duck. Scaup: 1/day the first 15 days, then 2. Mottled ducks: closed the first 15 days, then 1. Mergansers 5 (2 hooded) in addition to ducks. Coots 15.'
) AS b),
v(name, slug, season_type, start_date, end_date, units, bag, hrs, restrictions, applies_to) AS (VALUES
  -- ── Ducks: West Zone ───────────────────────────────────────────────────────
  ('Youth and Veterans Waterfowl Day 1 - West Zone', 'mallard', 'youth', DATE '2026-11-07', DATE '2026-11-07', 'West Zone', NULL::jsonb, NULL::jsonb,
   'Youths 17 and younger (with a non-hunting adult 18+) and veterans/active military only. Ducks, geese, mergansers, coots and gallinules; regular-season limits, except 0 mottled ducks and 1 scaup (before the regular season).', 'ducks'),
  ('Regular Duck Season (Split 1) - West Zone', 'mallard', 'general', DATE '2026-11-14', DATE '2026-12-06', 'West Zone', NULL, NULL, NULL, 'ducks'),
  ('Regular Duck Season (Split 2) - West Zone', 'mallard', 'general', DATE '2026-12-19', DATE '2027-01-24', 'West Zone', NULL, NULL, NULL, 'ducks'),
  ('Youth and Veterans Waterfowl Day 2 - West Zone', 'mallard', 'youth', DATE '2027-01-30', DATE '2027-01-30', 'West Zone', NULL, NULL,
   'Youths 17 and younger (with a non-hunting adult 18+) and veterans/active military only. Ducks, geese, mergansers, coots and gallinules; regular-season limits (1 mottled duck and 2 scaup after the regular season).', 'ducks'),
  ('Scaup (first 15 days) - West Zone', 'scaup', 'general', DATE '2026-11-14', DATE '2026-11-28', 'West Zone', '{"daily": 1, "possession": 3, "notes": "Within the 6-duck aggregate; 2 per day from the 16th day."}'::jsonb, NULL, NULL, NULL),
  ('Scaup (Split 1) - West Zone', 'scaup', 'general', DATE '2026-11-29', DATE '2026-12-06', 'West Zone', '{"daily": 2, "possession": 6, "notes": "Within the 6-duck aggregate."}'::jsonb, NULL, NULL, NULL),
  ('Scaup (Split 2) - West Zone', 'scaup', 'general', DATE '2026-12-19', DATE '2027-01-24', 'West Zone', '{"daily": 2, "possession": 6, "notes": "Within the 6-duck aggregate."}'::jsonb, NULL, NULL, NULL),
  ('Mottled Duck (Split 1) - West Zone', 'mottled-duck', 'general', DATE '2026-11-29', DATE '2026-12-06', 'West Zone', '{"daily": 1, "possession": 3, "notes": "Within the 6-duck aggregate."}'::jsonb, NULL, 'Closed the first 15 days of the season.', NULL),
  ('Mottled Duck (Split 2) - West Zone', 'mottled-duck', 'general', DATE '2026-12-19', DATE '2027-01-24', 'West Zone', '{"daily": 1, "possession": 3, "notes": "Within the 6-duck aggregate."}'::jsonb, NULL, NULL, NULL),
  ('Falconry Duck Season (Split 1) - West Zone', 'mallard', 'falconry', DATE '2026-11-05', DATE '2026-11-13', 'West Zone', '{"daily": 3, "possession": 9, "notes": "All permitted migratory game birds, singly or in the aggregate."}'::jsonb, NULL, 'Falconry only.', 'ducks'),
  ('Falconry Duck Season (Split 2) - West Zone', 'mallard', 'falconry', DATE '2026-12-07', DATE '2026-12-18', 'West Zone', '{"daily": 3, "possession": 9, "notes": "All permitted migratory game birds, singly or in the aggregate."}'::jsonb, NULL, 'Falconry only.', 'ducks'),
  ('Falconry Duck Season (Split 3) - West Zone', 'mallard', 'falconry', DATE '2027-01-25', DATE '2027-01-31', 'West Zone', '{"daily": 3, "possession": 9, "notes": "All permitted migratory game birds, singly or in the aggregate."}'::jsonb, NULL, 'Falconry only.', 'ducks'),
  -- ── Ducks: East Zone ───────────────────────────────────────────────────────
  ('Youth and Veterans Waterfowl Day 1 - East Zone', 'mallard', 'youth', DATE '2026-11-14', DATE '2026-11-14', 'East Zone', NULL, NULL,
   'Youths 17 and younger (with a non-hunting adult 18+) and veterans/active military only. Ducks, geese, mergansers, coots and gallinules; regular-season limits, except 0 mottled ducks and 1 scaup (before the regular season).', 'ducks'),
  ('Regular Duck Season (Split 1) - East Zone', 'mallard', 'general', DATE '2026-11-21', DATE '2026-12-06', 'East Zone', NULL, NULL, NULL, 'ducks'),
  ('Regular Duck Season (Split 2) - East Zone', 'mallard', 'general', DATE '2026-12-19', DATE '2027-01-31', 'East Zone', NULL, NULL, NULL, 'ducks'),
  ('Youth and Veterans Waterfowl Day 2 - East Zone', 'mallard', 'youth', DATE '2027-02-06', DATE '2027-02-06', 'East Zone', NULL, NULL,
   'Youths 17 and younger (with a non-hunting adult 18+) and veterans/active military only. Ducks, geese, mergansers, coots and gallinules; regular-season limits (1 mottled duck and 2 scaup after the regular season).', 'ducks'),
  ('Scaup (first 15 days) - East Zone', 'scaup', 'general', DATE '2026-11-21', DATE '2026-12-05', 'East Zone', '{"daily": 1, "possession": 3, "notes": "Within the 6-duck aggregate; 2 per day from the 16th day."}'::jsonb, NULL, NULL, NULL),
  ('Scaup (Split 1) - East Zone', 'scaup', 'general', DATE '2026-12-06', DATE '2026-12-06', 'East Zone', '{"daily": 2, "possession": 6, "notes": "Within the 6-duck aggregate."}'::jsonb, NULL, NULL, NULL),
  ('Scaup (Split 2) - East Zone', 'scaup', 'general', DATE '2026-12-19', DATE '2027-01-31', 'East Zone', '{"daily": 2, "possession": 6, "notes": "Within the 6-duck aggregate."}'::jsonb, NULL, NULL, NULL),
  ('Mottled Duck (Split 1) - East Zone', 'mottled-duck', 'general', DATE '2026-12-06', DATE '2026-12-06', 'East Zone', '{"daily": 1, "possession": 3, "notes": "Within the 6-duck aggregate."}'::jsonb, NULL, 'Closed the first 15 days of the season.', NULL),
  ('Mottled Duck (Split 2) - East Zone', 'mottled-duck', 'general', DATE '2026-12-19', DATE '2027-01-31', 'East Zone', '{"daily": 1, "possession": 3, "notes": "Within the 6-duck aggregate."}'::jsonb, NULL, NULL, NULL),
  ('Falconry Duck Season (Split 1) - East Zone', 'mallard', 'falconry', DATE '2026-11-05', DATE '2026-11-20', 'East Zone', '{"daily": 3, "possession": 9, "notes": "All permitted migratory game birds, singly or in the aggregate."}'::jsonb, NULL, 'Falconry only.', 'ducks'),
  ('Falconry Duck Season (Split 2) - East Zone', 'mallard', 'falconry', DATE '2026-12-07', DATE '2026-12-18', 'East Zone', '{"daily": 3, "possession": 9, "notes": "All permitted migratory game birds, singly or in the aggregate."}'::jsonb, NULL, 'Falconry only.', 'ducks'),
  -- ── Teal (statewide) ───────────────────────────────────────────────────────
  ('September Teal-Only Season - Statewide', 'blue-winged-teal', 'teal', DATE '2026-09-19', DATE '2026-09-27', 'Statewide', '{"daily": 6, "possession": 18, "notes": "Blue-winged, green-winged and cinnamon teal."}'::jsonb, NULL, 'Teal only.', NULL),
  ('September Teal-Only Season - Statewide', 'green-winged-teal', 'teal', DATE '2026-09-19', DATE '2026-09-27', 'Statewide', '{"daily": 6, "possession": 18, "notes": "Blue-winged, green-winged and cinnamon teal."}'::jsonb, NULL, 'Teal only.', NULL),
  -- ── Geese (same dates in both zones) ───────────────────────────────────────
  ('Canada Geese (Split 1) - Statewide', 'canada-goose', 'general', DATE '2026-11-14', DATE '2026-12-06', 'Statewide', '{"daily": 1, "possession": 3}'::jsonb, NULL,
   'Closed in part of southwest Louisiana (south of LA 82 / Intracoastal Canal between the Texas line and Freshwater Bayou Canal, plus Lake Arthur and the Mermentau River south of the LA 14 bridge).', NULL),
  ('Canada Geese (Split 2) - Statewide', 'canada-goose', 'general', DATE '2026-12-19', DATE '2027-02-07', 'Statewide', '{"daily": 1, "possession": 3}'::jsonb, NULL,
   'Closed in part of southwest Louisiana (south of LA 82 / Intracoastal Canal between the Texas line and Freshwater Bayou Canal, plus Lake Arthur and the Mermentau River south of the LA 14 bridge).', NULL),
  ('White-fronted Geese (Split 1) - Statewide', 'white-fronted-goose', 'general', DATE '2026-11-14', DATE '2026-12-06', 'Statewide', '{"daily": 3, "possession": 9}'::jsonb, NULL, NULL, NULL),
  ('White-fronted Geese (Split 2) - Statewide', 'white-fronted-goose', 'general', DATE '2026-12-19', DATE '2027-02-07', 'Statewide', '{"daily": 3, "possession": 9}'::jsonb, NULL, NULL, NULL),
  ('Light Geese (Split 1) - Statewide', 'snow-goose', 'general', DATE '2026-11-14', DATE '2026-12-06', 'Statewide', '{"daily": 20, "notes": "Snow, blue and Ross'' geese. No possession limit."}'::jsonb, NULL, NULL, NULL),
  ('Light Geese (Split 1) - Statewide', 'ross-goose', 'general', DATE '2026-11-14', DATE '2026-12-06', 'Statewide', '{"daily": 20, "notes": "Snow, blue and Ross'' geese. No possession limit."}'::jsonb, NULL, NULL, NULL),
  ('Light Geese (Split 2) - Statewide', 'snow-goose', 'general', DATE '2026-12-19', DATE '2027-02-07', 'Statewide', '{"daily": 20, "notes": "Snow, blue and Ross'' geese. No possession limit."}'::jsonb, NULL, NULL, NULL),
  ('Light Geese (Split 2) - Statewide', 'ross-goose', 'general', DATE '2026-12-19', DATE '2027-02-07', 'Statewide', '{"daily": 20, "notes": "Snow, blue and Ross'' geese. No possession limit."}'::jsonb, NULL, NULL, NULL),
  ('Light Goose Conservation Order (Split 1) - Statewide', 'snow-goose', 'conservation_order', DATE '2026-12-07', DATE '2026-12-18', 'Statewide', '{"notes": "No bag or possession limit."}'::jsonb,
   '{"start": "one-half hour before sunrise", "end": "one-half hour after sunset"}'::jsonb, 'Snow, blue and Ross'' geese only. Electronic calls and unplugged shotguns allowed.', NULL),
  ('Light Goose Conservation Order (Split 1) - Statewide', 'ross-goose', 'conservation_order', DATE '2026-12-07', DATE '2026-12-18', 'Statewide', '{"notes": "No bag or possession limit."}'::jsonb,
   '{"start": "one-half hour before sunrise", "end": "one-half hour after sunset"}'::jsonb, 'Snow, blue and Ross'' geese only. Electronic calls and unplugged shotguns allowed.', NULL),
  ('Light Goose Conservation Order (Split 2) - Statewide', 'snow-goose', 'conservation_order', DATE '2027-02-08', DATE '2027-03-07', 'Statewide', '{"notes": "No bag or possession limit."}'::jsonb,
   '{"start": "one-half hour before sunrise", "end": "one-half hour after sunset"}'::jsonb, 'Snow, blue and Ross'' geese only. Electronic calls and unplugged shotguns allowed.', NULL),
  ('Light Goose Conservation Order (Split 2) - Statewide', 'ross-goose', 'conservation_order', DATE '2027-02-08', DATE '2027-03-07', 'Statewide', '{"notes": "No bag or possession limit."}'::jsonb,
   '{"start": "one-half hour before sunrise", "end": "one-half hour after sunset"}'::jsonb, 'Snow, blue and Ross'' geese only. Electronic calls and unplugged shotguns allowed.', NULL)
)
INSERT INTO seasons (state_id, species_id, name, season_type, start_date, end_date, year,
                     bag_limit, shooting_hours, restrictions, units, source_url, metadata)
SELECT s.id, sp.id, v.name, v.season_type, v.start_date, v.end_date, 2026,
       COALESCE(v.bag, (SELECT b FROM duck_bag)),
       COALESCE(v.hrs, '{"start": "one-half hour before sunrise", "end": "sunset"}'::jsonb),
       COALESCE(v.restrictions,
         CASE WHEN v.applies_to = 'ducks' THEN
           '6 ducks: no more than 4 mallards (2 female), 3 wood ducks, 2 canvasbacks, 2 redheads, 1 black duck and 3 pintails (1 female). Scaup 1 per day the first 15 days, then 2. Mottled ducks closed the first 15 days, then 1. Mergansers 5 (2 hooded) and coots 15 in addition. Possession three times the daily bag.'
         END),
       jsonb_build_array(v.units),
       'https://www.wlf.louisiana.gov/assets/Resources/Publications/Regulations/26LAHD.pdf',
       jsonb_strip_nulls(jsonb_build_object('appliesTo', v.applies_to, 'source', 'ldwf',
                                            'enteredFrom', 'LDWF 2026-2027 Louisiana Hunting Regulations pp. 33-34, verified 2026-10-27'))
FROM v
JOIN states s ON s.code = 'LA'
JOIN species sp ON sp.slug = v.slug;

DO $$ DECLARE n int; d int; BEGIN
  SELECT count(*) INTO n FROM seasons se JOIN states s ON s.id = se.state_id WHERE s.code = 'LA' AND se.year = 2026;
  SELECT count(*) INTO d FROM seasons se JOIN states s ON s.id = se.state_id
    WHERE s.code = 'LA' AND se.year = 2026 AND se.metadata->>'appliesTo' = 'ducks';
  IF n <> 37 OR d <> 13 THEN RAISE EXCEPTION 'expected 37 LA 2026 seasons (13 all-duck), got % (%)', n, d; END IF;
END $$;

SELECT se.name, sp.slug, se.start_date::date, se.end_date::date, se.bag_limit->>'daily' AS daily
FROM seasons se JOIN states s ON s.id = se.state_id JOIN species sp ON sp.id = se.species_id
WHERE s.code = 'LA' AND se.year = 2026 ORDER BY se.units->>0, se.start_date, sp.slug;

COMMIT;
