"""Full audit of what data is in the database."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

print("=== TABLE ROW COUNTS ===")
for table in ["states", "species", "regulations", "seasons", "licenses",
              "locations", "refuge_counts", "documents", "document_chunks",
              "outfitters", "profiles"]:
    try:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        print(f"  {table}: {cur.fetchone()[0]}")
    except Exception as e:
        conn.rollback()
        print(f"  {table}: ERROR - {e}")

print("\n=== STATES IN DB ===")
cur.execute("SELECT code, name FROM states ORDER BY code")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]}")

print("\n=== SPECIES IN DB ===")
cur.execute("SELECT slug, name, category FROM species ORDER BY category, name")
for row in cur.fetchall():
    print(f"  [{row[2]}] {row[1]} ({row[0]})")

print("\n=== DOCUMENTS BY STATE ===")
cur.execute("""
    SELECT s.code, COUNT(d.id), SUM(LENGTH(d.content))
    FROM documents d
    LEFT JOIN states s ON s.id = d.state_id
    GROUP BY s.code ORDER BY s.code
""")
for code, count, chars in cur.fetchall():
    chars_k = (chars or 0) / 1000
    print(f"  {code or 'NULL'}: {count} docs, {chars_k:.0f}K chars")

print("\n=== DOCUMENT_CHUNKS BY STATE ===")
cur.execute("""
    SELECT s.code, COUNT(dc.id)
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    LEFT JOIN states s ON s.id = d.state_id
    GROUP BY s.code ORDER BY s.code
""")
for code, count in cur.fetchall():
    print(f"  {code or 'NULL'}: {count} chunks")

print("\n=== SEASONS BY STATE ===")
cur.execute("""
    SELECT s.code, COUNT(se.id)
    FROM seasons se
    JOIN states s ON s.id = se.state_id
    GROUP BY s.code ORDER BY s.code
""")
for code, count in cur.fetchall():
    print(f"  {code}: {count} seasons")

print("\n=== LICENSES BY STATE ===")
cur.execute("""
    SELECT s.code, COUNT(l.id)
    FROM licenses l
    JOIN states s ON s.id = l.state_id
    GROUP BY s.code ORDER BY s.code
""")
for code, count in cur.fetchall():
    print(f"  {code}: {count} licenses")

print("\n=== REGULATIONS BY STATE ===")
cur.execute("""
    SELECT s.code, COUNT(r.id), array_agg(DISTINCT r.category)
    FROM regulations r
    JOIN states s ON s.id = r.state_id
    GROUP BY s.code ORDER BY s.code
""")
for code, count, categories in cur.fetchall():
    print(f"  {code}: {count} regulations, categories: {categories}")

print("\n=== REFUGE COUNTS BY LOCATION ===")
cur.execute("""
    SELECT l.name, COUNT(rc.id), MIN(rc.survey_date), MAX(rc.survey_date)
    FROM refuge_counts rc
    JOIN locations l ON l.id = rc.location_id
    GROUP BY l.name ORDER BY l.name
""")
for name, count, min_d, max_d in cur.fetchall():
    print(f"  {name}: {count} rows ({min_d} to {max_d})")

print("\n=== LOCATIONS ===")
cur.execute("SELECT name, location_type FROM locations ORDER BY name")
for row in cur.fetchall():
    print(f"  {row[0]} (type={row[1]})")

print("\n=== SAMPLE DOCUMENT_CHUNKS (first 5) ===")
cur.execute("""
    SELECT dc.content, d.title, d.source_url
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    LIMIT 5
""")
for content, title, url in cur.fetchall():
    snippet = content[:120].replace("\n", " ") if content else ""
    print(f"  [{title}] {snippet}...")

print("\n=== SAMPLE SEASONS ===")
cur.execute("""
    SELECT s.code, sp.name, se.name, se.start_date, se.end_date, se.bag_limit
    FROM seasons se
    JOIN states s ON s.id = se.state_id
    LEFT JOIN species sp ON sp.id = se.species_id
    LIMIT 10
""")
for code, sp_name, se_name, start, end, bag in cur.fetchall():
    print(f"  {code} | {sp_name or '?'} | {se_name} | {start}-{end} | bag={bag}")

print("\n=== SAMPLE REGULATIONS ===")
cur.execute("""
    SELECT s.code, r.category, r.title, LEFT(r.content, 100)
    FROM regulations r
    JOIN states s ON s.id = r.state_id
    LIMIT 5
""")
for code, cat, title, content in cur.fetchall():
    snippet = (content or "")[:80].replace("\n", " ")
    print(f"  {code} | {cat} | {title} | {snippet}...")

conn.close()
