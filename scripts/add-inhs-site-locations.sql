-- ===========================================
-- INHS aerial inventory survey sites (2026-11-02)
--
-- The weekly INHS Forbes flights count each site along the Illinois and central Mississippi
-- rivers; until now only the two river-wide totals were stored. This adds one location per
-- site (42 new; the 43rd, "Cannon Refuge", is the existing Clarence Cannon NWR location,
-- whose own FWS page stopped in 2023). Generated from INHS_SITES in
-- apps/scrapers-python/huntstack_scrapers/parsers/inhs_forbes_pdf.py: names must match it.
--
-- The river-wide totals become survey_only summaries: they are the sum of the sites, so
-- counting both would double the birds. survey_only rows stay in the database and keep
-- being stored; the API's count queries and Where to Hunt skip them.
--
-- skipEbird: these sites sit a few miles apart and have weekly flight counts, so the
-- dashboard doesn't run an eBird lookup for each. pointApprox: the point was placed by
-- hand from the site order on the river, not taken from OpenStreetMap.
--
-- Additive (inserts, plus metadata/center_point updates). Idempotent: safe to re-run.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO states (code, name, agency_name, agency_url, metadata)
VALUES ('IA', 'Iowa', 'Iowa Department of Natural Resources', 'https://www.iowadnr.gov',
        jsonb_build_object('flyways', jsonb_build_array('mississippi')))
ON CONFLICT (code) DO NOTHING;

INSERT INTO locations (name, location_type, state_id, description, website_url, center_point, metadata)
SELECT v.name, 'wildlife_refuge', s.id, v.description,
       'https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/',
       jsonb_build_object('lat', v.lat, 'lng', v.lng),
       jsonb_build_object(
         'flyway', 'mississippi',
         'source', 'inhs',
         'surveyUrl', 'https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/',
         'parentLocation', v.parent,
         'river', v.river,
         'riverSection', v.section,
         'inhsLabel', v.label,
         'skipEbird', true,
         'pointApprox', v.approx
       )
