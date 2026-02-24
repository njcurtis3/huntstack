# huntstack

**Pre-hunt intelligence for waterfowl hunters.**

HuntStack replaces the fragmented workflow of Googling across state websites, reading PDFs, and checking Facebook groups — with structured data, live refuge counts, and an AI-powered assistant.

> HuntStack tells you **where** to hunt. OnX helps you get there.

---

## What It Does

### Migration Intelligence Dashboard

The core feature. Live and historical waterfowl counts from federal and state aerial surveys across the Central and Mississippi Flyways — updated weekly. See which refuges have birds arriving, peaking, or moving out, with week-over-week deltas and current weather push signals.

- Species-level counts with WoW % change and trend direction
- Cold front and push factor scoring (cold front present, north winds, sub-freezing temps)
- AI-generated weekly migration narrative
- Flyway progression view (N→S time series by state)

### Where to Hunt

Ranked refuge recommendations based on what's actually happening — not generic maps. Enter a species and location, and the app returns public hunting areas sorted by current bird activity, active seasons, weather alignment, and license requirements.

### AI Chat

Natural language queries backed by structured data + RAG. Ask things like:

- *"What do I need to hunt snow geese in New Mexico?"*
- *"Where are the pintails right now in the Central Flyway?"*
- *"Compare duck seasons in Arkansas vs Louisiana"*

### Regulation & License Intelligence

Structured seasons, bag limits, and license requirements for TX, NM, AR, LA, KS, OK — queryable through chat instead of reading PDFs.

---

## Live Data Sources

| Source | State | Type | Frequency |
| ------ | ----- | ---- | --------- |
| Washita NWR | OK | FWS HTML survey | Weekly |
| Salt Plains NWR | OK | FWS HTML survey | Weekly |
| Clarence Cannon NWR | MO | FWS HTML table | Weekly |
| Loess Bluffs NWR | MO | FWS PDF survey | Weekly |
| AGFC Aerial Survey | AR | State PDF (LLM extracted) | Biweekly |
| LDWF Aerial Survey | LA | State PDF (LLM extracted) | Monthly |
| MWI Statewide | TX, NM, AR, LA, KS, OK | USFWS harvest data | Annual |

PDFs (AGFC, LDWF) are extracted with `Meta-Llama-3.1-8B-Instruct-Turbo` via Together.ai.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Mapping | MapLibre GL, react-map-gl |
| Charts | Recharts |
| State | Zustand + TanStack Query |
| Backend | Fastify, TypeScript, Drizzle ORM |
| Database | Supabase (PostgreSQL + PostGIS + pgvector) |
| LLM / Embeddings | Together.ai (Llama 3.1 8B + bge-base-en-v1.5) |
| Scrapers | Python (Scrapling, pdfplumber) |
| Weather | NOAA API |
| Monorepo | pnpm workspaces |

---

## Project Structure

```
huntstack/
├── apps/
│   ├── web/                        # React + Vite frontend
│   │   └── src/
│   │       ├── pages/              # MigrationPage, WhereToHuntPage, ChatPage, etc.
│   │       ├── components/         # Reusable UI components
│   │       ├── stores/             # Zustand state
│   │       └── lib/                # API client, utilities
│   ├── api/                        # Fastify backend
│   │   └── src/
│   │       ├── routes/             # refuges, migration, chat, hunt, search, regulations
│   │       └── lib/                # weather.ts (NOAA), embeddings, RAG
│   └── scrapers-python/            # Python scraper pipeline
│       └── huntstack_scrapers/
│           ├── scrapers/           # run.py (unified CLI), refuge_counts.py
│           ├── parsers/            # Per-source HTML/PDF parsers
│           ├── extractors/         # llm.py (Together.ai), pdf.py (pdfplumber)
│           └── sources.py          # WATERFOWL_SOURCES registry
├── packages/
│   ├── db/                         # Drizzle schema & migrations
│   ├── shared/                     # Zod schemas, shared utilities
│   └── types/                      # Shared TypeScript types
└── scripts/                        # Database init SQL
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Python 3.11+
- Supabase project (PostgreSQL with `postgis` and `vector` extensions enabled)
- Together.ai API key

### Install

```bash
git clone https://github.com/yourusername/huntstack.git
cd huntstack
pnpm install
cp .env.example .env
# Fill in .env with your credentials
```

### Database Setup

Run `scripts/init-supabase.sql` in the Supabase SQL Editor.

> **Do NOT use `pnpm db:push`** — Drizzle will try to drop the `embedding` column (pgvector). Use raw SQL for all schema changes.

### Run

```bash
pnpm dev          # Start API + frontend in parallel
pnpm dev:web      # Frontend only — http://localhost:3000
pnpm dev:api      # API only    — http://localhost:4000
```

### Scrapers

```bash
cd apps/scrapers-python

