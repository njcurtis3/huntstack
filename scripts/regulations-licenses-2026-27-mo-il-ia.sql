-- ===========================================
-- MO, IL and IA waterfowl rules and licenses, hand-entered from each agency (drafted 2026-11-18)
--
-- These three states have 2026-27 season rows (scripts/waterfowl-seasons-2026-27-mo-il-ia.sql)
-- but no regulation or license rows, so the Regulations page showed dates only. This adds the
-- waterfowl rules a hunter needs and the licenses, stamps and fees to buy. Inserts only: the
-- script stops if any of the three states already has a regulation or license row.
--
-- Verified against (read 2026-11-18):
--   MO  MDC pages: permit/stamp requirements, Small Game and Migratory Bird permit pages (prices),
--       Hunting Permits (federal stamp, Conservation Order permit), waterfowl regulations,
--       managed waterfowl hunts. Each row's source_url is the page it came from.
--       https://mdc.mo.gov/hunting-trapping/regulations/migratory-birdwaterfowl-permit-stamp-requirements
--       https://mdc.mo.gov/hunting-trapping/species/waterfowl/waterfowl-regulations
--   IL  IDNR 2026-2027 Illinois Digest of Hunting and Trapping Regulations (HuntIllinois),
--       pp. 3-4 (licenses, credential table), 28-29 (season table, zones), 30 (stamps, HIP),
--       33 (public area permits), 34 (migratory waterfowl regulations).
--       https://v3-wp.huntillinois.org/wp-content/uploads/2026/08/HuntTrapDigest.pdf
--       Prices are the digest's base fees, which leave out vendor and transaction fees.
--   IA  Iowa DNR 2026-27 Hunting, Trapping & Migratory Game Bird Regulations,
--       pp. 3 (licenses and fees), 12-14 (requirements, HIP), 18 (blinds, decoys),
--       20 (nontoxic areas), 24-25 (migratory game bird regulations).
--       https://www.iowadnr.gov/media/1700/download
--       The booklet's prices are "beginning Dec. 15" (2026), the date Iowa's first fee increase
--       since 2019 takes effect, and include fees; before then they are a little lower. The
--       license rows say so.
--
-- Choices:
--   MO  The Migratory Bird Hunting Permit "satisfies requirements for Migratory Game Bird
--       Harvest Registration" (MDC), so the HIP row is $0 and says it comes with the permit.
--   IA  The hunting license row is the license plus the habitat fee (residents 16-64 and every
--       nonresident 16+ pay both), so a hunter's total is right; the description gives each part.
--   IL  The $5 State Habitat Stamp is not listed: it is for upland game, deer and turkey, not
--       waterfowl (digest p. 4 and 30).
--
-- Model: regulations.metadata.source = 'hand_entered', licenses.metadata.source the same, with
-- the agency document in source_document. The Regulations page's What you need to buy card picks
-- license rows by name (RegulationsPage.tsx BUY_SLOTS); names here were chosen to match it.
--
-- Run with psql against DATABASE_URL. Owner approval required before running on production.
-- ===========================================

BEGIN;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM regulations r JOIN states s ON s.id = r.state_id WHERE s.code IN ('MO', 'IL', 'IA');
  IF n > 0 THEN RAISE EXCEPTION 'MO/IL/IA already have % regulation rows; not adding more', n; END IF;
  SELECT count(*) INTO n FROM licenses l JOIN states s ON s.id = l.state_id WHERE s.code IN ('MO', 'IL', 'IA');
  IF n > 0 THEN RAISE EXCEPTION 'MO/IL/IA already have % license rows; not adding more', n; END IF;
  SELECT count(*) INTO n FROM states WHERE code IN ('MO', 'IL', 'IA');
  IF n <> 3 THEN RAISE EXCEPTION 'expected states MO, IL and IA, found %', n; END IF;
END $$;

-- ───────────────────────── Missouri ─────────────────────────

