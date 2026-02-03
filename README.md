# HuntSource

> Your comprehensive hunting information platform

HuntSource aggregates hunting regulations, season dates, license requirements, public land maps, and outfitter listings across all 50 states. Features AI-powered natural language search using RAG (Retrieval-Augmented Generation).

## Features

- 🦌 **Big Game Hunting** - Regulations, seasons, and draw information for elk, deer, and more
- 🦆 **Migratory Bird Tracking** - Real-time migration data and flyway information
- 📋 **Regulations Database** - Current hunting regulations from all 50 states
- 🗺️ **Interactive Maps** - Public lands, hunting units, and access points
- 🏕️ **Outfitter Directory** - Verified guides and outfitters
- 🤖 **AI Assistant** - Ask questions in natural language

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, MapLibre GL |
| Backend | Fastify, TypeScript, Drizzle ORM |
| Database | Supabase (PostgreSQL + PostGIS + pgvector) |
| Auth | Supabase Auth |
| LLM | Claude API (Anthropic) |
| Embeddings | OpenAI text-embedding-3-small |
| Scrapers | Node.js (Cheerio, Playwright) + Python (Scrapy, pdfplumber) |
| Queue | BullMQ + Redis |

## Project Structure

```
huntsource/
├── apps/
│   ├── web/                 # React frontend
│   ├── api/                 # Fastify backend
│   ├── scrapers-node/       # Node.js scrapers
│   └── scrapers-python/     # Python/Scrapy scrapers
├── packages/
│   ├── db/                  # Drizzle schema & migrations
│   ├── shared/              # Shared utilities
│   └── types/               # Shared TypeScript types
├── scripts/                 # Utility scripts
└── docs/                    # Documentation
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
git clone https://github.com/yourusername/huntsource.git
cd huntsource

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env with your credentials

# Set up database (requires Supabase project)
pnpm db:push

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
pnpm db:generate  # Generate migrations
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio

# Run scrapers
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

### MapTiler

1. Sign up at [maptiler.com](https://www.maptiler.com/)
2. Create an API key
3. Add to `.env` as `VITE_MAPTILER_KEY`

### Anthropic & OpenAI

1. Get API keys from [Anthropic](https://console.anthropic.com/) and [OpenAI](https://platform.openai.com/)
2. Add to `.env`

## Deployment

### Railway (MVP)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### AWS (Production)

See [docs/deployment-aws.md](docs/deployment-aws.md) for production deployment guide.

## License

Private - All rights reserved

## Acknowledgments

Data sources include:
- U.S. Fish & Wildlife Service
- State wildlife agencies (CPW, MFWP, TPWD, etc.)
- eBird (Cornell Lab of Ornithology)
- USGS, BLM, USFS
