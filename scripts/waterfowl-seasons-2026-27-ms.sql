-- ===========================================
-- Mississippi: the states row and the 2026-27 waterfowl seasons, hand-entered from MDWFP (2026-11-26)
--
-- Verified against (both agree on every date and limit):
--   https://www.mdwfp.com/wildlife-hunting/hunting-seasons-and-bag-limits  ("2026-2027 Seasons")
--   2026-2027 Digest of Migratory Game Bird Regulations (PDF)
--   https://www.mdwfp.com/sites/default/files/2026-05/Migratory%20Gamebird%20Digest%2026-27_2.pdf
--
-- One statewide zone for ducks and geese (the digest lists no zones). Shooting hours for all
-- migratory game birds: one-half hour before sunrise to sunset; the light goose conservation
-- order runs to one-half hour after sunset. Possession is 3x daily (the digest says so) except
-- light geese (none).
--
-- Not included (no species row): coots and mergansers (in the duck bag notes), brant (in the
-- goose notes), dove, woodcock, snipe, gallinules, rails, crows.
--
-- Model: same as scripts/waterfowl-seasons-2026-27-ar-ks-nm-ok.sql. One row per season segment;
-- seasons covering every duck hang off mallard with metadata.appliesTo = 'ducks'.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO states (code, name, agency_name, agency_url, regulations_url)
VALUES ('MS', 'Mississippi', 'Mississippi Dept. of Wildlife, Fisheries & Parks', 'https://www.mdwfp.com/',
        'https://www.mdwfp.com/wildlife-hunting/hunting-seasons-and-bag-limits')
ON CONFLICT (code) DO UPDATE SET agency_name = EXCLUDED.agency_name, agency_url = EXCLUDED.agency_url,
  regulations_url = COALESCE(states.regulations_url, EXCLUDED.regulations_url), updated_at = now();

DELETE FROM seasons se USING states s WHERE se.state_id = s.id AND s.code = 'MS' AND se.year = 2026;

