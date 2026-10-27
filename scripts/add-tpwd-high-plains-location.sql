-- ===========================================
-- TPWD Midwinter Survey, High Plains stratum (2026-10-27)
--
-- Location for the "Texas High Plains - TPWD Midwinter Survey" source in
-- apps/scrapers-python/huntstack_scrapers/sources.py: TPWD's January aerial survey
-- estimates for the High Plains stratum only (the "HP estimates" sheet of
-- mw_estimates_97-18.xls, 1997-2018, ducks and geese).
--
-- Like the statewide "Texas - TPWD Midwinter Survey" row: no center_point and
-- survey_only = true, so it never becomes a Where to Hunt card, an eBird lookup or a
-- current-count row. region = 'TX-HP' matches PUSH_REGIONS in apps/api/src/lib/weather.ts;
-- refuges.ts reads it for the Historical Trends chart.
--
-- Insert-only and idempotent.
-- ===========================================
\set ON_ERROR_STOP on

INSERT INTO locations (name, location_type, state_id, description, website_url, metadata)
SELECT 'Texas High Plains - TPWD Midwinter Survey', 'wildlife_refuge', s.id,
       'TPWD January aerial midwinter waterfowl survey, High Plains stratum (Panhandle and South Plains playa country). Estimates for 1997-2018; TPWD has not published stratum estimates since.',
       'https://tpwd.texas.gov/huntwild/wild/game_management/waterfowl/',
       jsonb_build_object('flyway', 'central', 'survey_only', true, 'region', 'TX-HP',
                          'regionLabel', 'TX High Plains', 'source', 'tpwd_mws')
FROM states s WHERE s.code = 'TX'
ON CONFLICT (name, location_type) DO NOTHING;

SELECT l.name, l.center_point, l.metadata FROM locations l
WHERE l.name = 'Texas High Plains - TPWD Midwinter Survey';
