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
import requests
import psycopg2
from dotenv import load_dotenv

# Add parent dirs so we can import from the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from huntstack_scrapers.pipelines import clean_text

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))

DATABASE_URL = os.environ["DATABASE_URL"]
TOGETHER_API_KEY = os.environ["TOGETHER_API_KEY"]
TOGETHER_API_URL = "https://api.together.xyz/v1/embeddings"
EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"

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


def generate_embedding(text: str) -> list[float] | None:
    """Generate embedding via Together.ai."""
    try:
        resp = requests.post(
            TOGETHER_API_URL,
            headers={
                "Authorization": f"Bearer {TOGETHER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"model": EMBEDDING_MODEL, "input": text},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]
    except Exception as e:
        print(f"  Embedding error: {e}")
        return None


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Get before counts
    cur.execute("SELECT COUNT(*) FROM document_chunks")
    before_count = cur.fetchone()[0]
    print(f"Before: {before_count} chunks")

    # Load all documents
    cur.execute("""
        SELECT d.id, d.title, d.content, d.source_url, d.document_type,
               s.code as state_code
        FROM documents d
        LEFT JOIN states s ON s.id = d.state_id
        WHERE d.content IS NOT NULL AND LENGTH(d.content) > 0
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
