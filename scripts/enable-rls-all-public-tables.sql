-- ===========================================
-- Close Supabase's public REST/GraphQL access to every HuntStack table (2026-11-07)
--
-- The web bundle ships the Supabase anon key (normal for Supabase). With row-level
-- security OFF and Supabase's default grants, that key could SELECT/INSERT/UPDATE/DELETE
-- every public table through PostgREST. Turning RLS on with NO policies gives the anon
-- and authenticated roles zero rows and zero writes.
--
-- Safe for the app: apps/api and the Python pipeline connect as `postgres`, which has
-- BYPASSRLS, and no client reads tables through supabase-js (it is used for sign-in only).
-- No data changes. Idempotent. Undo per table: ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;
--
-- Only tables owned by the connecting role are changed; spatial_ref_sys (PostGIS, owned by
-- supabase_admin) is skipped and reported.
--
-- NEW TABLES: Supabase's default privileges grant anon on every new public table, so any
-- future scripts/*.sql that creates a table must also run ENABLE ROW LEVEL SECURITY on it.
-- ===========================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    IF t.owner <> current_user THEN
      RAISE NOTICE 'skipped % (owned by %)', t.relname, t.owner;
    ELSIF t.rls THEN
      RAISE NOTICE 'already on: %', t.relname;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
      RAISE NOTICE 'enabled: %', t.relname;
    END IF;
  END LOOP;
END $$;
