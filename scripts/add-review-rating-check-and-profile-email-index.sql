-- ===========================================
-- Migration: reviews.rating CHECK constraint + profiles.email index
-- Reason: rating was only validated at the application layer; email had
--         no index despite being a natural auth-adjacent lookup column.
--
-- Run this in Supabase SQL Editor (or via psql against DATABASE_URL).
-- Idempotent — safe to run more than once.
-- ===========================================

DO $$ BEGIN
  ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (rating >= 1 AND rating <= 5);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles USING btree (email);
