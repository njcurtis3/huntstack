-- ===========================================
-- Waterfowl hunting access for more survey locations (2026-11-18)
--
-- Same keys as scripts/add-location-access.sql: locations.metadata.access ('public' | 'limited' |
-- 'closed' | 'private'), accessNote, accessSource, accessChecked. Where to Hunt and the Map leave
-- out 'closed' and 'private' places as somewhere to hunt (their birds still count as evidence).
--
-- 13 of the 41 unchecked INHS and refuge survey sites, each from the land manager's own page
-- (read 2026-11-18). The other INHS backwater lakes (Goose, Big, Clear, Crane, Grass, Jack,
-- Stewart, Douglas, Hitchcock Slough, Cuba Island, Duck Creek, Senachwine, Upper Peoria,
-- Spunky Bottoms, Hennepin & Hopper, Meredosia Lake, Arthur Refuge, Henderson Creek, Towhead
-- Lake, Long Lake and the open Mississippi River reaches) are left unchecked: no source said who
-- owns them or whether they can be hunted, and a wrong "public" sends hunters onto private land.
--
-- Additive (metadata keys only). Each name must update exactly one row, or nothing is changed.
-- Owner approval required before running on production.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE a (name text, access text, note text, source text) ON COMMIT DROP;
INSERT INTO a VALUES
  -- Closed to waterfowl hunting (refuge divisions)
  ('Swan Lake (Two Rivers NWR) - Mississippi River (INHS)', 'closed',
   'Not open to waterfowl hunting; the Calhoun Division wetlands are closed to public use Oct 16-Dec 31.',
   'https://www.fws.gov/refuge/two-rivers/visit-us/activities/hunting'),
  ('Batchtown Division, Two Rivers NWR - Mississippi River (INHS)', 'closed',
   'Not open to waterfowl hunting. Two Rivers NWR allows waterfowl only at Apple Creek, Pohlman Forest, Clarksville Island and Portage Island.',
   'https://www.fws.gov/refuge/two-rivers/visit-us/activities/hunting'),
  ('Gilbert Lake - Mississippi River (INHS)', 'closed',
   'Two Rivers NWR''s Gilbert Lake Division is not open to waterfowl hunting; boating closed Oct 16-Dec 31.',
   'https://www.fws.gov/refuge/two-rivers/visit-us/activities/hunting'),
  ('Louisa Division, Port Louisa NWR - Mississippi River (INHS)', 'closed',
   'Not open to waterfowl hunting: Big Timber is the only Port Louisa NWR unit open to waterfowl.',
   'https://www.fws.gov/refuge/port-louisa/visit-us/activities/hunting'),
  ('Keithsburg Division, Port Louisa NWR - Mississippi River (INHS)', 'closed',
   'Closed to waterfowl hunting, and to all public access Sept 15-Dec 31.',
   'https://www.fws.gov/refuge/port-louisa/visit-us/activities/hunting'),
  ('Delair Division, Great River NWR - Mississippi River (INHS)', 'closed',
   'Closed to migratory bird hunting, and to the public all year except the state-managed deer hunt.',
   'https://www.fws.gov/refuge/great-river/visit-us/activities/hunting'),
  -- Limited: hunting only in set areas, by draw or permit, or on set days
  ('Chautauqua NWR - Illinois River (INHS)', 'limited',
   'Waterfowl hunting only outside the main dike in the Liverpool Lake section, and Goofy Ridge Ditch and refuge land north of it; the pools are a sanctuary Oct 16-Jan 31.',
   'https://www.fws.gov/refuge/chautauqua/visit-us/activities/hunting'),
  ('Emiquon & Spoon River Bottoms - Illinois River (INHS)', 'limited',
   'Emiquon NWR: waterfowl only in its Open Unit (Forgotten Road, Wilder, Oxbow), sanctuary Oct 16-Jan 31. TNC''s Emiquon Preserve: drawn hunts at assigned sites, ending at noon.',
   'https://www.fws.gov/refuge/emiquon/visit-us/activities/hunting'),
  ('Rice Lake - Illinois River (INHS)', 'limited',
   'Rice Lake SFWA: daily drawing for blinds and pits at the check station (4:30 AM); walk-in units by Public Duck and Goose Hunting Area permit.',
   'https://dnr.illinois.gov/content/dam/soi/en/web/dnr/hunting/waterfowl/documents/publicduckandgoosepermitinstructions.pdf'),
  ('Banner Marsh - Illinois River (INHS)', 'limited',
   'Banner Marsh SFWA: blinds, boats and decoys provided; daily drawing for hunt locations, by Public Duck and Goose Hunting Area permit.',
   'https://dnr.illinois.gov/content/dam/soi/en/web/dnr/hunting/waterfowl/documents/publicduckandgoosepermitinstructions.pdf'),
  ('Powerton Lake - Illinois River (INHS)', 'limited',
   'About 60% of the lake is open: Fri-Sun and state holidays in the Central Zone duck season, until 1 pm, from boat blinds at sites drawn daily an hour before shooting time.',
   'https://huntillinois.org/sites/powerton-lake-sfwa'),
  ('Sanganois - Illinois River (INHS)', 'limited',
   'Sanganois SFWA: blinds drawn each July (unclaimed ones drawn daily); walk-in hunting in the posted area, by site permit on opening days; all hunting stops at 1 pm.',
   'https://huntillinois.org/sites/sanganois-sfwa'),
  ('Washita National Wildlife Refuge', 'limited',
   'Waterfowl on select farm fields during the dark goose season, on selected weekends and Wednesdays, mornings only (out by noon); no hunting over water.',
   'https://www.fws.gov/refuge/washita/visit-us/activities/hunting');

DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN SELECT * FROM a LOOP
    UPDATE locations l
    SET metadata = coalesce(l.metadata, '{}'::jsonb)
          || jsonb_build_object('access', r.access, 'accessNote', r.note, 'accessSource', r.source,
                                'accessChecked', '2026-11-18'),
        updated_at = now()
    WHERE l.name = r.name AND l.location_type = 'wildlife_refuge';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION '"%": expected 1 location, updated %', r.name, n; END IF;
  END LOOP;
END $$;

COMMIT;

SELECT l.name, l.metadata->>'access' AS access FROM locations l
WHERE l.metadata->>'accessChecked' = '2026-11-18' ORDER BY 2, 1;
