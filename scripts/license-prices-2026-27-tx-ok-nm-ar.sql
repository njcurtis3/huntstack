-- ===========================================
-- License prices for TX, OK, NM and AR, and one KS correction (drafted 2026-11-18)
--
-- These states' license rows came from LLM extraction and most had no prices, so the
-- Regulations page's What you need to buy card read "Price not listed". This fills the prices a
-- duck hunter pays from each agency's own 2026 fee list, and adds the rows that were missing
-- (TX HIP; NM hunting license, HMAV, Habitat Stamp, 4-day license). Every UPDATE must hit exactly
-- one row and every INSERT must be new, or the whole script rolls back.
--
-- Verified against (read 2026-11-18):
--   TX  TPWD Outdoor Annual: hunting licenses (Resident Hunting $25, Non-Resident General $315,
--       Non-Resident Special Small Game/Exotic 5-day $48), hunting endorsements (Migratory Game
--       Bird Endorsement $7, not required under 17; Federal Duck Stamp $25 plus fulfillment),
--       hunting permits and certifications (HIP Certification free).
--       https://tpwd.texas.gov/regulations/outdoor-annual/licenses/hunting-licenses-and-permits/hunting-licenses
--       https://tpwd.texas.gov/regulations/outdoor-annual/licenses/hunting-licenses-and-permits/hunting-endorsements
--   OK  ODWC license fees: Annual Hunting $36 resident, $209 nonresident; Oklahoma Waterfowl $21
--       resident, $31 nonresident; HIP $3, free online; Nonresident 5-Day $75 (not valid for
--       waterfowl). https://www.wildlifedepartment.com/licensing/regs/license-fees
--   NM  NMDOW 2026-2027 Hunting Rules and Information, fee table and pp. 13-14: Game-Hunting
--       License $25 / $90; Habitat Management and Access Validation $4 (all hunters 18+);
--       Habitat Stamp $10 (only on Forest Service and BLM land); HIP number $0; Federal Duck
--       Stamp $29; Temporary Game-Hunting License (4 days) $40 nonresident.
--       https://wildlife.dgf.nm.gov/home/publications/ (2026-2027 Hunting Rules and Info PDF)
--   AR  AGFC hunting license descriptions and fees: Federal Duck Stamp paper $25, electronic $30;
--       HIP registration free.
--       https://www.agfc.com/resources/licensing/hunting-license-descriptions-and-fees/
--
-- Also checked, no change: TX light goose limit. TPWD's 2026-2027 goose page gives 5 light geese
-- a day in both zones (3x possession), as the seasons table already has.
--
-- Run with psql against DATABASE_URL. Owner approval required before running on production.
-- ===========================================

BEGIN;

CREATE TEMP TABLE price_fix (st text, name text, res real, nonres real, descr text) ON COMMIT DROP;
INSERT INTO price_fix VALUES
  ('TX', 'Hunting License', 25, 315, 'Resident Hunting License $25. Nonresidents: Non-Resident General Hunting License $315 (any legal bird or animal), or the 5-day Non-Resident Special Small Game license ($48). Waterfowl hunters also need the Migratory Game Bird Endorsement, HIP and the Federal Duck Stamp.'),
  ('TX', 'Non-Resident Hunting License', NULL, 315, 'Non-Resident General Hunting License, valid from date of purchase until August 31; covers any legal bird or animal.'),
  ('TX', 'Migratory Game Bird Endorsement', 7, 7, 'Required to hunt waterfowl, coots, doves, cranes and other migratory game birds. Not required for hunters under 17.'),
  ('TX', 'Federal Migratory Bird Hunting and Conservation Stamp (Duck Stamp)', 25, 25, 'Required for waterfowl hunters 16 and older. $25 plus fulfillment; the electronic stamp is valid for the whole season.'),
  ('OK', 'Resident Annual Hunting License', 36, NULL, 'Annual hunting license for residents 18 and older, valid 365 days.'),
  ('OK', 'Nonresident Annual Hunting License', NULL, 209, 'Annual hunting license for nonresidents 18 and older, valid 365 days. The 5-day nonresident license is not valid for waterfowl.'),
  ('OK', 'Oklahoma Waterfowl License', 21, 31, 'Oklahoma waterfowl license (the state waterfowl stamp), valid July 1-June 30.'),
  ('OK', 'Oklahoma Waterfowl Hunting License', 21, 31, 'Same item as the Oklahoma Waterfowl License (state waterfowl stamp), valid July 1-June 30.'),
  ('OK', 'HIP Permit', 0, 0, 'Free online; $3 from a license dealer. Valid July 1-June 30.'),
  ('OK', 'Nonresident 5-day Hunting License', NULL, 75, 'Five days of choice. Not valid for big game, waterfowl, turkey or quail.'),
  ('NM', 'Federal Duck Stamp', 29, 29, 'Required for waterfowl hunters 16 and older. New Mexico''s price; the electronic stamp is valid for the whole season.'),
  ('NM', 'Harvest Information Program (HIP) Number', 0, 0, 'Free; required of all migratory game bird hunters.'),
  ('AR', 'Federal Duck Stamp', 25, 25, 'Required for waterfowl hunters 16 and older. Paper stamp $25; the electronic stamp is $30 (fees included).'),
  ('AR', 'Federal Migratory Bird Hunting and Conservation Stamp', 25, 25, 'The Federal Duck Stamp: paper $25, electronic $30.'),
  ('AR', 'Arkansas Harvest Information Program (HIP) Registration', 0, 0, 'Free; required for migratory bird hunters.'),
  ('AR', 'HIP Registration', 0, 0, 'Free; required for migratory bird hunters.'),
  ('AR', 'Arkansas HIP Registration', 0, NULL, 'Free; proof of Arkansas HIP registration.'),
  -- KS: the extracted row's $50 nonresident price is not the license (KDWP lists the nonresident
  -- 1-year hunting license at $125 on one page and $127.50 on another; $50 is the nonresident
  -- night-hunting equipment permit). KDWP's site refuses automated reads, so it is blanked rather
  -- than guessed; the $25 resident price matches KDWP's hunting fee page and is kept.
  ('KS', 'Hunting License', 25, NULL, 'Base hunting license required for hunting ducks in Kansas. Nonresident price not confirmed: check ksoutdoors.gov.');

