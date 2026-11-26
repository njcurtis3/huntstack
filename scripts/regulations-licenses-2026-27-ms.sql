-- ===========================================
-- Mississippi waterfowl rules and licenses, hand-entered from MDWFP (2026-11-26)
--
-- Sources:
--   Licenses: https://www.mdwfp.com/licenses-permits/hunting-and-fishing-license-prices
--     License prices only; each sale adds an agent fee ($1-$3) and a process fee ($2.49 resident,
--     $4.42 non-resident), not included here.
--   Rules: 2026-2027 Digest of Migratory Game Bird Regulations (PDF)
--     https://www.mdwfp.com/sites/default/files/2026-05/Migratory%20Gamebird%20Digest%2026-27_2.pdf
--   Federal Duck Stamp $25: the federal price (the MDWFP pages don't list it), as for the other states.
--
-- Run after scripts/waterfowl-seasons-2026-27-ms.sql (it adds the MS states row).
-- Replaces any MS licenses and 2026 regulations, so it can be re-run.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

DELETE FROM licenses l USING states s WHERE l.state_id = s.id AND s.code = 'MS';
DELETE FROM regulations r USING states s WHERE r.state_id = s.id AND s.code = 'MS' AND r.season_year = 2026;

INSERT INTO licenses (state_id, name, license_type, description, is_resident_only, price_resident, price_non_resident, purchase_url, metadata)
SELECT s.id, v.name, v.type, v.description, v.resident_only, v.res, v.nonres, 'https://www.mdwfp.com/licenses',
       '{"source": "hand_entered", "entered": "2026-11-26", "document": "MDWFP Hunting & Fishing License Prices; license price only, agent and process fees extra"}'::jsonb
FROM states s, (VALUES
  ('Small Game Hunting License', 'base',
   'Covers ducks, geese and other small game. Residents: small game hunting and freshwater fishing, $10. Non-residents: annual small game hunting, $95. Hunter education is required if born after January 1, 1972. Agent and process fees are extra.',
   false, 10.00::real, 95.00::real),
  ('All Game Hunting License', 'base',
   'All game, including deer and turkey. Residents: all game hunting and freshwater fishing, $25. Non-residents: annual all game hunting, $300 (no turkey stamp, archery, deer permit, fishing, waterfowl stamp or WMA permit). Agent and process fees are extra.',
   false, 25.00::real, 300.00::real),
  ('Sportsman''s License', 'base',
   'Residents only: all game, archery/primitive weapon/crossbow and freshwater fishing. Does not include the state or federal waterfowl stamp or the WMA permit.',
   true, 45.00::real, NULL::real),
  ('Nonresident 7-Day Small Game Hunting License', 'base',
   'Seven days of small game hunting for non-residents, $38. Waterfowl hunters still need the state waterfowl stamp and the Federal Duck Stamp.',
   false, NULL::real, 38.00::real),
  ('State Waterfowl Stamp', 'stamp',
   'Required for anyone 16 or older hunting waterfowl, along with the Federal Duck Stamp. Residents $10, non-residents $19 (electronic). Valid one year from purchase; a physical stamp must be signed in ink across the face. Hunters under 16 are exempt.',
   false, 10.00::real, 19.00::real),
  ('HIP Certification', 'permit',
   'Free; required for every licensed hunter of migratory game birds. Any license vendor certifies you: "MB" is printed on a Sportsman''s card, or "HIP" on a paper license.',
   false, 0::real, 0::real),
  ('Federal Duck Stamp', 'stamp',
   'Required for waterfowl hunters 16 and older. The paper stamp must be signed in ink across the face; the electronic E-Stamp is valid right away. Not needed for the Light Goose Conservation Order.',
   false, 25.00::real, 25.00::real),
  ('Wildlife Management Area User Permit', 'permit',
   'Needed to hunt MDWFP wildlife management areas. Valid one year. Residents $15, non-residents $30.',
   false, 15.00::real, 30.00::real),
  ('Light Goose Conservation Order Permit', 'permit',
   'Free permit to hunt snow, blue and Ross''s geese during the conservation order, with a Mississippi hunting license and state waterfowl stamp. Apply at mdwfp.com/wildlife-hunting/light-goose-permit-application.',
   false, 0::real, 0::real)
) AS v(name, type, description, resident_only, res, nonres)
WHERE s.code = 'MS';

INSERT INTO regulations (state_id, category, title, content, summary, season_year, source_url, source_document, metadata)
SELECT s.id, v.category, v.title, v.content, v.summary, 2026,
       'https://www.mdwfp.com/sites/default/files/2026-05/Migratory%20Gamebird%20Digest%2026-27_2.pdf',
       'MDWFP 2026-2027 Digest of Migratory Game Bird Regulations, ' || v.pages,
       '{"source": "hand_entered", "entered": "2026-11-26"}'::jsonb
FROM states s, (VALUES
  ('general', 'Licenses and stamps needed for waterfowl',
   'All hunters 16 and older need the Mississippi State Waterfowl Stamp and the Federal Duck Stamp to hunt waterfowl, plus a valid Mississippi hunting license unless exempt. Both stamps (or electronic proof of purchase) and the license must be on your person while hunting. The state stamp is valid for one year from purchase and, if a physical stamp, must be signed in ink across the face. Federal Duck Stamps are valid July 1 through June 30.',
   'Hunting license, state waterfowl stamp and federal stamp (16+).', 'p. 8'),
  ('general', 'HIP registration',
   'Every licensed hunter of migratory game birds in Mississippi must register in the HIP program and carry proof. Any hunting or fishing license vendor certifies you free of charge; "MB" is printed on a Sportsman''s License card, or "HIP" on a paper license receipt.',
   'Free at any license vendor; carry proof.', 'p. 8'),
  ('waterfowl', 'Shooting hours',
   'One-half hour before sunrise to sunset for all migratory game birds, except the Light Goose Conservation Order, when light geese may be hunted until 30 minutes after sunset.',
   'Half an hour before sunrise to sunset.', 'p. 3'),
  ('waterfowl', 'Non-toxic shot',
   'Non-toxic shot is required for waterfowl and coot hunting in all areas of Mississippi. Hunters may not have lead shot in their possession while hunting waterfowl or coots.',
   'Non-toxic shot only; no lead in possession.', 'p. 6'),
  ('waterfowl', 'Youth, veterans and active military waterfowl days',
   'February 6-7, 2027. Only youth 15 and under, veterans and active military personnel may hunt; youth must be accompanied by an adult 21 or older who is licensed to hunt waterfowl in Mississippi. Bag limits and shooting hours are the same as the regular season.',
   'Feb. 6-7, 2027; regular limits.', 'p. 3'),
  ('waterfowl', 'Light Goose Conservation Order',
   'Oct. 1-Nov. 12, 2026; Nov. 30-Dec. 3, 2026; Feb. 1-5, 2027; Feb. 8-Mar. 31, 2027. Hunters need a free conservation order permit (name, mailing address, email and phone), a Mississippi hunting license and the state waterfowl stamp. No daily or possession limit for snow, blue or Ross''s geese; electronic calls and unplugged shotguns allowed; shooting until 30 minutes after sunset.',
   'Free permit, license and state stamp; no limit.', 'pp. 3-4'),
  ('waterfowl', 'Public waterfowl hunting areas',
   'Regulations on wildlife management areas, Corps of Engineers lakes and national wildlife refuges may differ from statewide rules and from each other. Check the area''s regulations for closed areas, shooting hours, open dates and other restrictions before hunting, and contact the managing agency. MDWFP lists 27 WMAs and lakes, 8 Corps of Engineers areas and 10 national wildlife refuges with waterfowl hunting.',
   'Check each public area''s own rules.', 'pp. 4-5'),
  ('waterfowl', 'Hunting state line waters',
   'Mississippi has reciprocal license agreements with Arkansas and Louisiana. Hunters must know the state line and each state''s season dates and regulations where they hunt.',
   'Reciprocal licenses with Arkansas and Louisiana on state line waters.', 'p. 5'),
  ('waterfowl', 'Public waters',
   'Not all water in Mississippi is public; the Mississippi Department of Environmental Quality decides which waterways are. Hunting may be allowed on public water if it can be reached without trespass and no local ordinance forbids it. Floodwater that has overflowed a public waterway''s banks is not part of it: a practical rule is to stay within the tree lines on each bank.',
   'Stay inside the tree lines of a public waterway.', 'p. 5')
) AS v(category, title, content, summary, pages)
WHERE s.code = 'MS';

SELECT l.name, l.license_type, l.price_resident, l.price_non_resident
FROM licenses l JOIN states s ON s.id = l.state_id WHERE s.code = 'MS' ORDER BY l.license_type, l.name;
SELECT count(*) AS regulations FROM regulations r JOIN states s ON s.id = r.state_id WHERE s.code = 'MS' AND r.season_year = 2026;

COMMIT;
