"""Seed the Arkansas - AGFC Aerial Survey location."""
import os
import sys
from pathlib import Path

# Load .env from project root
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

import psycopg2

conn = psycopg2.connect(os.getenv("DATABASE_URL"))

# Get AR state ID
with conn.cursor() as cur:
    cur.execute("SELECT id FROM states WHERE code = 'AR'")
    row = cur.fetchone()
    if not row:
        print("ERROR: AR state not found")
        conn.close()
        exit(1)
    ar_state_id = str(row[0])
    print(f"AR state_id: {ar_state_id}")

# Insert the AGFC aerial survey location
import json
with conn.cursor() as cur:
    cur.execute("""
        INSERT INTO locations (name, location_type, state_id, metadata)
        VALUES (%s, %s, %s, %s::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING id
    """, (
        "Arkansas - AGFC Aerial Survey",
        "wildlife_refuge",  # reuse same type for pipeline compatibility
        ar_state_id,
        json.dumps({
            "flyway": "mississippi",
            "source": "agfc",
            "surveyUrl": "https://www.agfc.com/education/waterfowl-surveys-and-reports/",
            "isStateAggregate": True,
        }),
    ))
    result = cur.fetchone()
    if result:
        print(f"Created location: {result[0]}")
    else:
        # Check if it already exists
        cur.execute("SELECT id FROM locations WHERE name = 'Arkansas - AGFC Aerial Survey'")
        existing = cur.fetchone()
        if existing:
            print(f"Location already exists: {existing[0]}")
        else:
            print("ERROR: Insert failed")

conn.commit()
conn.close()
print("Done.")
