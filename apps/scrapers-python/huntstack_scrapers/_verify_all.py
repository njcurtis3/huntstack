"""Verify all refuge count data across sources."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

import psycopg2

conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()

# Summary by source
cur.execute("""
    SELECT l.name, COUNT(*) as rows, COUNT(DISTINCT rc.survey_date) as surveys,
           MIN(rc.survey_date) as earliest, MAX(rc.survey_date) as latest,
           rc.survey_type
    FROM refuge_counts rc
    JOIN locations l ON rc.location_id = l.id
    GROUP BY l.name, rc.survey_type
    ORDER BY l.name
""")

print("=== REFUGE COUNTS SUMMARY ===\n")
for row in cur.fetchall():
    print(f"{row[0]}")
    print(f"  Type: {row[5]}, Rows: {row[1]}, Surveys: {row[2]}")
    print(f"  Date range: {row[3]} to {row[4]}")
    print()

# Total counts
cur.execute("SELECT COUNT(*) FROM refuge_counts")
total = cur.fetchone()[0]
print(f"TOTAL refuge_count rows: {total}")

# Loess Bluffs detail
print("\n=== LOESS BLUFFS LATEST ===\n")
cur.execute("""
    SELECT rc.survey_date, sp.name, rc.count
    FROM refuge_counts rc
    JOIN species sp ON rc.species_id = sp.id
    JOIN locations l ON rc.location_id = l.id
    WHERE l.name = 'Loess Bluffs National Wildlife Refuge'
    AND rc.survey_date = (
        SELECT MAX(survey_date) FROM refuge_counts rc2
        JOIN locations l2 ON rc2.location_id = l2.id
        WHERE l2.name = 'Loess Bluffs National Wildlife Refuge'
    )
    ORDER BY sp.name
""")
for row in cur.fetchall():
    print(f"  {row[0]}  {row[1]}: {row[2]:,}")

# LDWF detail
print("\n=== LDWF LATEST ===\n")
cur.execute("""
    SELECT rc.survey_date, sp.name, rc.count
    FROM refuge_counts rc
    JOIN species sp ON rc.species_id = sp.id
    JOIN locations l ON rc.location_id = l.id
    WHERE l.name = 'Louisiana - LDWF Aerial Survey'
    ORDER BY rc.survey_date DESC, sp.name
    LIMIT 20
""")
for row in cur.fetchall():
    print(f"  {row[0]}  {row[1]}: {row[2]:,}")

conn.close()
