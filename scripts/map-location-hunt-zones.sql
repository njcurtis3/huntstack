-- ===========================================
-- Map hunting locations to their waterfowl season zones (2026-10-27)
--
-- Sets locations.metadata.huntZones: the season zone names (exactly as stored in
-- seasons.units) that cover each location. hunt.ts matches a location's open seasons
-- against these; "Statewide" seasons always apply and need no entry. Locations with no
-- huntZones (survey aggregates, AR/MO/IL, where every season is statewide or none are
-- stored) keep the "Open only in <zone>" card text.
--
-- Zone boundaries:
--   TX  (2026 memo adds a Northeast/Southeast goose split; TPWD 2026-27 still uses Eastern =
--       both.) duck: TPWD Outdoor Annual (HPMMU west of US 183/283/TX 6/US 277; South Zone south
--       of US 90 Del Rio-San Antonio and I-10 San Antonio-Orange). Goose: Western Zone
--       west of I-35/35W and US 81/287; Eastern = remainder.
--   KS  2026 MGBH memo (MGBHM-2026-01, docket FWS-HQ-MB-2026-3335; reworded but same
--       lines as 90 FR 40205-06). Cheyenne Bottoms sits in the Early Zone
--       lobe between K-4 at Hoisington (north) and US-56 Great Bend-Lyons (south), east of US-281;
--       Quivira is south of K-96 and east of US-281 (Late Zone); Flint Hills NWR is south
--       of K-68 and east of I-35 (Southeast Zone).
--   OK  2026 MGBH memo (unchanged from 2025-26): High Plains (Panhandle) = Beaver, Cimarron, Texas counties.
--       All four refuges here are in Low Plains Zones 1 and 2 (same seasons).
--   NM  NMDGF 2026-27 booklet: Central Flyway North Zone = north of I-40 and US 54;
--       MRGV = Valencia, Socorro and Sierra counties (closed in the regular dark goose
--       season, has its own).
--   LA  LDWF 2026-27 regulations p. 34: West Zone = between Texas and LA 79/LA 9/LA 147/
--       US 167 to Lafayette, then US 90 to Mississippi.
--
-- Also renames the NM Central Flyway regular dark goose rows' zone so MRGV locations
-- (Bosque del Apache) don't match a season that is closed there.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

UPDATE seasons se SET units = '["Central Flyway (North and South Zones, outside the MRGV)"]'::jsonb
FROM states s
WHERE se.state_id = s.id AND s.code = 'NM' AND se.year = 2026
  AND se.name = 'Dark Geese - Central Flyway';

WITH m(state, name, zones) AS (VALUES
  -- Texas: duck zone + goose zone
  ('TX', 'Amarillo Area Playas (eBird)',            '["High Plains Mallard Management Unit", "Western Zone"]'),
  ('TX', 'Buffalo Lake National Wildlife Refuge',   '["High Plains Mallard Management Unit", "Western Zone"]'),
  ('TX', 'Dalhart / Lake Rita Blanca (eBird)',      '["High Plains Mallard Management Unit", "Western Zone"]'),
  ('TX', 'Hereford-Dimmitt Playas (eBird)',         '["High Plains Mallard Management Unit", "Western Zone"]'),
  ('TX', 'Lubbock Area Playas (eBird)',             '["High Plains Mallard Management Unit", "Western Zone"]'),
  ('TX', 'Muleshoe National Wildlife Refuge',       '["High Plains Mallard Management Unit", "Western Zone"]'),
  ('TX', 'Caddo Lake WMA',                          '["North Zone", "Eastern Zone"]'),
  ('TX', 'Anahuac National Wildlife Refuge',        '["South Zone", "Eastern Zone"]'),
  ('TX', 'Aransas National Wildlife Refuge',        '["South Zone", "Eastern Zone"]'),
  ('TX', 'Brazoria National Wildlife Refuge',       '["South Zone", "Eastern Zone"]'),
  ('TX', 'Laguna Atascosa National Wildlife Refuge','["South Zone", "Eastern Zone"]'),
  ('TX', 'Matagorda Island WMA',                    '["South Zone", "Eastern Zone"]'),
  ('TX', 'Texas Point National Wildlife Refuge',    '["South Zone", "Eastern Zone"]'),
  -- Kansas: duck zone + teal/falconry unit
  ('KS', 'Cheyenne Bottoms (eBird)',                '["Low Plains Early Zone", "Low Plains Unit"]'),
  ('KS', 'Quivira National Wildlife Refuge',        '["Low Plains Late Zone", "Low Plains Unit"]'),
  ('KS', 'Flint Hills National Wildlife Refuge',    '["Low Plains Southeast Zone", "Low Plains Unit"]'),
  -- Oklahoma
  ('OK', 'Salt Plains National Wildlife Refuge',    '["Zones 1 and 2"]'),
  ('OK', 'Sequoyah National Wildlife Refuge',       '["Zones 1 and 2"]'),
  ('OK', 'Tishomingo National Wildlife Refuge',     '["Zones 1 and 2"]'),
  ('OK', 'Washita National Wildlife Refuge',        '["Zones 1 and 2"]'),
  -- New Mexico (all three refuges are east of the Continental Divide)
  ('NM', 'Las Vegas National Wildlife Refuge',      '["Central Flyway North Zone", "Central Flyway (North and South Zones)", "Central Flyway (North and South Zones, outside the MRGV)"]'),
  ('NM', 'Bitter Lake National Wildlife Refuge',    '["Central Flyway South Zone", "Central Flyway (North and South Zones)", "Central Flyway (North and South Zones, outside the MRGV)"]'),
  ('NM', 'Bosque del Apache National Wildlife Refuge', '["Central Flyway South Zone", "Central Flyway (North and South Zones)", "Middle Rio Grande Valley (Valencia, Socorro and Sierra counties)"]'),
  -- Louisiana
  ('LA', 'Sabine National Wildlife Refuge',         '["West Zone"]'),
  ('LA', 'Cameron Prairie National Wildlife Refuge','["West Zone"]'),
  ('LA', 'Lacassine National Wildlife Refuge',      '["West Zone"]'),
  ('LA', 'Catahoula National Wildlife Refuge',      '["East Zone"]')
)
UPDATE locations l
SET metadata = COALESCE(l.metadata, '{}'::jsonb)
               || jsonb_build_object('huntZones', m.zones::jsonb,
                                     'huntZonesNote', 'Mapped from agency zone boundaries 2026-10-27; see scripts/map-location-hunt-zones.sql')
FROM m JOIN states s ON s.code = m.state
WHERE l.state_id = s.id AND l.name = m.name;

DO $$ DECLARE n int; bad int; BEGIN
  SELECT count(*) INTO n FROM locations WHERE metadata ? 'huntZones';
  IF n <> 27 THEN RAISE EXCEPTION 'expected 27 locations with huntZones, got %', n; END IF;
  -- every mapped zone name must exist as a 2026 season zone in that state
  SELECT count(*) INTO bad
  FROM locations l JOIN states s ON s.id = l.state_id,
       jsonb_array_elements_text(l.metadata->'huntZones') z
  WHERE NOT EXISTS (SELECT 1 FROM seasons se WHERE se.state_id = l.state_id AND se.year = 2026 AND se.units->>0 = z);
  IF bad <> 0 THEN RAISE EXCEPTION '% huntZones entries match no 2026 season zone', bad; END IF;
END $$;

SELECT s.code, l.name, l.metadata->'huntZones'
FROM locations l JOIN states s ON s.id = l.state_id
WHERE l.metadata ? 'huntZones' ORDER BY s.code, l.name;

COMMIT;