INSERT INTO regulations (state_id, category, title, content, summary, season_year, source_url, source_document, metadata)
SELECT s.id, v.category, v.title, v.content, v.summary, 2026, v.url,
       'MDC website, read 2026-11-18', '{"source": "hand_entered", "entered": "2026-11-18"}'::jsonb
FROM states s, (VALUES
  ('general', 'Permits needed to hunt ducks and geese',
   'Missouri residents age 16 through 64 and nonresidents age 16 and older need a Small Game Hunting Permit. Residents and nonresidents age 16 and over also need a Missouri Migratory Bird Hunting Permit and a Federal Duck Stamp, signed in ink across its face (an e-Stamp bought online works right away). Missouri resident landowners hunting on their own land do not need the Small Game Hunting Permit, but still need the Migratory Bird Hunting Permit and the Duck Stamp. From the 2026-2027 season, nonresidents buy the nonresident Migratory Bird Hunting Permit ($60).',
   'Small Game permit (residents 16-64, nonresidents 16+), Migratory Bird permit and Federal Duck Stamp (16+).',
   'https://mdc.mo.gov/hunting-trapping/regulations/migratory-birdwaterfowl-permit-stamp-requirements'),
  ('general', 'Harvest registration (HIP)',
   'The Missouri Migratory Bird Hunting Permit satisfies the requirements for Migratory Game Bird Harvest Registration (HIP), so there is no separate sign-up in Missouri.',
   'HIP comes with the Migratory Bird Hunting Permit.',
   'https://mdc.mo.gov/hunting-trapping/regulations/migratory-birdwaterfowl-permit-stamp-requirements'),
  ('general', 'Hunters 15 and younger',
   'Hunters age 15 and younger do not need any permits. They must carry a valid Hunter Education Certificate Card, or hunt in the immediate presence of an adult 18 or older who is hunter-education certified or was born before January 1, 1967.',
   'No permits under 16; hunter education card, or hunt next to a qualified adult.',
   'https://mdc.mo.gov/hunting-trapping/regulations/migratory-birdwaterfowl-permit-stamp-requirements'),
  ('waterfowl', 'Youth waterfowl days',
   'Each zone has two youth-only waterfowl days. Hunters must be 15 or younger and stay in the immediate presence of an adult 18 or older, who may not hunt ducks. Youth need no permit; shooting hours and limits are the same as the regular season. A youth with a Hunter Education card needs no certified adult; otherwise the adult must be hunter-education certified unless born before January 1, 1967.',
   'Two youth days per zone, age 15 and younger, with an adult who may not hunt ducks.',
   'https://mdc.mo.gov/hunting-trapping/species/waterfowl/waterfowl-regulations'),
  ('waterfowl', 'Shooting hours',
   'One-half hour before sunrise to sunset for ducks, coots and geese. Teal season: sunrise to sunset. Light Goose Conservation Order: one-half hour before sunrise to one-half hour after sunset.',
   'Half an hour before sunrise to sunset; teal from sunrise.',
   'https://mdc.mo.gov/hunting-trapping/species/waterfowl/waterfowl-regulations'),
  ('waterfowl', 'Shotguns and shells',
   'Only shotguns 10 gauge or smaller. A shotgun must not hold more than 3 shells in the magazine and chamber combined; one that can hold more must be plugged with a one-piece filler that cannot be removed without disassembling the gun. During the Light Goose Conservation Order, shotguns holding more than three shells may be used.',
   '10 gauge or smaller, 3 shells (plugged), except in the Conservation Order.',
   'https://mdc.mo.gov/hunting-trapping/species/waterfowl/waterfowl-regulations'),
  ('waterfowl', 'Nontoxic shot',
   'Shells possessed or used while hunting ducks, geese, teal and coots anywhere in Missouri must be loaded with shot the U.S. Fish and Wildlife Service has approved as nontoxic: steel (iron), bismuth-tin, copper-clad iron, corrosion-inhibited copper and several tungsten blends, among others. Lead shot is also banned for all shotgun hunting on posted conservation areas, including Eagle Bluffs, Four Rivers, Duck Creek and Ted Shanks.',
   'Steel or other approved nontoxic shot for all waterfowl.',
   'https://mdc.mo.gov/hunting-trapping/regulations/nontoxic-shot-regulations'),
  ('waterfowl', 'Calls, decoys and baiting',
   'Electronic or electronically activated calls, and recorded or amplified calls, are prohibited, except for light geese during the Conservation Order. Live decoys are prohibited: tame or captive ducks and geese must be removed at least 10 days before hunting and kept out of sight and hearing of migrating waterfowl. Baiting is prohibited; an area stays baited for 10 days after all bait is removed.',
   'No electronic calls (except light geese in the Conservation Order), no live decoys, no bait.',
   'https://mdc.mo.gov/hunting-trapping/species/waterfowl/waterfowl-regulations'),
  ('waterfowl', 'Boats, vehicles and sink boxes',
   'You may shoot from a motorboat or sailboat only when the motor is shut off and/or the sails are furled and the boat has stopped moving. Hunting from a motor vehicle or aircraft is prohibited (people with paraplegia or missing one or both legs may hunt from a stationary vehicle). Sink boxes and other low-floating devices that hide the hunter below the water are prohibited.',
   'Motor off and boat stopped before shooting; no sink boxes.',
   'https://mdc.mo.gov/hunting-trapping/species/waterfowl/waterfowl-regulations'),
  ('waterfowl', 'Retrieving birds and waste',
   'Make a reasonable effort to retrieve every bird killed or crippled, and keep it in your custody until it reaches your home, lodging or a taxidermist. Leaving any edible portion of a bird is illegal.',
   'Retrieve what you shoot; no wasted meat.',
   'https://mdc.mo.gov/hunting-trapping/species/waterfowl/waterfowl-regulations'),
  ('waterfowl', 'Possession, transport and tagging',
   'On opening day, possession may not exceed the daily limit. No more than one daily limit may be held between where birds were taken and your vehicle, home or lodging, a preservation facility, a post office or a common carrier. Each bird must keep its head or one fully feathered wing attached while it is transported home or to a taxidermist. Before giving birds to someone else (as a gift, to transport, or to a processor, storage or taxidermist) tag them with your address, the number of birds by species, the date they were killed and your signature; boxes mailed or shipped must carry the same information.',
   'One daily limit in the field; head or wing attached; tag birds you give away.',
   'https://mdc.mo.gov/hunting-trapping/species/waterfowl/waterfowl-regulations'),
  ('waterfowl', 'Managed waterfowl areas',
   'MDC runs managed waterfowl hunts on its wetland areas, with draws to prevent crowding. Missouri residents with a conservation ID number can apply online for a reservation, which guarantees a place to hunt on a specific day at a specific area. Residents and nonresidents can hunt in a reservation holder''s party (up to four people), or arrive at the area and draw for a spot in the morning drawing (the "poor line"). Application dates and draw times are on MDC''s managed hunts pages.',
   'Reservations for residents, parties of four, and a morning poor-line draw open to everyone.',
   'https://mdc.mo.gov/hunting-trapping/species/waterfowl/managed-hunts-waterfowl'),
  ('waterfowl', 'Light Goose Conservation Order',
   'Feb. 7 to April 30, 2027, for snow, blue and Ross''s geese. Hunters 16 and older need only a Conservation Order Permit ($5.50 resident, $54 nonresident); the Small Game permit, Migratory Bird permit and Federal Duck Stamp are not required. Shotguns holding more than three shells and electronic calls may be used; nontoxic shot is still required. Shooting hours are one-half hour before sunrise to one-half hour after sunset.',
   'Feb. 7-Apr. 30, 2027: Conservation Order Permit only, unplugged guns and electronic calls allowed.',
   'https://mdc.mo.gov/hunting-trapping/seasons/light-goose-conservation-order')
) AS v(category, title, content, summary, url)
WHERE s.code = 'MO';

