-- Buffalo Lake NWR: search eBird within 12 km instead of the 25 km default.
-- At 25 km its circle reached Canyon (about 19 km east), so city-park geese in Canyon showed
-- up as refuge birds, and the same report also counted for the Amarillo area. 12 km covers
-- the refuge and Umbarger. Idempotent.
UPDATE locations
SET metadata = metadata || '{"ebirdRadiusKm": 12}'::jsonb
WHERE name = 'Buffalo Lake National Wildlife Refuge'
  AND (metadata->>'ebirdRadiusKm') IS DISTINCT FROM '12';
