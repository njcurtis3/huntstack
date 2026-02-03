-- ===========================================
-- HuntStack Database Initialization
-- Run this in Supabase SQL Editor before deploying
-- ===========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===========================================
-- Add vector column to document_chunks
-- (Run after Drizzle migrations)
-- ===========================================

-- Add embedding column with pgvector
-- ALTER TABLE document_chunks 
-- ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for vector similarity search
-- CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx 
-- ON document_chunks 
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);

-- ===========================================
-- Create search functions
-- ===========================================

-- Function to search documents by vector similarity
CREATE OR REPLACE FUNCTION search_documents(
  query_embedding vector(1536),
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

-- ===========================================
-- Row Level Security Policies
-- ===========================================

-- Enable RLS on tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfitters ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all profiles but only update their own
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Outfitters: Everyone can read, owners can update
CREATE POLICY "Outfitters are viewable by everyone"
  ON outfitters FOR SELECT
  USING (true);

CREATE POLICY "Outfitter owners can update their listing"
  ON outfitters FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Authenticated users can create outfitters"
  ON outfitters FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Reviews: Everyone can read, authors can update/delete their own
CREATE POLICY "Reviews are viewable by everyone"
  ON reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can create reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);

-- ===========================================
-- Triggers
-- ===========================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_outfitters_updated_at
  BEFORE UPDATE ON outfitters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_regulations_updated_at
  BEFORE UPDATE ON regulations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update outfitter rating when review is added/updated
CREATE OR REPLACE FUNCTION update_outfitter_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE outfitters
  SET 
    rating = (SELECT AVG(rating)::real FROM reviews WHERE outfitter_id = COALESCE(NEW.outfitter_id, OLD.outfitter_id)),
    review_count = (SELECT COUNT(*) FROM reviews WHERE outfitter_id = COALESCE(NEW.outfitter_id, OLD.outfitter_id))
  WHERE id = COALESCE(NEW.outfitter_id, OLD.outfitter_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rating_on_review
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_outfitter_rating();
