"""
Re-embed documents that lost their chunks from the interrupted rechunk.
Only processes documents that have no chunks AND are relevant to hunting.
"""
import os
import sys
import json
import time
import requests
import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from huntstack_scrapers.pipelines import clean_text

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))

DATABASE_URL = os.environ["DATABASE_URL"]
TOGETHER_API_KEY = os.environ["TOGETHER_API_KEY"]
TOGETHER_API_URL = "https://api.together.xyz/v1/embeddings"
EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"

CHUNK_SIZE = 600
CHUNK_OVERLAP = 100

# Skip these irrelevant documents
SKIP_TITLES = {
    "commercial fishing guide",
    "eeo / affirmative action policy",
    "eeo",
    "dealer license application",
    "view commercial and for-hire fishing regulations",
}


def chunk_text(text):
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


def generate_embedding(text):
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

    # Find orphaned documents (no chunks)
    cur.execute("""
        SELECT d.id, d.title, d.content, d.source_url, s.code as state_code
        FROM documents d
        LEFT JOIN document_chunks dc ON dc.document_id = d.id
        LEFT JOIN states s ON s.id = d.state_id
        WHERE dc.id IS NULL
          AND d.content IS NOT NULL
          AND LENGTH(d.content) > 200
    """)
    orphans = cur.fetchall()
    print(f"Found {len(orphans)} orphaned documents")

    total_chunks = 0
    skipped = 0
    embedding_calls = 0

    for i, (doc_id, title, content, source_url, state_code) in enumerate(orphans):
        # Skip irrelevant documents
        if title and title.lower().strip() in SKIP_TITLES:
            print(f"  [{i+1}/{len(orphans)}] SKIP (irrelevant): {title}")
            skipped += 1
            continue

        # Skip very large or irrelevant documents
        if len(content) > 80000:
            lower_title = (title or "").lower()
            if ("fish" in lower_title or "commercial" in lower_title or
                "dealer" in lower_title or "pfas" in lower_title or
                len(content) > 200000):
                print(f"  [{i+1}/{len(orphans)}] SKIP (too large/irrelevant): {title} ({len(content)} chars)")
                skipped += 1
                continue

        # Clean text
        cleaned = clean_text(content)
        if len(cleaned) < 200:
            print(f"  [{i+1}/{len(orphans)}] SKIP (too short after cleaning): {title}")
            skipped += 1
            continue

        # Chunk and embed
        chunks = chunk_text(cleaned)
        inserted = 0
        for idx, chunk in enumerate(chunks):
            embedding = generate_embedding(chunk)
            embedding_calls += 1

            if embedding:
                cur.execute("""
                    INSERT INTO document_chunks
                        (document_id, chunk_index, content, embedding, token_count, metadata)
                    VALUES (%s, %s, %s, %s::vector, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    doc_id, idx, chunk, str(embedding),
                    len(chunk.split()),
                    json.dumps({"state_code": state_code, "source_url": source_url}),
                ))
                inserted += 1

            if embedding_calls % 2 == 0:
                time.sleep(0.5)

        conn.commit()
        total_chunks += inserted
        print(f"  [{i+1}/{len(orphans)}] {title} ({state_code}): {inserted} chunks ({len(cleaned)} chars)")

    cur.execute("SELECT COUNT(*) FROM document_chunks")
    final = cur.fetchone()[0]
    print(f"\nDone. Added {total_chunks} chunks, skipped {skipped} docs.")
    print(f"Total chunks now: {final}")
    conn.close()


if __name__ == "__main__":
    main()
