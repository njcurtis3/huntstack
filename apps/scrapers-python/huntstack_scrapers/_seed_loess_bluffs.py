"""Seed Loess Bluffs NWR location (and MO state if needed)."""
import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

import psycopg2

conn = psycopg2.connect(os.getenv("DATABASE_URL"))

# Check if MO state exists
with conn.cursor() as cur:
    cur.execute("SELECT id, code, name FROM states WHERE code = 'MO'")
    row = cur.fetchone()
    if row:
        mo_state_id = str(row[0])
        print(f"MO state already exists: {mo_state_id}")
    else:
        print("MO state not found, creating...")
        cur.execute("""
            INSERT INTO states (name, code, metadata)
            VALUES ('Missouri', 'MO', '{"flyways": ["central", "mississippi"]}'::jsonb)
            RETURNING id
        """)
        mo_state_id = str(cur.fetchone()[0])
        conn.commit()
        print(f"Created MO state: {mo_state_id}")

# Seed Loess Bluffs NWR location
with conn.cursor() as cur:
    cur.execute("SELECT id FROM locations WHERE name = 'Loess Bluffs National Wildlife Refuge'")
    existing = cur.fetchone()
    if existing:
        print(f"Loess Bluffs already exists: {existing[0]}")
    else:
        metadata = json.dumps({
            "flyway": "central",
            "source": "fws",
            "surveyUrl": "https://www.fws.gov/library/collections/loess-bluffs-2025-waterfowl-and-bald-eagle-surveys",
            "fwsRefugeSlug": "loess-bluffs",
        })
        center_point = json.dumps({"lat": 40.05, "lng": -95.25})
        cur.execute("""
            INSERT INTO locations (name, state_id, location_type, center_point, acreage, website_url, metadata)
            VALUES (%s, %s, 'wildlife_refuge', %s::jsonb, 7431,
                    'https://www.fws.gov/refuge/loess-bluffs', %s::jsonb)
            RETURNING id
        """, ("Loess Bluffs National Wildlife Refuge", mo_state_id, center_point, metadata))
        loc_id = cur.fetchone()[0]
        conn.commit()
        print(f"Created Loess Bluffs location: {loc_id}")

conn.close()
print("Done.")
