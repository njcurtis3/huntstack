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
-- NOTE -- shrinking documents
--
-- Upserting chunks by (document_id, chunk_index) would, on its own, strand the
-- tail of a document that got shorter: new content writes chunk_index 0..9, the
-- old content had written 0..13, and 10..13 survive with stale text and stale
-- embeddings that keep surfacing in RAG results.
--
-- That is handled in code as of the commit that added this note:
-- EmbeddingPipeline._store_chunks() writes a whole document in one transaction
-- and then deletes any chunk_index it did not just write. No periodic sweep is
-- needed here.
-- ===========================================
