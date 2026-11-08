-- ===========================================
-- Outfitter self-service (2026-11-07)
--
-- Lets an outfitter claim or list a business and keep it current, with every public change
-- held as a pending submission until an admin approves it (apps/api/src/routes/me.ts and
-- admin.ts). Adds four tables: outfitter_submissions (new listing, edit, claim, review
-- reply), review_replies (approved replies, the only ones served), outfitter_inquiries
-- (hunter messages to a claimed outfitter) and outfitter_view_counts (a daily aggregate;
-- no IP, user agent or user id is stored). owner_id and user_id columns are Supabase auth
-- user ids with deliberately no FK (no code path creates profiles rows), so the old
-- outfitters.owner_id -> profiles FK is dropped (the field_reports precedent).
--
-- Every new table has row level security ENABLED with no policies and all anon/authenticated
-- grants revoked: only the API's server connection reads or writes them (CONSTRAINTS.md 3.2a).
-- Run seed-outfitters-tx.sql after this. Applied by hand, never drizzle-kit push.
--
-- Additive and idempotent apart from the FK drop (which is IF EXISTS).
-- ===========================================
\set ON_ERROR_STOP on

-- (1) owner_id points at a Supabase auth user, not a profiles row
ALTER TABLE outfitters DROP CONSTRAINT IF EXISTS outfitters_owner_id_profiles_id_fk;

-- (2) one listing per owner; legacy tx-NN ids resolve through metadata
CREATE UNIQUE INDEX IF NOT EXISTS outfitters_owner_unique ON outfitters (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS outfitters_legacy_id_idx ON outfitters ((metadata->>'legacyId'));

-- (3) pending changes awaiting an admin decision
CREATE TABLE IF NOT EXISTS outfitter_submissions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text        NOT NULL CONSTRAINT submissions_kind_check CHECK (kind IN ('new_listing', 'edit', 'claim', 'review_reply')),
  status          text        NOT NULL DEFAULT 'pending' CONSTRAINT submissions_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  user_id         uuid        NOT NULL,
  submitter_email text,
  outfitter_id    uuid        REFERENCES outfitters (id) ON DELETE CASCADE,
  review_id       uuid        REFERENCES reviews (id) ON DELETE CASCADE,
  payload         jsonb       NOT NULL,
  reject_reason   text,
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submissions_target CHECK (kind = 'new_listing' OR outfitter_id IS NOT NULL),
  CONSTRAINT submissions_reply_target CHECK (kind <> 'review_reply' OR review_id IS NOT NULL),
  CONSTRAINT submissions_reject_reason CHECK (status <> 'rejected' OR length(reject_reason) BETWEEN 3 AND 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS submissions_one_pending_edit ON outfitter_submissions (outfitter_id) WHERE status = 'pending' AND kind = 'edit';
CREATE UNIQUE INDEX IF NOT EXISTS submissions_one_pending_user ON outfitter_submissions (user_id) WHERE status = 'pending' AND kind IN ('new_listing', 'claim');
CREATE UNIQUE INDEX IF NOT EXISTS submissions_one_pending_reply ON outfitter_submissions (review_id) WHERE status = 'pending' AND kind = 'review_reply';
CREATE INDEX IF NOT EXISTS submissions_status_created_idx ON outfitter_submissions (status, created_at);
CREATE INDEX IF NOT EXISTS submissions_user_created_idx ON outfitter_submissions (user_id, created_at DESC);

ALTER TABLE outfitter_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON outfitter_submissions FROM anon, authenticated;

-- (4) approved owner replies to reviews; a row here is what the public sees
CREATE TABLE IF NOT EXISTS review_replies (
  review_id    uuid        PRIMARY KEY REFERENCES reviews (id) ON DELETE CASCADE,
  outfitter_id uuid        NOT NULL REFERENCES outfitters (id) ON DELETE CASCADE,
  body         text        NOT NULL CONSTRAINT review_replies_body_check CHECK (length(body) BETWEEN 1 AND 1500),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE review_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON review_replies FROM anon, authenticated;

-- (5) hunter inquiries to a claimed outfitter; hunter_email is the verified account email.
-- recipient_owner_id is the owner when it was sent: after a release and reclaim the new owner
-- never sees the previous owner's inquiries (they hold hunters' emails and phones).
CREATE TABLE IF NOT EXISTS outfitter_inquiries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outfitter_id    uuid        NOT NULL REFERENCES outfitters (id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL,
  recipient_owner_id uuid     NOT NULL,
  hunter_email    text        NOT NULL,
  hunter_name     text        CONSTRAINT inquiries_name_check CHECK (length(hunter_name) <= 80),
  hunter_phone    text        CONSTRAINT inquiries_phone_check CHECK (length(hunter_phone) <= 30),
  preferred_dates text        CONSTRAINT inquiries_dates_check CHECK (length(preferred_dates) <= 100),
  party_size      integer     CONSTRAINT inquiries_party_check CHECK (party_size BETWEEN 1 AND 50),
  message         text        NOT NULL CONSTRAINT inquiries_message_check CHECK (length(message) BETWEEN 10 AND 2000),
  status          text        NOT NULL DEFAULT 'new' CONSTRAINT inquiries_status_check CHECK (status IN ('new', 'read', 'archived')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiries_outfitter_created_idx ON outfitter_inquiries (outfitter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_user_created_idx ON outfitter_inquiries (user_id, created_at DESC);

ALTER TABLE outfitter_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON outfitter_inquiries FROM anon, authenticated;

-- (6) daily view aggregate; counted server side only
CREATE TABLE IF NOT EXISTS outfitter_view_counts (
  outfitter_id uuid    NOT NULL REFERENCES outfitters (id) ON DELETE CASCADE,
  day          date    NOT NULL,
  kind         text    NOT NULL CONSTRAINT view_counts_kind_check CHECK (kind IN ('impression', 'detail', 'contact')),
  count        integer NOT NULL DEFAULT 0 CONSTRAINT view_counts_count_check CHECK (count >= 0),
  PRIMARY KEY (outfitter_id, day, kind)
);

ALTER TABLE outfitter_view_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON outfitter_view_counts FROM anon, authenticated;
