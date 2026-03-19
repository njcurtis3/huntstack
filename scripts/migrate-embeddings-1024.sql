-- ===========================================
-- Migration: 768 -> 1024 embedding dimensions
-- Reason: BAAI/bge-base-en-v1.5 and togethercomputer/m2-bert-80M-8k-retrieval
--         removed from Together.ai serverless. Migrating to
--         intfloat/multilingual-e5-large-instruct (1024d).
--
-- Run this in Supabase SQL Editor, then re-embed all documents.
-- ===========================================

-- Drop the old index first (required before changing column type)
DROP INDEX IF EXISTS document_chunks_embedding_idx;

-- Drop and re-add the embedding column at the new dimension
-- (pgvector does not support ALTER COLUMN for dimension changes)
ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE document_chunks ADD COLUMN embedding vector(1024);

-- Recreate the IVFFlat index for cosine similarity search
CREATE INDEX document_chunks_embedding_idx
ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Recreate the search function with updated dimension
CREATE OR REPLACE FUNCTION search_documents(
  query_embedding vector(1024),
  match_count int DEFAULT 10,
  filter_state text DEFAULT NULL,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE
    (filter_state IS NULL OR d.metadata->>'state_code' = filter_state)
    AND (filter_category IS NULL OR d.document_type = filter_category)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
