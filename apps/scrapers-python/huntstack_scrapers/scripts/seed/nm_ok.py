"""Seed NM and OK structured data from verified web sources.

Sources:
- NM seasons: eregulations.com/newmexico/hunting, USFWS Central Flyway frameworks
- OK seasons: wildlifedepartment.com/hunting/seasons + species pages
- OK licenses: wildlifedepartment.com/licensing/regs/license-fees
"""
import os, sys, json, psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

# Get state IDs
cur.execute("SELECT id, code FROM states WHERE code IN ('NM', 'OK')")
state_map = {code: str(sid) for sid, code in cur.fetchall()}

# Get species IDs
cur.execute("SELECT slug, id FROM species")
species_map = {slug: str(sid) for slug, sid in cur.fetchall()}

def get_species(name):
    """Resolve species name to ID."""
    aliases = {
        "mallard": "mallard", "duck": "mallard", "ducks": "mallard",
        "snow goose": "snow-goose", "light goose": "snow-goose", "light geese": "snow-goose",
        "canada goose": "canada-goose", "dark goose": "canada-goose", "dark geese": "canada-goose",
        "white-fronted goose": "white-fronted-goose",
        "teal": "green-winged-teal", "september teal": "green-winged-teal",
        "coot": "american-coot", "coots": "american-coot",
        "snipe": "wilsons-snipe", "sandhill crane": "sandhill-crane",
        "dove": "mourning-dove", "woodcock": "american-woodcock",
        "merganser": "mallard", "gallinule": "mallard", "rail": "mallard",
        "crow": "mallard",
    }
    slug = aliases.get(name.lower(), name.lower().replace(" ", "-"))
    return species_map.get(slug, species_map.get("mallard"))

YEAR = 2025
META = json.dumps({"extracted_at": "2026-02-16", "source": "web_verified"})

# ============================================================
# NEW MEXICO SEASONS (2025-2026)
# Source: eregulations.com + USFWS Central Flyway frameworks
# ============================================================

NM_SEASONS = [
    # Central Flyway
    {"name": "Duck & Coot Season - North Zone (Central Flyway)", "species": "duck",
     "season_type": "general", "start": "2025-10-11", "end": "2026-01-14",
     "bag": {"daily": 6, "possession": 18}, "zones": ["North Zone"],
     "restrictions": "Mallard: 5 (2 hen max). Pintail: 3. Redhead: 2. Canvasback: 2. Scaup: 1. Wood duck: 3. Coot: 15 daily."},
    {"name": "Duck & Coot Season - South Zone (Central Flyway)", "species": "duck",
     "season_type": "general", "start": "2025-10-28", "end": "2026-01-31",
     "bag": {"daily": 6, "possession": 18}, "zones": ["South Zone"],
     "restrictions": "Mallard: 5 (2 hen max). Pintail: 3. Redhead: 2. Canvasback: 2. Scaup: 1. Wood duck: 3. Coot: 15 daily."},
    {"name": "September Teal Season", "species": "teal",
     "season_type": "teal", "start": "2025-09-13", "end": "2025-09-21",
     "bag": {"daily": 6, "possession": 18}, "zones": ["Statewide"]},
    {"name": "Dark Goose Season (Central Flyway)", "species": "canada goose",
     "season_type": "general", "start": "2025-10-17", "end": "2026-01-31",
     "bag": {"daily": 5, "possession": 15}, "zones": ["Statewide"],
     "restrictions": "Canada, cackling, white-fronted combined."},
    {"name": "MRGV Dark Goose Season", "species": "canada goose",
     "season_type": "general", "start": "2025-12-19", "end": "2026-01-31",
     "bag": {"daily": 5, "possession": 15}, "zones": ["Middle Rio Grande Valley"]},
    {"name": "Light Goose Regular Season (Central Flyway)", "species": "snow goose",
     "season_type": "general", "start": "2025-10-17", "end": "2026-01-31",
     "bag": {"daily": 50, "possession": None}, "zones": ["Statewide"],
     "restrictions": "Snow, blue, and Ross's geese combined. No possession limit."},
    {"name": "Light Goose Conservation Order", "species": "snow goose",
     "season_type": "conservation-order", "start": "2026-02-01", "end": "2026-03-10",
     "bag": {"daily": None, "possession": None}, "zones": ["Statewide"],
     "restrictions": "No daily bag or possession limits. Electronic calls and unplugged shotguns allowed."},
    {"name": "Snipe Season (Central Flyway)", "species": "snipe",
     "season_type": "general", "start": "2025-10-11", "end": "2026-01-25",
     "bag": {"daily": 8, "possession": 24}, "zones": ["Statewide"]},
    {"name": "Rail Season (Sora & Virginia)", "species": "rail",
     "season_type": "general", "start": "2025-09-13", "end": "2025-11-21",
     "bag": {"daily": 25, "possession": 75}, "zones": ["Statewide"]},
    {"name": "Gallinule Season", "species": "gallinule",
     "season_type": "general", "start": "2025-09-13", "end": "2025-11-21",
     "bag": {"daily": 3, "possession": 9}, "zones": ["Statewide"]},
    # Pacific Flyway
    {"name": "Duck & Coot Season (Pacific Flyway)", "species": "duck",
     "season_type": "general", "start": "2025-10-19", "end": "2026-01-31",
     "bag": {"daily": 7, "possession": 21}, "zones": ["Pacific Flyway"],
     "restrictions": "Mallard: 5 (2 hen max). Pintail: 1. Redhead: 2. Canvasback: 1. Scaup: limited. Pacific Flyway limits differ from Central."},
    {"name": "Goose Season - North Zone (Pacific Flyway)", "species": "canada goose",
     "season_type": "general", "start": "2025-09-27", "end": "2026-01-31",
     "bag": {"daily": 4, "possession": 12}, "zones": ["Pacific Flyway North"],
     "restrictions": "Split season: Sep 27-Oct 12, Nov 2-Jan 31."},
    {"name": "Goose Season - South Zone (Pacific Flyway)", "species": "canada goose",
     "season_type": "general", "start": "2025-10-17", "end": "2026-01-31",
     "bag": {"daily": 4, "possession": 12}, "zones": ["Pacific Flyway South"]},
    # Youth
    {"name": "Youth Waterfowl - North Zone (Central)", "species": "duck",
     "season_type": "general", "start": "2025-10-04", "end": "2025-10-05",
     "bag": {"daily": 6, "possession": 18}, "zones": ["North Zone"],
     "restrictions": "Youth only. Hunter must be 15 or younger with licensed adult."},
    {"name": "Youth Waterfowl - South Zone (Central)", "species": "duck",
     "season_type": "general", "start": "2025-10-25", "end": "2025-10-26",
     "bag": {"daily": 6, "possession": 18}, "zones": ["South Zone"],
     "restrictions": "Youth only. Hunter must be 15 or younger with licensed adult."},
]

