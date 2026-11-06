-- ===========================================
-- Hagerman National Wildlife Refuge, TX (2026-11-02)
--
-- Counts come from the Friends of Hagerman NWR weekly bird census: volunteers count every
-- bird along ~35 miles of refuge roads and trails each Tuesday and submit one eBird
-- checklist (hotspot L815117). apps/scrapers-python/huntstack_scrapers/parsers/hagerman_census.py
-- reads them; the location name must match its sources.py entry.
--
-- skipEbird: the census IS eBird data, so the dashboard's nearby-eBird lookup would repeat it.
-- Point: the eBird hotspot's coordinates.
--
-- Additive and idempotent: safe to re-run.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO locations (name, location_type, state_id, description, website_url, center_point, metadata)
SELECT 'Hagerman National Wildlife Refuge', 'wildlife_refuge', s.id,
       'National wildlife refuge on Lake Texoma (Grayson Co.). Weekly counts from the Friends of Hagerman NWR volunteer bird census, submitted to eBird; a volunteer census, not an agency survey.',
       'https://www.fws.gov/refuge/hagerman',
       jsonb_build_object('lat', 33.7386, 'lng', -96.7528),
       jsonb_build_object(
         'flyway', 'central',
         'source', 'foh_census',
         'surveyUrl', 'https://friendsofhagerman.com/Birding-Jack',
         'ebirdHotspot', 'L815117',
         'countsBy', 'Friends of Hagerman NWR (volunteer census)',
         'skipEbird', true
       )
FROM states s WHERE s.code = 'TX'
ON CONFLICT (name, location_type) DO NOTHING;

COMMIT;

SELECT name, center_point, metadata->>'source' AS source
FROM locations WHERE name = 'Hagerman National Wildlife Refuge';
