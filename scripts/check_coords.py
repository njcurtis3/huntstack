import psycopg2
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

cur.execute("""
  SELECT l.name, s.code, l.center_point, l.metadata->>'flyway'
  FROM locations l JOIN states s ON l.state_id = s.id
  WHERE l.location_type = 'wildlife_refuge'
    AND l.center_point IS NOT NULL
    AND (l.metadata->>'survey_only') IS DISTINCT FROM 'true'
    AND l.name NOT LIKE '% - Statewide MWI'
  ORDER BY s.code, l.name
  LIMIT 30
""")
rows = cur.fetchall()
print(f"Refuges with coords: {len(rows)}")
for r in rows:
    print(f"  {r[1]} | {r[0][:45]:<45} | {str(r[2])[:50]} | flyway: {r[3]}")

cur.execute("SELECT COUNT(*), COUNT(center_point) FROM locations WHERE location_type='wildlife_refuge'")
tot = cur.fetchone()
print(f"\nTotal wildlife_refuge rows: {tot[0]} | With center_point: {tot[1]}")

conn.close()
