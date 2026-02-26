import psycopg2
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

# Check location IDs that actually have refuge_counts rows
cur.execute("""
  SELECT l.id, l.name, s.code, l.center_point IS NOT NULL as has_coords, l.metadata->>'flyway', l.metadata->>'survey_only'
  FROM locations l
  JOIN states s ON l.state_id = s.id
  WHERE l.location_type = 'wildlife_refuge'
  ORDER BY s.code, l.name
""")
rows = cur.fetchall()
print("All wildlife_refuge locations:")
for r in rows:
    print(f"  {r[2]} | {r[1][:45]:<45} | coords={r[3]} | flyway={r[4]} | survey_only={r[5]} | id={r[0]}")

# Check what refugeIds currentCounts actually has
cur.execute("""
  SELECT DISTINCT rc.location_id, l.name, s.code
  FROM refuge_counts rc
  JOIN locations l ON rc.location_id = l.id
  JOIN states s ON l.state_id = s.id
  ORDER BY s.code, l.name
""")
print("\nLocations with actual refuge_counts rows:")
for r in cur.fetchall():
    print(f"  {r[2]} | {r[1][:45]:<45} | id={r[0]}")

conn.close()