INSERT INTO licenses (state_id, name, license_type, description, is_resident_only, price_resident, price_non_resident, purchase_url, metadata)
SELECT s.id, v.name, v.type, v.description, v.resident_only, v.res, v.nonres, 'https://mdc.mo.gov/buypermits',
       '{"source": "hand_entered", "entered": "2026-11-18", "document": "MDC permit pages, 2026 prices"}'::jsonb
FROM states s, (VALUES
  ('Small Game Hunting Permit', 'base', 'Required to hunt ducks, geese and other small game for Missouri residents 16-64 and nonresidents 16 and older. Resident landowners on their own land are exempt.', false, 11.50::real, 108.50::real),
  ('Migratory Bird Hunting Permit', 'permit', 'Required for residents and nonresidents 16 and older to hunt waterfowl, doves, snipe, woodcock and rails, along with a small game permit. Nonresidents buy the nonresident version ($60), new for the 2026-2027 season. Satisfies harvest registration (HIP).', false, 8.00::real, 60.00::real),
  ('Migratory Bird Harvest Registration (HIP)', 'permit', 'Included with the Migratory Bird Hunting Permit; no separate sign-up.', false, 0::real, 0::real),
  ('Federal Duck Stamp', 'stamp', 'Required for waterfowl hunters 16 and older. $25 for the paper stamp, which must be signed in ink across the face; the electronic e-Stamp costs $32 and is valid right away.', false, 25.00::real, 25.00::real),
  ('Conservation Order Permit', 'permit', 'The only permit needed to hunt snow, blue and Ross''s geese during the Light Goose Conservation Order (Feb. 7-Apr. 30, 2027), for hunters 16 and older.', false, 5.50::real, 54.00::real),
  ('Nonresident Daily Small Game Permit', 'base', 'A one-day small game permit for nonresidents, $16 a day; may be bought for several days. Waterfowl hunters still need the Migratory Bird Hunting Permit and the Federal Duck Stamp.', false, NULL::real, 16.00::real)
) AS v(name, type, description, resident_only, res, nonres)
WHERE s.code = 'MO';

