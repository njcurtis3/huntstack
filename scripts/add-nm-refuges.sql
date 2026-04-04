-- Add New Mexico Central Flyway refuges to the locations table.
-- Once inserted (with center_point set), the migration dashboard API will
-- automatically pull eBird geo observations for each refuge on every request.
--
-- Run this in the Supabase SQL Editor.

INSERT INTO locations (name, location_type, state_id, center_point, website_url, metadata)
SELECT
  ref.name,
  'wildlife_refuge',
  s.id,
  ref.center_point::jsonb,
  ref.website_url,
  ref.metadata::jsonb
FROM (VALUES
  (
    'Bosque del Apache National Wildlife Refuge',
    'NM',
    '{"lat": 33.7766, "lng": -106.8827}',
    'https://www.fws.gov/refuge/bosque-del-apache',
    '{"flyway": "central", "notable": "Premier sandhill crane and snow goose wintering site on the Central Flyway"}'
  ),
  (
    'Bitter Lake National Wildlife Refuge',
    'NM',
    '{"lat": 33.4883, "lng": -104.3836}',
    'https://www.fws.gov/refuge/bitter-lake',
    '{"flyway": "central", "notable": "Important waterfowl stopover in the Pecos River valley"}'
  ),
  (
    'Las Vegas National Wildlife Refuge',
    'NM',
    '{"lat": 35.6017, "lng": -104.6422}',
    'https://www.fws.gov/refuge/las-vegas',
    '{"flyway": "central", "notable": "High-elevation wetland stopover in northeastern NM"}'
  )
) AS ref(name, state_code, center_point, website_url, metadata)
JOIN states s ON s.code = ref.state_code
ON CONFLICT DO NOTHING;

-- Verify the inserts
SELECT l.name, s.code as state, l.center_point, l.metadata->>'flyway' as flyway
FROM locations l
JOIN states s ON s.id = l.state_id
WHERE s.code = 'NM' AND l.location_type = 'wildlife_refuge'
ORDER BY l.name;