FROM (VALUES
  ('Hennepin & Hopper Lakes - Illinois River (INHS)', 'IL', 41.235, -89.33, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'upper', 'Hennepin/Hopper', true),
  ('Goose Lake (Putnam Co.) - Illinois River (INHS)', 'IL', 41.21, -89.36, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'upper', 'Goose Lake', true),
  ('Senachwine Lake - Illinois River (INHS)', 'IL', 41.1914, -89.3562, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'upper', 'Senachwine Lake', false),
  ('Hitchcock Slough - Illinois River (INHS)', 'IL', 41.13, -89.38, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'upper', 'Hitchcock Slough', true),
  ('Douglas Lake - Illinois River (INHS)', 'IL', 41.1, -89.39, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'upper', 'Douglas Lake', true),
  ('Goose Lake (Marshall Co.) - Illinois River (INHS)', 'IL', 41.0615, -89.4028, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'upper', 'Goose Lake', false),
  ('Upper Peoria Lake - Illinois River (INHS)', 'IL', 40.82, -89.55, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'upper', 'Upper Peoria', true),
  ('Powerton Lake - Illinois River (INHS)', 'IL', 40.5487, -89.6954, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'upper', 'Powerton', false),
  ('Goose Lake (Fulton Co.) - Illinois River (INHS)', 'IL', 40.4426, -89.9326, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Goose Lake', false),
  ('Rice Lake - Illinois River (INHS)', 'IL', 40.4695, -89.9468, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Rice Lake', false),
  ('Big Lake (Fulton Co.) - Illinois River (INHS)', 'IL', 40.455, -89.965, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Big Lake', true),
  ('Banner Marsh - Illinois River (INHS)', 'IL', 40.5235, -89.8681, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Banner Marsh', false),
  ('Duck Creek - Illinois River (INHS)', 'IL', 40.5226, -89.9658, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Duck Creek', false),
  ('Clear Lake (Mason Co.) - Illinois River (INHS)', 'IL', 40.44, -89.86, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Clear Lake', true),
  ('Chautauqua NWR - Illinois River (INHS)', 'IL', 40.37, -89.99, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Chautauqua', true),
  ('Emiquon & Spoon River Bottoms - Illinois River (INHS)', 'IL', 40.3497, -90.0709, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Emiquon/Spoon Btm', false),
  ('Grass Lake - Illinois River (INHS)', 'IL', 40.22, -90.13, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Grass Lake', true),
  ('Jack Lake - Illinois River (INHS)', 'IL', 40.18, -90.17, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Jack Lake', true),
  ('Stewart Lake - Illinois River (INHS)', 'IL', 40.14, -90.23, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Stewart Lake', true),
  ('Crane Lake - Illinois River (INHS)', 'IL', 40.1175, -90.2768, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Crane Lake', false),
  ('Cuba Island - Illinois River (INHS)', 'IL', 40.0719, -90.2879, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Cuba Island', false),
  ('Sanganois - Illinois River (INHS)', 'IL', 40.0995, -90.3474, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Sanganois', false),
  ('Big Lake (Schuyler/Brown Co.) - Illinois River (INHS)', 'IL', 39.99, -90.43, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Big Lake', true),
  ('Spunky Bottoms - Illinois River (INHS)', 'IL', 39.94, -90.57, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Spunky Bottoms', true),
  ('Meredosia Lake - Illinois River (INHS)', 'IL', 39.8752, -90.5516, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Illinois River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Illinois River - INHS Aerial Inventory', 'Illinois River', 'lower', 'Meredosia Lake', false),
  ('Keokuk to Nauvoo - Mississippi River (INHS)', 'IL', 40.47, -91.4, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'upper', 'Keokuk-Nauvoo', true),
  ('Arthur Refuge - Mississippi River (INHS)', 'IL', 40.52, -91.39, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'upper', 'Arthur Refuge', true),
  ('Nauvoo to Fort Madison - Mississippi River (INHS)', 'IL', 40.59, -91.34, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'upper', 'Nauvoo-Ft. Madison', true),
  ('Fort Madison to Dallas City - Mississippi River (INHS)', 'IL', 40.635, -91.24, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'upper', 'Ft. Madison-Dallas', true),
  ('Henderson Creek - Mississippi River (INHS)', 'IL', 40.9, -90.96, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'upper', 'Henderson Creek', true),
  ('Keithsburg Division, Port Louisa NWR - Mississippi River (INHS)', 'IL', 41.08, -90.96, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'upper', 'Keithsburg Refuge', true),
  ('Louisa Division, Port Louisa NWR - Mississippi River (INHS)', 'IA', 41.2181, -91.1116, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (upper Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'upper', 'Louisa Refuge', false),
  ('Swan Lake (Two Rivers NWR) - Mississippi River (INHS)', 'IL', 38.999, -90.5791, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'lower', 'Swan Lake', false),
  ('Gilbert Lake - Mississippi River (INHS)', 'IL', 38.9625, -90.5085, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'lower', 'Gilbert Lake', false),
  ('Long Lake (St. Charles Co.) - Mississippi River (INHS)', 'MO', 38.9557, -90.4226, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'lower', 'Long Lake', true),
  ('Dardenne Club - Mississippi River (INHS)', 'MO', 38.87, -90.53, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'lower', 'Dardenne Club', true),
  ('Cuivre Club - Mississippi River (INHS)', 'MO', 38.93, -90.68, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'lower', 'Cuivre Club', true),
  ('Batchtown Division, Two Rivers NWR - Mississippi River (INHS)', 'IL', 39.03, -90.66, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'lower', 'Batchtown Refuge', true),
  ('Towhead Lake - Mississippi River (INHS)', 'IL', 39.42, -90.99, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'lower', 'Towhead Lake', true),
  ('Delair Division, Great River NWR - Mississippi River (INHS)', 'IL', 39.47, -91.04, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'lower', 'Delair Refuge', true),
  ('Ted Shanks Conservation Area - Mississippi River (INHS)', 'MO', 39.5134, -91.1136, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'lower', 'Shanks Refuge', false),
  ('Meyer to Keokuk - Mississippi River (INHS)', 'IL', 40.27, -91.47, 'INHS Forbes Biological Station weekly aerial waterfowl inventory site (lower Mississippi River), Sept-Jan. Counts are INHS''s estimate for this site on each flight.', 'Central Mississippi River - INHS Aerial Inventory', 'Mississippi River', 'lower', 'Meyer-Keokuk', true)
) AS v(name, state, lat, lng, description, parent, river, section, label, approx)
JOIN states s ON s.code = v.state
ON CONFLICT (name, location_type) DO NOTHING;

-- Clarence Cannon: counts now come from the INHS flights; its point was ~15 miles west
UPDATE locations
SET center_point = jsonb_build_object('lat', 39.275, 'lng', -90.785),
    metadata = metadata || jsonb_build_object(
      'surveyUrl', 'https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/',
      'countsFrom', 'inhs', 'parentLocation', 'Central Mississippi River - INHS Aerial Inventory', 'river', 'Mississippi River',
      'riverSection', 'lower', 'inhsLabel', 'Cannon Refuge'),
    updated_at = now()
WHERE name = 'Clarence Cannon National Wildlife Refuge' AND location_type = 'wildlife_refuge';

-- River-wide totals: summaries of the sites from now on
UPDATE locations
SET metadata = metadata || jsonb_build_object('survey_only', true, 'skipEbird', true),
    updated_at = now()
WHERE name IN ('Illinois River - INHS Aerial Inventory', 'Central Mississippi River - INHS Aerial Inventory')
  AND location_type = 'wildlife_refuge';

COMMIT;

SELECT s.code, count(*) AS inhs_sites
FROM locations l JOIN states s ON s.id = l.state_id
WHERE l.metadata->>'source' = 'inhs' AND (l.metadata->>'survey_only') IS DISTINCT FROM 'true'
GROUP BY s.code ORDER BY s.code;
