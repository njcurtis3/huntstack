-- ===========================================
-- Index document_chunks by md5(content) (2026-10-27)
--
-- EmbeddingPipeline._held_elsewhere (pipelines.py) looks up each page's chunk hashes before
-- embedding, to skip text another document already stores. Without this index that lookup
-- scans the whole table once per page.
--
-- CONCURRENTLY: must run outside a transaction block. Idempotent.
-- ===========================================
\set ON_ERROR_STOP on

CREATE INDEX CONCURRENTLY IF NOT EXISTS document_chunks_content_md5_idx
  ON document_chunks (md5(content));
