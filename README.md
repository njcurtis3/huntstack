# huntstack

🦆

**huntstack** is a pre-hunt intelligence platform for waterfowl hunters. It replaces the fragmented workflow of Googling across state websites, reading PDFs, and checking Facebook groups with structured, searchable data and an AI-powered assistant.

## V1 Features (Waterfowl Focus)

- **Regulation & License Intelligence** - Structured seasons, bag limits, license requirements with prices — queryable via LLM instead of reading PDFs
- **Migration Intelligence** - Weekly refuge bird counts, historical trends, flyway progression from FWS/state survey data
- **AI Chat** - Natural language queries backed by structured data + RAG (e.g., "What do I need to hunt snow geese in New Mexico?")
- **State Coverage** - TX, AR, NM, LA, KS, OK (Central + Mississippi Flyways) + MO (Loess Bluffs)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, MapLibre GL |
| Backend | Fastify, TypeScript, Drizzle ORM |
| Database | Supabase (PostgreSQL + PostGIS + pgvector) |
| Auth | Supabase Auth |
| LLM | Meta-Llama-3.1-8B-Instruct-Turbo |
| Embeddings | bge-base-en-v1.5 |
| Scrapers | Node.js (Cheerio, Playwright) + Python (Scrapy, pdfplumber) |
| Queue | BullMQ + Redis |

## Project Structure

```
huntstack/
├── apps/
│   ├── web/                 # React + Vite frontend
│   ├── api/                 # Fastify backend
│   │   └── src/routes/      # API endpoints (species, refuges, regulations, search, chat)
│   ├── scrapers-node/       # Node.js scrapers (Cheerio, Playwright)
│   └── scrapers-python/     # Python/Scrapy scrapers
│       └── huntstack_scrapers/
│           ├── spiders/     # Scrapy spiders (state_regulations, refuge_counts)
│           ├── parsers/     # Modular PDF/HTML parsers (AGFC, LDWF, Loess Bluffs, FWS)
│           └── scripts/     # Maintenance scripts
│               ├── seed/    # Data seeding & patching
│               ├── audit/   # Data validation & checks
│               └── cleanup/ # Re-chunking, re-embedding, cleanup
├── packages/
│   ├── db/                  # Drizzle schema & migrations
│   ├── shared/              # Shared utilities & Zod schemas
│   └── types/               # Shared TypeScript types
└── scripts/                 # Database init scripts
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Python 3.11+ (for Python scrapers)
- Redis (for job queue)
- Supabase account (or local PostgreSQL with extensions)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/huntstack.git
cd huntstack

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env with your credentials

# Set up database (requires Supabase project)
# Run scripts/init-supabase.sql in Supabase SQL Editor
# Do NOT use pnpm db:push — it will drop the pgvector embedding column

# Start development servers
pnpm dev
```

### Development

```bash
# Run all services in parallel
pnpm dev

# Run individual services
pnpm dev:web    # Frontend at http://localhost:3000
pnpm dev:api    # API at http://localhost:4000

# Database commands
pnpm db:generate  # Generate Drizzle migrations
pnpm db:studio    # Open Drizzle Studio
# WARNING: Do NOT use pnpm db:push — it drops the pgvector embedding column

# Python scrapers (from apps/scrapers-python/)
python -m scrapy crawl state_regulations   # Crawl state wildlife agency sites
python -m scrapy crawl refuge_counts       # Scrape refuge bird count data

# Maintenance scripts
python -m huntstack_scrapers.scripts.audit.db          # Full database audit
python -m huntstack_scrapers.scripts.audit.check_state  # Check document/chunk status
python -m huntstack_scrapers.scripts.cleanup.rechunk    # Re-chunk and re-embed documents

# Node.js scrapers
pnpm scrape       # Start Node.js scraper worker
```

### API Documentation

When the API is running, Swagger docs are available at:
- http://localhost:4000/docs

## Environment Setup

### Supabase

1. Create a new Supabase project
2. Enable the following extensions in SQL Editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Copy your project URL and keys to `.env`

### Together.ai hosted models

1. Get API keys from together.ai
2. Add to `.env`

## Data Sources

Active V1 sources:

- **State wildlife agencies**: TPWD (TX), AGFC (AR), NMDGF (NM), LDWF (LA), KDWP (KS), ODWC (OK)
- **U.S. Fish & Wildlife Service**: Refuge bird count surveys (Washita NWR, Salt Plains NWR)
- **Loess Bluffs NWR (MO)**: Weekly waterfowl survey PDFs
- **USFWS Migratory Bird Harvest Information Program**: MWI annual data (2006-2016)

## License

**Private**

© 2026 Nathan Curtis. All rights reserved.

This repository is public for viewing purposes only.
No permission is granted to copy, modify, or redistribute the code without explicit permission.
