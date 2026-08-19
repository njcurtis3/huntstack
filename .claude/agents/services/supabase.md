# Supabase

PostgreSQL + pgvector. The only stateful thing in the stack — everything else is
rebuildable from git.

Two independent ways in. Prefer the second for most real questions.

## 1. Management API (control plane)

- Base URL: `https://api.supabase.com/v1`
- Auth: `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`
- Project ref: `$SUPABASE_PROJECT_REF` (the subdomain in `SUPABASE_URL`)

```bash
# projects + region + status
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects \
  | python -c "import sys,json; [print(p['id'], p['name'], p['region'], p['status']) for p in json.load(sys.stdin)]"

# service health
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/health?services=db,auth,rest" \
  | python -c "import sys,json; [print(s['name'], s['status']) for s in json.load(sys.stdin)]"
```

`status: INACTIVE` on the project means it was **paused** (free tier pauses after
a week of inactivity). That takes the whole API down and presents as a Railway
deploy failing its health check — worth checking early during any outage.

## 2. Direct SQL via psql (data plane)

`DATABASE_URL` is already in the repo `.env`, and `psql` is installed. For any
question about actual data — row counts, freshness, whether a scrape landed —
this is far better than the Management API.

```bash
set -a; . .env; set +a
psql "$DATABASE_URL" -c "SELECT count(*) FROM refuge_counts;"
```

### SELECT only

`SELECT` is the only statement you may run. No `INSERT`, `UPDATE`, `DELETE`,
`ALTER`, `CREATE`, `DROP`, `TRUNCATE`, or anything in a transaction that writes.
Schema changes are hand-written `scripts/*.sql` applied by a human per
`RUNBOOK.md` "Deploying" — never by this agent.

**Never run `drizzle-kit push`.** It drops the pgvector `embedding` column on
`document_chunks`. This is the single most destructive command in the repo.

### Useful read-only queries

```sql
-- how stale is refuge data?
SELECT state_code, max(survey_date) AS latest, count(*)
FROM refuge_counts GROUP BY state_code ORDER BY latest DESC;

-- season coverage per state for the current year
SELECT state_code, season_year, count(*)
FROM seasons GROUP BY state_code, season_year ORDER BY state_code, season_year;

-- RAG corpus size
SELECT count(*) FROM documents;
SELECT count(*) FROM document_chunks;
SELECT count(*) FROM document_chunks WHERE embedding IS NULL;  -- should be 0

-- table sizes, for free-tier headroom
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12;

-- total DB size vs the 500MB free tier
SELECT pg_size_pretty(pg_database_size(current_database()));
```

`document_chunks` with 1024-dim embeddings dominates storage; it is the table to
watch for free-tier limits.

### JSONB quirk

Drizzle stores JSONB metadata as **double-encoded strings**. PostgreSQL
`->>'key'` extraction does not work as expected. Use `name LIKE` or filter in
application code. Do not report a `->>` query returning nothing as missing data.

## Not available

Billing, plan usage, and the storage/bandwidth quota page are dashboard-only.
Database size from the query above is the closest proxy.
