"""Verify NM and OK structured data after seeding."""
import os, psycopg2, json
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

print("=" * 60)
print("STRUCTURED DATA SUMMARY — ALL V1 STATES")
print("=" * 60)

# Counts by state
for table, label in [("seasons", "Seasons"), ("licenses", "Licenses")]:
    cur.execute(f"""
        SELECT s.code, COUNT(t.id)
        FROM states s LEFT JOIN {table} t ON t.state_id = s.id
        WHERE s.code IN ('TX','AR','NM','LA','KS','OK')
        GROUP BY s.code ORDER BY s.code
    """)
    print(f"\n{label}:")
    for code, count in cur.fetchall():
        print(f"  {code}: {count}")

cur.execute("""
    SELECT s.code, COUNT(r.id)
    FROM states s LEFT JOIN regulations r ON r.state_id = s.id AND r.is_active = true
    WHERE s.code IN ('TX','AR','NM','LA','KS','OK')
    GROUP BY s.code ORDER BY s.code
""")
print(f"\nActive Regulations:")
for code, count in cur.fetchall():
    print(f"  {code}: {count}")

# NM seasons detail
print("\n" + "=" * 60)
print("NM SEASONS (2025-2026)")
print("=" * 60)
cur.execute("""
    SELECT se.name, se.start_date, se.end_date, se.bag_limit, se.restrictions
    FROM seasons se JOIN states s ON s.id = se.state_id
    WHERE s.code = 'NM' ORDER BY se.start_date
""")
for name, start, end, bag, restr in cur.fetchall():
    bag_str = ""
    if bag:
        b = json.loads(bag) if isinstance(bag, str) else bag
        bag_str = f" | bag: {b.get('daily', '?')}/{b.get('possession', '?')}"
    print(f"  {name}: {start} - {end}{bag_str}")

# OK seasons detail
print("\n" + "=" * 60)
print("OK SEASONS (2025-2026)")
print("=" * 60)
cur.execute("""
    SELECT se.name, se.start_date, se.end_date, se.bag_limit
    FROM seasons se JOIN states s ON s.id = se.state_id
    WHERE s.code = 'OK' ORDER BY se.start_date
""")
for name, start, end, bag in cur.fetchall():
    bag_str = ""
    if bag:
        b = json.loads(bag) if isinstance(bag, str) else bag
        bag_str = f" | bag: {b.get('daily', '?')}/{b.get('possession', '?')}"
    print(f"  {name}: {start} - {end}{bag_str}")

# NM licenses with prices
print("\n" + "=" * 60)
print("NM LICENSES (sample with prices)")
print("=" * 60)
cur.execute("""
    SELECT l.name, l.license_type, l.price_resident, l.price_non_resident
    FROM licenses l JOIN states s ON s.id = l.state_id
    WHERE s.code = 'NM'
    ORDER BY l.name LIMIT 15
""")
for name, ltype, pr, pnr in cur.fetchall():
    print(f"  [{ltype}] {name}: R=${pr} NR=${pnr}")

# OK licenses with prices
print("\n" + "=" * 60)
print("OK LICENSES")
print("=" * 60)
cur.execute("""
    SELECT l.name, l.license_type, l.price_resident, l.price_non_resident
    FROM licenses l JOIN states s ON s.id = l.state_id
    WHERE s.code = 'OK'
    ORDER BY l.name
""")
for name, ltype, pr, pnr in cur.fetchall():
    print(f"  [{ltype}] {name}: R=${pr} NR=${pnr}")

conn.close()
