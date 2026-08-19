# Check catalog

Named, pre-worked checks. Look here before improvising — each entry already has
the right calls and, more importantly, the right *interpretation*. Add a new
entry whenever you work out a check that will be asked again.

Every check assumes credentials are loaded per `credentials.md`.

---

## CHECK-01 — Staging / preview deployments (Cloudflare)

**Question:** does pushing a branch give us a working staging environment, or do
we need to build one?

**Origin:** Beta Master Plan Phase 5 item 2, open since 2026-08. The plan says to
"check the live dashboard rather than assuming either way" — Cloudflare Pages
*normally* enables per-branch previews, but normally is not a finding.

**Steps** — see `cloudflare.md` for the exact commands:

1. Fetch the project config. Read `preview_deployment_setting`
   (`all` / `custom` / `none` / absent) and the branch include/exclude lists.
2. List deployments and look for any row with `environment: preview`. An actual
   preview build is stronger evidence than the config field.
3. Compare `deployment_configs.preview.env_vars` keys against
   `deployment_configs.production.env_vars` keys.

**Interpretation — step 3 is the one that matters.** `VITE_*` vars are inlined
by Vite at build time, and Pages keeps separate variable sets per environment.
Previews enabled with an empty preview var set is the worst outcome: builds go
green, the preview URL loads, and the app points at `localhost` with no Supabase
and no Sentry. Someone testing a change there concludes their change broke
something. So the answer to this check is only "yes, staging works" when
previews are on **and** the preview env vars match production.

**Expected preview vars:** `VITE_API_URL`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_MAPTILER_KEY`, `VITE_SENTRY_DSN`.

**Open decision to surface, not decide:** there is only one Railway API service,
so previews will point at production API and production data unless the user
splits it. Note the implication; the call is theirs.

---

## CHECK-02 — Post-push deploy verification

**Question:** did commit `<sha>` actually ship, on both platforms?

1. Cloudflare: deployments list, find `commit_hash` matching the SHA, read
   `latest_stage.status`.
2. Railway: deployments for the API service, match `meta`, read `status`.
3. GitHub: CI run for the same `head_sha`, read `conclusion`.
4. `curl https://<api-host>/api/health/ready` — the live end-to-end answer.

**Interpretation:** neither platform waits for CI. A green deploy plus a red CI
run means known-broken code is live — say so first, before anything else.

---

## CHECK-03 — Production health sweep

**Question:** is anything broken right now?

1. `GET /api/health/ready` (Railway API + DB in one call).
2. Frontend: `curl -sI https://huntstack.com` -> expect 200.
3. Sentry: unresolved issues, last 24h, both projects.
4. Supabase: project `status` is `ACTIVE_HEALTHY`, not `INACTIVE` (paused).
5. Together: model availability probe.

**Interpretation:** an empty Sentry list is not health until `firstEvent` is
non-null on both projects — see `sentry.md`. Report "no errors reported" and
"error reporting is not wired up" as different findings, because they are.

---

## CHECK-04 — Environment variable audit

**Question:** is everything the apps need actually set where it needs to be set?

Pull the key lists from Cloudflare (production and preview) and Railway, and
diff them against `.env.example`. **Names only, never values.**

Known traps:

- `VITE_SENTRY_DSN` is **build-time**. Set on Cloudflare after the last build =
  not in the bundle. If it was recently added, a rebuild is required, and that
  is the recommendation to give.
- `CORS_ORIGIN` on Railway still pointing at `localhost:3000` breaks the real
  frontend.
- `VITE_API_URL` missing produces a build that succeeds and an app that calls
  localhost. Green build, broken site.
- `VITE_MAPTILER_KEY` is documented but **no code in `apps/web/src` references
  MapTiler** — `MapPage` is a gated placeholder. Its absence is not a problem.
  Do not report it as one.

---

## CHECK-05 — Cost and usage posture

**Question:** what are we spending, and is anything unbounded?

1. Read `INFRASTRUCTURE_COSTS.md` first — the model is already built.
2. Together: **no usage API exists.** Read the figure off the billing page with
   the browser (`browser.md`), and confirm whether a spend cap is set — it has
   been outstanding since Phase 2 and is the only hard ceiling on cost. If the
   browser is unavailable or the session expired, say so; never estimate spend
   and present it as a reading.
3. Supabase: DB size query vs the 500MB free tier (`supabase.md`).
4. Sentry: 30d quota stats; `rate_limited`/`dropped` outcomes mean the free tier
   is full and errors are being discarded.
5. Optionally, the other billing pages in `browser.md` — Cloudflare plan
   usage, Railway cycle estimate, Supabase free-tier headroom, Sentry event
   quota. Only worth opening if the question is about total cost rather than
   one service.
6. Grep `apps/api/src/routes/` for any route calling Together without a
   per-route `config.rateLimit`. A new unprotected paid route is the single most
   likely cause of an unexpected bill.

---

## CHECK-06 — Scraper run verification

**Question:** did the weekly scrape actually work?

The scraper runs locally on Windows Task Scheduler, not on any platform, so this
is a local + DB check:

1. Newest log in `scripts/logs/`.
2. `SELECT state_code, max(survey_date), count(*) FROM refuge_counts GROUP BY state_code;`
3. Compare against the previous week.

**Interpretation:** the classic failure is a run that "succeeds" while extracting
**zero items** because a source site restructured its URLs. Exit code 0 is not
success — row counts are. `SCRAPER_ALERT_WEBHOOK` is deliberately unset (user
opted out), so nothing else will tell anyone.

---

## CHECK-07 — Billing sweep (browser)

**Question:** what is every service actually costing right now?

The only check that legitimately starts in a browser, because none of these
numbers have an API. Work through the URL table in `browser.md` in order.

For each: read the current-cycle figure, the plan, and whether any cap or alert
is configured. Report the number **with its period** ("$4.12 month-to-date,
cycle resets the 1st"), the date you read it, and the fact that it came off a
dashboard page.

**Interpretation:** Together is the only usage-priced dependency and therefore
the only one that can spike; everything else is a flat plan or a free tier with
a hard ceiling. So the headline is Together's spend and cap status. The others
matter as "how much headroom before a free tier converts into a bill" — Supabase
DB size and Sentry event quota are the two that will run out first under beta
traffic.

**Do not click anything.** Billing pages put irreversible, money-moving buttons
next to the numbers you came to read.

---

## Adding a check

Keep the shape: question, steps, and — the part that carries the value —
interpretation, especially where a naive reading of the output would be wrong.
An agent that reports `preview_deployment_setting: all` as "staging works" has
answered the API's question instead of the user's.
