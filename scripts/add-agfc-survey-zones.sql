-- ===========================================
-- AGFC aerial survey zones (2026-10-27)
--
-- AGFC's reports give mallards and total ducks for 11 Delta zones (Table 1) and 9
-- Arkansas River Valley zones (Table 2), every survey period since November 2011
-- (parsers/agfc_zones.py). One location per zone holds those counts.
--
-- location_type 'survey_zone', not 'wildlife_refuge': a zone is a slice of the statewide
-- AGFC survey, so its birds are already in "Arkansas - AGFC Aerial Survey". Hunt
-- recommendations and the scrapers only read wildlife_refuge rows, and the API's count
-- queries skip survey_only locations, so zone counts are never added on top of the
-- statewide count. They're shown as a breakdown of it (metadata.parentLocation).
--
-- Names must match agfc_zones.location_name(): "AGFC survey zone: <zone as in the table>".
-- Idempotent: safe to re-run. metadata is a real jsonb object, not a JSON string.
-- ===========================================
\set ON_ERROR_STOP on

INSERT INTO locations (name, location_type, state_id, description, metadata)
SELECT 'AGFC survey zone: ' || v.zone, 'survey_zone', s.id,
       'AGFC aerial waterfowl survey zone (' || v.region || '): mallard and total-duck estimates from AGFC''s survey reports.',
       jsonb_build_object('flyway', 'mississippi', 'source', 'agfc', 'survey_only', true,
                          'parentLocation', 'Arkansas - AGFC Aerial Survey',
                          'region', v.region, 'zone', v.zone, 'zoneOrder', v.ord)
FROM (VALUES
  ('Delta', 'Bayou Bartholomew - Bayou Boeuf', 1),
  ('Delta', 'Bayou Macon', 2),
  ('Delta', 'Bayou Meto - Lower Arkansas', 3),
  ('Delta', 'Big Creek', 4),
  ('Delta', 'Black - Upper White', 5),
  ('Delta', 'Cache', 6),
  ('Delta', 'L''Anguille', 7),
  ('Delta', 'Lower White - Bayou Des Arc', 8),
  ('Delta', 'Little River Ditches', 9),
  ('Delta', 'Lower St. Francis', 10),
  ('Delta', 'Lower White', 11),
  ('Arkansas River Valley', 'Bigelow - Lake Conway', 12),
  ('Arkansas River Valley', 'Cadron', 13),
  ('Arkansas River Valley', 'East Dardanelle Reservoir', 14),
  ('Arkansas River Valley', 'Fourche La Fave', 15),
  ('Arkansas River Valley', 'Frog Bayou', 16),
  ('Arkansas River Valley', 'Holla Bend', 17),
  ('Arkansas River Valley', 'Petit Jean', 18),
  ('Arkansas River Valley', 'Pt. Remove - Plumerville', 19),
  ('Arkansas River Valley', 'West Dardanelle Reservoir', 20)
) AS v(region, zone, ord)
JOIN states s ON s.code = 'AR'
ON CONFLICT (name, location_type) DO NOTHING;

SELECT count(*) AS survey_zones FROM locations WHERE location_type = 'survey_zone';