DO $$
DECLARE f record; n int;
BEGIN
  FOR f IN SELECT * FROM price_fix LOOP
    UPDATE licenses l SET price_resident = f.res, price_non_resident = f.nonres, description = f.descr,
      metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object('pricesFrom', 'agency fee list, read 2026-11-18')
    FROM states s WHERE s.id = l.state_id AND s.code = f.st AND l.name = f.name;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION '% "%": expected 1 row, updated %', f.st, f.name, n; END IF;
  END LOOP;
END $$;

-- New rows
CREATE TEMP TABLE new_lic (st text, name text, type text, res real, nonres real, url text, descr text) ON COMMIT DROP;
INSERT INTO new_lic VALUES
  ('TX', 'HIP Certification', 'permit', 0, 0, 'https://tpwd.texas.gov/regulations/outdoor-annual/licenses/hunting-licenses-and-permits/hunting-permits-certifications',
   'Free. Tell the clerk you will hunt migratory birds and answer the short survey; your license then shows "HIP Certified". Another state''s HIP is not valid in Texas.'),
  ('NM', 'Game-Hunting License', 'base', 25, 90, 'https://onlinesales.wildlife.state.nm.us',
   'Required for all migratory game bird, upland game, big game and turkey hunters. Junior license $10 resident, $20 nonresident.'),
  ('NM', 'Habitat Management and Access Validation', 'permit', 4, 4, 'https://onlinesales.wildlife.state.nm.us',
   'HMAV, required for all hunters 18 and older on public or private land, once per license year. Added to your cart automatically with your first license.'),
  ('NM', 'Habitat Stamp', 'stamp', 10, 10, 'https://onlinesales.wildlife.state.nm.us',
   'Required only to hunt or fish on U.S. Forest Service or BLM land, once per license year.'),
  ('NM', 'Temporary Game-Hunting License (4 days)', 'base', NULL, 40, 'https://onlinesales.wildlife.state.nm.us',
   'A 4-day game-hunting license for nonresidents.');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM new_lic x JOIN states s ON s.code = x.st JOIN licenses l ON l.state_id = s.id AND l.name = x.name;
  IF n > 0 THEN RAISE EXCEPTION '% of the new license rows already exist', n; END IF;
END $$;

INSERT INTO licenses (state_id, name, license_type, description, is_resident_only, price_resident, price_non_resident, purchase_url, metadata)
SELECT s.id, x.name, x.type, x.descr, false, x.res, x.nonres, x.url,
       '{"source": "hand_entered", "entered": "2026-11-18", "pricesFrom": "agency fee list, read 2026-11-18"}'::jsonb
FROM new_lic x JOIN states s ON s.code = x.st;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM licenses l JOIN states s ON s.id = l.state_id
  WHERE s.code IN ('TX', 'NM') AND l.metadata->>'entered' = '2026-11-18' AND l.metadata->>'source' = 'hand_entered'
    AND l.name IN ('HIP Certification', 'Game-Hunting License', 'Habitat Management and Access Validation', 'Habitat Stamp', 'Temporary Game-Hunting License (4 days)');
  IF n <> 5 THEN RAISE EXCEPTION 'expected 5 new rows, found %', n; END IF;
END $$;

COMMIT;
