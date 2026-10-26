-- ===========================================
-- Cheyenne Bottoms (Kansas) eBird area (2026-10-26)
--
-- KDWP's weekly Cheyenne Bottoms waterfowl report refuses automated requests (HTTP 403),
-- so it is not scraped. Birders report there almost daily, so the marsh is covered through
-- the eBird API instead, like the Panhandle areas (scripts/add-panhandle-ebird-locations.sql).
-- 20km radius keeps it clear of Quivira NWR (~60km away), which is already a location.
-- Idempotent. metadata is a real jsonb object.
-- ===========================================

INSERT INTO locations (name, location_type, state_id, description, website_url, center_point, metadata)
SELECT 'Cheyenne Bottoms (eBird)', 'wildlife_refuge', s.id,
       'eBird community sightings within 20km of Cheyenne Bottoms Wildlife Area, Great Bend, KS. KDWP posts weekly waterfowl and water-level reports on its site.',
       'https://ksoutdoors.gov/KDWP-Info/Locations/Wildlife-Areas/Public-Wildlife-Areas-in-Southwest-Kansas/Cheyenne-Bottoms/Cheyenne-Bottoms-Waterfowl-Report',
       jsonb_build_object('lat', 38.47, 'lng', -98.66),
       jsonb_build_object('flyway', 'central', 'source', 'ebird', 'ebirdOnly', true, 'ebirdRadiusKm', 20)
FROM states s WHERE s.code = 'KS'
ON CONFLICT (name, location_type) DO NOTHING;

SELECT name, center_point, metadata FROM locations WHERE name = 'Cheyenne Bottoms (eBird)';