-- ───────────────────────── Illinois ─────────────────────────

INSERT INTO regulations (state_id, category, title, content, summary, season_year, source_url, source_document, metadata)
SELECT s.id, v.category, v.title, v.content, v.summary, 2026,
       'https://v3-wp.huntillinois.org/wp-content/uploads/2026/08/HuntTrapDigest.pdf',
       'IDNR 2026-2027 Illinois Digest of Hunting and Trapping Regulations, ' || v.pages,
       '{"source": "hand_entered", "entered": "2026-11-18"}'::jsonb
FROM states s, (VALUES
  ('general', 'Licenses and stamps needed for waterfowl',
   'To hunt migratory waterfowl, residents and nonresidents need a hunting license, the State Migratory Waterfowl Stamp (age 18 and older), the Federal Duck Stamp (age 16 and older) and HIP certification. Disabled hunters, servicemembers and landowners may be exempt from some of these; see the digest''s table on page 4. Annual licenses and state stamps go on sale March 1 and are valid through March 31 of the following year. Carry your license and stamps while hunting.',
   'Hunting license, state stamp (18+), federal stamp (16+) and HIP.', 'pp. 3-4, 29'),
  ('general', 'HIP registration',
   'Free HIP (Harvest Information Program) registration is required every year to hunt migratory game birds. Get it when you buy your hunting or sportsman license, or call 1-866-716-6550 and record the transaction number on your license. Lifetime license holders must register every year too. HIP is per state: register in each state where you hunt migratory birds.',
   'Free, every year, with your license or at 1-866-716-6550.', 'p. 30'),
  ('general', 'Hunter education',
   'Anyone born on or after January 1, 1980 must complete a hunter safety education course, or show a hunting license from Illinois or another state from a prior year, before buying a hunting license.',
   'Born 1980 or later: hunter safety course first.', 'p. 3'),
  ('waterfowl', 'Shooting hours',
   'One-half hour before sunrise to sunset for ducks, coots, geese and brant, including youth days. Light Goose Conservation Order: one-half hour before sunrise to one-half hour after sunset.',
   'Half an hour before sunrise to sunset.', 'pp. 28-29'),
  ('waterfowl', 'Shotguns and shells',
   'No shotgun larger than 10 gauge; no rifle, pistol, punt gun, battery gun or swivel gun. A shotgun capable of holding more than three shells must be plugged with a one-piece filler that limits it to three and cannot be removed without disassembling the gun. This does not apply during the Light Goose Conservation Order.',
   '10 gauge or smaller, 3 shells (plugged), except in the Conservation Order.', 'p. 34'),
  ('waterfowl', 'Non-toxic shot',
   'While hunting waterfowl (including coots and captive-reared mallards), snipe or rail you may not possess any shotgun shells not approved as non-toxic by federal regulations. Most shells from major manufacturers are approved. Several IDNR sites also require non-toxic shot for other hunting. Steel #3 is ballistically similar to lead #5.',
   'Only approved non-toxic shells in your possession while waterfowl hunting.', 'pp. 30, 34'),
  ('waterfowl', 'Calls and decoys',
   'No live decoys: live, tame or captive ducks and geese must be removed for 10 consecutive days before hunting and kept in an enclosure that muffles their calls and hides them from migrating waterfowl. No recorded or electronic calls, except for snow and Ross''s geese during the Light Goose Conservation Order.',
   'No live decoys; no electronic calls except in the Conservation Order.', 'p. 34'),
  ('waterfowl', 'Boats, blinds and sink boxes',
   'You may not hunt waterfowl from a watercraft moving under mechanical power or sail, or from a floating blind that is not anchored (a scull boat may be used on certain public waters). Sink boxes are illegal. No uncased or loaded shotgun in a motorized boat, except an uncased, unloaded gun to chase crippled birds within 400 yards of the blind they fell from, right after they fall; load it and shoot only after the motor is completely shut off and the boat has stopped. You may not drive, rally or chase waterfowl with any motorized conveyance or sailboat.',
   'Shoot only with the motor off and the boat stopped; anchored blinds; no rallying.', 'p. 34'),
  ('waterfowl', 'Baiting',
   'You may not take migratory game birds by baiting, or on or over an area you know or should know is baited. An area stays baited for 10 consecutive days after the bait is removed. Standing or flooded standing crops, manipulated natural vegetation, flooded harvested cropland and normal agricultural planting or harvest are not baiting.',
   'No hunting over bait, or within 10 days of its removal.', 'p. 34'),
  ('waterfowl', 'Retrieving birds and wanton waste',
   'Retrieve, if possible, and keep in your custody every bird killed or crippled (you need permission to enter private property). A wounded bird you reduce to possession must be killed at once and counts toward your daily limit. Wasting the usable (breast) meat of any migratory game bird is illegal.',
   'Retrieve what you shoot; keep the breast meat.', 'p. 34'),
  ('waterfowl', 'Possession, transport and tagging',
   'No more than one daily limit in the field or on the way home. No live migratory game birds. Birds must keep their head or one fully feathered wing attached while being transported from the field to your home or a preservation facility. Birds left anywhere but your home, or with another person, must be tagged with your signature and address, the number of birds by species and the dates they were killed (tags at huntillinois.org/waterfowl). Shipped packages must be labeled outside with sender, recipient and the number of birds by species.',
   'One daily limit in the field; head or wing attached; tag birds you leave with others.', 'p. 34'),
  ('waterfowl', 'Public duck and goose hunting area permits',
   'Site-specific permits on several IDNR sites are drawn by lottery: first lottery (Illinois residents only) Aug. 16-31; second, Sept. 1-15, for unsuccessful residents, nonresidents and new applicants; third, Sept. 16-28. Up to 5 duck and 5 goose permits can be obtained. Unfilled permits are first-come, first-served online from Oct. 1 until 72 hours before the hunt date. Youth (ages 10-17) apply on paper Sept. 1-Oct. 1. More than 100 public sites offer waterfowl hunting; see each site''s hunter fact sheet on huntillinois.org.',
   'Lotteries Aug. 16-Sept. 28, then first-come from Oct. 1.', 'p. 33'),
  ('waterfowl', 'Youth waterfowl days',
   'Youth hunters must be 17 or younger and have a hunting license and HIP certification, unless hunting on property where they live. Youth under 16 need no stamps; the federal duck stamp is required from age 16. An adult at least 18 must accompany the youth into the field, and hunters 18 and older may not hunt waterfowl or coots on youth days (see the digest for the exception). Limits are the regular season''s, except scaup, 2 a day.',
   'Age 17 and younger, with an adult who may not hunt.', 'pp. 28-29'),
  ('waterfowl', 'Light Goose Conservation Order',
   'Snow and Ross''s geese: North Zone Jan. 27-Apr. 30, 2027; Central and South Zones Feb. 1-Apr. 30, 2027. No daily or possession limit. Unplugged shotguns (no limit on shells) and electronic calls may be used. The federal duck stamp is not required; the Illinois waterfowl stamp and a hunting license are.',
   'Late Jan./Feb.-Apr. 30, 2027: no limit, unplugged guns and electronic calls.', 'p. 29')
) AS v(category, title, content, summary, pages)
WHERE s.code = 'IL';