# ============================================================
# OKLAHOMA SEASONS (2025-2026)
# Source: wildlifedepartment.com/hunting/seasons + species pages
# ============================================================

OK_SEASONS = [
    {"name": "September Teal Season", "species": "teal",
     "season_type": "teal", "start": "2025-09-13", "end": "2025-09-21",
     "bag": {"daily": 6, "possession": 18}, "zones": ["Statewide"]},
    {"name": "Special Resident Canada Goose Season", "species": "canada goose",
     "season_type": "general", "start": "2025-09-13", "end": "2025-09-22",
     "bag": {"daily": 8, "possession": 24}, "zones": ["Statewide"]},
    {"name": "Duck, Merganser & Coot Season - Zones 1 & 2", "species": "duck",
     "season_type": "general", "start": "2025-11-08", "end": "2026-01-25",
     "bag": {"daily": 6, "possession": 18}, "zones": ["Zone 1", "Zone 2"],
     "restrictions": "Split: Nov 8-30, Dec 6-Jan 25. Mallard: 5 (2 hen). Pintail: 3. Redhead: 2. Canvasback: 2. Scaup: 1. Wood duck: 3. Coot: 15 daily."},
    {"name": "Duck, Merganser & Coot Season - Panhandle", "species": "duck",
     "season_type": "general", "start": "2025-10-04", "end": "2026-01-07",
     "bag": {"daily": 6, "possession": 18}, "zones": ["Panhandle"],
     "restrictions": "High Plains Mallard Management Unit. Mallard: 5 (2 hen). Pintail: 3. Redhead: 2. Canvasback: 2. Scaup: 1. Wood duck: 3. Coot: 15 daily."},
    {"name": "White-Fronted Goose Season", "species": "white-fronted goose",
     "season_type": "general", "start": "2025-11-01", "end": "2026-02-01",
     "bag": {"daily": 2, "possession": 6}, "zones": ["Statewide"],
     "restrictions": "Split: Nov 1-30, Dec 6-Feb 1."},
    {"name": "Dark Goose Season", "species": "canada goose",
     "season_type": "general", "start": "2025-11-01", "end": "2026-02-08",
     "bag": {"daily": 8, "possession": 24}, "zones": ["Statewide"],
     "restrictions": "Split: Nov 1-30, Dec 6-Feb 8. Includes Canada, cackling."},
    {"name": "Light Goose Regular Season", "species": "snow goose",
     "season_type": "general", "start": "2025-11-01", "end": "2026-02-08",
     "bag": {"daily": 50, "possession": None}, "zones": ["Statewide"],
     "restrictions": "Split: Nov 1-30, Dec 6-Feb 8. Snow, blue, Ross's combined. No possession limit."},
    {"name": "Light Goose Conservation Order", "species": "snow goose",
     "season_type": "conservation-order", "start": "2026-02-13", "end": "2026-03-30",
     "bag": {"daily": None, "possession": None}, "zones": ["Statewide"],
     "restrictions": "No daily bag or possession limits. Electronic calls and unplugged shotguns allowed."},
    {"name": "Sandhill Crane Season", "species": "sandhill crane",
     "season_type": "general", "start": "2025-10-18", "end": "2026-01-18",
     "bag": {"daily": 3, "possession": 9}, "zones": ["West of I-35"],
     "restrictions": "West of I-35 only. East of I-35 closed. Federal permit required."},
    {"name": "Dove Season", "species": "dove",
     "season_type": "general", "start": "2025-09-01", "end": "2025-12-29",
     "bag": {"daily": 15, "possession": 45}, "zones": ["Statewide"],
     "restrictions": "Split: Sep 1-Oct 31, Dec 1-29."},
    {"name": "Woodcock Season", "species": "woodcock",
     "season_type": "general", "start": "2025-11-01", "end": "2025-12-15",
     "bag": {"daily": 3, "possession": 9}, "zones": ["Statewide"]},
    {"name": "Rail Season", "species": "rail",
     "season_type": "general", "start": "2025-09-01", "end": "2025-11-09",
     "bag": {"daily": 25, "possession": 75}, "zones": ["Statewide"]},
    {"name": "Snipe Season", "species": "snipe",
     "season_type": "general", "start": "2025-09-27", "end": "2026-01-11",
     "bag": {"daily": 8, "possession": 24}, "zones": ["Statewide"]},
    {"name": "Gallinule Season", "species": "gallinule",
     "season_type": "general", "start": "2025-09-01", "end": "2025-11-09",
     "bag": {"daily": 3, "possession": 9}, "zones": ["Statewide"]},
    # Youth/Vet/Military
    {"name": "Youth/Vet/Military Duck Days - Zones 1 & 2", "species": "duck",
     "season_type": "general", "start": "2025-11-01", "end": "2026-01-31",
     "bag": {"daily": 6, "possession": 18}, "zones": ["Zone 1", "Zone 2"],
     "restrictions": "Nov 1 and Jan 31 only. Youth 15 or younger with adult. Veterans/active military eligible."},
    {"name": "Youth/Vet/Military Duck Days - Panhandle", "species": "duck",
     "season_type": "general", "start": "2025-09-27", "end": "2026-01-31",
     "bag": {"daily": 6, "possession": 18}, "zones": ["Panhandle"],
     "restrictions": "Sep 27 and Jan 31 only. Youth 15 or younger with adult. Veterans/active military eligible."},
]

