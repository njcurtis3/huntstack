"""Check LDWF data in DB."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

# Count LDWF rows
cur.execute("""
    SELECT COUNT(*) FROM refuge_counts
    WHERE location_id = (
        SELECT id FROM locations WHERE name = 'Louisiana - LDWF Aerial Survey'
    )
""")
print(f"LDWF rows: {cur.fetchone()[0]}")

# Show surveys by date
cur.execute("""
    SELECT rc.survey_date, s.name, rc.count
    FROM refuge_counts rc
    JOIN species s ON s.id = rc.species_id
    WHERE rc.location_id = (
        SELECT id FROM locations WHERE name = 'Louisiana - LDWF Aerial Survey'
    )
    ORDER BY rc.survey_date, s.name
""")
rows = cur.fetchall()
current_date = None
for date, species, count in rows:
    if date != current_date:
        print(f"\n{date}:")
        current_date = date
    print(f"  {species}: {count:,}")

# Total counts
cur.execute("SELECT COUNT(*) FROM refuge_counts")
print(f"\nTotal refuge_counts in DB: {cur.fetchone()[0]}")
conn.close()