INSERT INTO licenses (state_id, name, license_type, description, is_resident_only, price_resident, price_non_resident, purchase_url, metadata)
SELECT s.id, v.name, v.type, v.description, false, v.res, v.nonres, 'https://www.exploremoreil.com',
       '{"source": "hand_entered", "entered": "2026-11-18", "document": "IDNR 2026-2027 Digest of Hunting and Trapping Regulations; base fees, vendor fees not included"}'::jsonb
FROM states s, (VALUES
  ('Hunting License', 'base', 'Annual hunting license, on sale March 1 and valid through March 31 of the next year. Base fee; vendor fees are extra. Senior, sportsman, apprentice and youth licenses also exist.', 12.00::real, 57.00::real),
  ('Nonresident 5-Day Hunting License', 'base', 'A 5-day hunting license for nonresidents. Base fee; vendor fees are extra.', NULL::real, 35.00::real),
  ('State Migratory Waterfowl Stamp', 'stamp', 'Required for anyone 18 or older, including lifetime license holders, to hunt migratory waterfowl. Disabled hunters, servicemembers and landowners may be exempt. Base fee; vendor fees are extra.', 15.00::real, 15.00::real),
  ('HIP Certification', 'permit', 'Free; required every year to hunt migratory game birds. Get it with your license or at 1-866-716-6550.', 0::real, 0::real),
  ('Federal Duck Stamp', 'stamp', 'Federal Migratory Bird Hunting and Conservation Stamp, required from age 16. The paper stamp must be signed in ink across the face; electronic stamps are valid nationwide for the season.', 25.00::real, 25.00::real)
) AS v(name, type, description, res, nonres)
WHERE s.code = 'IL';