# ============================================================
# OKLAHOMA LICENSES (2025-2026)
# Source: wildlifedepartment.com/licensing/regs/license-fees
# ============================================================

OK_LICENSES = [
    {"name": "Annual Hunting License", "type": "base",
     "description": "Required base license for all resident hunters age 18+",
     "resident_only": False, "price_r": 36, "price_nr": 209,
     "valid_for": ["all game"]},
    {"name": "Youth Annual Super Hunting License", "type": "base",
     "description": "Ages 17 and under. Covers deer, turkey, waterfowl, elk, bear, antelope, furbearers, trapping",
     "resident_only": False, "price_r": 26, "price_nr": 151,
     "valid_for": ["all game", "deer", "turkey", "waterfowl", "elk", "bear", "antelope"]},
    {"name": "5-Day Nonresident Hunting License", "type": "base",
     "description": "Small game and upland game only. Excludes big game, waterfowl, turkey, quail",
     "resident_only": False, "price_r": None, "price_nr": 75,
     "valid_for": ["small game", "upland game"]},
    {"name": "Federal Duck Stamp", "type": "stamp",
     "description": "Required for all persons 16 or older hunting waterfowl",
     "resident_only": False, "price_r": 29, "price_nr": 29,
     "valid_for": ["waterfowl"]},
    {"name": "Oklahoma Waterfowl Stamp", "type": "stamp",
     "description": "Required for waterfowl hunting. Valid July 1 - June 30",
     "resident_only": False, "price_r": 21, "price_nr": 31,
     "valid_for": ["waterfowl"]},
    {"name": "HIP Registration", "type": "permit",
     "description": "Harvest Information Program. Required for all migratory bird/waterfowl hunters under 64. Free online",
     "resident_only": False, "price_r": 0, "price_nr": 0,
     "valid_for": ["migratory birds", "waterfowl"]},
    {"name": "Sandhill Crane Permit", "type": "permit",
     "description": "Required for sandhill crane hunting. Free online",
     "resident_only": False, "price_r": 0, "price_nr": 0,
     "valid_for": ["sandhill crane"]},
    {"name": "Nonresident Game Bird Permit", "type": "permit",
     "description": "Required for nonresidents hunting on WMA properties",
     "resident_only": False, "price_r": None, "price_nr": 100,
     "valid_for": ["game birds", "WMA properties"]},
    {"name": "Deer Archery License", "type": "species",
     "description": "Oct 1 - Jan 15 archery deer season",
     "resident_only": False, "price_r": 36, "price_nr": 501,
     "valid_for": ["deer"]},
    {"name": "Deer Muzzleloader License", "type": "species",
     "description": "Muzzleloader deer season",
     "resident_only": False, "price_r": 36, "price_nr": 501,
     "valid_for": ["deer"]},
    {"name": "Deer Gun License", "type": "species",
     "description": "Gun deer season",
     "resident_only": False, "price_r": 36, "price_nr": 501,
     "valid_for": ["deer"]},
    {"name": "Turkey License (Spring/Fall)", "type": "species",
     "description": "Turkey hunting license, valid year-round",
     "resident_only": False, "price_r": 20, "price_nr": 40,
     "valid_for": ["turkey"]},
    {"name": "Elk License", "type": "species",
     "description": "Elk hunting, per elk hunted",
     "resident_only": False, "price_r": 51, "price_nr": 506,
     "valid_for": ["elk"]},
]

