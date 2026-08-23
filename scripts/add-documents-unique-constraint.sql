-- ===========================================
-- Migration: stop documents/document_chunks from duplicating on re-scrape
--
-- WHY: documents currently has NO unique constraint, so the
--      ON CONFLICT DO NOTHING in pipelines.py can only ever fire on the
--      primary key (a random UUID). Every re-scrape therefore inserts a full
--      fresh copy of every page plus all of its embedded chunks. This adds
--      the keys those ON CONFLICT clauses need, turning re-scrapes into
--      in-place updates instead of unbounded growth.
--
-- PREREQUISITE: run scripts/prune-duplicate-documents.sql FIRST. Creating a
--               unique index fails while duplicate rows exist.
--
-- PAIRED CODE CHANGE: pipelines.py's three document inserts and its chunk
--                     insert target these constraints by name/columns. Apply
--                     this migration and that code change together -- the
--                     ON CONFLICT (source_url, document_type) clause is a
--                     syntax error against a table with no matching index.
--
-- Per CLAUDE.md: raw SQL only. Do NOT use drizzle-kit push (it drops the
-- pgvector embedding column).
-- ===========================================


-- -------------------------------------------
-- documents: one row per source page per type
-- -------------------------------------------
-- CONCURRENTLY avoids taking a write lock on a large table. It cannot run
-- inside a transaction block -- run this statement on its own in psql.
--
-- NOTE ON NULLS: Postgres treats NULLs as distinct by default, so rows with
-- source_url IS NULL are exempt and can still duplicate. Every scraper path
-- in pipelines.py supplies a URL, so this only affects hand-seeded rows.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS documents_source_url_type_idx
ON documents (source_url, document_type);


-- -------------------------------------------
-- document_chunks: one row per chunk per doc
-- -------------------------------------------
-- chunks_chunk_idx already covers (document_id, chunk_index) but is NOT
-- unique, so it cannot back an ON CONFLICT clause. Replace it with a unique
-- index over the same columns -- it serves the existing lookups equally well,
-- so nothing is lost by dropping the old one.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS chunks_document_chunk_uniq_idx
ON document_chunks (document_id, chunk_index);

DROP INDEX IF EXISTS chunks_chunk_idx;


-- -------------------------------------------
-- Verify
-- -------------------------------------------
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('documents', 'document_chunks')
ORDER BY tablename, indexname;


-- ===========================================
-- KNOWN LIMITATION -- shrinking documents
--
-- With upserts in place, re-scraping a page that got SHORTER leaves stale
-- trailing chunks behind: the new content produces chunk_index 0..9, the old
-- produced 0..13, and chunks 10..13 are updated by nothing and survive with
-- their old text and embeddings, polluting RAG results.
--
-- The clean fix is for the chunk pipeline to delete a document's existing
-- chunks before writing the new set, rather than upserting chunk-by-chunk.
-- That is a larger refactor of pipelines.py's per-chunk flow than this
-- migration covers. Until it happens, this sweeps the stragglers -- safe to
-- re-run any time after a scrape:
--
--   DELETE FROM document_chunks c
--   USING (
--     SELECT document_id, max(chunk_index) AS max_idx
--     FROM document_chunks
--     WHERE created_at > now() - interval '1 day'
--     GROUP BY document_id
--   ) recent
--   WHERE c.document_id = recent.document_id
--     AND c.created_at < now() - interval '1 day';
--
-- (Deletes chunks for recently-rewritten documents that were not themselves
-- rewritten in that pass. Adjust the interval to bracket your scrape run.)
-- ===========================================
