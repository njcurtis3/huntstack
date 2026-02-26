"""Add center_point coordinates for TX/LA refuges that are missing them."""
import psycopg2
import json
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

updates = [
    # TX refuges missing coords
    ('Brazoria National Wildlife Refuge',     'TX', 29.02, -95.28),
    ('Texas Point National Wildlife Refuge',  'TX', 29.87, -93.92),
    ('Caddo Lake WMA',                        'TX', 32.69, -94.09),
    ('Matagorda Island WMA',                  'TX', 28.38, -96.38),
]

for name, state, lat, lng in updates:
    cur.execute("""
        UPDATE locations SET center_point = %s
        WHERE name = %s AND location_type = 'wildlife_refuge'
          AND (SELECT code FROM states WHERE id = state_id) = %s
    """, (json.dumps({"lat": lat, "lng": lng}), name, state))
    print(f"Updated {state} | {name}: ({lat}, {lng}) — {cur.rowcount} row(s)")

conn.commit()
conn.close()
print("Done.")
