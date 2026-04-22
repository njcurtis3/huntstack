# CLAUDE.md - HuntStack Project Specification

## Project Overview

**HuntStack** is a comprehensive hunting information platform serving as the definitive one-stop resource for hunters and outfitters across the United States. The application aggregates open-source data on migratory bird tracking, big game hunting, regulations, licensing, hunting locations, outfitter services, and interactive mapping—all queryable through an integrated LLM interface.

---

## Core Mission

Provide hunters and outfitters with the most accurate, up-to-date, and comprehensive hunting information available, powered by aggregated open-source data and intelligent search capabilities.

---

## Strategic Positioning

**HuntStack tells you WHERE to hunt. OnX helps you get there.**

### Competitive Landscape

| Category | OnX | HuntStand | BaseMap | HuntStack |
|----------|-----|-----------|---------|-----------|
| Offline GPS navigation | Yes | Yes | Yes | No (don't compete) |
| Public/private land ownership | Yes | Yes | Yes | Maybe later |
| Waypoints / tracking | Yes | Yes | Yes | Not core |
| Satellite / topo maps | Yes | Yes | Yes | Minimal or none |
| State regulations | Basic links | Basic | Basic | **Deep, structured, searchable** |
| License requirements | No | No | No | **Yes** |
| Season comparison across states | No | No | No | **Yes** |
| Migration intelligence | No | No | No | **Core feature** |
| Harvest / refuge counts | No | No | No | **Yes** |
| Public hunting recommendations | No | No | No | **Yes** |
| Outfitter discovery | Limited | Limited | Limited | **Integrated + data context** |
| Trip planning (multi-state) | No | No | No | **Yes** |
| AI / natural language search | No | No | No | **Core feature** |
| Cross-data reasoning | No | No | No | **Core feature** |

### The Big Strategic Rule

**Do not build maps first.**

Every failed hunting startup tries to compete with OnX on mapping. Instead, build the thing hunters currently do with:
- Google searches
- 6 state websites
- 3 PDFs
- Facebook groups
- Refuge reports

If HuntStack replaces that fragmented workflow, we win.

**They own in-field tools. We own pre-hunt intelligence.**

---

## 3 Killer Features

### Killer Feature #1: "Where should I hunt this weekend?" — ✅ LIVE

Example query: *"Snow geese within 3 hours of Amarillo"*

Output includes:
- Top regions ranked by opportunity (multi-factor scoring: bird activity, weather, push factors, open seasons, migration status)
- Migration activity (based on refuge counts)
- Recent refuge reports
- Weather alignment
- Active seasons
- License requirements

**Implemented via `/api/hunt/recommendations`**

### Killer Feature #2: Migration Intelligence Dashboard — ✅ LIVE

For waterfowl:
- Refuge counts (weekly surveys from 6 live sources)
- Historical MWI trends (annual surveys)
- Push factor scoring (cold fronts, wind, temperature drop)
- Flyway progression (N→S time series)
- eBird community observation integration
- LLM-generated weekly intelligence narrative

**Implemented via `/api/migration/*` and `/api/refuges/*`**

### Killer Feature #3: Regulation + License Intelligence (LLM) — ✅ LIVE

Instead of PDFs, users ask: *"What do I need to hunt NM conservation order?"*

Response includes structured data on seasons, licenses, bag limits, shooting hours, stamp requirements — powered by RAG over scraped regulation documents.

**Implemented via `/api/chat` (RAG) and `/api/regulations/*`**

---

## Current Build Status (as of April 2026)

### ✅ Complete — V1 Core

| Feature | Status | Notes |
|---------|--------|-------|
| Refuge count ingestion | Complete | 800+ rows, 6 live sources (OK, AR, MO, LA, TX) |
| Migration dashboard | Complete | Flyway progression, push factors, weekly LLM report |
| eBird integration | Complete | Regional activity with 14-day trend comparison |
| RAG chat | Complete | Semantic search + LLM via Together.ai (`Qwen2.5-7B-Instruct-Turbo`) |
| Regulations/seasons/licenses | Complete | TX fully populated; NM, AR, LA, KS, OK seeded |
| Hunt recommendations | Complete | Multi-factor scored, geolocation-aware |
| Weather integration | Complete | NOAA forecasts, alerts, hunting conditions |
| Outfitter directory | Complete | 14 verified TX outfitters; other states gated with "coming soon" |
| State comparison tool | Complete | Cross-state season/regulation comparison |
| Full-text + semantic search | Complete | Both keyword and vector search |
| CI pipeline | Complete | GitHub Actions: typecheck + build on every PR |
| Weekly scraper automation | Complete | Windows Task Scheduler, every Monday 6am |
| NM refuge data | Complete | Central flyway refuges added |
| Beta readiness fixes | Complete | Error boundary, health check, .env.example, mobile headers, port fix |

### 🔄 In Progress / Next

| Feature | Status | Notes |
|---------|--------|-------|
| Regulation scraper URLs | Needs fix | TX, AR, NM, KS, OK source sites restructured — see `plans/Finish-Killer-Feature-3.md` |
| Additional state regulations | Ongoing | Priority: KS, OK deeper population; scraper URLs must be fixed first |
| MapPage | Gated | "Coming Soon" overlay with redirect to Where to Hunt; MapLibre wired but unused |
| Test suite | Not started | `pnpm test` wired, no test files yet |
| Background job queue | Deferred | BullMQ + Redis declared but unwired; not needed at current scale |

### ❌ Explicitly Out of Scope (V1)

- Offline maps / GPS tracking
- Property boundaries
- Big game (defer until waterfowl is solid)

---

## Tech Stack

### Backend — `apps/api/`
- **Runtime**: Node.js 22, TypeScript 5.5
- **Framework**: Fastify 4 with plugins: cors, helmet, jwt, rate-limit, swagger
- **Database**: PostgreSQL via Supabase, Drizzle ORM 0.32
- **LLM / Embeddings**: Together.ai SDK 0.9 (`Qwen` for chat, `multilingual-e5-large` for embeddings)
- **External APIs**: eBird (Cornell Lab), NOAA Weather
- **Validation**: Zod 3.23

### Frontend — `apps/web/`
- **Framework**: React 18 + Vite 5, TypeScript 5.5
- **Routing**: React Router 6
- **State**: Zustand 4 + TanStack Query 5
- **Maps**: MapLibre GL 4 + react-map-gl 7 (MapTiler basemap)
- **Charts**: Recharts 3, react-simple-maps 3 (US map)
- **Styling**: Tailwind CSS 3
- **Auth**: Supabase JS 2

### Data Pipeline — `apps/scrapers-python/`
- **Framework**: Scrapling 0.4 (replaced Scrapy)
- **PDF extraction**: pdfplumber
- **LLM extraction**: Together.ai `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`
- **Entry point**: `python -m huntstack_scrapers.scrapers.run {refuge_counts|state_regulations}`

### Infrastructure
- **Database**: Supabase (PostgreSQL + pgvector for embeddings)
- **Monorepo**: pnpm workspaces
- **CI**: GitHub Actions (typecheck + build on push/PR to main)
- **Scraper schedule**: Windows Task Scheduler, every Monday 6am

---

## Project Structure

```
huntstack/
├── apps/
│   ├── web/                      # React + Vite frontend
│   │   └── src/
│   │       ├── components/       # Reusable UI components
│   │       ├── pages/            # Route pages (10 pages)
│   │       ├── hooks/            # Custom React hooks
│   │       ├── stores/           # Zustand state stores
│   │       └── lib/              # Utilities (api.ts, supabase.ts)
│   ├── api/                      # Fastify backend
│   │   └── src/
│   │       ├── routes/           # 11 route modules
│   │       ├── services/         # Business logic
│   │       └── lib/              # Utilities (weather, geo, etc.)
│   └── scrapers-python/          # Python scrapers (Scrapling, pdfplumber)
│       └── huntstack_scrapers/
│           ├── scrapers/         # run.py, refuge_counts.py, state_regulations.py
│           ├── parsers/          # Per-source parsers
│           ├── extractors/       # llm.py, pdf.py
│           ├── sources.py        # WATERFOWL_SOURCES registry
│           ├── pipelines.py      # DB + embedding pipelines
│           └── species_mapping.py
├── packages/
│   ├── db/                       # Drizzle schema & migrations (12 tables)
│   ├── shared/                   # Shared utilities & Zod validation
│   └── types/                    # Shared TypeScript types
├── scripts/                      # Seed scripts, data validation utilities
│   ├── run-refuge-counts.ps1     # Weekly scraper (Task Scheduler)
│   └── logs/                     # Scraper run logs (auto-pruned 30d)
└── .github/workflows/ci.yml      # CI: typecheck + build
```

---

## API Routes Reference

| Module | Endpoints | Description |
|--------|-----------|-------------|
| `health` | `GET /health`, `GET /health/ready` | Status + DB readiness |
| `search` | `GET /`, `POST /semantic` | Full-text and vector search |
| `species` | `GET /`, `GET /:id`, `GET /:id/regulations`, `GET /:id/migration` | Species data + seasons |
| `regulations` | `GET /states`, `GET /:state`, `GET /:state/seasons`, `GET /:state/licenses` | Structured regulations |
| `refuges` | `GET /`, `GET /:id/counts`, `GET /migration/dashboard` | Refuge counts + migration data |
| `migration` | `GET /push-factors`, `GET /weekly-summary`, `GET /flyway-progression`, `GET /regional-activity` | Migration intelligence |
| `hunt` | `GET /recommendations` | Multi-factor scored hunt recommendations |
| `weather` | `GET /forecast/:refugeId`, `GET /alerts`, `GET /hunting-conditions/:refugeId` | NOAA weather |
| `geo` | `GET /zip/:zip`, `GET /search`, `GET /reverse` | Geocoding via OpenStreetMap |
| `outfitters` | `GET /`, `GET /:id` | Outfitter directory |
| `chat` | `POST /` | RAG-powered AI chat |

---

## Database Schema (12 Tables)

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts (Supabase auth) |
| `species` | Huntable species with flyway/migration data |
| `states` | State agency info and regulation URLs |
| `regulations` | Full regulation text, versioned by year |
| `seasons` | Season dates, bag limits, shooting hours |
| `licenses` | License types, pricing, requirements |
| `outfitters` | Business profiles, hunt types, pricing |
| `reviews` | Hunter reviews of outfitters |
| `locations` | Public hunting areas with geospatial data |
| `refugeCounts` | Weekly + annual bird count surveys |
| `documents` | Source documents for RAG pipeline |
| `documentChunks` | Chunked text with pgvector embeddings |

> **IMPORTANT**: Do NOT use `drizzle-kit push` — it will attempt to DROP the `embedding` column (pgvector) from `documentChunks`. Use raw SQL for schema changes.

---

## Frontend Pages (10 Pages)

| Page | Route | Description |
|------|-------|-------------|
| `HomePage` | `/` | Hero, stats dashboard, feature overview |
| `MigrationPage` | `/migration` | Interactive dashboard: map, counts, flyway charts, push factors |
| `MigrationReportPage` | `/migration/report` | LLM weekly intelligence narrative |
| `ChatPage` | `/chat` | Multi-turn RAG AI chat with localStorage history |
| `WhereToHuntPage` | `/where-to-hunt` | Scored hunt recommendations with geolocation |
| `RegulationsPage` | `/regulations` | US map + state selector, seasons/licenses by species |
| `OutfittersPage` | `/outfitters` | Search/filter by state, species, price |
| `SearchPage` | `/search` | Full-text search across all data |
| `MapPage` | `/map` | MapLibre GL map (placeholder) |
| `NotFoundPage` | `*` | 404 |

---

## Scraper Sources (WATERFOWL_SOURCES)

| Source | State | Type | Frequency |
|--------|-------|------|-----------|
| Washita NWR | OK | FWS HTML | Weekly |
| Salt Plains NWR | OK | FWS HTML | Weekly |
| Arkansas AGFC Aerial Survey | AR | PDF index (Google Drive) | Biweekly |
| Loess Bluffs NWR | MO | FWS PDF list | Weekly |
| Clarence Cannon NWR | MO | FWS HTML (wide format) | Weekly |
| Louisiana LDWF Aerial Survey | LA | PDF list | Monthly |
| Texas TPWD Midwinter Survey | TX | Excel files | Annual |

Run all: `python -m huntstack_scrapers.scrapers.run refuge_counts`
Run one: `python -m huntstack_scrapers.scrapers.run refuge_counts --source "Washita National Wildlife Refuge"`
Dry run: `python -m huntstack_scrapers.scrapers.run refuge_counts --dry-run`

> **NOTE**: `loess_bluffs_pdf.py` URL generator is hardcoded to Oct 2025–Apr 2026 season. Update each season.

---

## Commands Reference

```bash
# Install dependencies (run from root)
pnpm install

# Development
pnpm dev              # Start all dev servers in parallel
pnpm dev:web          # Frontend only (http://localhost:3000)
pnpm dev:api          # Backend only (http://localhost:4001)

# Build
pnpm build            # Build all packages
pnpm build:web        # Build frontend only
pnpm build:api        # Build backend only

# Database — use raw SQL for schema changes, NOT drizzle-kit push
pnpm db:generate      # Generate Drizzle migration files
pnpm db:migrate       # Run migrations
pnpm db:studio        # Open Drizzle Studio GUI

# Scrapers (run from apps/scrapers-python/)
python -m huntstack_scrapers.scrapers.run refuge_counts
python -m huntstack_scrapers.scrapers.run state_regulations --state TX
python -m huntstack_scrapers.scrapers.run refuge_counts --dry-run

# Seed scripts (run from repo root)
pnpm tsx scripts/seed.ts
pnpm tsx scripts/seed-waterfowl.ts
pnpm tsx scripts/seed-refuges.ts
```

---

## Environment Variables

```
DATABASE_URL              # Supabase PostgreSQL pooler connection
SUPABASE_URL              # Supabase project URL
SUPABASE_ANON_KEY         # Supabase anon key
SUPABASE_SERVICE_KEY      # Supabase service role key
VITE_SUPABASE_URL         # Frontend: Supabase URL
VITE_SUPABASE_ANON_KEY    # Frontend: Supabase anon key
VITE_API_URL              # Frontend: API base URL
VITE_MAPTILER_KEY         # MapTiler API key for basemap
REDIS_URL                 # Redis (declared, not active — localhost:6379)
TOGETHER_API_KEY          # Together.ai (LLM + embeddings)
EBIRD_API_KEY             # eBird Cornell Lab API
PORT                      # API port (default: 4001)
HOST                      # API host (default: 0.0.0.0)
NODE_ENV                  # development | production
LOG_LEVEL                 # info
CORS_ORIGIN               # http://localhost:3000
```

---

## Development Automation

### Claude Code Hooks (`.claude/settings.json`)
- **After any Edit/Write**: runs `tsc --noEmit` on the API package (async, ~3s)
- **After editing scrapers-python files**: runs Python `ast.parse()` syntax check (instant)

### CI (`.github/workflows/ci.yml`)
- Runs on every push and PR to `main`
- **typecheck job**: `tsc --noEmit` on both API and web (hard failure)
- **build job**: full production build of both packages

### Weekly Scraper (`scripts/run-refuge-counts.ps1`)
- Windows Task Scheduler, every Monday at 6:00 AM
- Logs to `scripts/logs/refuge-counts-YYYY-MM-DD.log`
- Auto-prunes logs older than 30 days

---

## Key Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary focus | Waterfowl first | Clear market gap, migration intelligence is unique differentiator |
| Mapping strategy | Minimal/none | Avoid competing with OnX, HuntStand, BaseMap on their strength |
| Core differentiator | Pre-hunt intelligence | "HuntStack tells you WHERE to hunt. OnX helps you get there." |
| V1 target users | Waterfowl hunters | Plan around refuge counts, weather fronts, migration timing |
| GPS/offline features | Defer to later phases | Not core to value proposition, competitors own this space |
| Scraper framework | Scrapling (replaced Scrapy) | Scrapy deleted; Scrapling is simpler and maintained |
| LLM provider | Together.ai | Embeddings + chat in one API; cost-effective at V1 scale |
| Schema changes | Raw SQL only | drizzle-kit push drops pgvector embedding column |
| Job queue (BullMQ) | Deferred | Not needed at current scale; Redis not running locally |
| Scraper scheduling | Windows Task Scheduler | Local cron — needs .env credentials, can't run in cloud |

---

## Product Roadmap

### V1 - Planning Intelligence for Waterfowl — 🟢 Substantially Complete

Core data pipeline, migration intelligence, RAG chat, hunt recommendations, regulations, and weather are all live. Priority states (TX, NM, AR, LA, KS, OK) are seeded.

**Remaining V1 work:**
- Deepen KS/OK regulation data
- Add NM refuge count sources
- Build out test suite
- Mobile polish

### V2 - Expansion (When V1 Gets Traction)

- Public land layers (from state GIS)
- Distance filters ("within 3 hours of...")
- Outfitter directory expansion (beyond TX)
- Trip planning (save locations, notes)
- Push notifications: "Snow geese numbers jumped in Clovis"
- BullMQ background job queue (on-demand data refresh)

### V3 - Moat Phase (Become Infrastructure)

- Predictive migration models
- Weather-movement correlation analysis
- User harvest reports (crowdsourced)
- Data export to OnX / HuntStand
- API for outfitters

### Big Game Expansion (Future)

After waterfowl is solid:
- Colorado, Montana, Wyoming (elk, deer)
- Draw/tag systems and odds
- Unit-by-unit success rates
- Wisconsin, Michigan (whitetail)

---

## Open Questions

1. **Monetization Model**: Free tier vs subscription? Outfitter listing fees?
2. **Data Update Frequency**: How often to check for regulation changes?
3. **User-Generated Content**: Allow hunt reports, location tips?
4. **Liability Considerations**: Disclaimers for regulation accuracy?
5. **Test Strategy**: What to prioritize first — API integration tests or scraper unit tests?

---

## Notes for Claude Code

### Critical Constraints
1. **Never use `drizzle-kit push`** — drops the `embedding` pgvector column. Use raw SQL.
2. **Scrapy is deleted** — use Scrapling scrapers only (`apps/scrapers-python/`)
3. **No `Co-Authored-By` in commits** — user preference
4. **`gh` CLI not installed** — use GitHub API via curl if needed, or prompt user

### Strategic Priorities
1. **Waterfowl first** — V1 focuses on waterfowl/migratory bird hunters
2. **Pre-hunt intelligence** — help hunters decide WHERE to hunt, not navigate in the field
3. **Don't build maps** — avoid GPS, offline maps, property boundaries (OnX territory)
4. **Replace fragmented workflow** — target the Google + PDFs + Facebook groups research process

### Development Guidelines
1. **Prioritize data accuracy** — hunting regulations have legal implications
2. **Source attribution** — always track where data comes from
3. **Incremental development** — build state-by-state, feature-by-feature
4. **Test with real scenarios** — use actual hunting planning use cases (e.g., "snow geese near Amarillo")
5. **Mobile-first** — hunters use phones for research
6. **Plain language** — regulations are complex; simplify for users
7. **Type safety** — use shared types from `@huntstack/types`
8. **Validation** — use Zod schemas from `@huntstack/shared`
9. **Windows environment** — use `powershell -Command "..."` for Python commands
10. **Drizzle JSONB quirk** — metadata stored as double-encoded strings; use `name LIKE` or app-level filtering instead of `->>'key'` extraction
