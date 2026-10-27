-- ===========================================
-- Remove repeated chunk text from document_chunks (2026-10-27)
--
-- Agency sites repeat blocks of text on many pages (KDWP's stamp prices, HIP notes and crane
-- permit rules each sat on ~50 pages), and each copy was stored and embedded. On 2026-10-27,
-- 18,947 of 33,139 chunks were exact copies of another, so vector search returned one passage
-- several times and the table was most of the database's 547 MB.
--
-- Keeps one row per distinct content: a 'regulation' document's copy over a 'page' copy, then
-- the shortest source_url (the hub page the text belongs to), then the lowest ids. Only exact
-- copies are removed, so no text leaves the table. The scraper no longer re-adds copies
-- (pipelines.EmbeddingPipeline._held_elsewhere); search and chat also drop repeats when picking
-- results (apps/api/src/lib/retrieval.ts).
--
-- Default is a dry run (counts, then ROLLBACK). Apply with:  psql "$DB" -v apply=1 -f this.sql
-- Back up the rows first (see RUNBOOK / CURRENT_STATE for the \copy used on 2026-10-27).
-- VACUUM FULL takes an exclusive lock on document_chunks (chat retrieval waits ~1-2 min) and
-- rebuilds its indexes, including the ivfflat one, which needs more than Supabase's 32 MB default.
-- ===========================================
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size_before;

BEGIN;

CREATE TEMP TABLE chunk_copies ON COMMIT DROP AS
SELECT id FROM (
  SELECT c.id,
         row_number() OVER (
           PARTITION BY md5(c.content)
           ORDER BY (d.document_type = 'regulation') DESC, length(d.source_url), d.id, c.chunk_index, c.id
         ) AS rank
  FROM document_chunks c JOIN documents d ON d.id = c.document_id
) ranked
WHERE rank > 1;

SELECT (SELECT count(*) FROM document_chunks) AS chunks_before,
       (SELECT count(*) FROM chunk_copies) AS copies_to_delete;

DELETE FROM document_chunks WHERE id IN (SELECT id FROM chunk_copies);

SELECT count(*) AS chunks_after, count(DISTINCT md5(content)) AS distinct_texts FROM document_chunks;

\if :apply
  COMMIT;
  SET maintenance_work_mem = '128MB';
  VACUUM (FULL, ANALYZE) document_chunks;
  SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size_after;
\else
  ROLLBACK;
  \echo 'Dry run: nothing deleted. Re-run with -v apply=1 to delete and compact.'
\endif