# ============================================================
# INSERT FUNCTIONS
# ============================================================

def insert_seasons(state_code, seasons):
    state_id = state_map[state_code]

    # Check existing
    cur.execute("SELECT COUNT(*) FROM seasons WHERE state_id = %s AND year = %s", (state_id, YEAR))
    existing = cur.fetchone()[0]

    # Delete existing for this year
    cur.execute("DELETE FROM seasons WHERE state_id = %s AND year = %s", (state_id, YEAR))
    if cur.rowcount:
        print(f"  Deleted {cur.rowcount} existing {state_code} seasons")

    inserted = 0
    for s in seasons:
        species_id = get_species(s["species"])
        cur.execute("""
            INSERT INTO seasons (state_id, species_id, name, season_type, start_date, end_date, year,
                                 bag_limit, shooting_hours, restrictions, units, source_url, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            state_id, species_id, s["name"], s["season_type"],
            s["start"], s["end"], YEAR,
            json.dumps(s.get("bag")) if s.get("bag") else None,
            None,  # shooting_hours
            s.get("restrictions"),
            json.dumps(s.get("zones")) if s.get("zones") else None,
            f"https://www.eregulations.com/newmexico/hunting/migratory-birds-seasons-regulations" if state_code == "NM"
            else "https://www.wildlifedepartment.com/hunting/seasons",
            META,
        ))
        inserted += 1

    conn.commit()
    print(f"  Inserted {inserted} {state_code} seasons (was {existing})")

def insert_licenses(state_code, licenses):
    state_id = state_map[state_code]

    cur.execute("DELETE FROM licenses WHERE state_id = %s", (state_id,))
    if cur.rowcount:
        print(f"  Deleted {cur.rowcount} existing {state_code} licenses")

    inserted = 0
    for lic in licenses:
        cur.execute("""
            INSERT INTO licenses (state_id, name, license_type, description, is_resident_only,
                                  price_resident, price_non_resident, valid_for, purchase_url, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            state_id, lic["name"], lic["type"], lic["description"],
            lic.get("resident_only", False),
            lic["price_r"], lic["price_nr"],
            json.dumps(lic.get("valid_for")) if lic.get("valid_for") else None,
            None,  # purchase_url
            META,
        ))
        inserted += 1

    conn.commit()
    print(f"  Inserted {inserted} {state_code} licenses")


# ============================================================
# MAIN
# ============================================================

print("=== Seeding NM Seasons ===")
insert_seasons("NM", NM_SEASONS)

print("\n=== Seeding OK Seasons ===")
insert_seasons("OK", OK_SEASONS)

print("\n=== Seeding OK Licenses ===")
insert_licenses("OK", OK_LICENSES)

# Quick verification
print("\n=== Verification ===")
for code in ("NM", "OK"):
    state_id = state_map[code]
    cur.execute("SELECT COUNT(*) FROM seasons WHERE state_id = %s", (state_id,))
    print(f"{code} seasons: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM licenses WHERE state_id = %s", (state_id,))
    print(f"{code} licenses: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM regulations WHERE state_id = %s AND is_active = true", (state_id,))
    print(f"{code} active regulations: {cur.fetchone()[0]}")

conn.close()
print("\nDone!")
