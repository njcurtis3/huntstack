"""
Re-embed every chunk in document_chunks with the current embedding model.

Written for the Oct 2026 move from Together.ai's e5-large-instruct to OpenAI's
text-embedding-3-small. Vectors from two models live in different spaces, so a
query embedded with the new model cannot be compared against chunks embedded
with the old one: every row has to be redone, not just new ones.

Only the `embedding` column changes. Chunk text, ids and metadata are left
alone, so nothing is deleted and a failed batch leaves the rest intact.

Afterwards it rebuilds the ivfflat index. Its cluster centroids were computed
from the old vectors and would send queries to the wrong lists, quietly
dropping recall, until rebuilt.

Usage (from apps/scrapers-python, with DATABASE_URL pointing at Supabase):
    python -m huntstack_scrapers.scripts.cleanup.reembed_all --dry-run
    python -m huntstack_scrapers.scripts.cleanup.reembed_all
    python -m huntstack_scrapers.scripts.cleanup.reembed_all --start-after <chunk id>
"""
import argparse
import os
import sys
import time

import psycopg2
from dotenv import load_dotenv

# Force UTF-8 output so non-ASCII chunk text doesn't crash on Windows
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from huntstack_scrapers.pipelines import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, embed_texts

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", ".env"))

# OpenAI accepts up to 2048 inputs per request; 200 chunks of ~600 chars is ~30k tokens,
# well inside the per-request limit and small enough that a failure costs little to redo.
BATCH_SIZE = 200
INDEX_NAME = "document_chunks_embedding_idx"


def embed_with_retry(texts: list[str], api_key: str) -> list[list[float]]:
    for attempt in range(1, 5):
        try:
            return embed_texts(texts, api_key)
        except Exception as e:
            if attempt == 4:
                raise
            wait = attempt * 5
            print(f"  Embedding error (attempt {attempt}/4): {e} — retrying in {wait}s")
            time.sleep(wait)
    raise AssertionError("unreachable")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true",
                        help="Embed one batch and report; write nothing")
    parser.add_argument("--start-after", type=str, default=None,
                        help="Resume after this chunk id (printed after every batch)")
    args = parser.parse_args()

    api_key = os.environ["OPENAI_API_KEY"]
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    cur.execute("SELECT format_type(atttypid, atttypmod) FROM pg_attribute "
                "WHERE attrelid = 'document_chunks'::regclass AND attname = 'embedding'")
    column_type = cur.fetchone()[0]
    if column_type != f"vector({EMBEDDING_DIMENSIONS})":
        sys.exit(f"document_chunks.embedding is {column_type}, but {EMBEDDING_MODEL} is configured "
                 f"for {EMBEDDING_DIMENSIONS} dims. Migrate the column first.")

    cur.execute("SELECT COUNT(*), COALESCE(SUM(LENGTH(content)), 0) FROM document_chunks")
    total, total_chars = cur.fetchone()
    # ~4 chars per token; text-embedding-3-small is $0.02 per million tokens
    print(f"{total} chunks, ~{total_chars // 4:,} tokens, ~${total_chars / 4 / 1e6 * 0.02:.2f} "
          f"with {EMBEDDING_MODEL} @ {EMBEDDING_DIMENSIONS} dims")

    last_id = args.start_after
    done = 0
    while True:
        if last_id is None:
            cur.execute("SELECT id, content FROM document_chunks ORDER BY id LIMIT %s", (BATCH_SIZE,))
        else:
            cur.execute("SELECT id, content FROM document_chunks WHERE id > %s ORDER BY id LIMIT %s",
                        (last_id, BATCH_SIZE))
        rows = cur.fetchall()
        if not rows:
            break

        embeddings = embed_with_retry([content for _, content in rows], api_key)

        if args.dry_run:
            print(f"[DRY RUN] embedded {len(rows)} chunks, {len(embeddings[0])} dims each; nothing written")
            conn.close()
            return

        cur.executemany(
            "UPDATE document_chunks SET embedding = %s::vector WHERE id = %s",
            [(str(embedding), chunk_id) for (chunk_id, _), embedding in zip(rows, embeddings)],
        )
        conn.commit()

        done += len(rows)
        last_id = rows[-1][0]
        print(f"  {done}/{total} re-embedded (resume with --start-after {last_id})")

    print(f"Rebuilding {INDEX_NAME} so its clusters reflect the new vectors...")
    cur.execute(f"REINDEX INDEX {INDEX_NAME}")
    conn.commit()
    print(f"Done. {done} chunks re-embedded with {EMBEDDING_MODEL}.")
    conn.close()


if __name__ == "__main__":
    main()
