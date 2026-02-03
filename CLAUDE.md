# CLAUDE.md - HuntStack Project Specification

## Project Overview

**HuntStack** is a comprehensive hunting information platform serving as the definitive one-stop resource for hunters and outfitters across the United States. The application aggregates open-source data on migratory bird tracking, big game hunting, regulations, licensing, hunting locations, outfitter services, and interactive mapping—all queryable through an integrated LLM interface.

---

## Core Mission

Provide hunters and outfitters with the most accurate, up-to-date, and comprehensive hunting information available, powered by aggregated open-source data and intelligent search capabilities.

---

## User Types

### 1. Hunters (Primary Consumer)
Individual hunters seeking comprehensive planning and research tools.

**Needs:**
- Find hunting locations by species, state, and season
- Access current regulations (federal and state)
- Discover and compare outfitters
- View migratory bird flyway data and tracking information
- Plan hunts with maps, weather, and season data
- Obtain license requirements and application deadlines
- Query all aggregated data via natural language (LLM)

### 2. Outfitters (Business/Provider)
Professional hunting guides and outfitting services seeking visibility and regulatory compliance.

**Needs:**
- List their services by location and hunt types offered
- Access latest regulatory updates affecting their operations
- Monitor license and permit requirement changes
- Receive alerts on federal/state regulation changes
- Manage their business profile and service offerings
- Connect with potential clients (hunters)

---

## Core Feature Domains

### A. Migratory Bird Hunting
- **Flyway Data**: Pacific, Central, Mississippi, Atlantic flyway tracking
- **Species Information**: Waterfowl, doves, woodcock, rails, snipe, etc.
- **Migration Tracking**: Real-time and historical migration pattern data
- **Federal Frameworks**: USFWS migratory bird hunting frameworks
- **State Seasons**: State-specific season dates, bag limits, shooting hours
- **Harvest Data**: Historical harvest statistics by species and region

### B. Big Game Hunting
- **Species Coverage**: Deer (whitetail, mule), elk, moose, bear, pronghorn, wild boar, mountain lion, bighorn sheep, etc.
- **Unit/Zone Maps**: State game management units and hunting zones
- **Draw/Tag Systems**: Application deadlines, point systems, draw odds
- **Population Data**: Herd counts, success rates by unit
- **Trophy Data**: Record books, quality metrics by area

### C. Regulations & Licensing
- **Federal Regulations**: Migratory bird frameworks, endangered species, federal lands rules
- **State Regulations**: All 50 states' hunting regulations
- **License Requirements**: Resident/non-resident, species-specific licenses
- **Stamps & Permits**: Federal duck stamp, state stamps, special permits
- **Season Dates**: Comprehensive season calendar with alerts
- **Regulation Change Tracking**: Automated monitoring and alerts for updates

### D. Location & Mapping
- **Public Lands**: National forests, BLM, wildlife refuges, state WMAs
- **Access Points**: Trailheads, boat ramps, parking areas
- **Private Land Programs**: Walk-in hunting areas, WIHA, iWIHA equivalents
- **Terrain Data**: Topographic overlays, habitat types
- **Weather Integration**: Forecasts, historical weather patterns
- **GPS Integration**: Waypoints, tracks, hunt planning tools

### E. Outfitter Directory
- **Business Profiles**: Contact info, services, pricing ranges
- **Hunt Types Offered**: Species, methods (guided, semi-guided, DIY support)
- **Location Coverage**: States/regions served
- **Availability Calendar**: Booking windows, season availability
- **Reviews & Ratings**: Hunter feedback system
- **Verification Status**: Licensed/insured verification badges

### F. LLM Query Interface
- **Natural Language Search**: "Where can I hunt elk in Colorado in October?"
- **Data Synthesis**: Combine regulations, locations, and seasons into actionable answers
- **Personalized Recommendations**: Based on user preferences and history
- **Regulation Interpretation**: Plain-language explanations of complex rules
- **Trip Planning Assistance**: Multi-factor hunt planning support

---

## Data Sources (Open Source / Public)

### Federal Sources
- **USFWS** (U.S. Fish & Wildlife Service): Migratory bird frameworks, federal regulations
- **USGS Bird Banding Laboratory**: Bird tracking and banding data
- **BLM** (Bureau of Land Management): Public land boundaries and access
- **USFS** (U.S. Forest Service): National forest maps and regulations
- **Data.gov**: Federal hunting and wildlife datasets

### State Sources
- **State Fish & Game/Wildlife Agencies**: All 50 states
  - Regulations PDFs/APIs
  - Season dates
  - License systems
  - Harvest reports
  - Game management unit maps

### Third-Party Open Data
- **eBird** (Cornell Lab): Bird observation and migration data
- **iNaturalist**: Species observation data
- **OpenStreetMap**: Base mapping data
- **NOAA**: Weather and climate data
- **Movebank**: Animal tracking data (where available)

---

## Technical Requirements

### Data Architecture
- Normalized database schema for regulations, species, locations, outfitters
- Versioned regulation storage (track changes over time)
- Geospatial data support (PostGIS or equivalent)
- Full-text search capability
- Vector embeddings for LLM-powered semantic search

### API Design
- RESTful API for core data access
- GraphQL consideration for complex queries
- Real-time updates via WebSocket for alerts
- Rate limiting and authentication

### LLM Integration
- RAG (Retrieval-Augmented Generation) architecture
- Document chunking and embedding pipeline
- Context-aware query processing
- Citation/source attribution in responses
- Guardrails for accuracy and safety

### Frontend Requirements
- Responsive web application (mobile-first)
- Interactive mapping interface
- Search and filter capabilities
- User dashboards (Hunter vs Outfitter views)
- Offline capability for field use (PWA)

