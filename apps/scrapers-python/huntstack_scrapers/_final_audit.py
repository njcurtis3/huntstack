"""Final audit of chunk quality."""
import os, psycopg2
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

# JS noise check
for p in ['querySelector', 'classList', 'addEventListener', 'function()']:
    cur.execute("SELECT COUNT(*) FROM document_chunks WHERE content LIKE %s", (f"%{p}%",))
    c = cur.fetchone()[0]
    if c > 0:
        print(f"Remaining JS noise: '{p}' = {c}")

# CSS noise check
for p in ['border-color:', 'background-color:', 'font-size:']:
    cur.execute("SELECT COUNT(*) FROM document_chunks WHERE content LIKE %s", (f"%{p}%",))
    c = cur.fetchone()[0]
    if c > 0:
        print(f"Remaining CSS noise: '{p}' = {c}")

# 404 pages
cur.execute("""SELECT COUNT(*) FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE d.title = '404'""")
c = cur.fetchone()[0]
if c > 0:
    print(f"404 page chunks: {c}")

# Totals
cur.execute("SELECT COUNT(*) FROM document_chunks")
print(f"\nTotal chunks: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(*) FROM document_chunks WHERE embedding IS NULL")
print(f"Chunks without embeddings: {cur.fetchone()[0]}")

# By state
cur.execute("""SELECT COALESCE(s.code, 'X'), COUNT(dc.id)
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    LEFT JOIN states s ON s.id = d.state_id
    GROUP BY s.code ORDER BY s.code""")
print("\nBy state:")
for code, count in cur.fetchall():
    print(f"  {code}: {count}")

# By type
cur.execute("""SELECT d.document_type, COUNT(dc.id)
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    GROUP BY d.document_type""")
print("\nBy type:")
for dtype, count in cur.fetchall():
    print(f"  {dtype}: {count}")

conn.close()
