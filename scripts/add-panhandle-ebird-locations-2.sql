-- ===========================================
-- More Texas High Plains eBird areas (2026-10-27)
--
-- Same pattern as add-panhandle-ebird-locations.sql: eBird-only areas that pull
-- community sightings (refuges.ts -> getEBirdCountsForRefuge). These fill the gaps the
-- first four left: each is centered on the most-birded waterfowl hotspots outside the
-- Amarillo / Lubbock / Dalhart / Hereford circles (eBird ref/hotspot/geo, all-time
-- species counts and sightings within the past month, checked 2026-10-27). Radii are
-- kept small enough to limit overlap with the existing 50km circles.
--
-- All seven are inside the High Plains Mallard Management Unit (east edge US 183 /
-- US 283 / US 277) and west of the US 81/287/I-35 goose line, so huntZones is set here
-- (same values as the other Panhandle areas in map-location-hunt-zones.sql).
--
-- Idempotent: safe to re-run. metadata is a real jsonb object, not a JSON string.
-- ===========================================
\set ON_ERROR_STOP on

INSERT INTO locations (name, location_type, state_id, description, center_point, metadata)
SELECT v.name, 'wildlife_refuge', s.id, v.description,
       jsonb_build_object('lat', v.lat, 'lng', v.lng),
       jsonb_build_object('flyway', 'central', 'source', 'ebird', 'ebirdOnly', true,
                          'ebirdRadiusKm', v.radius,
                          'huntZones', jsonb_build_array('High Plains Mallard Management Unit', 'Western Zone'),
                          'huntZonesNote', 'Mapped from agency zone boundaries 2026-10-27; see scripts/add-panhandle-ebird-locations-2.sql')
FROM (VALUES
  ('Lake Meredith (eBird)',
   'eBird community sightings within 25km of Lake Meredith (Harbor Bay, Blue West, Spring Canyon, McBride Canyon), north of Amarillo.',
   35.65, -101.62, 25),
  ('Pampa / Lake McClellan / Greenbelt (eBird)',
   'eBird community sightings within 40km of Lake McClellan: Pampa playas, Greenbelt Reservoir and Taylor Lakes WMA in the eastern Panhandle.',
   35.25, -100.90, 40),
  ('Canadian River / Lake Marvin (eBird)',
   'eBird community sightings within 20km of Canadian: Lake Marvin, Gene Howe WMA and the Canadian River.',
   35.90, -100.30, 20),
  ('Plainview / Hale County Playas (eBird)',
   'eBird community sightings within 35km of Plainview: Hale County playas, Hale Center and Lockney ponds.',
   34.19, -101.72, 35),
  ('Childress Lakes (eBird)',
   'eBird community sightings within 25km of Childress: Lake Childress, Baylor Lake, Lake Scott and Matador WMA.',
   34.44, -100.28, 25),
  ('Post / Lake Alan Henry / Tahoka (eBird)',
   'eBird community sightings within 35km of Post: Lake Alan Henry, Tahoka Lake and Lynn County playas.',
   33.15, -101.40, 35),
  ('Midland-Odessa (eBird)',
   'eBird community sightings within 30km of Midland: I-20 Pond, Sibley Nature Center and city ponds.',
   31.99, -102.08, 30)
) AS v(name, description, lat, lng, radius)
JOIN states s ON s.code = 'TX'
ON CONFLICT (name, location_type) DO NOTHING;

SELECT name, center_point, metadata->>'ebirdRadiusKm' AS radius_km
FROM locations WHERE metadata->>'source' = 'ebird' ORDER BY name;
