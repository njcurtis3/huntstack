# HuntStack Operations Runbook

Short operational reference for running HuntStack in production (beta). For the full
architecture snapshot see `CURRENT_STATE.md`; for constraints see `CONSTRAINTS.md`.

## Deployment topology

| Piece | Platform | Notes |
|-------|----------|-------|
| Frontend (`apps/web`) | Cloudflare Pages (project `huntstack`) | Git-connected; build `pnpm --filter @huntstack/web build`, output `apps/web/dist`. Auto-deploys on push to `main`. |
| API (`apps/api`) | Railway (nixpacks, `railway.toml`) | Health check gates deploys on `/api/health/ready` (DB reachability). Auto-deploys on push to `main`. |
| Database | Supabase (PostgreSQL + pgvector) | Migrations are **manual** (see below). |

Both platforms auto-deploy from `main`, so a bad commit reaching `main` ships to production.

## Rollback

### Frontend (Cloudflare Pages)
1. Cloudflare dashboard → Workers & Pages → `huntstack` → **Deployments**.
2. Find the last known-good deployment, open its `…` menu → **Rollback to this deployment**.
   (Instant — Pages keeps prior builds; no rebuild needed.)
3. Alternatively, `git revert <bad-sha>` + push to `main` triggers a fresh good build.

### API (Railway)
1. Railway dashboard → `huntstack` API service → **Deployments**.
2. Open the last known-good deployment → **Redeploy** (or **Rollback**).
3. Railway's health check (`/api/health/ready`) must pass or the deploy is marked failed —
   if a rollback won't go healthy, the DB is likely unreachable (check `DATABASE_URL` / Supabase).
4. Alternatively `git revert` + push, same as frontend.

### Database
- There is **no automatic migration on deploy** — the Railway build command does not run
  `db:migrate`. Schema changes are applied manually and separately (raw SQL / `scripts/*.sql`).
- **Never run `drizzle-kit push`** — it drops the pgvector `embedding` column on `document_chunks`.
  Use raw SQL migrations (see `CONSTRAINTS.md`).
- Rolling back app code does **not** roll back the schema. If a deploy included a schema change,
  reverting the code may leave the DB ahead of the code — usually fine (additive changes), but
  verify before assuming a code rollback fully restores prior behavior.

## Monitoring & alerts

- **Scraper failure alerts:** set `SCRAPER_ALERT_WEBHOOK` (Slack or Discord incoming webhook) in
  `.env`. `scripts/run-refuge-counts.ps1` then POSTs an alert when the weekly run fails **or**
  silently extracts 0 items. Without it, a stalled or broken scraper fails invisibly.
- **Error tracking:** set `SENTRY_DSN` (API) and `VITE_SENTRY_DSN` (frontend, build-time) to send
  unhandled errors to Sentry. Both apps run normally with these unset (no reporting).
- **LLM cost:** `/api/chat` is rate-limited to 20 req/hour/IP (`chat.ts`). Set a hard billing
  spend-cap/alert in the **Together.ai dashboard** as the external backstop — this is not
  configurable from code.
- **Health:** `GET /api/health` (liveness) and `GET /api/health/ready` (DB check, returns 503 if
  the DB is down). Railway uses the latter to gate deploys.

## Common incidents

| Symptom | Likely cause | First check |
|---------|-------------|-------------|
| Chat returns 503 | `TOGETHER_API_KEY` missing/invalid, or the pinned Together model was retired from serverless | Together.ai dashboard; test `GET /v1/models` (see `CONSTRAINTS.md §4.6`) |
| Chat/extraction returns empty or 400 | Together retired the model ID | Swap model ID; the 400 body names the problem |
| Scraper produces 0 items | Source site restructured (dead URL) or extractor model broke | That week's log in `scripts/logs/`; run one source with `--dry-run` |
| API deploy stuck unhealthy | DB unreachable | `GET /api/health/ready`; Supabase status; `DATABASE_URL` |
| Frontend shows localhost/API errors in prod | `VITE_API_URL` not set at build time (it's build-time, no runtime override) | Cloudflare Pages env vars, then rebuild |
