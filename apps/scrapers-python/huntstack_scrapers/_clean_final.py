"""Final cleanup: delete chunks with CSS, remaining JS, and pure nav text."""
import os, re, psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM document_chunks")
before = cur.fetchone()[0]
print(f"Before: {before} chunks")

deleted = 0

# Delete chunks containing CSS
css_patterns = [
    "border-color:", "background-color:", "font-size:", "margin-right:",
    "float: left", "content: \"\\", ".activeCollapsible",
    "border-radius:", "text-decoration:", "padding-left:",
]
for pattern in css_patterns:
    cur.execute("DELETE FROM document_chunks WHERE content LIKE %s", (f"%{pattern}%",))
    if cur.rowcount > 0:
        print(f"  Deleted {cur.rowcount} CSS chunks with '{pattern}'")
        deleted += cur.rowcount

# Delete remaining JS chunks
js_extra = [
    "querySelector", "addEventListener", "classList", "setAttribute",
    "function()", "var ", "const ", ".click()",
    "document.getElementById", "window.location",
]
for pattern in js_extra:
    cur.execute("DELETE FROM document_chunks WHERE content LIKE %s", (f"%{pattern}%",))
    if cur.rowcount > 0:
        print(f"  Deleted {cur.rowcount} JS chunks with '{pattern}'")
        deleted += cur.rowcount

conn.commit()

cur.execute("SELECT COUNT(*) FROM document_chunks")
after = cur.fetchone()[0]
print(f"\nAfter: {after} chunks ({deleted} deleted)")

# Sample quality check
print("\n=== SAMPLE CHUNKS ===")
cur.execute("""
    SELECT LEFT(dc.content, 200), d.title, d.document_type
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    ORDER BY RANDOM()
    LIMIT 8
""")
for content, title, dtype in cur.fetchall():
    snippet = content[:150].replace('\n', ' | ')
    print(f"  [{dtype}] {title}: {snippet}...")

conn.close()
