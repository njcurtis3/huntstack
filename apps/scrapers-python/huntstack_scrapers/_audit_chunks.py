"""Audit document chunks to quantify noise level."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

cur.execute("""SELECT COUNT(*) FROM document_chunks
    WHERE content LIKE '%%querySelector%%'
       OR content LIKE '%%classList%%'
       OR content LIKE '%%addEventListener%%'
       OR content LIKE '%%function()%%'""")
print(f"JavaScript noise chunks: {cur.fetchone()[0]}")

cur.execute("""SELECT COUNT(*) FROM document_chunks
    WHERE (LENGTH(content) - LENGTH(REPLACE(content, ' | ', ''))) / 3 > 5""")
print(f"Heavy pipe-separator chunks (likely nav): {cur.fetchone()[0]}")

cur.execute("""SELECT COUNT(*) FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE d.title = '404' OR d.title LIKE '%%Not Found%%'""")
print(f"404/error page chunks: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(*) FROM document_chunks")
print(f"Total chunks: {cur.fetchone()[0]}")

cur.execute("""SELECT d.document_type, COUNT(dc.id)
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    GROUP BY d.document_type ORDER BY COUNT(dc.id) DESC""")
print("\nChunks by type:")
for dtype, count in cur.fetchall():
    print(f"  {dtype}: {count}")

cur.execute("""SELECT COALESCE(s.code, 'NULL'), COUNT(dc.id)
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    LEFT JOIN states s ON s.id = d.state_id
    GROUP BY s.code ORDER BY s.code""")
print("\nChunks by state:")
for code, count in cur.fetchall():
    print(f"  {code}: {count}")

# Show a few noisy chunks
print("\n=== SAMPLE NOISY CHUNKS (JS) ===")
cur.execute("""SELECT LEFT(content, 200), d.title, d.source_url
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE content LIKE '%%querySelector%%' LIMIT 3""")
for content, title, url in cur.fetchall():
    print(f"  [{title}] {url}")
    print(f"  {content[:150]}...")
    print()

# Show chunks with short content that might be menus
cur.execute("""SELECT COUNT(*) FROM document_chunks WHERE LENGTH(content) < 100""")
print(f"Very short chunks (<100 chars): {cur.fetchone()[0]}")

# Show chunks that are mostly whitespace/punctuation
cur.execute("""SELECT COUNT(*) FROM document_chunks
    WHERE LENGTH(REGEXP_REPLACE(content, '[^a-zA-Z]', '', 'g')) < LENGTH(content) * 0.3""")
print(f"Low alpha ratio chunks (<30%% letters): {cur.fetchone()[0]}")

conn.close()