-- ───────────────────────── Iowa ─────────────────────────

INSERT INTO regulations (state_id, category, title, content, summary, season_year, source_url, source_document, metadata)
SELECT s.id, v.category, v.title, v.content, v.summary, 2026,
       'https://www.iowadnr.gov/media/1700/download',
       'Iowa DNR 2026-27 Hunting, Trapping & Migratory Game Bird Regulations, ' || v.pages,
       '{"source": "hand_entered", "entered": "2026-11-18"}'::jsonb
FROM states s, (VALUES
  ('general', 'Licenses and fees needed for waterfowl',
   'Hunters 16 and older need a hunting license. Iowa residents 16-64 and nonresidents 16 and older also pay the wildlife habitat fee. Everyone 16 and older must pay the Iowa Migratory Game Bird Fee to hunt geese, brant, ducks, coots and other migratory game birds, even if a hunting license is not required, and carry a Federal Duck Stamp signed in ink across its face (an E-Stamp is valid for the whole season).',
   'Hunting license, habitat fee, migratory game bird fee and federal stamp (16+).', 'pp. 12-14'),
  ('general', 'HIP registration',
   'All licensed hunters pursuing migratory game birds must register for HIP every year, in the Go Outdoors Iowa app or through the link at www.iowadnr.gov/waterfowl. Write the confirmation number on your license, print an updated license, or keep a screenshot as proof; conservation officers enforce it. Youth hunters who are not required to have a hunting license do not register.',
   'Register every year in the Go Outdoors Iowa app; carry the confirmation number.', 'p. 14'),
  ('general', 'Hunter education and young hunters',
   'Hunters born after Jan. 1, 1972 must complete a hunter education course to get a hunting license. Hunters under 16 under the direct supervision of a licensed parent, guardian or other adult need no license or fees (one licensed adult per unlicensed hunter). Residents 12 to 15 may hunt without an adult if they have a hunting license and have passed hunter education. An apprentice license lets someone 16 or older hunt with a licensed mentor without hunter education, twice in a lifetime.',
   'Born after 1971: hunter education; under 16 with a licensed adult needs no license.', 'pp. 12-13'),
  ('waterfowl', 'Youth waterfowl days',
   'Resident hunters 15 or younger may hunt waterfowl on Youth Waterfowl Hunting Days without a hunting license, federal duck stamp or Iowa fees. Each youth must be accompanied by an adult 18 or older who has a hunting license and has paid the habitat and migratory game bird fees if required. Shooting hours and limits are the regular season''s.',
   'Residents 15 and younger, no license needed, with a licensed adult.', 'pp. 10, 21'),
  ('waterfowl', 'Shooting hours',
   'One-half hour before sunrise to sunset for ducks, geese and coots. September teal season: sunrise to sunset. Light Goose Conservation Order: one-half hour before sunrise to one-half hour after sunset.',
   'Half an hour before sunrise to sunset; teal from sunrise.', 'pp. 10, 21'),
  ('waterfowl', 'Shotguns and shells',
   'No shotgun larger than 10 gauge, and no rifle, pistol, crossbow, punt, battery or swivel gun. A shotgun capable of holding more than three shells must be plugged with a one-piece filler that cannot be removed without disassembling the gun. Unplugged shotguns may be used during the Light Goose Conservation Order.',
   '10 gauge or smaller, 3 shells (plugged), except in the Conservation Order.', 'p. 24'),
  ('waterfowl', 'Nontoxic shot',
   'No one may take ducks, geese (including brant), rails, snipe or coots while possessing shot, in shells or loose for muzzleloading, other than approved nontoxic shot. Nontoxic shot is also required for all hunting, including turkey, on federal Waterfowl Production Areas and on the state areas listed in the regulations.',
   'Only approved nontoxic shot in your possession while waterfowl hunting.', 'pp. 20, 25'),
  ('waterfowl', 'Calls, decoys and baiting',
   'No live decoys: tame or captive ducks and geese must be confined out of sight and muffled for 10 consecutive days before hunting. No recorded or electrically amplified calls, except during the Light Goose Conservation Order. Motorized or mechanical decoys are legal for waterfowl. No hunting by baiting or over a baited area; an area stays baited for 10 days after all bait is removed. Standing or flooded crops, natural vegetation and normal agricultural operations are not baiting.',
   'Spinning-wing decoys legal; no live decoys, electronic calls or bait.', 'pp. 18, 24'),
  ('waterfowl', 'Boats, vehicles and drones',
   'You may not shoot from a motorboat or sailboat unless the motor is completely shut off and/or the sails furled and it has stopped moving, or use any motor-driven land, water or air conveyance or sailboat to concentrate, drive or rally birds. No hunting from motor vehicles or aircraft (people with paraplegia or missing one or both legs may hunt from a stationary vehicle), and no sink boxes. Drones may not be used while hunting.',
   'Motor off and boat stopped before shooting; no rallying, sink boxes or drones.', 'pp. 18, 24'),
  ('waterfowl', 'Blinds and decoys on game management areas',
   'Blinds on game management areas are first-come, first-served, whatever their type. You may build a blind only from natural vegetation, cutting nothing but willows, and may not drive nails or other metal into trees. Portable blinds and decoys are not allowed on game management areas from one hour after sunset until midnight, and decoys may not be left unattended for more than 30 minutes between midnight and one hour after sunset. No boat may be anchored away from shore and left unattended unless tied to a legal buoy.',
   'First-come blinds; take blinds and decoys out each evening.', 'p. 18'),
  ('waterfowl', 'Retrieving birds',
   'Make a reasonable effort to retrieve every migratory game bird you kill or cripple, and keep it in your custody where it was taken or on the way to your vehicle, home or lodging, a preservation facility, a post office or a common carrier.',
   'Retrieve what you shoot and keep it with you.', 'p. 25'),
  ('waterfowl', 'Light Goose Conservation Order',
   'Snow and Ross''s geese may be taken during the Light Goose Conservation Order. Hunters need a valid hunting license, the habitat and migratory game bird fees, and HIP registration if required; a federal duck stamp is not required. No daily or possession limit. Electronic callers and unplugged shotguns may be used. Shooting hours are one-half hour before sunrise to one-half hour after sunset.',
   'No limit, electronic calls and unplugged guns; no federal stamp needed.', 'p. 21')
) AS v(category, title, content, summary, pages)
WHERE s.code = 'IA';

