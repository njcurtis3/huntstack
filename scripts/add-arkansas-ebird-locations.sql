-- ===========================================
-- Arkansas refuges and WMAs with eBird sightings (2026-10-27)
--
-- Arkansas's only official counts are AGFC's statewide aerial survey, and its refuges
-- don't publish waterfowl counts. These areas pull community sightings live from eBird
-- (refuges.ts -> getEBirdCountsForRefuge, radius = metadata.ebirdRadiusKm), the same
-- way as the existing Cache River / Holla Bend / Wapanocca / White River rows and the
-- Texas Panhandle areas.
--
-- Centers are the most-birded eBird hotspots of each area (eBird ref/hotspot/US-AR,
-- 2026-10-27). Radii keep overlap with neighbouring areas to a few km
-- (Bald Knob/Cache River ~4km, Point Remove/Holla Bend ~3km), so a sighting is rarely
-- counted twice. In late October most have no waterfowl sightings yet; they fill in
-- from November.
--
-- Refuges use their full name and source 'usfws', like the existing refuge rows (an
-- official count source can be attached later); WMAs are "(eBird)" areas.
-- Arkansas duck and goose seasons are statewide, so no huntZones are needed.
--
-- Idempotent: safe to re-run. metadata is a real jsonb object, not a JSON string.
-- ===========================================
\set ON_ERROR_STOP on

INSERT INTO locations (name, location_type, state_id, description, center_point, metadata)
SELECT v.name, 'wildlife_refuge', s.id, v.description,
       jsonb_build_object('lat', v.lat, 'lng', v.lng),
       jsonb_build_object('flyway', 'mississippi', 'source', v.source,
                          'ebirdOnly', true, 'ebirdRadiusKm', v.radius,
                          'note', 'eBird community sightings only; see scripts/add-arkansas-ebird-locations.sql')
FROM (VALUES
  -- National wildlife refuges
  ('Bald Knob National Wildlife Refuge', 'usfws',
   'Bald Knob NWR, White County: rice fields and moist-soil units known for wintering pintails. eBird sightings within 10km.',
   35.29, -91.58, 10),
  ('Big Lake National Wildlife Refuge', 'usfws',
   'Big Lake NWR and Big Lake WMA, Mississippi County, in the far northeast. eBird sightings within 15km.',
   35.89, -90.10, 15),
  ('Felsenthal National Wildlife Refuge', 'usfws',
   'Felsenthal NWR on the Ouachita River, south Arkansas: green-tree reservoir flooded each winter. eBird sightings within 20km.',
   33.12, -92.15, 20),
  ('Overflow National Wildlife Refuge', 'usfws',
   'Overflow NWR, Ashley County, southeast Arkansas. eBird sightings within 12km.',
   33.11, -91.63, 12),
  ('Pond Creek National Wildlife Refuge', 'usfws',
   'Pond Creek NWR, Sevier County, southwest Arkansas bottomland hardwoods. eBird sightings within 12km.',
   33.83, -94.20, 12),
  -- AGFC wildlife management areas and lakes
  ('Bayou Meto WMA / Stuttgart (eBird)', 'ebird',
   'George H. Dunklin Jr. Bayou Meto WMA and the Stuttgart rice country, Arkansas and Jefferson counties. eBird sightings within 18km.',
   34.25, -91.62, 18),
  ('Dave Donaldson Black River WMA (eBird)', 'ebird',
   'Dave Donaldson Black River WMA and Lake Ashbaugh, Clay/Greene/Randolph counties. eBird sightings within 20km.',
   36.29, -90.75, 20),
  ('Shirey Bay Rainey Brake WMA (eBird)', 'ebird',
   'Shirey Bay Rainey Brake WMA on the Black River, Lawrence County. eBird sightings within 15km.',
   35.98, -91.20, 15),
  ('St. Francis Sunken Lands WMA (eBird)', 'ebird',
   'St. Francis Sunken Lands WMA, Craighead and Poinsett counties. eBird sightings within 15km.',
   35.72, -90.40, 15),
  ('Earl Buss Bayou DeView WMA (eBird)', 'ebird',
   'Earl Buss Bayou DeView WMA, Poinsett County. eBird sightings within 12km.',
   35.67, -90.93, 12),
  ('Freddie Black Choctaw Island WMA (eBird)', 'ebird',
   'Freddie Black Choctaw Island WMA on the Mississippi River, Desha County. eBird sightings within 15km.',
   33.60, -91.22, 15),
  ('Ed Gordon Point Remove WMA (eBird)', 'ebird',
   'Ed Gordon Point Remove WMA, Conway County: the Arkansas River Valley''s top duck zone in AGFC surveys. eBird sightings within 10km.',
   35.28, -92.78, 10),
  ('Frog Bayou WMA (eBird)', 'ebird',
   'Frog Bayou WMA and Ozark Lake, Crawford County, western Arkansas River Valley. eBird sightings within 12km.',
   35.46, -94.15, 12),
  ('Millwood Lake (eBird)', 'ebird',
   'Millwood Lake and Millwood State Park, southwest Arkansas. eBird sightings within 12km.',
   33.73, -93.95, 12)
) AS v(name, source, description, lat, lng, radius)
JOIN states s ON s.code = 'AR'
ON CONFLICT (name, location_type) DO NOTHING;

SELECT l.name, l.center_point, l.metadata->>'ebirdRadiusKm' AS radius_km
FROM locations l JOIN states s ON s.id = l.state_id
WHERE s.code = 'AR' ORDER BY l.name;
