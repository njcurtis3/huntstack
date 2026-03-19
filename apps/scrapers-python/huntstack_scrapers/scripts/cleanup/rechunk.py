"""
Re-chunk all documents with cleaned text and fresh embeddings.

Reads every document from the `documents` table, applies clean_text(),
re-chunks, generates new embeddings via Together.ai, and replaces
the old document_chunks rows.

Usage:
    python huntstack_scrapers/_rechunk.py
"""
import os
import sys
import json
import time
import psycopg2
from dotenv import load_dotenv

# Force UTF-8 output so non-ASCII chars in document titles don't crash on Windows
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Force IPv4 in urllib3 before importing requests
# (IPv6 is unreachable on this machine — sets AF_INET instead of AF_UNSPEC)
import urllib3.util.connection
urllib3.util.connection.HAS_IPV6 = False
import requests

# Add parent dirs so we can import from the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from huntstack_scrapers.pipelines import clean_text

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", ".env"))

DATABASE_URL = os.environ["DATABASE_URL"]
TOGETHER_API_KEY = os.environ["TOGETHER_API_KEY"]
TOGETHER_API_URL = "https://api.together.xyz/v1/embeddings"
EMBEDDING_MODEL = "intfloat/multilingual-e5-large-instruct"

CHUNK_SIZE = 600
CHUNK_OVERLAP = 100


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks (same logic as EmbeddingPipeline)."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        if end < len(text):
            for punct in ['\n\n', '. ', '? ', '! ', '\n']:
                last_punct = text[start:end].rfind(punct)
                if last_punct > CHUNK_SIZE // 2:
                    end = start + last_punct + len(punct)
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - CHUNK_OVERLAP
    return chunks


# Persistent session — reuses TCP connections instead of opening one per chunk
_session: requests.Session | None = None


def get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({
            "Authorization": f"Bearer {TOGETHER_API_KEY}",
            "Content-Type": "application/json",
        })
    return _session


def generate_embedding(text: str) -> list[float] | None:
    """Generate embedding via Together.ai (IPv4-forced, connection-reusing session)."""
    for attempt in range(1, 5):
        try:
            resp = get_session().post(
                TOGETHER_API_URL,
                json={"model": EMBEDDING_MODEL, "input": text},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]
        except Exception as e:
            wait = attempt * 2
            print(f"  Embedding error (attempt {attempt}/4): {e} — retrying in {wait}s")
            time.sleep(wait)
    print(f"  Embedding failed after 4 attempts, skipping chunk")
    return None


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Get before counts
    cur.execute("SELECT COUNT(*) FROM document_chunks")
    before_count = cur.fetchone()[0]
    print(f"Before: {before_count} chunks")

    # Load documents that don't yet have chunks (resume-safe)
    cur.execute("""
        SELECT d.id, d.title, d.content, d.source_url, d.document_type,
               s.code as state_code
        FROM documents d
        LEFT JOIN states s ON s.id = d.state_id
        WHERE d.content IS NOT NULL AND LENGTH(d.content) > 0
          AND d.id NOT IN (SELECT DISTINCT document_id FROM document_chunks)
        ORDER BY d.id
    """)
    documents = cur.fetchall()
    print(f"Processing {len(documents)} documents...")

    total_new_chunks = 0
    skipped = 0
    embedding_calls = 0

    for i, (doc_id, title, content, source_url, doc_type, state_code) in enumerate(documents):
        # Skip PDFs stored as bytes (shouldn't happen but just in case)
        if isinstance(content, bytes):
            continue

        # Clean the text
        cleaned = clean_text(content)

        # Delete old chunks for this document
        cur.execute("DELETE FROM document_chunks WHERE document_id = %s", (doc_id,))
        deleted = cur.rowcount

        if len(cleaned) < 200:
            conn.commit()
            skipped += 1
            if deleted > 0:
                print(f"  [{i+1}/{len(documents)}] SKIP {title} ({state_code}) — {len(cleaned)} chars after cleaning, deleted {deleted} old chunks")
            continue

        # Chunk the cleaned text
        chunks = chunk_text(cleaned)

        # Generate embeddings and insert
        doc_chunks_inserted = 0
        for idx, chunk in enumerate(chunks):
            embedding = generate_embedding(chunk)
            embedding_calls += 1

            if embedding:
                cur.execute("""
                    INSERT INTO document_chunks
                        (document_id, chunk_index, content, embedding, token_count, metadata)
                    VALUES (%s, %s, %s, %s::vector, %s, %s)
                """, (
                    doc_id,
                    idx,
                    chunk,
                    str(embedding),
                    len(chunk.split()),
                    json.dumps({
                        "state_code": state_code,
                        "source_url": source_url,
                    }),
                ))
                doc_chunks_inserted += 1

            # Rate limit: ~2 calls/sec to avoid Together.ai throttling
            if embedding_calls % 2 == 0:
                time.sleep(0.5)

        conn.commit()
        total_new_chunks += doc_chunks_inserted
        print(f"  [{i+1}/{len(documents)}] {title} ({state_code}): {deleted} old -> {doc_chunks_inserted} new chunks ({len(cleaned)} chars)")

    # Final stats
    cur.execute("SELECT COUNT(*) FROM document_chunks")
    after_count = cur.fetchone()[0]

    print(f"\n=== DONE ===")
    print(f"Documents processed: {len(documents)}")
    print(f"Documents skipped (too short): {skipped}")
    print(f"Embedding API calls: {embedding_calls}")
    print(f"Chunks: {before_count} → {after_count} ({after_count - before_count:+d})")

    conn.close()


if __name__ == "__main__":
    main()
