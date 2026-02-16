"""Quick verification of AGFC data in refuge_counts table."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

import psycopg2

conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()

cur.execute("""
    SELECT rc.survey_date, rc.survey_type, rc.count, sp.name as species, sp.slug
    FROM refuge_counts rc
    JOIN species sp ON rc.species_id = sp.id
    JOIN locations l ON rc.location_id = l.id
    WHERE l.name = 'Arkansas - AGFC Aerial Survey'
    ORDER BY rc.survey_date DESC, sp.name
""")
rows = cur.fetchall()
for r in rows:
    print(f"  {r[0]}  {r[1]:<20s}  {r[2]:>10,}  {r[3]}")

print(f"\nTotal: {len(rows)} rows")

# Count distinct survey dates
cur.execute("""
    SELECT COUNT(DISTINCT survey_date)
    FROM refuge_counts rc
    JOIN locations l ON rc.location_id = l.id
    WHERE l.name = 'Arkansas - AGFC Aerial Survey'
""")
print(f"Distinct survey dates: {cur.fetchone()[0]}")

conn.close()