WITH
duck_bag(b, r) AS (VALUES (
  jsonb_build_object('daily', 6, 'possession', 18,
    'speciesLimits', jsonb_build_object('mallard', 4, 'wood-duck', 3, 'pintail', 3, 'redhead', 2, 'canvasback', 2, 'scaup', 1, 'mottled-duck', 1),
    'notes', 'No more than 2 of the 4 mallards may be females; 2 black ducks. Scaup: 1 a day through Dec. 17, 2 a day Dec. 18-Jan. 31. Mergansers are a separate limit of 5 (no more than 2 hooded). Coots 15. Possession three times the daily limit.'),
  '6 ducks: no more than 4 mallards (2 females), 3 wood ducks, 2 redheads, 3 pintails, 2 canvasbacks, 1 mottled duck and 2 black ducks. Scaup: 1 a day through Dec. 17, then 2 a day Dec. 18-Jan. 31. Mergansers: 5 (2 hooded). Coots: 15. Possession three times the daily limit. Non-toxic shot only.')
),
hrs(h) AS (VALUES ('{"start": "30 minutes before sunrise", "end": "sunset"}'::jsonb)),
src(u) AS (VALUES ('https://www.mdwfp.com/wildlife-hunting/hunting-seasons-and-bag-limits')),
v(name, slug, season_type, start_date, end_date, ducks, bag, hours, restrictions) AS (VALUES
  ('Regular Duck Season (Split 1) - Statewide', 'mallard', 'general', DATE '2026-11-27', DATE '2026-11-29', true, NULL::jsonb, NULL::jsonb, NULL),
  ('Regular Duck Season (Split 2) - Statewide', 'mallard', 'general', DATE '2026-12-04', DATE '2026-12-06', true, NULL, NULL, NULL),
  ('Regular Duck Season (Split 3) - Statewide', 'mallard', 'general', DATE '2026-12-09', DATE '2027-01-31', true, NULL, NULL, NULL),
  ('Youth, Veterans and Active Military Waterfowl Days - Statewide', 'mallard', 'youth', DATE '2027-02-06', DATE '2027-02-07', true, NULL, NULL,
   'Youth 15 and under, veterans and active military only; youth must be with an adult 21 or older licensed to hunt waterfowl in Mississippi. Same limits and hours as the regular season.'),
  ('September Teal Season - Statewide', 'blue-winged-teal', 'teal', DATE '2026-09-19', DATE '2026-09-27', false,
   '{"daily": 6, "possession": 18, "notes": "All teal species, in the aggregate."}'::jsonb, NULL, 'Teal only.'),
  ('September Teal Season - Statewide', 'green-winged-teal', 'teal', DATE '2026-09-19', DATE '2026-09-27', false,
   '{"daily": 6, "possession": 18, "notes": "All teal species, in the aggregate."}'::jsonb, NULL, 'Teal only.'),
  ('September Canada Goose - Statewide', 'canada-goose', 'general', DATE '2026-09-01', DATE '2026-09-30', false,
   '{"daily": 5, "possession": 15}'::jsonb, NULL, 'Roebuck Lake (Leflore County) is closed to Canada goose hunting.'),
  ('Canada Goose (Split 1) - Statewide', 'canada-goose', 'general', DATE '2026-11-13', DATE '2026-11-29', false,
   '{"daily": 5, "possession": 15, "notes": "Brant open on the same dates: 1 a day, 3 in possession."}'::jsonb, NULL, 'Roebuck Lake (Leflore County) is closed to Canada goose hunting.'),
  ('Canada Goose (Split 2) - Statewide', 'canada-goose', 'general', DATE '2026-12-04', DATE '2026-12-06', false,
   '{"daily": 5, "possession": 15, "notes": "Brant open on the same dates: 1 a day, 3 in possession."}'::jsonb, NULL, 'Roebuck Lake (Leflore County) is closed to Canada goose hunting.'),
  ('Canada Goose (Split 3) - Statewide', 'canada-goose', 'general', DATE '2026-12-09', DATE '2027-01-31', false,
   '{"daily": 5, "possession": 15, "notes": "Brant open on the same dates: 1 a day, 3 in possession."}'::jsonb, NULL, 'Roebuck Lake (Leflore County) is closed to Canada goose hunting.'),
  ('White-fronted Goose (Split 1) - Statewide', 'white-fronted-goose', 'general', DATE '2026-11-13', DATE '2026-11-29', false, '{"daily": 3, "possession": 9}'::jsonb, NULL, NULL),
  ('White-fronted Goose (Split 2) - Statewide', 'white-fronted-goose', 'general', DATE '2026-12-04', DATE '2026-12-06', false, '{"daily": 3, "possession": 9}'::jsonb, NULL, NULL),
  ('White-fronted Goose (Split 3) - Statewide', 'white-fronted-goose', 'general', DATE '2026-12-09', DATE '2027-01-31', false, '{"daily": 3, "possession": 9}'::jsonb, NULL, NULL),
  ('Light Geese (Split 1) - Statewide', 'snow-goose', 'general', DATE '2026-11-13', DATE '2026-11-29', false, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL),
  ('Light Geese (Split 1) - Statewide', 'ross-goose', 'general', DATE '2026-11-13', DATE '2026-11-29', false, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL),
  ('Light Geese (Split 2) - Statewide', 'snow-goose', 'general', DATE '2026-12-04', DATE '2026-12-06', false, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL),
  ('Light Geese (Split 2) - Statewide', 'ross-goose', 'general', DATE '2026-12-04', DATE '2026-12-06', false, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL),
  ('Light Geese (Split 3) - Statewide', 'snow-goose', 'general', DATE '2026-12-09', DATE '2027-01-31', false, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL),
  ('Light Geese (Split 3) - Statewide', 'ross-goose', 'general', DATE '2026-12-09', DATE '2027-01-31', false, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL)
),
co(split, start_date, end_date) AS (VALUES
  (1, DATE '2026-10-01', DATE '2026-11-12'),
  (2, DATE '2026-11-30', DATE '2026-12-03'),
  (3, DATE '2027-02-01', DATE '2027-02-05'),
  (4, DATE '2027-02-08', DATE '2027-03-31')
),
rows AS (
  SELECT name, slug, season_type, start_date, end_date, ducks, bag, hours, restrictions FROM v
  UNION ALL
  SELECT 'Light Goose Conservation Order (Split ' || co.split || ') - Statewide', sp.slug, 'conservation_order', co.start_date, co.end_date, false,
         '{"notes": "No daily or possession limit for snow, blue or Ross''s geese."}'::jsonb,
         '{"start": "30 minutes before sunrise", "end": "30 minutes after sunset"}'::jsonb,
         'Free Light Goose Conservation Order permit (mdwfp.com/wildlife-hunting/light-goose-permit-application), a Mississippi hunting license and state waterfowl stamp. Electronic calls and unplugged shotguns allowed; non-toxic shot. No federal duck stamp needed.'
  FROM co CROSS JOIN (VALUES ('snow-goose'), ('ross-goose')) AS sp(slug)
)
INSERT INTO seasons (state_id, species_id, name, season_type, start_date, end_date, year,
                     bag_limit, shooting_hours, restrictions, units, source_url, metadata)
SELECT s.id, sp.id, r.name, r.season_type, r.start_date, r.end_date, 2026,
       CASE WHEN r.ducks THEN d.b ELSE r.bag END,
       COALESCE(r.hours, h.h),
       CASE WHEN r.ducks AND r.restrictions IS NULL THEN d.r ELSE r.restrictions END,
       jsonb_build_array('Statewide'), src.u,
       jsonb_strip_nulls(jsonb_build_object('appliesTo', CASE WHEN r.ducks THEN 'ducks' END, 'source', 'ms_agency',
                                            'enteredFrom', 'MDWFP 2026-27 seasons page and migratory game bird digest, verified 2026-11-26'))
FROM rows r
JOIN states s ON s.code = 'MS'
JOIN species sp ON sp.slug = r.slug
CROSS JOIN duck_bag d CROSS JOIN hrs h CROSS JOIN src;

DO $$ BEGIN
  IF (SELECT count(*) FROM seasons se JOIN states s ON s.id = se.state_id WHERE s.code = 'MS' AND se.year = 2026) <> 27 THEN
    RAISE EXCEPTION 'expected 27 MS 2026 seasons, got %',
      (SELECT count(*) FROM seasons se JOIN states s ON s.id = se.state_id WHERE s.code = 'MS' AND se.year = 2026);
  END IF;
END $$;

SELECT se.name, sp.slug, se.start_date::date, se.end_date::date, se.bag_limit->>'daily' AS daily
FROM seasons se JOIN states s ON s.id = se.state_id JOIN species sp ON sp.id = se.species_id
WHERE s.code = 'MS' AND se.year = 2026 ORDER BY se.start_date, sp.slug;

COMMIT;
