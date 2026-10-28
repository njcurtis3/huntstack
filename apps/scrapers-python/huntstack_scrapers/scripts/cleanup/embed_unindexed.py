"""
Index stored documents that have text but no chunks, for one state.

Documents saved while embeddings were failing (e.g. the July 2026 crawl, when Together's
embedding model was retired) kept their text but never got chunks, so chat can't find them.
This feeds each one through EmbeddingPipeline, the same path a crawl uses: same cleaning and
chunking, text another document already holds is skipped, and chunks are written in one
transaction per document.

Usage (from apps/scrapers-python):
    python -m huntstack_scrapers.scripts.cleanup.embed_unindexed --state NM --dry-run
    python -m huntstack_scrapers.scripts.cleanup.embed_unindexed --state NM
    python -m huntstack_scrapers.scripts.cleanup.embed_unindexed --state KS --exclude "/layout/set"

--exclude takes a regex matched against "<title> <url>" (repeatable); matching documents are
left unindexed. Runs on 2026-10-27 (see CURRENT_STATE.md) used:
    KS  /layout/set ; hunting-forecasts    print-view copies; July copy of last season's reports
    TX  ^(?!.*(?i:hunt)).*(?i:fish|red-drum|seatrout)   fishing-only pages
        activity=(wildlifeViewing|hiking|fishing|camping|bicycling|other|equestrian|driving)
        action=Search ; /wildlife_management/          WMA non-hunting tabs, search-form
                                                        variants, Kerr/Mason Mtn research
    AR  /news/|/tag/|(?i:recipe)           old news and undated weekly reports, recipes
    OK  /waterfowl/reports|duck-stamp-program   old weekly reports page, stamp art contest
In Git Bash, set MSYS_NO_PATHCONV=1 first: it rewrites an argument starting with "/" into a
Windows path, and the pattern then silently matches nothing.
"""
import argparse
import logging
import os
import re
import sys

import psycopg2
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", ".env"))

from huntstack_scrapers.pipelines import EmbeddingPipeline, clean_text  # noqa: E402


class _Spider:
    logger = logging.getLogger("embed_unindexed")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--state", required=True, help="State code, e.g. NM")
    parser.add_argument("--dry-run", action="store_true", help="List the documents and chunk counts; write nothing")
    parser.add_argument("--exclude", action="append", default=[],
                        help='Regex on "<title> <url>"; matching documents are skipped (repeatable)')
    args = parser.parse_args()
    excludes = [re.compile(p) for p in args.exclude]
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    with conn.cursor() as cur:
        cur.execute("""
            SELECT d.source_url, d.document_type, d.title, d.content
            FROM documents d JOIN states s ON s.id = d.state_id
            WHERE s.code = %s AND d.content IS NOT NULL AND length(d.content) > 200
              AND NOT EXISTS (SELECT 1 FROM document_chunks c WHERE c.document_id = d.id)
            ORDER BY d.source_url
        """, (args.state.upper(),))
        docs = cur.fetchall()
    conn.close()

    pipeline = EmbeddingPipeline()
    if not pipeline.api_key:
        sys.exit("EMBEDDINGS_API_KEY (or OPENAI_API_KEY) is not set")
    print(f"{len(docs)} {args.state.upper()} documents with text and no chunks")
    skipped = [d for d in docs if any(p.search(f"{d[2] or ''} {d[0]}") for p in excludes)]
    docs = [d for d in docs if d not in skipped]
    print(f"{len(skipped)} excluded, {len(docs)} to index")
    total = 0
    for url, document_type, title, content in docs:
        chunks = pipeline._chunk_text(clean_text(content))
        total += len(chunks)
        print(f"  {document_type:10} {len(chunks):4} chunks  {(title or '').strip()[:50]}  {url}")
        if args.dry_run:
            continue
        # The item type maps back to this document_type (pipelines.DOCUMENT_TYPE_BY_ITEM_TYPE)
        item = {"url": url, "type": document_type, "content": content, "state_code": args.state.upper()}
        pipeline.process_item(item, _Spider())
    print(f"{total} chunks before skipping text stored elsewhere")
    return 0


if __name__ == "__main__":
    sys.exit(main())
