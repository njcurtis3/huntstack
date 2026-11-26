-- ===========================================
-- Mississippi refuges and WMAs with eBird sightings (2026-11-26)
--
-- Mississippi's only official count is MDWFP's aerial survey of the Delta, and its refuges and
-- WMAs don't publish waterfowl counts. These areas pull community sightings live from eBird
-- (radius = metadata.ebirdRadiusKm), like the Arkansas areas
-- (scripts/add-arkansas-ebird-locations.sql). They are also the state's weather push points:
-- push scores vote over a state's locations, and Mississippi had only the survey's one point.
--
-- Centres are each unit's largest PAD-US polygon (apps/api/src/data/public-lands.ts). Radii keep
-- neighbours from overlapping (Tallahatchie NWR / Malmaison WMA 9.7 km apart: 5 km each; Yazoo
-- NWR / Muscadine Farms 15 km and Howard Miller / Shipland 14.5 km: 7 km each). The units are
-- MDWFP's and USFWS's listed waterfowl hunting areas (2026-27 migratory game bird digest, pp. 4-5);
-- each has its own rules, so access is left unchecked (the page says so).
-- Mississippi's duck and goose seasons are statewide, so no huntZones are needed.
--
-- Idempotent: safe to re-run. Owner approval required before running on production.
-- ===========================================
\set ON_ERROR_STOP on

INSERT INTO locations (name, location_type, state_id, description, center_point, metadata)
SELECT v.name, 'wildlife_refuge', s.id, v.description,
       jsonb_build_object('lat', v.lat, 'lng', v.lng),
       jsonb_build_object('flyway', 'mississippi', 'source', v.source,
                          'ebirdOnly', true, 'ebirdRadiusKm', v.radius,
                          'note', 'eBird community sightings only; see scripts/add-mississippi-ebird-locations.sql')
FROM (VALUES
  -- National wildlife refuges
  ('Yazoo National Wildlife Refuge', 'usfws',
   'Yazoo NWR, Washington County, in the south Delta: managed moist-soil units and flooded fields. eBird sightings within 7km.',
   33.0944, -90.9864, 7),
  ('Dahomey National Wildlife Refuge', 'usfws',
   'Dahomey NWR, Bolivar County, with Charlie Capps WMA next door. eBird sightings within 12km.',
   33.7101, -90.9221, 12),
  ('Tallahatchie National Wildlife Refuge', 'usfws',
   'Tallahatchie NWR, Grenada and Tallahatchie counties, at the Delta''s eastern edge. eBird sightings within 5km.',
   33.7756, -90.1441, 5),
  ('Coldwater River National Wildlife Refuge', 'usfws',
   'Coldwater River NWR, Quitman and Tallahatchie counties, north Delta. eBird sightings within 12km.',
   34.0956, -90.1405, 12),
  ('Morgan Brake National Wildlife Refuge', 'usfws',
   'Morgan Brake NWR, Holmes County, with Hillside and Mathews Brake NWRs nearby. eBird sightings within 12km.',
   33.2226, -90.1887, 12),
  ('Panther Swamp National Wildlife Refuge', 'usfws',
   'Panther Swamp NWR, Yazoo County, south Delta bottomland hardwoods. eBird sightings within 12km.',
   32.8362, -90.5699, 12),
  ('Sam D. Hamilton Noxubee National Wildlife Refuge', 'usfws',
   'Noxubee NWR, Oktibbeha, Noxubee and Winston counties, east Mississippi. eBird sightings within 15km.',
   33.2695, -88.8377, 15),
  ('St. Catherine Creek National Wildlife Refuge', 'usfws',
   'St. Catherine Creek NWR on the Mississippi River south of Natchez. eBird sightings within 15km.',
   31.4003, -91.4612, 15),
  -- MDWFP wildlife management areas
  ('Mahannah WMA (eBird)', 'ebird',
   'Mahannah WMA, Issaquena and Warren counties, south Delta: pumped waterfowl units. eBird sightings within 12km.',
   32.5427, -90.9096, 12),
  ('Howard Miller WMA (eBird)', 'ebird',
   'Howard Miller WMA, Issaquena County: flooded waterfowl units. eBird sightings within 7km.',
   32.8266, -90.9985, 7),
  ('Shipland WMA (eBird)', 'ebird',
   'Shipland WMA on the Mississippi River, Issaquena County. eBird sightings within 7km.',
   32.7646, -91.1344, 7),
  ('Sky Lake WMA (eBird)', 'ebird',
   'Sky Lake WMA, Humphreys County: an oxbow lake and cypress brake. eBird sightings within 10km.',
   33.2871, -90.4651, 10),
  ('Malmaison WMA (eBird)', 'ebird',
   'Malmaison WMA, Grenada, Carroll and Leflore counties. eBird sightings within 5km.',
   33.7046, -90.0837, 5),
  ('Muscadine Farms WMA (eBird)', 'ebird',
   'Muscadine Farms WMA, Washington County: managed waterfowl fields. eBird sightings within 7km.',
   33.2303, -90.9804, 7)
) AS v(name, source, description, lat, lng, radius)
JOIN states s ON s.code = 'MS'
ON CONFLICT (name, location_type) DO NOTHING;

SELECT l.name, l.center_point, l.metadata->>'ebirdRadiusKm' AS radius_km
FROM locations l JOIN states s ON s.id = l.state_id
WHERE s.code = 'MS' ORDER BY l.name;
