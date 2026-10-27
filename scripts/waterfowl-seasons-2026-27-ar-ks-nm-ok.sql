-- ===========================================
-- AR, KS, NM and OK 2026-27 waterfowl seasons, hand-entered from each agency (2026-10-27)
--
-- Replaces the LLM-extracted year=2026 rows for these four states. What was wrong:
--   AR  duck season stored as one Nov 21-Jan 31 block (it has three segments); 4-mallard
--       cap and mottled/black duck caps missing; light geese only Oct 31-Nov 29; regular
--       Canada goose segments and white-fronted segments missing; conservation order had
--       last spring's dates (Feb-Apr 2026); gallinule, rail, snipe and woodcock seasons
--       filed under mallard (they read as open duck seasons).
--   KS  no second duck segments; possession 6 (it is 18); scaup cap missing; youth days,
--       Low Plains teal-only split, falconry missing; Canada goose "Sept 15-Apr 30" and
--       white-fronted "Sept 15-Dec 31" don't exist; light geese only as the conservation
--       order with the wrong start (Nov 1, it is Feb 15).
--   NM  "Duck Season - South Zone" was the Pacific Flyway season (Oct 19, 7 ducks); the
--       Central Flyway South Zone (Oct 28) was missing; North Zone limit 7 (it is 6); teal
--       Sept 12-Nov 20 (it is Sept 12-20); youth days missing; light goose conservation
--       order merged into the regular season; dove, band-tailed pigeon, coot, rail,
--       gallinule, snipe and sandhill crane seasons filed under mallard.
--   OK  only 3 rows: no duck or goose seasons at all; youth "days" stored as whole-season
--       ranges; conservation order Feb 15, 2026-Mar 30, 2027.
--
-- Verified against:
--   AR  https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/
--       (first duck segment ends Nov 29: AGFC corrected a Dec 1 misprint,
--        https://www.agfc.com/news/duck-season-error-in-two-agfc-publications/)
--   KS  https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt
--       https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/what-to-hunt/migratory-birds/ducks (possession 18)
--       (read in a browser: the site refuses automated requests)
--   NM  2026-2027 New Mexico Migratory Game Bird Hunting Rules and Info (PDF, rev. 2026-07-13)
--       https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/
--   OK  https://www.wildlifedepartment.com/hunting/seasons
--       https://www.wildlifedepartment.com/hunting/regs/ducks-mergansers-coots
--       https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes
--
-- Not included (no species row to hang them on): coot, sandhill crane, dove, rail,
-- gallinule, snipe, woodcock. The old rows for those are deleted, not moved.
-- Louisiana is NOT in this script: LDWF's 2026-27 regulations PDF refuses automated
-- requests and Chrome's PDF viewer can't be read, so LA stays as extracted.
--
-- Possession limits: where an agency page gives only the daily bag, possession is
-- entered as 3x daily, the federal rule for ducks and dark geese (50 CFR 20.39), and
-- the row's notes say so. Light geese have no possession limit.
--
-- Model: same as scripts/tx-waterfowl-seasons-2026-27.sql. One row per season segment;
-- seasons covering every duck hang off mallard with metadata.appliesTo = 'ducks' and
-- bag_limit.speciesLimits for the caps inside the aggregate.
-- Backup of the replaced rows: scratchpad seasons-ar-ks-la-nm-ok-2026-backup.csv (60 rows, all five states).
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

DELETE FROM seasons se USING states s
WHERE se.state_id = s.id AND s.code IN ('AR', 'KS', 'NM', 'OK') AND se.year = 2026;

WITH
-- Duck bag (and the restriction text shown with it) per state / flyway
bags(key, b, r) AS (VALUES
  ('AR', jsonb_build_object('daily', 6, 'possession', 18,
     'speciesLimits', jsonb_build_object('mallard', 4, 'wood-duck', 3, 'pintail', 3, 'redhead', 2, 'canvasback', 2, 'scaup', 1, 'mottled-duck', 1),
     'notes', 'No more than 2 of the 4 mallards may be hens; 2 black ducks. Mergansers are a separate limit of 5 (no more than 2 hooded). Coots 15. All other species: 6, including teal.'),
   '6 ducks: no more than 4 mallards (2 hens), 1 scaup, 3 wood ducks, 3 pintails, 2 redheads, 2 canvasbacks, 2 black ducks and 1 mottled duck. Mergansers: 5 (2 hooded). Coots: 15. Possession three times the daily limit. On most WMAs hunting ends at noon during the regular duck season.'),
  ('KS', jsonb_build_object('daily', 6, 'possession', 18,
     -- Scaup 1: KDWP's Ducks page and the Central Flyway framework (1 scaup) say 1; its When to
     -- Hunt page says 2. OK, NM and TX (all Central Flyway) list 1 for 2026-27.
     'speciesLimits', jsonb_build_object('mallard', 5, 'wood-duck', 3, 'pintail', 3, 'redhead', 2, 'canvasback', 2, 'scaup', 1),
     'notes', 'No more than 2 of the 5 mallards may be hens. Includes mergansers. Coots 15 (45 possession). Scaup: KDWP''s When to Hunt page says 2, its Ducks page and the federal Central Flyway limit say 1; confirm with KDWP.'),
   '6 ducks and mergansers: no more than 5 mallards (2 hens), 3 wood ducks, 3 pintails, 2 redheads, 2 canvasbacks and 1 scaup (KDWP''s When to Hunt page says 2; confirm). Coots: 15. Possession 18. From Sept. 25, 2026 nonresidents must stop at 11:59 a.m. (except teal and the light goose conservation order).'),
  ('NM-CF', jsonb_build_object('daily', 6, 'possession', 18,
     'speciesLimits', jsonb_build_object('mallard', 5, 'wood-duck', 3, 'pintail', 3, 'redhead', 2, 'canvasback', 2, 'scaup', 1),
     'notes', 'No more than 2 of the 5 mallards may be female; Mexican ducks count as mallards. 2 hooded mergansers. Coots 15 (45 possession).'),
   'Central Flyway (east of the Continental Divide). 6 ducks: no more than 5 mallards (2 female; Mexican ducks count as mallards), 1 scaup, 3 wood ducks, 2 redheads, 2 hooded mergansers, 3 pintails and 2 canvasbacks. Coots: 15. Possession three times the daily bag.'),
  ('NM-PF', jsonb_build_object('daily', 7, 'possession', 21,
     'speciesLimits', jsonb_build_object('pintail', 3, 'redhead', 2, 'canvasback', 2, 'scaup', 2),
     'notes', 'No more than 2 female mallards. Scaup open Oct. 19-Jan. 12 only.'),
   'Pacific Flyway (west of the Continental Divide). 7 ducks: no more than 2 female mallards, 2 redheads, 3 pintails, 2 canvasbacks and 2 scaup (scaup Oct. 19-Jan. 12 only). Coots and gallinules: 25. Possession three times the daily bag.'),
  ('OK', jsonb_build_object('daily', 6, 'possession', 18,
     'speciesLimits', jsonb_build_object('mallard', 5, 'wood-duck', 3, 'pintail', 3, 'redhead', 2, 'canvasback', 2, 'scaup', 1),
     'notes', 'No more than 2 of the 5 mallards may be hens. Includes mergansers. Coots 15. Possession 3x daily (federal rule; ODWC''s duck page lists daily limits only).'),
   '6 ducks, including mergansers: no more than 5 mallards (2 hens), 3 wood ducks, 3 pintails, 2 redheads, 2 canvasbacks and 1 scaup. Coots: 15.')
),
-- Default shooting hours per state (a row can override)
hours(code, h) AS (VALUES
  ('AR', '{"start": "30 minutes before sunrise", "end": "sunset", "notes": "On most WMAs, regular duck season hunting ends at noon."}'::jsonb),
  ('KS', '{"start": "one-half hour before sunrise", "end": "sunset", "notes": "Nonresidents: until 11:59 a.m. from Sept. 25, 2026, except teal and the light goose conservation order."}'::jsonb),
  ('NM', '{"start": "one-half hour before sunrise", "end": "sunset", "notes": "Bernardo, Jackson Lake, La Joya and W.S. Huey WMAs and Bottomless Lakes Overflow: until 1 p.m."}'::jsonb),
  ('OK', '{"start": "one-half hour before sunrise", "end": "sunset"}'::jsonb)
),
v(code, name, slug, season_type, start_date, end_date, units, bag_key, bag, hrs, restrictions, applies_to, source_url) AS (VALUES
  -- ═══ ARKANSAS ═══════════════════════════════════════════════════════════════
  ('AR', 'Regular Duck Season (Split 1) - Statewide', 'mallard', 'general', DATE '2026-11-21', DATE '2026-11-29', 'Statewide', 'AR', NULL::jsonb, NULL::jsonb, NULL, 'ducks', 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Regular Duck Season (Split 2) - Statewide', 'mallard', 'general', DATE '2026-12-10', DATE '2026-12-23', 'Statewide', 'AR', NULL, NULL, NULL, 'ducks', 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Regular Duck Season (Split 3) - Statewide', 'mallard', 'general', DATE '2026-12-26', DATE '2027-01-31', 'Statewide', 'AR', NULL, NULL, NULL, 'ducks', 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Youth-Only Duck Season - Statewide', 'mallard', 'youth', DATE '2027-02-06', DATE '2027-02-07', 'Statewide', 'AR', NULL, NULL,
   'Youths 15 and younger; ducks, geese, coots and mergansers; same limits as the regular seasons. A mentor 21 or older may call but not hunt.', 'ducks', 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Veterans and Active Duty Military Duck Season - Statewide', 'mallard', 'special', DATE '2027-02-06', DATE '2027-02-07', 'Statewide', 'AR', NULL, NULL,
   'Active-duty military and qualifying veterans with an approved document; same limits as the regular seasons. AGFC''s page calls this both "this day" and Feb. 6-7: confirm with AGFC.', 'ducks', 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'September Teal-Only Season - Statewide', 'blue-winged-teal', 'teal', DATE '2026-09-19', DATE '2026-09-27', 'Statewide', NULL,
   '{"daily": 6, "possession": 18, "notes": "Blue-winged, green-winged and cinnamon teal in the aggregate."}'::jsonb, '{"start": "sunrise", "end": "sunset"}'::jsonb, 'Teal only. Shooting begins at sunrise.', NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'September Teal-Only Season - Statewide', 'green-winged-teal', 'teal', DATE '2026-09-19', DATE '2026-09-27', 'Statewide', NULL,
   '{"daily": 6, "possession": 18, "notes": "Blue-winged, green-winged and cinnamon teal in the aggregate."}'::jsonb, '{"start": "sunrise", "end": "sunset"}'::jsonb, 'Teal only. Shooting begins at sunrise.', NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Early Canada Goose - Statewide', 'canada-goose', 'general', DATE '2026-09-01', DATE '2026-10-15', 'Statewide', NULL, '{"daily": 5, "possession": 15}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Canada Goose (Split 1) - Statewide', 'canada-goose', 'general', DATE '2026-11-21', DATE '2026-11-29', 'Statewide', NULL, '{"daily": 2, "possession": 6}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Canada Goose (Split 2) - Statewide', 'canada-goose', 'general', DATE '2026-12-10', DATE '2026-12-23', 'Statewide', NULL, '{"daily": 2, "possession": 6}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Canada Goose (Split 3) - Statewide', 'canada-goose', 'general', DATE '2026-12-26', DATE '2027-01-31', 'Statewide', NULL, '{"daily": 2, "possession": 6}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'White-fronted Goose (Split 1) - Statewide', 'white-fronted-goose', 'general', DATE '2026-10-31', DATE '2026-11-08', 'Statewide', NULL, '{"daily": 2, "possession": 6}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'White-fronted Goose (Split 2) - Statewide', 'white-fronted-goose', 'general', DATE '2026-11-21', DATE '2026-11-29', 'Statewide', NULL, '{"daily": 2, "possession": 6}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'White-fronted Goose (Split 3) - Statewide', 'white-fronted-goose', 'general', DATE '2026-12-10', DATE '2026-12-23', 'Statewide', NULL, '{"daily": 2, "possession": 6}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'White-fronted Goose (Split 4) - Statewide', 'white-fronted-goose', 'general', DATE '2026-12-26', DATE '2027-01-31', 'Statewide', NULL, '{"daily": 2, "possession": 6}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Geese (Split 1) - Statewide', 'snow-goose', 'general', DATE '2026-10-31', DATE '2026-11-08', 'Statewide', NULL, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Geese (Split 1) - Statewide', 'ross-goose', 'general', DATE '2026-10-31', DATE '2026-11-08', 'Statewide', NULL, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Geese (Split 2) - Statewide', 'snow-goose', 'general', DATE '2026-11-21', DATE '2026-11-29', 'Statewide', NULL, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Geese (Split 2) - Statewide', 'ross-goose', 'general', DATE '2026-11-21', DATE '2026-11-29', 'Statewide', NULL, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Geese (Split 3) - Statewide', 'snow-goose', 'general', DATE '2026-12-10', DATE '2026-12-23', 'Statewide', NULL, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Geese (Split 3) - Statewide', 'ross-goose', 'general', DATE '2026-12-10', DATE '2026-12-23', 'Statewide', NULL, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Geese (Split 4) - Statewide', 'snow-goose', 'general', DATE '2026-12-26', DATE '2027-01-31', 'Statewide', NULL, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Geese (Split 4) - Statewide', 'ross-goose', 'general', DATE '2026-12-26', DATE '2027-01-31', 'Statewide', NULL, '{"daily": 20, "notes": "Snow, blue and Ross''s geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Goose Conservation Order (Split 1) - Statewide', 'snow-goose', 'conservation_order', DATE '2027-02-01', DATE '2027-02-05', 'Statewide', NULL, '{"notes": "No bag limit."}'::jsonb, NULL, 'Special conservation order rules apply; see AGFC.', NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Goose Conservation Order (Split 1) - Statewide', 'ross-goose', 'conservation_order', DATE '2027-02-01', DATE '2027-02-05', 'Statewide', NULL, '{"notes": "No bag limit."}'::jsonb, NULL, 'Special conservation order rules apply; see AGFC.', NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Goose Conservation Order (Split 2) - Statewide', 'snow-goose', 'conservation_order', DATE '2027-02-08', DATE '2027-04-25', 'Statewide', NULL, '{"notes": "No bag limit."}'::jsonb, NULL, 'Special conservation order rules apply; see AGFC.', NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),
  ('AR', 'Light Goose Conservation Order (Split 2) - Statewide', 'ross-goose', 'conservation_order', DATE '2027-02-08', DATE '2027-04-25', 'Statewide', NULL, '{"notes": "No bag limit."}'::jsonb, NULL, 'Special conservation order rules apply; see AGFC.', NULL, 'https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/'),

  -- ═══ KANSAS ═════════════════════════════════════════════════════════════════
  ('KS', 'September Teal-Only Season - High Plains Unit', 'blue-winged-teal', 'teal', DATE '2026-09-19', DATE '2026-09-27', 'High Plains Unit', NULL, '{"daily": 6, "possession": 18, "notes": "Teal in any combination. Possession 3x daily (federal rule)."}'::jsonb, NULL, 'Teal only.', NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'September Teal-Only Season - High Plains Unit', 'green-winged-teal', 'teal', DATE '2026-09-19', DATE '2026-09-27', 'High Plains Unit', NULL, '{"daily": 6, "possession": 18, "notes": "Teal in any combination. Possession 3x daily (federal rule)."}'::jsonb, NULL, 'Teal only.', NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'September Teal-Only Season - Low Plains Unit', 'blue-winged-teal', 'teal', DATE '2026-09-12', DATE '2026-09-20', 'Low Plains Unit', NULL, '{"daily": 6, "possession": 18, "notes": "Teal in any combination. Possession 3x daily (federal rule)."}'::jsonb, NULL, 'Teal only.', NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'September Teal-Only Season - Low Plains Unit', 'green-winged-teal', 'teal', DATE '2026-09-12', DATE '2026-09-20', 'Low Plains Unit', NULL, '{"daily": 6, "possession": 18, "notes": "Teal in any combination. Possession 3x daily (federal rule)."}'::jsonb, NULL, 'Teal only.', NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Youth, Veteran and Active Military Duck Days - High Plains Unit', 'mallard', 'youth', DATE '2026-10-03', DATE '2026-10-04', 'High Plains Unit', 'KS', NULL, NULL,
   'Hunters 17 and younger (supervised by a non-hunting adult 18+), veterans and active military only; same limits as the regular season.', 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Youth, Veteran and Active Military Duck Days - Low Plains Early Zone', 'mallard', 'youth', DATE '2026-09-26', DATE '2026-09-27', 'Low Plains Early Zone', 'KS', NULL, NULL,
   'Hunters 17 and younger (supervised by a non-hunting adult 18+), veterans and active military only; same limits as the regular season.', 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Youth, Veteran and Active Military Duck Days - Low Plains Late Zone', 'mallard', 'youth', DATE '2026-10-17', DATE '2026-10-18', 'Low Plains Late Zone', 'KS', NULL, NULL,
   'Hunters 17 and younger (supervised by a non-hunting adult 18+), veterans and active military only; same limits as the regular season.', 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Youth, Veteran and Active Military Duck Days - Low Plains Southeast Zone', 'mallard', 'youth', DATE '2026-10-24', DATE '2026-10-25', 'Low Plains Southeast Zone', 'KS', NULL, NULL,
   'Hunters 17 and younger (supervised by a non-hunting adult 18+), veterans and active military only; same limits as the regular season.', 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Regular Duck Season (Split 1) - High Plains Unit', 'mallard', 'general', DATE '2026-10-10', DATE '2027-01-03', 'High Plains Unit', 'KS', NULL, NULL, NULL, 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Regular Duck Season (Split 2) - High Plains Unit', 'mallard', 'general', DATE '2027-01-22', DATE '2027-01-31', 'High Plains Unit', 'KS', NULL, NULL, NULL, 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Regular Duck Season (Split 1) - Low Plains Early Zone', 'mallard', 'general', DATE '2026-10-10', DATE '2026-12-06', 'Low Plains Early Zone', 'KS', NULL, NULL, NULL, 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Regular Duck Season (Split 2) - Low Plains Early Zone', 'mallard', 'general', DATE '2026-12-19', DATE '2027-01-03', 'Low Plains Early Zone', 'KS', NULL, NULL, NULL, 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Regular Duck Season (Split 1) - Low Plains Late Zone', 'mallard', 'general', DATE '2026-10-31', DATE '2027-01-03', 'Low Plains Late Zone', 'KS', NULL, NULL, NULL, 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Regular Duck Season (Split 2) - Low Plains Late Zone', 'mallard', 'general', DATE '2027-01-23', DATE '2027-01-31', 'Low Plains Late Zone', 'KS', NULL, NULL, NULL, 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Regular Duck Season (Split 1) - Low Plains Southeast Zone', 'mallard', 'general', DATE '2026-11-07', DATE '2027-01-03', 'Low Plains Southeast Zone', 'KS', NULL, NULL, NULL, 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Regular Duck Season (Split 2) - Low Plains Southeast Zone', 'mallard', 'general', DATE '2027-01-16', DATE '2027-01-31', 'Low Plains Southeast Zone', 'KS', NULL, NULL, NULL, 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Falconry Duck Season - Low Plains Unit (all zones)', 'mallard', 'falconry', DATE '2027-02-24', DATE '2027-03-10', 'Low Plains Unit', NULL,
   '{"daily": 3, "notes": "No more than 3 migratory birds in any combination, including coot, dove, rail, crow, snipe and woodcock."}'::jsonb, NULL, 'Extended falconry season. Closed in the High Plains Unit.', 'ducks', 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Dark Geese (Split 1) - Statewide', 'canada-goose', 'general', DATE '2026-10-31', DATE '2026-11-01', 'Statewide', NULL, '{"daily": 6, "possession": 18, "notes": "Canada and cackling geese. Possession 3x daily (federal rule)."}'::jsonb, NULL, NULL, NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Dark Geese (Split 2) - Statewide', 'canada-goose', 'general', DATE '2026-11-04', DATE '2027-02-14', 'Statewide', NULL, '{"daily": 6, "possession": 18, "notes": "Canada and cackling geese. Possession 3x daily (federal rule)."}'::jsonb, NULL, NULL, NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'White-fronted Goose (Split 1) - Statewide', 'white-fronted-goose', 'general', DATE '2026-10-31', DATE '2027-01-03', 'Statewide', NULL, '{"daily": 2, "possession": 6, "notes": "Possession 3x daily (federal rule)."}'::jsonb, NULL, NULL, NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'White-fronted Goose (Split 2) - Statewide', 'white-fronted-goose', 'general', DATE '2027-01-23', DATE '2027-02-14', 'Statewide', NULL, '{"daily": 2, "possession": 6, "notes": "Possession 3x daily (federal rule)."}'::jsonb, NULL, NULL, NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Light Geese (Split 1) - Statewide', 'snow-goose', 'general', DATE '2026-10-31', DATE '2026-11-01', 'Statewide', NULL, '{"daily": 50, "notes": "Light geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Light Geese (Split 1) - Statewide', 'ross-goose', 'general', DATE '2026-10-31', DATE '2026-11-01', 'Statewide', NULL, '{"daily": 50, "notes": "Light geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Light Geese (Split 2) - Statewide', 'snow-goose', 'general', DATE '2026-11-04', DATE '2027-02-14', 'Statewide', NULL, '{"daily": 50, "notes": "Light geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Light Geese (Split 2) - Statewide', 'ross-goose', 'general', DATE '2026-11-04', DATE '2027-02-14', 'Statewide', NULL, '{"daily": 50, "notes": "Light geese in the aggregate. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Light Goose Conservation Order - Statewide', 'snow-goose', 'conservation_order', DATE '2027-02-15', DATE '2027-04-30', 'Statewide', NULL, '{"notes": "Unlimited daily bag."}'::jsonb, NULL, NULL, NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),
  ('KS', 'Light Goose Conservation Order - Statewide', 'ross-goose', 'conservation_order', DATE '2027-02-15', DATE '2027-04-30', 'Statewide', NULL, '{"notes": "Unlimited daily bag."}'::jsonb, NULL, NULL, NULL, 'https://www.ksoutdoors.gov/outdoor-activities/hunting-in-kansas/when-to-hunt'),

  -- ═══ NEW MEXICO ═════════════════════════════════════════════════════════════
  -- Central Flyway (east of the Continental Divide); North/South split at I-40 and US 54 at Tucumcari
  ('NM', 'Youth Waterfowl Days - Central Flyway North Zone', 'mallard', 'youth', DATE '2026-10-03', DATE '2026-10-04', 'Central Flyway North Zone', 'NM-CF', NULL, NULL,
   'Youth 17 and younger, accompanied by an adult 18+ who may not hunt ducks. Ducks and coots only; same limits as the regular season.', 'ducks', 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Youth Waterfowl Days - Central Flyway South Zone', 'mallard', 'youth', DATE '2026-10-24', DATE '2026-10-25', 'Central Flyway South Zone', 'NM-CF', NULL, NULL,
   'Youth 17 and younger, accompanied by an adult 18+ who may not hunt ducks. Ducks and coots only; same limits as the regular season.', 'ducks', 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Regular Duck Season - Central Flyway North Zone', 'mallard', 'general', DATE '2026-10-10', DATE '2027-01-13', 'Central Flyway North Zone', 'NM-CF', NULL, NULL, NULL, 'ducks', 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Regular Duck Season - Central Flyway South Zone', 'mallard', 'general', DATE '2026-10-28', DATE '2027-01-31', 'Central Flyway South Zone', 'NM-CF', NULL, NULL, NULL, 'ducks', 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'September Teal-Only Season - Central Flyway', 'blue-winged-teal', 'teal', DATE '2026-09-12', DATE '2026-09-20', 'Central Flyway (North and South Zones)', NULL,
   '{"daily": 6, "possession": 18, "notes": "Blue-winged, cinnamon and green-winged teal in the aggregate."}'::jsonb, NULL, 'Teal only.', NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'September Teal-Only Season - Central Flyway', 'green-winged-teal', 'teal', DATE '2026-09-12', DATE '2026-09-20', 'Central Flyway (North and South Zones)', NULL,
   '{"daily": 6, "possession": 18, "notes": "Blue-winged, cinnamon and green-winged teal in the aggregate."}'::jsonb, NULL, 'Teal only.', NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Dark Geese - Central Flyway', 'canada-goose', 'general', DATE '2026-10-17', DATE '2027-01-31', 'Central Flyway (North and South Zones, outside the MRGV)', NULL,
   '{"daily": 5, "possession": 15, "notes": "Canada and white-fronted geese in the aggregate."}'::jsonb, NULL, 'Valencia, Socorro and Sierra counties (MRGV) are closed in the regular dark goose season.', NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Dark Geese - Central Flyway', 'white-fronted-goose', 'general', DATE '2026-10-17', DATE '2027-01-31', 'Central Flyway (North and South Zones, outside the MRGV)', NULL,
   '{"daily": 5, "possession": 15, "notes": "Canada and white-fronted geese in the aggregate."}'::jsonb, NULL, 'Valencia, Socorro and Sierra counties (MRGV) are closed in the regular dark goose season.', NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Dark Geese - Middle Rio Grande Valley', 'canada-goose', 'general', DATE '2026-12-19', DATE '2027-01-31', 'Middle Rio Grande Valley (Valencia, Socorro and Sierra counties)', NULL,
   '{"daily": 2, "season": 2, "notes": "Canada and white-fronted geese; 2 per day and 2 per season."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Dark Geese - Middle Rio Grande Valley', 'white-fronted-goose', 'general', DATE '2026-12-19', DATE '2027-01-31', 'Middle Rio Grande Valley (Valencia, Socorro and Sierra counties)', NULL,
   '{"daily": 2, "season": 2, "notes": "Canada and white-fronted geese; 2 per day and 2 per season."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Light Geese - Central Flyway', 'snow-goose', 'general', DATE '2026-10-17', DATE '2027-01-31', 'Central Flyway (North and South Zones)', NULL, '{"daily": 50, "notes": "Snow and Ross''s geese. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Light Geese - Central Flyway', 'ross-goose', 'general', DATE '2026-10-17', DATE '2027-01-31', 'Central Flyway (North and South Zones)', NULL, '{"daily": 50, "notes": "Snow and Ross''s geese. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Light Goose Conservation Order - Central Flyway', 'snow-goose', 'conservation_order', DATE '2027-02-01', DATE '2027-03-10', 'Central Flyway (North and South Zones)', NULL, '{"notes": "No bag or possession limit."}'::jsonb,
   '{"start": "one-half hour before sunrise", "end": "one-half hour after sunset", "notes": "Except on WMAs."}'::jsonb, 'Free permit required. Electronic calls and unplugged shotguns allowed.', NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Light Goose Conservation Order - Central Flyway', 'ross-goose', 'conservation_order', DATE '2027-02-01', DATE '2027-03-10', 'Central Flyway (North and South Zones)', NULL, '{"notes": "No bag or possession limit."}'::jsonb,
   '{"start": "one-half hour before sunrise", "end": "one-half hour after sunset", "notes": "Except on WMAs."}'::jsonb, 'Free permit required. Electronic calls and unplugged shotguns allowed.', NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  -- Pacific Flyway (west of the Continental Divide); North/South split at I-40
  ('NM', 'Youth Waterfowl Days - Pacific Flyway', 'mallard', 'youth', DATE '2026-10-10', DATE '2026-10-11', 'Pacific Flyway (North and South Zones)', 'NM-PF', NULL, NULL,
   'Youth 17 and younger, accompanied by an adult 18+ who may not hunt ducks. Ducks, coots and gallinules only; same limits as the regular season.', 'ducks', 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Regular Duck Season - Pacific Flyway', 'mallard', 'general', DATE '2026-10-19', DATE '2027-01-31', 'Pacific Flyway (North and South Zones)', 'NM-PF', NULL, NULL, NULL, 'ducks', 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Scaup - Pacific Flyway', 'scaup', 'general', DATE '2026-10-19', DATE '2027-01-12', 'Pacific Flyway (North and South Zones)', NULL, '{"daily": 2, "possession": 6, "notes": "Within the 7-duck aggregate."}'::jsonb, NULL, 'Scaup close Jan. 12; the rest of the duck season runs to Jan. 31.', NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese (Split 1) - Pacific Flyway North Zone', 'canada-goose', 'general', DATE '2026-09-26', DATE '2026-10-11', 'Pacific Flyway North Zone', NULL, '{"daily": 5, "possession": 15, "notes": "Canada geese and brant."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese (Split 1) - Pacific Flyway North Zone', 'white-fronted-goose', 'general', DATE '2026-09-26', DATE '2026-10-11', 'Pacific Flyway North Zone', NULL, '{"daily": 10, "possession": 30}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese (Split 1) - Pacific Flyway North Zone', 'snow-goose', 'general', DATE '2026-09-26', DATE '2026-10-11', 'Pacific Flyway North Zone', NULL, '{"daily": 20, "possession": 60, "notes": "Light geese in the aggregate."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese (Split 1) - Pacific Flyway North Zone', 'ross-goose', 'general', DATE '2026-09-26', DATE '2026-10-11', 'Pacific Flyway North Zone', NULL, '{"daily": 20, "possession": 60, "notes": "Light geese in the aggregate."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese (Split 2) - Pacific Flyway North Zone', 'canada-goose', 'general', DATE '2026-11-02', DATE '2027-01-31', 'Pacific Flyway North Zone', NULL, '{"daily": 5, "possession": 15, "notes": "Canada geese and brant."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese (Split 2) - Pacific Flyway North Zone', 'white-fronted-goose', 'general', DATE '2026-11-02', DATE '2027-01-31', 'Pacific Flyway North Zone', NULL, '{"daily": 10, "possession": 30}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese (Split 2) - Pacific Flyway North Zone', 'snow-goose', 'general', DATE '2026-11-02', DATE '2027-01-31', 'Pacific Flyway North Zone', NULL, '{"daily": 20, "possession": 60, "notes": "Light geese in the aggregate."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese (Split 2) - Pacific Flyway North Zone', 'ross-goose', 'general', DATE '2026-11-02', DATE '2027-01-31', 'Pacific Flyway North Zone', NULL, '{"daily": 20, "possession": 60, "notes": "Light geese in the aggregate."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese - Pacific Flyway South Zone', 'canada-goose', 'general', DATE '2026-10-17', DATE '2027-01-31', 'Pacific Flyway South Zone', NULL, '{"daily": 5, "possession": 15, "notes": "Canada geese and brant."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese - Pacific Flyway South Zone', 'white-fronted-goose', 'general', DATE '2026-10-17', DATE '2027-01-31', 'Pacific Flyway South Zone', NULL, '{"daily": 10, "possession": 30}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese - Pacific Flyway South Zone', 'snow-goose', 'general', DATE '2026-10-17', DATE '2027-01-31', 'Pacific Flyway South Zone', NULL, '{"daily": 20, "possession": 60, "notes": "Light geese in the aggregate."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),
  ('NM', 'Geese - Pacific Flyway South Zone', 'ross-goose', 'general', DATE '2026-10-17', DATE '2027-01-31', 'Pacific Flyway South Zone', NULL, '{"daily": 20, "possession": 60, "notes": "Light geese in the aggregate."}'::jsonb, NULL, NULL, NULL, 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-migratory-game-bird-hunting-rules-and-info/'),

  -- ═══ OKLAHOMA ═══════════════════════════════════════════════════════════════
  -- Panhandle Counties = Cimarron, Texas and Beaver (High Plains Mallard Management Unit)
  ('OK', 'Youth, Veteran and Active Military Duck Day 1 - Panhandle Counties', 'mallard', 'youth', DATE '2026-10-03', DATE '2026-10-03', 'Panhandle Counties', 'OK', NULL, NULL,
   'Youth 15 and younger (with a non-hunting adult 18+), veterans and active military. Ducks, mergansers, coots and geese; same limits as the regular season.', 'ducks', 'https://www.wildlifedepartment.com/hunting/regs/ducks-mergansers-coots'),
  ('OK', 'Youth, Veteran and Active Military Duck Day 2 - Panhandle Counties', 'mallard', 'youth', DATE '2027-01-30', DATE '2027-01-30', 'Panhandle Counties', 'OK', NULL, NULL,
   'Youth 15 and younger (with a non-hunting adult 18+), veterans and active military. Ducks, mergansers, coots and geese; same limits as the regular season.', 'ducks', 'https://www.wildlifedepartment.com/hunting/regs/ducks-mergansers-coots'),
  ('OK', 'Youth, Veteran and Active Military Duck Day 1 - Zones 1 and 2', 'mallard', 'youth', DATE '2026-11-07', DATE '2026-11-07', 'Zones 1 and 2', 'OK', NULL, NULL,
   'Youth 15 and younger (with a non-hunting adult 18+), veterans and active military. Ducks, mergansers, coots and geese; same limits as the regular season.', 'ducks', 'https://www.wildlifedepartment.com/hunting/regs/ducks-mergansers-coots'),
  ('OK', 'Youth, Veteran and Active Military Duck Day 2 - Zones 1 and 2', 'mallard', 'youth', DATE '2027-02-06', DATE '2027-02-06', 'Zones 1 and 2', 'OK', NULL, NULL,
   'Youth 15 and younger (with a non-hunting adult 18+), veterans and active military. Ducks, mergansers, coots and geese; same limits as the regular season.', 'ducks', 'https://www.wildlifedepartment.com/hunting/regs/ducks-mergansers-coots'),
  ('OK', 'Regular Duck Season - Panhandle Counties', 'mallard', 'general', DATE '2026-10-10', DATE '2027-01-13', 'Panhandle Counties', 'OK', NULL, NULL, NULL, 'ducks', 'https://www.wildlifedepartment.com/hunting/regs/ducks-mergansers-coots'),
  ('OK', 'Regular Duck Season (Split 1) - Zones 1 and 2', 'mallard', 'general', DATE '2026-11-14', DATE '2026-12-06', 'Zones 1 and 2', 'OK', NULL, NULL, NULL, 'ducks', 'https://www.wildlifedepartment.com/hunting/regs/ducks-mergansers-coots'),
  ('OK', 'Regular Duck Season (Split 2) - Zones 1 and 2', 'mallard', 'general', DATE '2026-12-12', DATE '2027-01-31', 'Zones 1 and 2', 'OK', NULL, NULL, NULL, 'ducks', 'https://www.wildlifedepartment.com/hunting/regs/ducks-mergansers-coots'),
  ('OK', 'September Teal-Only Season - Statewide', 'blue-winged-teal', 'teal', DATE '2026-09-12', DATE '2026-09-20', 'Statewide', NULL, '{"daily": 6, "possession": 18}'::jsonb, NULL, 'Teal only.', NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'September Teal-Only Season - Statewide', 'green-winged-teal', 'teal', DATE '2026-09-12', DATE '2026-09-20', 'Statewide', NULL, '{"daily": 6, "possession": 18}'::jsonb, NULL, 'Teal only.', NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'Special Resident Canada Goose - Statewide', 'canada-goose', 'general', DATE '2026-09-12', DATE '2026-09-21', 'Statewide', NULL, '{"daily": 8, "possession": 24}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'Dark Geese (Split 1) - Statewide', 'canada-goose', 'general', DATE '2026-11-07', DATE '2026-12-06', 'Statewide', NULL, '{"daily": 8, "possession": 24}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'Dark Geese (Split 2) - Statewide', 'canada-goose', 'general', DATE '2026-12-12', DATE '2027-02-14', 'Statewide', NULL, '{"daily": 8, "possession": 24}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'White-fronted Goose (Split 1) - Statewide', 'white-fronted-goose', 'general', DATE '2026-11-07', DATE '2026-12-06', 'Statewide', NULL, '{"daily": 2, "possession": 6}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'White-fronted Goose (Split 2) - Statewide', 'white-fronted-goose', 'general', DATE '2026-12-12', DATE '2027-02-07', 'Statewide', NULL, '{"daily": 2, "possession": 6}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'Light Geese (Split 1) - Statewide', 'snow-goose', 'general', DATE '2026-11-07', DATE '2026-12-06', 'Statewide', NULL, '{"daily": 50, "notes": "Snow, blue and Ross'' geese. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'Light Geese (Split 1) - Statewide', 'ross-goose', 'general', DATE '2026-11-07', DATE '2026-12-06', 'Statewide', NULL, '{"daily": 50, "notes": "Snow, blue and Ross'' geese. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'Light Geese (Split 2) - Statewide', 'snow-goose', 'general', DATE '2026-12-12', DATE '2027-02-14', 'Statewide', NULL, '{"daily": 50, "notes": "Snow, blue and Ross'' geese. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'Light Geese (Split 2) - Statewide', 'ross-goose', 'general', DATE '2026-12-12', DATE '2027-02-14', 'Statewide', NULL, '{"daily": 50, "notes": "Snow, blue and Ross'' geese. No possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'Light Goose Conservation Order - Statewide', 'snow-goose', 'conservation_order', DATE '2027-02-15', DATE '2027-03-30', 'Statewide', NULL, '{"notes": "No daily bag or possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes'),
  ('OK', 'Light Goose Conservation Order - Statewide', 'ross-goose', 'conservation_order', DATE '2027-02-15', DATE '2027-03-30', 'Statewide', NULL, '{"notes": "No daily bag or possession limit."}'::jsonb, NULL, NULL, NULL, 'https://www.wildlifedepartment.com/hunting/regs/september-teal-geese-sandhill-cranes')
)
INSERT INTO seasons (state_id, species_id, name, season_type, start_date, end_date, year,
                     bag_limit, shooting_hours, restrictions, units, source_url, metadata)
SELECT s.id, sp.id, v.name, v.season_type, v.start_date, v.end_date, 2026,
       COALESCE(v.bag, b.b),
       CASE WHEN v.season_type = 'conservation_order' AND v.hrs IS NULL THEN NULL ELSE COALESCE(v.hrs, h.h) END,
       COALESCE(v.restrictions, b.r),
       jsonb_build_array(v.units), v.source_url,
       jsonb_strip_nulls(jsonb_build_object('appliesTo', v.applies_to, 'source', lower(v.code) || '_agency',
                                            'enteredFrom', 'Agency 2026-27 regulations, verified 2026-10-27'))
FROM v
JOIN states s ON s.code = v.code
JOIN species sp ON sp.slug = v.slug
LEFT JOIN bags b ON b.key = v.bag_key
JOIN hours h ON h.code = v.code;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM (VALUES ('AR', 27), ('KS', 27), ('NM', 29), ('OK', 20)) AS e(code, n) LOOP
    IF (SELECT count(*) FROM seasons se JOIN states s ON s.id = se.state_id WHERE s.code = r.code AND se.year = 2026) <> r.n THEN
      RAISE EXCEPTION 'expected % % 2026 seasons, got %', r.n, r.code,
        (SELECT count(*) FROM seasons se JOIN states s ON s.id = se.state_id WHERE s.code = r.code AND se.year = 2026);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM seasons se JOIN states s ON s.id = se.state_id
             WHERE s.code IN ('AR','KS','NM','OK') AND se.year = 2026 AND se.bag_limit IS NULL) THEN
    RAISE EXCEPTION 'a row has no bag_limit (unknown bag_key?)';
  END IF;
END $$;

SELECT s.code, se.name, sp.slug, se.start_date::date, se.end_date::date, se.bag_limit->>'daily' AS daily
FROM seasons se JOIN states s ON s.id = se.state_id JOIN species sp ON sp.id = se.species_id
WHERE s.code IN ('AR','KS','NM','OK') AND se.year = 2026 ORDER BY s.code, se.units->>0, se.start_date, sp.slug;

COMMIT;
