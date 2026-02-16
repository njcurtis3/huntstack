"""Check current state of document_chunks after partial rechunk."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM document_chunks")
print(f"Current chunks: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(*) FROM document_chunks WHERE embedding IS NULL")
print(f"Chunks without embeddings: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(*) FROM documents")
print(f"Total documents: {cur.fetchone()[0]}")

# Check documents that lost chunks
cur.execute("""
    SELECT d.id, d.title, LENGTH(d.content) as content_len
    FROM documents d
    LEFT JOIN document_chunks dc ON dc.document_id = d.id
    WHERE dc.id IS NULL
      AND d.content IS NOT NULL
      AND LENGTH(d.content) > 200
    LIMIT 20
""")
orphans = cur.fetchall()
print(f"\nDocuments with no chunks ({len(orphans)}):")
for did, title, clen in orphans:
    print(f"  {title} ({clen} chars)")

conn.close()
