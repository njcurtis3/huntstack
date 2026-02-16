import os, psycopg2
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM document_chunks")
print(f"Chunks: {cur.fetchone()[0]}")
cur.execute("""SELECT COUNT(*) FROM documents d
    LEFT JOIN document_chunks dc ON dc.document_id = d.id
    WHERE dc.id IS NULL AND d.content IS NOT NULL AND LENGTH(d.content) > 200""")
print(f"Orphaned docs: {cur.fetchone()[0]}")
conn.close()
