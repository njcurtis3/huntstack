-- ===========================================
-- Texas Panhandle / South Plains eBird areas (2026-10-26)
--
-- No Panhandle refuge publishes weekly counts, so these areas exist only to pull
-- eBird community sightings (refuges.ts -> getEBirdCountsForRefuge). Each is placed
-- over where recent waterfowl sightings cluster and asks for eBird's 50km maximum
-- radius via metadata.ebirdRadiusKm (the default for refuges is 25km).
--
-- eBird "recent observations" are the latest sighting of each species at each
-- place, not survey totals — the UI labels them as community observations.
-- Idempotent: safe to re-run. metadata is a real jsonb object, not a JSON string.
-- ===========================================

INSERT INTO locations (name, location_type, state_id, description, center_point, metadata)
SELECT v.name, 'wildlife_refuge', s.id, v.description,
       jsonb_build_object('lat', v.lat, 'lng', v.lng),
       jsonb_build_object('flyway', 'central', 'source', 'ebird', 'ebirdOnly', true, 'ebirdRadiusKm', 50)
FROM (VALUES
  ('Amarillo Area Playas (eBird)',
   'eBird community sightings within 50km of Amarillo: Canyon, Randall and Carson County playas.',
   35.15, -101.85),
  ('Lubbock Area Playas (eBird)',
   'eBird community sightings within 50km of Lubbock: city lakes and South Plains playas.',
   33.58, -101.87),
  ('Dalhart / Lake Rita Blanca (eBird)',
   'eBird community sightings within 50km of Dalhart, including Lake Rita Blanca.',
   36.04, -102.50),
  ('Hereford-Dimmitt Playas (eBird)',
   'eBird community sightings within 50km of the Hereford-Dimmitt playa belt.',
   34.70, -102.35)
) AS v(name, description, lat, lng)
JOIN states s ON s.code = 'TX'
ON CONFLICT (name, location_type) DO NOTHING;

SELECT name, center_point, metadata FROM locations WHERE metadata->>'source' = 'ebird' ORDER BY name;
