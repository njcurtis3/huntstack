"""Delete the massive PFAS report chunks and any other oversized irrelevant docs."""
import os, psycopg2
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

# Delete chunks from PFAS report and other large irrelevant docs
cur.execute("""
    DELETE FROM document_chunks
    WHERE document_id IN (
        SELECT id FROM documents
        WHERE title ILIKE '%%pfas%%'
           OR title ILIKE '%%commercial fishing%%'
           OR LENGTH(content) > 200000
    )
""")
print(f"Deleted {cur.rowcount} chunks from oversized/irrelevant documents")
conn.commit()

cur.execute("SELECT COUNT(*) FROM document_chunks")
print(f"Total chunks now: {cur.fetchone()[0]}")
conn.close()
