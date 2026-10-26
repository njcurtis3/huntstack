-- ===========================================
-- INHS Forbes Biological Station aerial inventory locations (2026-10-26)
--
-- The weekly Illinois River / central Mississippi River waterfowl inventory is stored
-- as two river-wide locations (see huntstack_scrapers/parsers/inhs_forbes_pdf.py).
-- Illinois was not in the states table. Idempotent: safe to re-run.
--
-- metadata is written as a real jsonb object (jsonb_build_object), not a JSON string:
-- double-encoded metadata makes metadata->>'flyway' return NULL in SQL.
-- ===========================================

INSERT INTO states (code, name, agency_name, agency_url, metadata)
VALUES (
  'IL', 'Illinois', 'Illinois Department of Natural Resources', 'https://dnr.illinois.gov',
  jsonb_build_object('flyways', jsonb_build_array('mississippi'))
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO locations (name, location_type, state_id, description, website_url, center_point, metadata)
SELECT v.name, 'wildlife_refuge', s.id, v.description, v.website_url,
       jsonb_build_object('lat', v.lat, 'lng', v.lng),
       jsonb_build_object(
         'flyway', 'mississippi',
         'source', 'inhs',
         'surveyUrl', 'https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/',
         'isStateAggregate', true
       )
FROM (VALUES
  ('Illinois River - INHS Aerial Inventory',
   'Weekly INHS aerial waterfowl inventory of 23 locations along 214 miles of the Illinois River (Spring Valley to Grafton), Sept-Jan. Counts are river-wide totals.',
   'https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/',
   40.30, -90.06),
  ('Central Mississippi River - INHS Aerial Inventory',
   'Weekly INHS aerial waterfowl inventory of 18 locations along 272 miles of the central Mississippi River (Alton to Moline), Sept-Jan. Counts are river-wide totals.',
   'https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/',
   40.40, -91.20)
) AS v(name, description, website_url, lat, lng)
JOIN states s ON s.code = 'IL'
ON CONFLICT (name, location_type) DO NOTHING;

SELECT l.name, s.code, l.center_point, l.metadata->>'flyway' AS flyway
FROM locations l JOIN states s ON s.id = l.state_id
WHERE l.metadata->>'source' = 'inhs';
