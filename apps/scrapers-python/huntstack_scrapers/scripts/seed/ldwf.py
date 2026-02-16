"""Seed the Louisiana - LDWF Aerial Survey location."""
import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

import psycopg2

conn = psycopg2.connect(os.getenv("DATABASE_URL"))

# Get LA state ID
with conn.cursor() as cur:
    cur.execute("SELECT id FROM states WHERE code = 'LA'")
    row = cur.fetchone()
    if not row:
        print("ERROR: LA state not found!")
        exit(1)
    la_state_id = str(row[0])
    print(f"LA state: {la_state_id}")

# Seed location
with conn.cursor() as cur:
    cur.execute("SELECT id FROM locations WHERE name = 'Louisiana - LDWF Aerial Survey'")
    existing = cur.fetchone()
    if existing:
        print(f"Location already exists: {existing[0]}")
    else:
        metadata = json.dumps({
            "flyway": "mississippi",
            "source": "ldwf",
            "isStateAggregate": True,
            "surveyUrl": "https://www.wlf.louisiana.gov/page/aerial-waterfowl-surveys",
        })
        center_point = json.dumps({"lat": 29.95, "lng": -92.00})
        cur.execute("""
            INSERT INTO locations (name, state_id, location_type, center_point, metadata)
            VALUES (%s, %s, 'wildlife_refuge', %s::jsonb, %s::jsonb)
            RETURNING id
        """, ("Louisiana - LDWF Aerial Survey", la_state_id, center_point, metadata))
        loc_id = cur.fetchone()[0]
        conn.commit()
        print(f"Created location: {loc_id}")

conn.close()
print("Done.")
