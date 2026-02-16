"""Update NM license prices from verified NMDGF fee schedule.
Source: wildlife.dgf.nm.gov/hunting/licenses-and-permits/license-requirements-fees/
       + NMDGF OTC Licenses & Fees PDF
"""
import os, psycopg2
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

state_id_q = "(SELECT id FROM states WHERE code = 'NM')"

# Known NM license prices (2024-2025)
updates = [
    # Base hunting licenses
    ("Game Hunting License", 15, 265),
    ("Game-Hunting License", 15, 265),
    ("Game Hunting and Fishing License", 30, 330),
    ("Game-Hunting and Fishing License", 30, 330),
    # Junior licenses
    ("Junior Game Hunting License", 10, 10),
    ("Junior Game-Hunting License", 10, 10),
    ("Junior Game Hunting and Fishing License", 15, 15),
    # Veteran/disabled
    ("Disabled Veteran Game Hunting and Fishing License", 10, None),
    ("Disabled Hunting License", 10, None),
    # Stamps and validations
    ("Habitat Stamp", 5, 5),
    ("Habitat Management and Access Validation", 4, 4),
    ("Habitat Management and Access Validation (HMAV)", 4, 4),
    ("Habitat Management & Access Validation", 4, 4),
    ("Federal Migratory Bird Hunting & Conservation Stamp (Duck Stamp)", 29, 29),
    ("Federal Duck Stamp", 29, 29),
    # Species licenses
    ("Turkey License", 25, 100),
    ("Bear License", 47, 260),
    ("Cougar License", 43, 260),
    ("Big Game License", 47, 265),
    # Permits (free)
    ("Migratory Game Bird Permit", 0, 0),
    ("New Mexico Migratory Game Bird Permit", 0, 0),
    ("HIP Registration", 0, 0),
    ("Band-tailed Pigeon Permit", 0, 0),
    ("Eastern Sandhill Crane Permit", 0, 0),
    ("Draw Sandhill Crane Permit", 0, 0),
    ("Light Goose Conservation Order Permit", 0, 0),
]

updated = 0
for name, price_r, price_nr in updates:
    cur.execute(f"""
        UPDATE licenses SET price_resident = %s, price_non_resident = %s
        WHERE state_id = {state_id_q} AND name = %s
    """, (price_r, price_nr, name))
    if cur.rowcount > 0:
        updated += cur.rowcount
        print(f"  Updated: {name} -> R=${price_r} NR=${price_nr}")

conn.commit()
print(f"\nUpdated {updated} NM license prices")

# Verify
cur.execute(f"""
    SELECT COUNT(*) FROM licenses
    WHERE state_id = {state_id_q} AND price_resident IS NOT NULL
""")
print(f"NM licenses with prices: {cur.fetchone()[0]} / 30")
conn.close()
