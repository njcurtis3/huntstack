# Beta Launch Checklist

Everything required to get HuntStack hosted and beta-ready. Ordered by priority.

Last updated: 2026-04-24

---

## Status Summary

| Item | Status |
|------|--------|
| CI — typecheck | Done |
| CI — build | Done |
| CI — lint | Done |
| Frontend deploy (Cloudflare Pages) | Not done |
| API host (TBD) | Not done |
| SPA routing fix (`_redirects`) | Done |
| Production env vars | Not done |
| CORS configured for production | Not done |
| Post-deploy smoke test | Not done |
| Smoke test suite (3 endpoints) | Not done |
| Branch protection on main | Not done |

---

## 1. Add `_redirects` for Cloudflare Pages (code change)

React Router requires all routes to fall back to `index.html`. Without this, any
direct URL navigation or page refresh on a non-root route returns a 404.

Create `apps/web/public/_redirects`:

```
/* /index.html 200
```

Files in `apps/web/public/` are copied to the build output directory automatically
by Vite, so this requires no build config changes.

---

## 2. Add lint job to CI

`pnpm lint` is wired in both `apps/web` and `apps/api` but never runs in GitHub
Actions. ESLint catches real bugs that tsc misses (unused vars, missing React hook
deps, etc.).

Add a lint job to `.github/workflows/ci.yml` after the typecheck job:

```yaml
lint:
  name: Lint
  runs-on: ubuntu-latest
  needs: typecheck

  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4
      with:
        version: 9

    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Lint API
      run: pnpm --filter @huntstack/api lint

    - name: Lint Web
      run: pnpm --filter @huntstack/web lint
```

---

## 3. Cloudflare Pages — Frontend

### Setup in Cloudflare dashboard

1. Connect GitHub repo to Cloudflare Pages
2. Set the following build config:
   - **Framework preset**: None (custom)
   - **Build command**: `pnpm --filter @huntstack/web build`
   - **Build output directory**: `apps/web/dist`
   - **Root directory**: `/` (repo root — Pages needs to run pnpm install from root)

### Environment variables (set in Pages dashboard)

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Your production API URL |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_MAPTILER_KEY` | MapTiler API key |
| `NODE_VERSION` | `22` |

### Notes

- Push to main = automatic deploy. No GitHub Actions step needed for frontend.
- Preview deployments are created automatically for PRs.
- Custom domain: add in Pages dashboard under Custom Domains.
- The `_redirects` file from step 1 handles SPA routing — no additional Pages
  redirect rules needed.

---

## 4. API Host

The Fastify API cannot run on Cloudflare Workers (non-Node runtime, no native pg
connections). It needs a traditional Node.js host.

### Recommended: Railway

- GitHub integration mirrors Cloudflare Pages simplicity
- No cold starts on paid tier ($5/mo)
- Inject env vars via Railway dashboard
- Auto-deploys on push to main

### Alternative options

| Host | Cost | Notes |
|------|------|-------|
| Railway | ~$5/mo | Recommended — no cold starts, great DX |
| Render | Free tier / $7/mo | Free tier has cold starts (30s delay) |
| Fly.io | ~$3–5/mo | Most control, slightly more setup |

### Build + start config (same for any host)

- **Install command**: `pnpm install --frozen-lockfile`
- **Build command**: `pnpm --filter @huntstack/api build`
- **Start command**: `pnpm --filter @huntstack/api start`

### Environment variables (set in host dashboard)

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Supabase PostgreSQL pooler URL |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `TOGETHER_API_KEY` | Together.ai API key |
| `EBIRD_API_KEY` | eBird Cornell Lab API key |
| `CORS_ORIGIN` | Your Cloudflare Pages URL (e.g. `https://huntstack.pages.dev`) |
| `NODE_ENV` | `production` |
| `PORT` | Set by host automatically |
| `HOST` | `0.0.0.0` (already the default) |
| `LOG_LEVEL` | `info` |

### CORS is critical

`CORS_ORIGIN` must be set to the exact Pages URL or custom domain. A mismatch
will block all API requests from the frontend. If you have both a `pages.dev`
subdomain and a custom domain, set the custom domain.

---

## 5. Update `VITE_API_URL` in CI

The build job currently uses a placeholder:

```yaml
VITE_API_URL: http://localhost:4001
```

Once you have a production API URL, add it as a GitHub Actions secret
(`VITE_API_URL`) and update the build job:

```yaml
- name: Build Web
  run: pnpm --filter @huntstack/web build
  env:
    VITE_API_URL: ${{ secrets.VITE_API_URL }}
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
    VITE_MAPTILER_KEY: ${{ secrets.VITE_MAPTILER_KEY }}
```

Note: Cloudflare Pages builds independently from GitHub Actions using its own env
vars, so this only affects the CI build artifact — not what Pages actually deploys.
Still worth fixing so CI produces a valid artifact.

---

## 6. Add smoke tests for the 3 killer feature endpoints

No test suite exists yet. Full coverage is not needed for beta — but regression
tests for the 3 killer features would catch broken deploys before users hit them.

### Endpoints to test

| Endpoint | Killer Feature |
|----------|---------------|
| `GET /api/hunt/recommendations` | Where to Hunt |
| `GET /api/migration/push-factors` | Migration Dashboard |
| `GET /api/refuges/migration/dashboard` | Migration Dashboard |

### Approach

Use [Vitest](https://vitest.dev/) (already compatible with the Vite/TS stack) with
supertest or simple fetch against a running API instance.

At minimum, each smoke test should assert:
- Response status is 200
- Response body has the expected top-level shape (not empty arrays)
- No 500 errors

Add a test job to CI after the build job that runs these against a locally started
API instance.

---

## 7. Enable branch protection on main

Currently pushes go directly to main with no required CI pass. Once you have a
hosting target and deploys are wired, a broken push = broken production.

In GitHub repo settings → Branches → Add rule for `main`:

- Require status checks to pass before merging
  - `Type Check`
  - `Build`
  - `Lint` (once added)
- Require branches to be up to date before merging
- Do not allow bypassing the above settings

---

## Recommended order of execution

1. Create `apps/web/public/_redirects` (5 minutes, unblocks Pages)
2. Add lint job to CI (15 minutes)
3. Set up Cloudflare Pages (15 minutes — dashboard config + env vars)
4. Set up API host — Railway or equivalent (30 minutes)
5. Set `CORS_ORIGIN` on API host to Pages URL
6. Set `VITE_API_URL` as GitHub secret, update CI build job
7. Smoke test the live deployment manually (hit all 3 killer feature endpoints)
8. Add automated smoke tests to CI
9. Enable branch protection on main

---

## What is explicitly out of scope for beta

- Staging environment (push to main = production is fine for beta)
- Dependabot / automated dependency updates
- Per-species eBird activity threshold calibration
- BullMQ background job queue (not needed at current scale)
- MapPage (placeholder with Coming Soon overlay)
- Big game regulations
