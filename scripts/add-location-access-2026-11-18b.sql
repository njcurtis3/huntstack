-- ===========================================
-- Waterfowl hunting access for 7 more INHS survey sites (2026-11-18, second pass)
--
-- Same keys as scripts/add-location-access.sql: locations.metadata.access ('public' | 'limited' |
-- 'closed' | 'private'), accessNote, accessSource, accessChecked. Where to Hunt and the Map leave
-- out 'closed' and 'private' places as somewhere to hunt (their birds still count as evidence).
--
-- Each from a page of the land manager or owner (read 2026-11-18), except Jack and Grass Lakes,
-- whose source is the sale listing of a membership in the private club that owns their island.
-- Still unchecked, no source said who owns them or whether they can be hunted: Arthur Refuge,
-- Big Lake (Fulton and Schuyler/Brown), Clear Lake (Mason), Crane Lake, Cuba Island, Douglas
-- Lake, Duck Creek, Goose Lake (Fulton, Marshall, Putnam), Henderson Creek, Hitchcock Slough,
-- Senachwine Lake, Towhead Lake, Long Lake (MO) and the four open Mississippi River reaches
-- (Pools 19 and 20 have no IDNR hunting-site page). A wrong "public" sends hunters onto private
-- land, so they stay unchecked.
--
-- Additive (metadata keys only). Each name must update exactly one row, or nothing is changed.
-- Owner approval required before running on production.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE a (name text, access text, note text, source text) ON COMMIT DROP;
INSERT INTO a VALUES
  -- Closed
  ('Hennepin & Hopper Lakes - Illinois River (INHS)', 'closed',
   'The Wetlands Initiative''s Sue and Wes Dixon Waterfowl Refuge: no hunting or trapping in any season. Open to visitors dawn to dusk.',
   'https://www.wetlands-initiative.org/dixon-location-and-visiting'),
  ('Spunky Bottoms - Illinois River (INHS)', 'closed',
   'The Nature Conservancy''s preserve is temporarily closed to public access; for permission to visit, contact TNC''s Illinois River Program office (309-547-2730).',
   'https://www.nature.org/en-us/get-involved/how-to-help/places-we-protect/spunky-bottoms/'),
  -- Private
  ('Jack Lake - Illinois River (INHS)', 'private',
   'On Grand Island near Bath, a private membership waterfowl club with its own boat ramp.',
   'https://www.landhub.com/property/4100-mason-county-illinois-grand-island-lodge-lifet-bath-93108449'),
  ('Grass Lake - Illinois River (INHS)', 'private',
   'On Grand Island near Bath, a private membership waterfowl club with its own boat ramp.',
   'https://www.landhub.com/property/4100-mason-county-illinois-grand-island-lodge-lifet-bath-93108449'),
  -- Limited
  ('Meredosia Lake - Illinois River (INHS)', 'limited',
   'IDNR marked sites, assigned by a public drawing in odd-numbered years; hunt within 10 feet of your site, duck hunting ends at 1 pm in the Central Zone season, rest areas closed. Meredosia NWR land itself is closed to hunting.',
   'https://huntillinois.org/sites/meredosia-lake'),
  ('Upper Peoria Lake - Illinois River (INHS)', 'limited',
   'The north end is Woodford SFWA: blinds assigned yearly by drawing, hunting only where posted open, rest areas closed. Check local rules for the rest of the lake.',
   'https://huntillinois.org/sites/woodford-sfwa'),
  ('Stewart Lake - Illinois River (INHS)', 'limited',
   'The west half (about 700 acres) was given to IDNR as public hunting land beside Sanganois SFWA; the east half is Illinois Audubon''s Stewart Lake Wildlife Sanctuary.',
   'https://illinoisaudubon.org/?p=9010');

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