### Data Freshness
- Automated scraping/API polling for regulation updates
- Change detection and alerting system
- Data provenance tracking (source, date, version)
- Manual review workflow for critical updates

---

## Development Guidelines

### Code Standards
- TypeScript for type safety (frontend and backend where applicable)
- Comprehensive error handling
- Logging and observability
- Unit and integration testing
- API documentation (OpenAPI/Swagger)

### Security Considerations
- Authentication for user accounts
- Authorization (Hunter vs Outfitter permissions)
- Data validation and sanitization
- Rate limiting and abuse prevention
- PII protection for user data

### Performance Targets
- Sub-second search results
- Map rendering < 2 seconds
- LLM responses < 5 seconds
- Mobile performance optimization
- CDN for static assets

### Accessibility
- WCAG 2.1 AA compliance
- Screen reader compatibility
- Keyboard navigation
- Color contrast requirements

---

## MVP Scope (Phase 1)

### Must Have
1. **Core Data Models**: Species, regulations, locations, outfitters
2. **State Regulation Database**: Start with 5-10 priority states
3. **Basic Search**: Filter by state, species, season
4. **Interactive Map**: Public lands, basic hunting areas
5. **Outfitter Listings**: Basic profiles and search
6. **LLM Query Interface**: Basic Q&A over aggregated data
7. **User Authentication**: Hunter and Outfitter account types

### Priority States (Suggested)
- Colorado, Montana, Wyoming (big game)
- Arkansas, Louisiana, Texas (waterfowl)
- South Dakota, Kansas (upland/waterfowl)
- Wisconsin, Michigan (deer/waterfowl)

### Nice to Have (Phase 2+)
- All 50 states coverage
- Real-time migration tracking integration
- Advanced trip planning tools
- Mobile native apps
- Outfitter booking integration
- Social features (hunt reports, photos)
- Predictive analytics (best times/places)

---

## File Structure Convention

```
/src
  /api          # Backend API routes and controllers
  /services     # Business logic and data processing
  /models       # Database models and schemas
  /lib          # Shared utilities and helpers
  /components   # Frontend UI components
  /pages        # Frontend page components/routes
  /hooks        # Custom React hooks
  /stores       # State management
  /types        # TypeScript type definitions
  /data         # Static data, seed files, schemas
    /scrapers   # Data ingestion scripts
    /embeddings # Vector embedding pipelines
/tests          # Test files mirroring src structure
/docs           # Additional documentation
/scripts        # Build, deploy, maintenance scripts
```

---

## Key Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| *To be filled during planning* | | |

---

## Open Questions

1. **Monetization Model**: Free tier vs subscription? Outfitter listing fees?
2. **Data Update Frequency**: How often to check for regulation changes?
3. **User-Generated Content**: Allow hunt reports, location tips?
4. **Liability Considerations**: Disclaimers for regulation accuracy?
5. **Offline Data**: What data to cache for offline field use?

---

## Commands Reference

```bash
# Install dependencies (run from root)
pnpm install

# Development - run all services
pnpm dev              # Start all dev servers in parallel
pnpm dev:web          # Frontend only (http://localhost:3000)
pnpm dev:api          # Backend only (http://localhost:4000)

# Build
pnpm build            # Build all packages
pnpm build:web        # Build frontend only
pnpm build:api        # Build backend only

# Database (requires DATABASE_URL in .env)
pnpm db:generate      # Generate Drizzle migrations
pnpm db:push          # Push schema to database
pnpm db:studio        # Open Drizzle Studio GUI

# Scrapers
pnpm scrape           # Start Node.js scraper worker
cd apps/scrapers-python && scrapy crawl colorado_regulations  # Run specific spider

# Testing & Linting
pnpm lint             # Lint all packages
pnpm test             # Run all tests
```

---

## Project Structure

```
huntstack/
├── apps/
│   ├── web/                 # React + Vite frontend
│   │   └── src/
│   │       ├── components/  # Reusable UI components
│   │       ├── pages/       # Route pages
│   │       ├── hooks/       # Custom React hooks
│   │       ├── stores/      # Zustand state stores
│   │       └── lib/         # Utilities (api, supabase)
│   ├── api/                 # Fastify backend
│   │   └── src/
│   │       ├── routes/      # API endpoints
│   │       ├── services/    # Business logic
│   │       └── lib/         # Utilities
│   ├── scrapers-node/       # Node.js scrapers (Cheerio, Playwright)
│   └── scrapers-python/     # Python scrapers (Scrapy, pdfplumber)
├── packages/
│   ├── db/                  # Drizzle schema & migrations
│   ├── shared/              # Shared utilities & validation
│   └── types/               # Shared TypeScript types
└── scripts/                 # Database init, deployment scripts
```

---

## Environment Setup

1. Copy `.env.example` to `.env`
2. Create Supabase project and add credentials
3. Run `scripts/init-supabase.sql` in Supabase SQL Editor
4. Get MapTiler API key for maps
5. Add Anthropic & OpenAI API keys

---

## Notes for Claude Code

When working on this project:

1. **Prioritize data accuracy** - Hunting regulations have legal implications
2. **Source attribution** - Always track where data comes from
3. **Incremental development** - Build state-by-state, feature-by-feature
4. **Test with real scenarios** - Use actual hunting planning use cases
5. **Mobile-first** - Hunters use phones in the field
6. **Offline consideration** - Cell service is limited in hunting areas
7. **Plain language** - Regulations are complex; simplify for users
8. **Type safety** - Use shared types from `@huntstack/types`
9. **Validation** - Use Zod schemas from `@huntstack/shared`
