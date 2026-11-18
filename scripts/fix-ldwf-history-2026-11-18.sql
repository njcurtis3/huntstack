-- ===========================================
-- Louisiana LDWF aerial survey history, re-read and checked (2026-11-18)
--
-- The stored LA history before Dec 2024 was read by the LLM and mostly wrong: species shifted a
-- row (a survey's TOTAL DABBLERS stored as pintail, TOTAL DIVERS as canvasback), the same flight
-- stored under two dates, the Northeast Louisiana reports stored as if they were the coastal
-- survey, and a September 2024 survey LDWF never completed (Hurricane Francine) stored as 12,500
-- mallards. Each report here is read from the PDF's Table 1 without the LLM, by position, and
-- kept only when its species add up exactly to the table's own TOTAL DABBLERS, TOTAL DIVERS and
-- TOTAL DUCKS rows. All 32 coastal reports 2019-2026 pass; the ones stored since Dec 2024 already
-- matched and are not touched.
--
-- Deletes: the wrong rows of each re-read report (by file), the two NELA reports (a different
-- survey area: as a statewide survey they read as an 80% drop a week later) and Sept 2024.
-- Inserts: the checked species, ducks only (the table has no geese), under the report's stored
-- date, or LDWF's report date for a survey stored twice or not at all.
-- Every delete must remove exactly the expected rows and every survey must add up to its TOTAL
-- DUCKS after, or nothing is changed. Owner approval required before running on production.
-- ===========================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE del (survey_date date, file text, n int) ON COMMIT DROP;
INSERT INTO del VALUES
  ('2019-01-17', 'Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 11),
  ('2019-09-11', 'Louisiana_Aerial_Waterfowl_Survey_September_2019.pdf', 1),
  ('2019-09-12', 'Louisiana_Aerial_Waterfowl_Survey_September_2019.pdf', 1),
  ('2019-11-22', 'Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 12),
  ('2019-12-19', 'Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 10),
  ('2020-01-17', 'Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 12),
  ('2020-09-09', 'Louisiana_Aerial_Waterfowl_Survey_September_2020.pdf', 3),
  ('2020-09-10', 'Louisiana_Aerial_Waterfowl_Survey_September_2020.pdf', 2),
  ('2020-11-19', 'Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 10),
  ('2020-12-17', 'Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 9),
  ('2020-12-18', 'Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 4),
  ('2021-09-10', 'Louisiana_Aerial_Waterfowl_Survey_September_2021.pdf', 4),
  ('2021-11-17', 'Louisiana-Aerial-Waterfowl-Survey-November-2021.pdf', 11),
  ('2021-12-17', 'Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 10),
  ('2022-01-12', 'Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 11),
  ('2022-09-08', 'Louisiana-Aerial-Waterfowl-Survey-September-2022.pdf', 4),
  ('2022-09-09', 'Louisiana-Aerial-Waterfowl-Survey-September-2022.pdf', 1),
  ('2022-12-16', 'Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 9),
  ('2023-01-18', 'Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 9),
  ('2023-11-09', 'Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 10),
  ('2023-11-15', '2023-11-NELA-Waterfowl-Aerial-Survey-Report.pdf', 7),
  ('2023-12-10', 'Aerial-Survey-Dec-2023-.pdf', 10),
  ('2023-12-11', '2023-12-NELA-Waterfowl-Aerial-Survey-Report.pdf', 8),
  ('2024-01-24', 'Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 11),
  ('2024-09-09', 'waterseptember2024.pdf', 1),
  ('2024-11-08', 'Louisiana-Aerial-Wterfowl-Survey---Coastal-Zone-and-Little-River-Basin-November-2024.pdf', 9),
  ('2025-01-17', 'waterJan2025.pdf', 7),
  ('2025-09-17', 'waterseptember2025.pdf', 6);

CREATE TEMP TABLE ins (survey_date date, url text, slug text, count int, total int) ON COMMIT DROP;
INSERT INTO ins VALUES
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'mallard', 73000, 2049000),
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'mottled-duck', 52000, 2049000),
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'gadwall', 610000, 2049000),
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'american-wigeon', 8000, 2049000),
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'green-winged-teal', 385000, 2049000),
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'blue-winged-teal', 89000, 2049000),
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'northern-shoveler', 175000, 2049000),
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'pintail', 84000, 2049000),
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'scaup', 204000, 2049000),
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'ring-necked-duck', 309000, 2049000),
  ('2019-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2019.pdf', 'canvasback', 60000, 2049000),
  ('2019-09-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_September_2019.pdf', 'mottled-duck', 15000, 142000),
  ('2019-09-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_September_2019.pdf', 'blue-winged-teal', 127000, 142000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'mallard', 3000, 1042000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'mottled-duck', 19000, 1042000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'gadwall', 327000, 1042000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'american-wigeon', 9000, 1042000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'green-winged-teal', 81000, 1042000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'blue-winged-teal', 166000, 1042000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'northern-shoveler', 112000, 1042000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'pintail', 129000, 1042000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'scaup', 64000, 1042000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'ring-necked-duck', 112000, 1042000),
  ('2019-11-22', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2019.pdf', 'canvasback', 20000, 1042000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'mallard', 88000, 2571000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'mottled-duck', 35000, 2571000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'gadwall', 944000, 2571000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'american-wigeon', 27000, 2571000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'green-winged-teal', 154000, 2571000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'blue-winged-teal', 150000, 2571000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'northern-shoveler', 199000, 2571000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'pintail', 280000, 2571000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'scaup', 88000, 2571000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'ring-necked-duck', 488000, 2571000),
  ('2019-12-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2019.pdf', 'canvasback', 118000, 2571000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'mallard', 54000, 2302000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'mottled-duck', 27000, 2302000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'gadwall', 487000, 2302000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'american-wigeon', 9000, 2302000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'green-winged-teal', 406000, 2302000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'blue-winged-teal', 136000, 2302000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'northern-shoveler', 231000, 2302000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'pintail', 173000, 2302000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'scaup', 173000, 2302000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'ring-necked-duck', 443000, 2302000),
  ('2020-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2020.pdf', 'canvasback', 163000, 2302000),
  ('2020-09-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_September_2020.pdf', 'mottled-duck', 31000, 268000),
  ('2020-09-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_September_2020.pdf', 'blue-winged-teal', 236000, 268000),
  ('2020-09-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_September_2020.pdf', 'pintail', 1000, 268000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'mallard', 7000, 855000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'mottled-duck', 27000, 855000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'gadwall', 288000, 855000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'american-wigeon', 9000, 855000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'green-winged-teal', 49000, 855000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'blue-winged-teal', 160000, 855000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'northern-shoveler', 31000, 855000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'pintail', 41000, 855000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'scaup', 85000, 855000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'ring-necked-duck', 154000, 855000),
  ('2020-11-19', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2020.pdf', 'canvasback', 4000, 855000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'mallard', 50000, 2214000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'mottled-duck', 32000, 2214000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'gadwall', 456000, 2214000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'american-wigeon', 6000, 2214000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'green-winged-teal', 302000, 2214000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'blue-winged-teal', 163000, 2214000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'northern-shoveler', 172000, 2214000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'pintail', 170000, 2214000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'scaup', 136000, 2214000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'ring-necked-duck', 653000, 2214000),
  ('2020-12-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2020.pdf', 'canvasback', 74000, 2214000),
  ('2021-09-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_September_2021.pdf', 'mottled-duck', 18000, 301000),
  ('2021-09-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_September_2021.pdf', 'gadwall', 2000, 301000),
  ('2021-09-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_September_2021.pdf', 'blue-winged-teal', 281000, 301000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'mallard', 20000, 1293000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'mottled-duck', 18000, 1293000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'gadwall', 243000, 1293000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'american-wigeon', 22000, 1293000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'green-winged-teal', 106000, 1293000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'blue-winged-teal', 293000, 1293000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'northern-shoveler', 104000, 1293000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'pintail', 156000, 1293000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'scaup', 12000, 1293000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'ring-necked-duck', 316000, 1293000),
  ('2021-11-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf', 'canvasback', 3000, 1293000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'mallard', 32000, 1439000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'mottled-duck', 16000, 1439000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'gadwall', 378000, 1439000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'american-wigeon', 8000, 1439000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'green-winged-teal', 185000, 1439000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'blue-winged-teal', 202000, 1439000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'northern-shoveler', 86000, 1439000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'pintail', 191000, 1439000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'scaup', 37000, 1439000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'ring-necked-duck', 178000, 1439000),
  ('2021-12-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_December_2021.pdf', 'canvasback', 126000, 1439000),
  ('2022-01-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 'mallard', 23000, 2054000),
  ('2022-01-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 'mottled-duck', 23000, 2054000),
  ('2022-01-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 'gadwall', 341000, 2054000),
  ('2022-01-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 'green-winged-teal', 268000, 2054000),
  ('2022-01-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 'blue-winged-teal', 232000, 2054000),
  ('2022-01-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 'northern-shoveler', 139000, 2054000),
  ('2022-01-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 'pintail', 97000, 2054000),
  ('2022-01-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 'scaup', 441000, 2054000),
  ('2022-01-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 'ring-necked-duck', 333000, 2054000),
  ('2022-01-12', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-January-2022.pdf', 'canvasback', 157000, 2054000),
  ('2022-09-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-September-2022.pdf', 'mottled-duck', 21000, 285000),
  ('2022-09-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-September-2022.pdf', 'blue-winged-teal', 264000, 285000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'mallard', 2000, 802000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'mottled-duck', 19000, 802000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'gadwall', 295000, 802000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'american-wigeon', 4000, 802000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'green-winged-teal', 128000, 802000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'blue-winged-teal', 200000, 802000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'northern-shoveler', 14000, 802000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'pintail', 101000, 802000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'scaup', 26000, 802000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'ring-necked-duck', 12000, 802000),
  ('2022-11-21', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial-Waterfowl-Survey-November-2022.pdf', 'canvasback', 1000, 802000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'mallard', 24000, 2121000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'mottled-duck', 20000, 2121000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'gadwall', 463000, 2121000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'american-wigeon', 5000, 2121000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'green-winged-teal', 801000, 2121000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'blue-winged-teal', 158000, 2121000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'northern-shoveler', 111000, 2121000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'pintail', 159000, 2121000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'scaup', 77000, 2121000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'ring-necked-duck', 286000, 2121000),
  ('2022-12-16', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-December-2022.pdf', 'canvasback', 17000, 2121000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'mallard', 37000, 1988000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'mottled-duck', 19000, 1988000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'gadwall', 359000, 1988000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'american-wigeon', 9000, 1988000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'green-winged-teal', 427000, 1988000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'blue-winged-teal', 145000, 1988000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'northern-shoveler', 190000, 1988000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'pintail', 203000, 1988000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'scaup', 36000, 1988000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'ring-necked-duck', 330000, 1988000),
  ('2023-01-18', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2023.pdf', 'canvasback', 233000, 1988000),
  ('2023-11-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 'mallard', 6000, 584000),
  ('2023-11-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 'mottled-duck', 19000, 584000),
  ('2023-11-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 'gadwall', 137000, 584000),
  ('2023-11-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 'american-wigeon', 7000, 584000),
  ('2023-11-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 'green-winged-teal', 51000, 584000),
  ('2023-11-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 'blue-winged-teal', 154000, 584000),
  ('2023-11-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 'northern-shoveler', 81000, 584000),
  ('2023-11-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 'pintail', 89000, 584000),
  ('2023-11-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 'ring-necked-duck', 37000, 584000),
  ('2023-11-09', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf', 'canvasback', 3000, 584000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'mallard', 11000, 853000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'mottled-duck', 27000, 853000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'gadwall', 184000, 853000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'american-wigeon', 4000, 853000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'green-winged-teal', 151000, 853000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'blue-winged-teal', 102000, 853000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'northern-shoveler', 95000, 853000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'pintail', 72000, 853000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'scaup', 41000, 853000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'ring-necked-duck', 159000, 853000),
  ('2023-12-10', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Aerial-Survey-Dec-2023-.pdf', 'canvasback', 7000, 853000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'mallard', 24000, 1466000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'mottled-duck', 28000, 1466000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'gadwall', 326000, 1466000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'american-wigeon', 21000, 1466000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'green-winged-teal', 287000, 1466000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'blue-winged-teal', 140000, 1466000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'northern-shoveler', 76000, 1466000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'pintail', 142000, 1466000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'scaup', 179000, 1466000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'ring-necked-duck', 191000, 1466000),
  ('2024-01-24', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf', 'canvasback', 52000, 1466000),
  ('2024-11-08', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Wterfowl-Survey---Coastal-Zone-and-Little-River-Basin-November-2024.pdf', 'mottled-duck', 15000, 510000),
  ('2024-11-08', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Wterfowl-Survey---Coastal-Zone-and-Little-River-Basin-November-2024.pdf', 'gadwall', 87000, 510000),
  ('2024-11-08', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Wterfowl-Survey---Coastal-Zone-and-Little-River-Basin-November-2024.pdf', 'american-wigeon', 3000, 510000),
  ('2024-11-08', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Wterfowl-Survey---Coastal-Zone-and-Little-River-Basin-November-2024.pdf', 'green-winged-teal', 26000, 510000),
  ('2024-11-08', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Wterfowl-Survey---Coastal-Zone-and-Little-River-Basin-November-2024.pdf', 'blue-winged-teal', 229000, 510000),
  ('2024-11-08', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Wterfowl-Survey---Coastal-Zone-and-Little-River-Basin-November-2024.pdf', 'northern-shoveler', 19000, 510000),
  ('2024-11-08', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Wterfowl-Survey---Coastal-Zone-and-Little-River-Basin-November-2024.pdf', 'pintail', 129000, 510000),
  ('2024-11-08', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana-Aerial-Wterfowl-Survey---Coastal-Zone-and-Little-River-Basin-November-2024.pdf', 'ring-necked-duck', 2000, 510000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'mallard', 17000, 2249000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'mottled-duck', 15000, 2249000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'gadwall', 260000, 2249000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'american-wigeon', 8000, 2249000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'green-winged-teal', 745000, 2249000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'blue-winged-teal', 102000, 2249000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'northern-shoveler', 226000, 2249000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'pintail', 72000, 2249000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'scaup', 195000, 2249000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'ring-necked-duck', 565000, 2249000),
  ('2025-01-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterJan2025.pdf', 'canvasback', 44000, 2249000),
  ('2025-09-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterseptember2025.pdf', 'mottled-duck', 10000, 112000),
  ('2025-09-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterseptember2025.pdf', 'gadwall', 1000, 112000),
  ('2025-09-17', 'https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/waterseptember2025.pdf', 'blue-winged-teal', 101000, 112000);

DO $$
DECLARE loc uuid; r record; n int;
BEGIN
  SELECT id INTO STRICT loc FROM locations WHERE name = 'Louisiana - LDWF Aerial Survey';
  FOR r IN SELECT * FROM del LOOP
    DELETE FROM refuge_counts
    WHERE location_id = loc AND survey_date::date = r.survey_date AND regexp_replace(source_url, '.*/', '') = r.file;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> r.n THEN RAISE EXCEPTION '% %: expected to delete %, deleted %', r.survey_date, r.file, r.n, n; END IF;
  END LOOP;

  INSERT INTO refuge_counts (location_id, species_id, survey_date, count, survey_type, source_url, metadata)
  SELECT loc, sp.id, i.survey_date, i.count, 'aerial_monthly', i.url,
         jsonb_build_object('checked', '2026-11-18', 'read', 'LDWF Table 1, species add up to TOTAL DUCKS')
  FROM ins i JOIN species sp ON sp.slug = i.slug;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> (SELECT count(*) FROM ins) THEN RAISE EXCEPTION 'inserted % of % rows (unknown species slug?)', n, (SELECT count(*) FROM ins); END IF;

  FOR r IN SELECT survey_date, max(total) AS total FROM ins GROUP BY 1 LOOP
    SELECT sum(count) INTO n FROM refuge_counts WHERE location_id = loc AND survey_date::date = r.survey_date;
    IF n <> r.total THEN RAISE EXCEPTION '%: stored % but TOTAL DUCKS is %', r.survey_date, n, r.total; END IF;
  END LOOP;
END $$;

COMMIT;

SELECT survey_date::date, count(*) AS species, sum(count) AS ducks
FROM refuge_counts rc JOIN locations l ON l.id = rc.location_id
WHERE l.name = 'Louisiana - LDWF Aerial Survey' GROUP BY 1 ORDER BY 1;
