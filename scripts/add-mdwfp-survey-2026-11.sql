-- ===========================================
-- Mississippi: the MDWFP aerial waterfowl survey (2026-11-26)
--
-- Source: MDWFP Aerial Waterfowl Survey Report, November 17-20, 2026 (PDF)
--   https://www.mdwfp.com/sites/default/files/2026-11/Nov%202026%20Aerial%20Survey%20Report_0.pdf
-- The survey covers the Mississippi Delta (randomized transects), not the whole state; the location
-- says so. Stored like the AGFC survey: mallards, and other ducks = total ducks - mallards
-- (Table 1's dabbler and diver columns add up to within 1 of its total; the total wins).
--
-- Nov 2026: flown Nov 17-20, stored under Nov 20 (the last flight day). 548 mallards,
-- 21,864 total ducks (Table 2: -98% and -91% against the November average).
-- History: Table 1's November estimates for 2007-2025 (no survey in 2012 or 2013). The report
-- gives no flight dates for them, so each is stored under Nov 15 of that year with
-- metadata.dateApproximate. They feed the card's same-month long-term average (CONSTRAINTS §7.6c).
-- No geese: none were seen in Nov 2026, and Table 1 has no goose columns.
-- Run after scripts/waterfowl-seasons-2026-27-ms.sql (it adds the MS states row). Re-runnable.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO locations (state_id, name, location_type, center_point, description, website_url, metadata)
SELECT s.id, 'Mississippi - MDWFP Aerial Survey', 'wildlife_refuge', '{"lat": 33.5, "lng": -90.6}'::jsonb,
       'MDWFP aerial waterfowl survey of the Mississippi Delta (randomized transects), flown in November, December and January.',
       'https://www.mdwfp.com/wildlife-hunting/wildlife-species-program/waterfowl-program',
       '{"flyway": "mississippi", "source": "mdwfp", "surveyUrl": "https://www.mdwfp.com/wildlife-hunting/wildlife-species-program/waterfowl-program", "isStateAggregate": true, "surveyArea": "Mississippi Delta"}'::jsonb
FROM states s
WHERE s.code = 'MS' AND NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Mississippi - MDWFP Aerial Survey');

DELETE FROM refuge_counts rc USING locations l
WHERE rc.location_id = l.id AND l.name = 'Mississippi - MDWFP Aerial Survey';

CREATE TEMP TABLE ins (survey_date date, mallards int, total int, approx boolean) ON COMMIT DROP;
INSERT INTO ins VALUES
  (DATE '2007-11-15', 25872, 88106, true),
  (DATE '2008-11-15', 30748, 232081, true),
  (DATE '2009-11-15', 24281, 240117, true),
  (DATE '2010-11-15', 10481, 181344, true),
  (DATE '2011-11-15', 43845, 308596, true),
  (DATE '2014-11-15', 88005, 397215, true),
  (DATE '2015-11-15', 30933, 142802, true),
  (DATE '2016-11-15', 36540, 373249, true),
  (DATE '2017-11-15', 88019, 500591, true),
  (DATE '2018-11-15', 55258, 214371, true),
  (DATE '2019-11-15', 26866, 328390, true),
  (DATE '2020-11-15', 40100, 266194, true),
  (DATE '2021-11-15', 27462, 242344, true),
  (DATE '2022-11-15', 33149, 182069, true),
  (DATE '2023-11-15', 16446, 86035, true),
  (DATE '2024-11-15', 5741, 87011, true),
  (DATE '2025-11-15', 22231, 305910, true),
  (DATE '2026-11-20', 548, 21864, false);

INSERT INTO refuge_counts (location_id, species_id, survey_date, count, survey_type, source_url, notes, metadata)
SELECT l.id, sp.id, i.survey_date, CASE WHEN sp.slug = 'mallard' THEN i.mallards ELSE i.total - i.mallards END,
       'aerial_monthly', 'https://www.mdwfp.com/sites/default/files/2026-11/Nov%202026%20Aerial%20Survey%20Report_0.pdf',
       CASE WHEN i.approx THEN 'November survey estimate from the Nov 2026 report''s Table 1; flight dates not given.'
            ELSE 'Flown Nov 17-20, 2026. Very dry; lowest November estimates on record.' END,
       jsonb_strip_nulls(jsonb_build_object('source', 'mdwfp', 'raw_species_name', sp.slug, 'totalDucks', i.total,
         'dateApproximate', CASE WHEN i.approx THEN true END, 'entered', '2026-11-26'))
FROM ins i
CROSS JOIN (SELECT id, slug FROM species WHERE slug IN ('mallard', 'other-ducks')) sp
JOIN locations l ON l.name = 'Mississippi - MDWFP Aerial Survey';

DO $$ BEGIN
  IF (SELECT count(*) FROM refuge_counts rc JOIN locations l ON l.id = rc.location_id
      WHERE l.name = 'Mississippi - MDWFP Aerial Survey') <> 36 THEN
    RAISE EXCEPTION 'expected 36 MDWFP rows';
  END IF;
END $$;

SELECT rc.survey_date::date, sum(rc.count) FILTER (WHERE sp.slug = 'mallard') AS mallards, sum(rc.count) AS total_ducks
FROM refuge_counts rc JOIN locations l ON l.id = rc.location_id JOIN species sp ON sp.id = rc.species_id
WHERE l.name = 'Mississippi - MDWFP Aerial Survey' GROUP BY 1 ORDER BY 1;

COMMIT;
