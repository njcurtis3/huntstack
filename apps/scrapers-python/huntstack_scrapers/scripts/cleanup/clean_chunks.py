"""
Delete noisy chunks from document_chunks table.

Instead of re-embedding everything, just remove chunks that are clearly
JavaScript, navigation menus, 404 pages, or other noise. Keeps good
chunks with their existing embeddings intact.

Usage:
    python huntstack_scrapers/_clean_chunks.py
"""
import os
import re
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM document_chunks")
before = cur.fetchone()[0]
print(f"Before: {before} chunks")

total_deleted = 0

# 1. Delete chunks containing JavaScript patterns
js_patterns = [
    "querySelector", "classList", "addEventListener", "setAttribute",
    "removeAttribute", "createElement", "appendChild",
    "awb-menu", "submenu_", "nav-submenu",
    "aria-expanded", "aria-hidden", "data-toggle",
    ".click()", ".toggle(", ".forEach(",
    "document.", "window.", "console.",
]
for pattern in js_patterns:
    cur.execute(
        "DELETE FROM document_chunks WHERE content LIKE %s",
        (f"%{pattern}%",)
    )
    if cur.rowcount > 0:
        print(f"  Deleted {cur.rowcount} chunks with '{pattern}'")
        total_deleted += cur.rowcount
conn.commit()

# 2. Delete chunks from 404/error pages
cur.execute("""
    DELETE FROM document_chunks
    WHERE document_id IN (
        SELECT id FROM documents
        WHERE title = '404'
           OR title LIKE '%%Page Not Found%%'
           OR title LIKE '%%Error%%'
    )
""")
if cur.rowcount > 0:
    print(f"  Deleted {cur.rowcount} chunks from 404/error pages")
    total_deleted += cur.rowcount
conn.commit()

# 3. Delete chunks that are mostly non-alphabetic (< 30% letters)
cur.execute("SELECT id, content FROM document_chunks")
low_alpha = 0
for chunk_id, content in cur.fetchall():
    alpha = sum(1 for c in content if c.isalpha())
    if len(content) > 50 and alpha < len(content) * 0.30:
        cur.execute("DELETE FROM document_chunks WHERE id = %s", (chunk_id,))
        low_alpha += 1
if low_alpha > 0:
    print(f"  Deleted {low_alpha} low-alpha-ratio chunks")
    total_deleted += low_alpha
conn.commit()

# 4. Delete chunks that are just navigation menu items
# These have lots of short "words" that are menu link text
nav_words = {
    "home", "about", "contact", "login", "search", "menu",
    "skip to content", "skip navigation", "back to top",
    "privacy policy", "terms of service", "cookie policy",
    "sitemap", "follow us", "share this",
}
cur.execute("SELECT id, content FROM document_chunks")
nav_deleted = 0
for chunk_id, content in cur.fetchall():
    lower = content.lower().strip()
    # Check if chunk is just a nav word
    if lower in nav_words:
        cur.execute("DELETE FROM document_chunks WHERE id = %s", (chunk_id,))
        nav_deleted += 1
        continue
    # Check if chunk looks like a menu list: mostly short items separated by spaces
    # with very little actual sentence structure
    words = content.split()
    if len(words) > 5:
        # Count how many words are < 4 chars (common in nav: "Home", "FAQ", etc.)
        short_words = sum(1 for w in words if len(w) < 4)
        # If >60% short words AND no sentences (no periods/colons), likely nav
        has_sentences = '.' in content or ':' in content
        if short_words > len(words) * 0.6 and not has_sentences and len(content) < 300:
            cur.execute("DELETE FROM document_chunks WHERE id = %s", (chunk_id,))
            nav_deleted += 1
if nav_deleted > 0:
    print(f"  Deleted {nav_deleted} navigation menu chunks")
    total_deleted += nav_deleted
conn.commit()

# 5. Delete very short chunks (< 50 chars) — usually just page titles or fragments
cur.execute("DELETE FROM document_chunks WHERE LENGTH(content) < 50")
if cur.rowcount > 0:
    print(f"  Deleted {cur.rowcount} very short chunks (<50 chars)")
    total_deleted += cur.rowcount
conn.commit()

# 6. Also delete the 404 documents themselves
cur.execute("""
    DELETE FROM documents
    WHERE title = '404'
       OR title LIKE '%%Page Not Found%%'
""")
if cur.rowcount > 0:
    print(f"  Deleted {cur.rowcount} 404 documents")
conn.commit()

# Final count
cur.execute("SELECT COUNT(*) FROM document_chunks")
after = cur.fetchone()[0]

print(f"\n=== RESULT ===")
print(f"Chunks: {before} -> {after} ({total_deleted} deleted, {before - after} net reduction)")

# Show sample of remaining chunks to verify quality
print("\n=== SAMPLE REMAINING CHUNKS ===")
cur.execute("""
    SELECT LEFT(dc.content, 200), d.title, d.document_type
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    ORDER BY RANDOM()
    LIMIT 5
""")
for content, title, dtype in cur.fetchall():
    snippet = content[:150].replace('\n', ' | ')
    print(f"  [{dtype}] {title}: {snippet}...")

conn.close()
