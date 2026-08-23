-- ===========================================
-- Prune duplicate documents + reclaim disk
--
-- WHY: documents has no unique constraint (only documents_type_idx and
--      documents_state_idx, both plain). pipelines.py inserts with a bare
--      ON CONFLICT DO NOTHING, which can therefore only fire on the primary
--      key -- a defaultRandom() UUID that never collides. Result: every
--      re-scrape writes a COMPLETE fresh copy of every page, and each copy
--      drags ~14 chunks (600-char chunking, pipelines.py:367) each carrying a
--      1024-dim embedding at ~4KB. That is the leading suspect for blowing
--      past the Supabase free-tier storage cap.
--
-- WHAT: keeps the NEWEST row per (source_url, document_type) and deletes the
--       rest. document_chunks cascades via its ON DELETE CASCADE FK, so the
--       embeddings go with them.
--
-- ORDER: run this BEFORE scripts/add-documents-unique-constraint.sql -- that
--        migration cannot create its unique index while duplicates exist.
--
-- HOW: run in a psql session (NOT the Supabase SQL Editor -- see the VACUUM
--      section at the bottom, which cannot run inside a transaction block).
-- ===========================================


-- -------------------------------------------
-- STEP 1 -- Look before you delete (read-only)
-- -------------------------------------------
-- Run this first and eyeball it. If duplicate_rows is ~0, duplicates are NOT
-- your storage problem and you should stop here rather than deleting anything.

SELECT
  count(*)                                            AS total_documents,
  count(DISTINCT (source_url, document_type))         AS distinct_documents,
  count(*) - count(DISTINCT (source_url, document_type)) AS duplicate_rows,
  pg_size_pretty(pg_total_relation_size('documents'))       AS documents_size,
  pg_size_pretty(pg_total_relation_size('document_chunks')) AS chunks_size
FROM documents
WHERE source_url IS NOT NULL;

-- Worst offenders, so you can sanity-check that these really are re-scrapes
-- of the same page and not legitimately distinct records:
SELECT source_url, document_type, count(*) AS copies,
       min(created_at) AS first_scraped, max(created_at) AS last_scraped
FROM documents
WHERE source_url IS NOT NULL
GROUP BY source_url, document_type
HAVING count(*) > 1
ORDER BY copies DESC
LIMIT 25;


-- -------------------------------------------
-- STEP 2 -- Delete the superseded copies
-- -------------------------------------------
-- Keeps the most recent row per (source_url, document_type). Tie-break on id
-- so the result is deterministic when created_at collides.
--
-- NOTE: rows with source_url IS NULL are left alone -- there is no key to
-- dedupe them on. If you have many, investigate separately.

BEGIN;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY source_url, document_type
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM documents
  WHERE source_url IS NOT NULL
)
DELETE FROM documents d
USING ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- Chunks whose parent document is already gone. The FK is ON DELETE CASCADE so
-- this should report 0; it exists to catch rows orphaned by any earlier
-- manual cleanup that bypassed the cascade.
DELETE FROM document_chunks c
WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = c.document_id);

-- Inspect the row counts, then COMMIT (or ROLLBACK if they look wrong).
SELECT count(*) AS documents_remaining FROM documents;
SELECT count(*) AS chunks_remaining FROM document_chunks;

COMMIT;


-- -------------------------------------------
-- STEP 3 -- Actually reclaim the disk
-- -------------------------------------------
-- CRITICAL: the DELETEs above do NOT return space to the filesystem. Postgres
-- only marks the tuples dead and keeps the space for reuse within the table,
-- so the Supabase storage figure will barely move until you run this.
--
-- VACUUM FULL cannot run inside a transaction block -- run each statement on
-- its own, in psql, outside BEGIN/COMMIT.
--
-- WARNING: VACUUM FULL rewrites the table and needs roughly 2x the table's
-- current size in free space while it runs. If you are hard against the quota
-- this can fail. If it does, do the smaller table first, or use pg_repack
-- (rewrites incrementally without the 2x spike) if the extension is available.

VACUUM (FULL, ANALYZE) document_chunks;
VACUUM (FULL, ANALYZE) documents;

-- The ivfflat index on embeddings holds stale entries for every deleted chunk
-- and is often the single largest object here. Rebuilding it usually reclaims
-- more than the row deletes did.
REINDEX INDEX document_chunks_embedding_idx;


-- -------------------------------------------
-- STEP 4 -- Confirm it worked
-- -------------------------------------------
SELECT
  pg_size_pretty(pg_total_relation_size('documents'))       AS documents_size,
  pg_size_pretty(pg_total_relation_size('document_chunks')) AS chunks_size,
  pg_size_pretty(pg_database_size(current_database()))      AS total_db_size;

-- Largest relations overall -- if documents/document_chunks are NOT at the top
-- of this list, the storage problem is somewhere else entirely and pruning was
-- the wrong lever.
SELECT relname,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;