# Run all refuge count sources
python -m huntstack_scrapers.scrapers.run refuge_counts

# Run a single source
python -m huntstack_scrapers.scrapers.run refuge_counts --source "Loess Bluffs National Wildlife Refuge"

# Dry run (parse only, no DB writes)
python -m huntstack_scrapers.scrapers.run refuge_counts --dry-run
```

---

## API Routes

| Route | Description |
| ----- | ----------- |
| `GET /api/refuges` | List wildlife refuges with state/flyway filters |
| `GET /api/refuges/:id/counts` | Bird count time-series with delta + trend |
| `GET /api/refuges/migration/dashboard` | Aggregated migration data across all refuges |
| `GET /api/migration/push-factors` | Weather push factor scores per state (cold fronts, wind, temp) |
| `GET /api/migration/weekly-summary` | LLM-generated migration narrative (6h cache) |
| `GET /api/migration/flyway-progression` | Weekly counts by state ordered N→S |
| `POST /api/chat` | RAG-powered AI chat with structured data retrieval |
| `GET /api/hunt` | Ranked hunting recommendations by species + location |
| `GET /api/search` | Full-text search across regulations, species, locations |
| `GET /api/regulations` | State regulations with filters |
| `GET /api/species` | Species catalog |

Swagger docs at `http://localhost:4000/docs` when running locally.

---

## Environment Variables

```bash
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
TOGETHER_API_KEY=tgp_v1_...
VITE_API_URL=http://localhost:4000
VITE_MAPTILER_KEY=...
PORT=4000
CORS_ORIGIN=http://localhost:3000
```

---

## V1 Roadmap

V1 targets waterfowl hunters in the Central and Mississippi Flyways.

**Priority states:** TX, NM, AR, LA, KS, OK + MO (Loess Bluffs)

### Done

- [x] Refuge count scraper pipeline (6 live sources, 1,500+ rows)
- [x] Migration Intelligence dashboard — counts, WoW deltas, trend direction
- [x] Push factor panel — cold fronts, north winds, sub-freezing temps via NOAA
- [x] AI-generated weekly migration narrative
- [x] Where to Hunt — ranked refuge recommendations
- [x] AI Chat — RAG over structured data + document embeddings
- [x] Regulation & License Intelligence — TX, NM, AR, LA, KS, OK
- [x] Dark / light mode

### Planned

- [ ] Distance filter ("within 3 hours of Amarillo")
- [ ] Push notifications ("Snow geese numbers jumped at Loess Bluffs")
- [ ] User accounts + saved locations
- [ ] Outfitter directory
- [ ] Flyway map overlay with count heatmap
- [ ] Offline PWA support

### V2 (When V1 Has Traction)

- Public land layers (BLM, state WMAs)
- More state scraper coverage
- Predictive migration models (weather × count correlation)
- User harvest reports (crowdsourced)
- Big game expansion (elk, deer — CO, MT, WY)

---

## Strategic Positioning

HuntStack is not a mapping app. It's a pre-hunt intelligence layer.

| Feature | OnX | HuntStand | HuntStack |
| ------- | --- | --------- | --------- |
| Offline GPS / navigation | ✓ | ✓ | — |
| Property boundaries | ✓ | ✓ | — |
| Live refuge counts | — | — | ✓ |
| Migration intelligence | — | — | ✓ |
| AI regulation queries | — | — | ✓ |
| Season comparison (multi-state) | — | — | ✓ |
| Weather push factor alerts | — | — | ✓ |
| "Where should I hunt?" | — | — | ✓ |

---

## License

**Private** — © 2026 Nathan Curtis. All rights reserved.

This repository is public for viewing purposes only. No permission is granted to copy, modify, or redistribute without explicit written permission.
