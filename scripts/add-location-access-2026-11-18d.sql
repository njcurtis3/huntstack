-- ===========================================
-- Waterfowl hunting access for Cheyenne Bottoms (2026-11-18, fourth pass)
--
-- Same keys as scripts/add-location-access.sql. KDWP's own wildlife-area page refuses automated
-- requests (HTTP 403), so the source is the Kansas Wetlands Education Center (Fort Hays State
-- University, on the area itself), whose hunting page restates the area's rules. Read 2026-11-18.
--
-- Additive (metadata keys only). The name must update exactly one row, or nothing is changed.
-- Owner approval required before running on production.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE n int;
BEGIN
  UPDATE locations l
  SET metadata = coalesce(l.metadata, '{}'::jsonb)
        || jsonb_build_object(
             'access', 'limited',
             'accessNote', 'KDWP wildlife area: check in on the GoOutdoorsKS app or online before every hunt. Pools 1, 5 and part of Pool 2 are refuge, closed to all entry; a pool holding whooping cranes closes to hunting. Boats in Pools 2, 3 and 4 only, no airboats, no shooting on or from the dikes, non-toxic shot.',
             'accessSource', 'https://wetlandscenter.fhsu.edu/things-to-do/hunting',
             'accessChecked', '2026-11-18'),
      updated_at = now()
  WHERE l.name = 'Cheyenne Bottoms (eBird)' AND l.location_type = 'wildlife_refuge';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Cheyenne Bottoms: expected 1 location, updated %', n; END IF;
END $$;

COMMIT;

SELECT name, metadata->>'access' AS access, metadata->>'accessChecked' AS checked
FROM locations WHERE name = 'Cheyenne Bottoms (eBird)';
