-- ===========================================
-- Waterfowl hunting access for national wildlife refuges and WMAs (2026-11-18, third pass)
--
-- Same keys as scripts/add-location-access.sql: locations.metadata.access ('public' | 'limited' |
-- 'closed' | 'private'), accessNote, accessSource, accessChecked. 'closed' here means closed to
-- waterfowl hunting (some of these refuges hunt deer or doves). Where to Hunt and the Map leave
-- out 'closed' and 'private' places as somewhere to hunt, and a PAD-US unit with the same name
-- within 30 km is left off the public land layer; a note rides along on the unit.
--
-- 37 refuges and WMAs, each from the manager's own page or 2026-27 regulations brochure (read
-- 2026-11-18): USFWS refuge hunting pages and brochures, AGFC WMA pages, TPWD WMA pages.
-- Wapanocca's newest brochure online is the 2024 one. Not checked: Cheyenne Bottoms (KDWP's site
-- refuses automated reads) and the eBird areas named after towns or regions (Amarillo Area
-- Playas, Lake Meredith, Millwood Lake and the like), which aren't one piece of land.
--
-- Additive (metadata keys only). Each name must update exactly one row, or nothing is changed.
-- Owner approval required before running on production.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE a (name text, access text, note text, source text) ON COMMIT DROP;
INSERT INTO a VALUES
  -- Arkansas refuges
  ('Bald Knob National Wildlife Refuge', 'limited',
   'State waterfowl seasons, until noon. Draw-hunt units are closed to others Fri-Sun and opening days; the sanctuary is closed Nov 15-Feb 28. Signed General Hunting and Fishing Permit required.',
   'https://www.fws.gov/sites/default/files/documents/2026-09/bald-knob-hunt-2026_web.pdf'),
  ('Big Lake National Wildlife Refuge', 'closed',
   'A waterfowl sanctuary: no migratory bird hunting.',
   'https://www.fws.gov/refuge/big-lake/visit-us/activities/hunting'),
  ('Cache River National Wildlife Refuge', 'limited',
   'Daily in the state waterfowl season until noon, with a signed Refuge Access Permit. Some areas by weekly draw ($12.50); youth quota hunts in Dec and Jan.',
   'https://www.fws.gov/refuge/cache-river/visit-us/activities/hunting'),
  ('Felsenthal National Wildlife Refuge', 'limited',
   'In the state duck seasons; all duck hunting gear out by 1 pm, 25 shells a day. The waterfowl sanctuary is closed to all entry. Signed Refuge Access Permit required.',
   'https://www.fws.gov/sites/default/files/documents/2026-07/felsenthal_nwr_2026-virtual_0.pdf'),
  ('Holla Bend National Wildlife Refuge', 'closed',
   'Waterfowl and other migratory bird hunting are prohibited on the refuge and in its Migratory Bird Closure Zone.',
   'https://www.fws.gov/sites/default/files/documents/2026-09/holla-bend-public-regs-2026_web.pdf'),
  ('Overflow National Wildlife Refuge', 'limited',
   'In the green tree reservoir when water levels allow; hunting ends at noon, 25 shells a day. The Youth Only Waterfowl Unit is by draw.',
   'https://www.fws.gov/refuge/overflow/visit-us/activities/hunting'),
  ('Pond Creek National Wildlife Refuge', 'limited',
   'Waterfowl hunting in backwater sloughs and lakes under the refuge''s public use rules (permit, hours): check its regulations.',
   'https://www.fws.gov/refuge/pond-creek/visit-us/activities/hunting'),
  ('Wapanocca National Wildlife Refuge', 'closed',
   'Closed to all migratory bird hunting.',
   'https://www.fws.gov/carp/sites/default/files/documents/WapanoccaVirtualHunt%202024.pdf'),
  ('White River National Wildlife Refuge', 'limited',
   'Dale Bumpers White River NWR: until noon, portable blinds only, out by 1 pm; some areas open set days only; closed on the White River from Holly Lake to Benzal Bridge and in the Kansas Lake Area. Annual Public Use Permit required.',
   'https://www.fws.gov/sites/default/files/documents/2026-07/dale-bumper-white-river-hunt-2026_virtual.pdf'),
  -- Arkansas WMAs
  ('Bayou Meto WMA / Stuttgart (eBird)', 'limited',
   'George H. Dunklin Jr. Bayou Meto WMA: off the water by noon; Buckingham Flats by online draw; Wrape Plantation rest area and Halowell Reservoir closed Nov 1-Feb 15.',
   'https://agfc.com/wma/george-h-dunklin-jr-bayou-meto-wma'),
  ('Dave Donaldson Black River WMA (eBird)', 'limited',
   'Off the water by noon, 25 shells; no nonresidents in the first duck segment; no boats on set dates; Winchester rest area closed Nov 1-Feb 15.',
   'https://agfc.com/wma/dave-donaldson-black-river-wma'),
  ('Earl Buss Bayou DeView WMA (eBird)', 'limited',
   'Hunting ends at noon; no boats on set dates; Lake Hogue closed except early teal season.',
   'https://agfc.com/wma/earl-buss-bayou-deview-wma'),
  ('Ed Gordon Point Remove WMA (eBird)', 'limited',
   'Tuesdays, Thursdays, Saturdays and Sundays only, ending at noon; Steve Frick rest area closed Nov 1-Feb 15.',
   'https://agfc.com/wma/ed-gordon-point-remove-wma'),
  ('Freddie Black Choctaw Island WMA (eBird)', 'limited',
   'Hunting ends at noon; waterfowl-season access limits and permit draws; no airboats in duck season (except on the Mississippi).',
   'https://agfc.com/wma/freddie-black-choctaw-island-wma'),
  ('Frog Bayou WMA (eBird)', 'limited',
   'Tuesdays, Thursdays, Saturdays and Sundays only, ending at noon; draw units, and a free Open Hunting Unit permit for flooded areas; rest areas closed Nov 1-Feb 15.',
   'https://agfc.com/wma/frog-bayou-wma'),
  ('Shirey Bay Rainey Brake WMA (eBird)', 'limited',
   'Hunting ends at noon; moist-soil units and rest areas closed Nov 1-Feb 15; no boats on set dates.',
   'https://agfc.com/wma/shirey-bay-rainey-brake-wma'),
  ('St. Francis Sunken Lands WMA (eBird)', 'limited',
   'Hunting ends at noon; the St. Francis River Permit Unit is by online draw; rest areas closed Nov 1-Feb 15.',
   'https://agfc.com/wma/st-francis-sunken-lands-wma'),
  -- Kansas
  ('Flint Hills National Wildlife Refuge', 'limited',
   'Waterfowl only south of the Neosho River.',
   'https://www.fws.gov/refuge/flint-hills/visit-us/activities/hunting'),
  ('Quivira National Wildlife Refuge', 'limited',
   'Only in areas marked as public hunting areas. Closed to all hunting, sometimes suddenly, while whooping cranes are on the refuge.',
   'https://www.fws.gov/refuge/quivira/visit-us/activities/hunting'),
  -- Louisiana
  ('Cameron Prairie National Wildlife Refuge', 'limited',
   'Youth waterfowl hunts only, by lottery: assigned blinds on Saturdays and school holidays.',
   'https://www.fws.gov/refuge/cameron-prairie/visit-us/activities/hunting'),
  ('Catahoula National Wildlife Refuge', 'limited',
   'Waterfowl hunting ends at noon, decoys and blinds out by 1 pm; no waterfowl hunting during the deer gun hunts.',
   'https://www.fws.gov/sites/default/files/documents/2026-06/catahoula-hunt-fish-2026v3_virtual.pdf'),
  ('Lacassine National Wildlife Refuge', 'limited',
   'Wednesdays, Thursdays, Saturdays and Sundays, 4 am-2 pm: a boat-only general area, and a 964-acre walk-in area for parties with a youth or senior.',
   'https://www.fws.gov/refuge/lacassine/visit-us/activities/hunting'),
  ('Sabine National Wildlife Refuge', 'limited',
   'Wednesdays, Thursdays, Saturdays and Sundays, 4 am-2 pm, on 34,000 acres reached mostly by boat; some walk-in areas.',
   'https://www.fws.gov/refuge/sabine/visit-us/activities/hunting'),
  -- New Mexico
  ('Bitter Lake National Wildlife Refuge', 'limited',
   'North Tract: all days in the state seasons. Middle Tract: approved areas Tue, Thu and Sat until 1 pm. Portable blinds only, removed daily.',
   'https://www.fws.gov/refuge/bitter-lake/visit-us/activities/hunting'),
  ('Bosque del Apache National Wildlife Refuge', 'closed',
   'No waterfowl hunting: light goose hunting has been suspended since 2018 and ducks are not open. Doves only.',
   'https://www.fws.gov/refuge/bosque-del-apache/visit-us/activities/hunting'),
  ('Las Vegas National Wildlife Refuge', 'limited',
   'Geese only, from assigned pit blinds on set Thursdays and Tuesdays in Nov and Dec, booked on Recreation.gov; shooting ends at 1 pm.',
   'https://www.fws.gov/refuge/las-vegas/visit-us/activities/hunting'),
  -- Oklahoma
  ('Sequoyah National Wildlife Refuge', 'limited',
   'In designated units (Sandtown Bottom, Vian Creeks, Webber Bottom, Girty Bottom) on set hunt days, Saturday to Tuesday; the waterfowl sanctuary is closed.',
   'https://www.fws.gov/sites/default/files/documents/2026-08/sequoyah-hunt-2026-2027.pdf'),
  ('Tishomingo National Wildlife Refuge', 'limited',
   'Refuge Units 2 and 21 only, until 1 pm. The state''s Tishomingo WMU next door is open, also until 1 pm.',
   'https://www.fws.gov/refuge/tishomingo/visit-us/activities/hunting'),
  -- Texas
  ('Anahuac National Wildlife Refuge', 'limited',
   'Now Jocelyn Nungaray NWR: refuge waterfowl permit required; East Unit by online reservation; set days by unit; closed in the early Canada goose and light goose seasons and on some holidays.',
   'https://www.fws.gov/sites/default/files/documents/2026-10/jocelyn-nungaray-hunt-2026-2027.pdf'),
  ('Aransas National Wildlife Refuge', 'closed',
   'Waterfowl hunting is prohibited on the refuge and within its proclamation boundary around the Blackjack Peninsula. Allowed from the water on the west side of St. Charles Bay.',
   'https://www.fws.gov/refuge/aransas/visit-us/activities/hunting'),
  ('Brazoria National Wildlife Refuge', 'limited',
   'Christmas Point (boat access) and Middle Bayou (walk-in), with the signed refuge hunting permit.',
   'https://www.fws.gov/refuge/brazoria/visit-us/activities/hunting'),
  ('Buffalo Lake National Wildlife Refuge', 'closed',
   'No waterfowl hunting: the refuge''s hunts are deer, dove, quail and pheasant, by TPWD draw.',
   'https://www.fws.gov/refuge/buffalo-lake/visit-us/activities/hunting'),
  ('Caddo Lake WMA', 'limited',
   'Annual Public Hunting permit required; closes for drawn hunts.',
   'https://tpwd.texas.gov/huntwild/hunt/wma/find_a_wma/list/?id=104'),
  ('Laguna Atascosa National Wildlife Refuge', 'closed',
   'No waterfowl hunting: the refuge''s hunts are deer, nilgai, feral hogs and alligators.',
   'https://www.fws.gov/refuge/laguna-atascosa/visit-us/activities/hunting'),
  ('Matagorda Island WMA', 'limited',
   'Boat access only. A Limited Public Use or Annual Public Hunting permit is required to hunt ducks.',
   'https://tpwd.texas.gov/huntwild/hunt/wma/find_a_wma/list/?id=48'),
  ('Muleshoe National Wildlife Refuge', 'closed',
   'No waterfowl hunting: the refuge''s hunts are deer, dove and quail, by TPWD draw.',
   'https://www.fws.gov/refuge/muleshoe/visit-us/activities/hunting'),
  ('Texas Point National Wildlife Refuge', 'limited',
   'With the refuge''s 2026-27 waterfowl hunting permit and a state hunting license.',
   'https://www.fws.gov/refuge/texas-point/visit-us/activities/hunting');

DO $$
DECLARE r record; n int;
BEGIN
  IF (SELECT count(*) FROM a) <> 37 THEN RAISE EXCEPTION 'expected 37 places, have %', (SELECT count(*) FROM a); END IF;
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

SELECT l.metadata->>'access' AS access, count(*) FROM locations l
WHERE l.metadata->>'accessChecked' = '2026-11-18' GROUP BY 1 ORDER BY 1;