INSERT INTO licenses (state_id, name, license_type, description, is_resident_only, price_resident, price_non_resident, purchase_url, metadata)
SELECT s.id, v.name, v.type, v.description, false, v.res, v.nonres, 'https://www.iowadnr.gov/things-do/hunting-trapping/hunting-licenses',
       '{"source": "hand_entered", "entered": "2026-11-18", "document": "Iowa DNR 2026-27 regulations p. 3, prices beginning Dec. 15, 2026, fees included"}'::jsonb
FROM states s, (VALUES
  ('Hunting License with Habitat Fee', 'base', 'Hunting license ($23 resident 16+, $137 nonresident 18+) plus the wildlife habitat fee ($15.50; residents 16-64 and every nonresident). Prices from Dec. 15, 2026, fees included; a little lower before then. Nonresidents 16-17 pay $33.50 for the license.', 36.50::real, 151.00::real),
  ('Nonresident 5-Day Hunting License', 'base', 'A 5-day hunting license for nonresidents 18 and older, plus the $15.50 habitat fee. Not valid for deer or turkey. Price from Dec. 15, 2026.', NULL::real, 80.50::real),
  ('Iowa Migratory Game Bird Fee', 'permit', 'Required for residents and nonresidents 16 and older to hunt ducks, geese, coots and other migratory game birds, even if a hunting license is not required. Price from Dec. 15, 2026, fees included.', 12.50::real, 12.50::real),
  ('HIP Registration', 'permit', 'Free; required every year in the Go Outdoors Iowa app or at www.iowadnr.gov/waterfowl.', 0::real, 0::real),
  ('Federal Duck Stamp', 'stamp', 'Required for waterfowl hunters 16 and older, signed in ink across the face. Iowa''s price includes fees; the E-Stamp is valid for the whole season.', 31.00::real, 31.00::real)
) AS v(name, type, description, res, nonres)
WHERE s.code = 'IA';

-- Checks: the counts this script means to add
DO $$
DECLARE r int; l int;
BEGIN
  SELECT count(*) INTO r FROM regulations x JOIN states s ON s.id = x.state_id WHERE s.code IN ('MO', 'IL', 'IA');
  SELECT count(*) INTO l FROM licenses x JOIN states s ON s.id = x.state_id WHERE s.code IN ('MO', 'IL', 'IA');
  IF r <> 13 + 14 + 12 THEN RAISE EXCEPTION 'expected 39 regulation rows, got %', r; END IF;
  IF l <> 6 + 5 + 5 THEN RAISE EXCEPTION 'expected 16 license rows, got %', l; END IF;
END $$;

COMMIT;
