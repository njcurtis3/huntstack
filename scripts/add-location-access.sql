-- ===========================================
-- Waterfowl hunting access for survey locations (2026-11-08)
--
-- Sets locations.metadata.access ('public' | 'limited' | 'closed' | 'private'), accessNote and
-- accessSource. Read by apps/api/src/lib/access.ts. Where to Hunt hides 'closed' and 'private'
-- places (they're survey sites, not hunting spots), and chat says so instead of calling them
-- public. A location with no access key shows "Access not verified".
--
-- Only places checked against an agency page are set. Checked 2026-11-08:
--   Loess Bluffs NWR (MO)   fws.gov hunting page + 50 CFR 32.44: no duck hunting; light geese
--                           only, in designated areas
--   Clarence Cannon NWR (MO) FWS 2025-26 hunt brochure: closed to migratory bird hunting
--                           (deer by permit only)
--   Hagerman NWR (TX)       FWS 2026-27 upland/migratory bird regs: dove, squirrel and rabbit
--                           only; no waterfowl hunting
--   Salt Plains NWR (OK)    FWS hunt brochure: ducks and geese only in the walk-in public
--                           hunting area north of SH 11, mornings
--   Ted Shanks CA (MO)      MDC area page/map: the INHS count is the waterfowl refuge, closed to
--                           all use Oct 15-Mar 1; hunting only in the designated waterfowl area
--   Cuivre Club, Dardenne Club (MO)  private duck clubs counted on the INHS flights
--
-- Not yet checked (show "not verified"): the other INHS sites in IL/IA/MO, Washita NWR, and
-- every location with no fresh counts. Before Illinois or Iowa join Where to Hunt, check them.
--
-- Additive (metadata keys only). Idempotent: safe to re-run.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

WITH a(name, access, note, source) AS (VALUES
  ('Loess Bluffs National Wildlife Refuge', 'limited',
   'No duck hunting. Light geese only, in designated areas.',
   'https://www.fws.gov/refuge/loess-bluffs/visit-us/activities/hunting'),
  ('Clarence Cannon National Wildlife Refuge', 'closed',
   'Closed to migratory bird hunting; deer hunting by permit only.',
   'https://www.fws.gov/sites/default/files/documents/2025-07/clarencecannon_hunt25-online.pdf'),
  ('Hagerman National Wildlife Refuge', 'closed',
   'No waterfowl hunting; dove, squirrel and rabbit only.',
   'https://www.fws.gov/sites/default/files/documents/2026-07/hagerman-upland-game-and-mig-game-bird-hunts-2026-2027_web-508-final.pdf'),
  ('Salt Plains National Wildlife Refuge', 'limited',
   'Ducks and geese only in the walk-in public hunting area north of SH 11; mornings only.',
   'https://www.fws.gov/media/hunting-brochure-salt-plains-national-wildlife-refuge'),
  ('Ted Shanks Conservation Area - Mississippi River (INHS)', 'limited',
   'The counted refuge is closed to all use Oct 15-Mar 1; hunt only the designated waterfowl area.',
   'https://mdc.mo.gov/discover-nature/places/ted-shanks-conservation-area'),
  ('Cuivre Club - Mississippi River (INHS)', 'private',
   'Private duck club counted on the INHS survey flights.',
   'https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/'),
  ('Dardenne Club - Mississippi River (INHS)', 'private',
   'Private duck club counted on the INHS survey flights.',
   'https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/')
)
UPDATE locations l
SET metadata = coalesce(l.metadata, '{}'::jsonb)
      || jsonb_build_object('access', a.access, 'accessNote', a.note, 'accessSource', a.source,
                            'accessChecked', '2026-11-08'),
    updated_at = now()
FROM a
WHERE l.name = a.name AND l.location_type = 'wildlife_refuge';

COMMIT;

SELECT l.name, l.metadata->>'access' AS access
FROM locations l
WHERE l.metadata ? 'access'
ORDER BY 2, 1;
