# HuntStack — Infrastructure Cost Model

What it costs to run HuntStack, and specifically what *beta users* will do that spends money.
Verified against the code on 2026-08-18. Companion to `RUNBOOK.md` (operations) and
`CONSTRAINTS.md` (limits).

> **Pricing caveat:** unit prices below are marked ⚠️ where they came from published vendor
> rates rather than your actual invoices. Vendor pricing changes and your plan may differ —
> confirm each against the real dashboard before treating any total as a budget. The *structure*
> (which actions cost money, how many calls each triggers, how they scale) is derived from the
> code and is reliable regardless of price drift.

---

## 1. TL;DR

**Only one thing in this app costs meaningful variable money per user: Together.ai tokens.**
Everything else is either a flat hosting fee or a free-tier API.

| Cost type | Service | Scales with |
|---|---|---|
| **Variable (per user action)** | Together.ai (LLM + embeddings) | Chat messages, semantic searches, forced report refreshes |
| **Flat (per month)** | Railway (API), Supabase (DB) | Roughly constant until you outgrow a tier |
| **Free at beta scale** | Cloudflare Pages, Sentry, eBird, NOAA, Nominatim | Nothing to pay, but throttling/quota risk |
| **$0 — declared but unused** | MapTiler, Redis/BullMQ | Not wired up |

At realistic beta volume the variable cost is **single-digit to low-double-digit dollars per
month**. The fixed hosting floor is larger than the usage cost until you're well past beta.

---

## 2. What beta users actually do that costs money

Ranked by cost per action. This is the direct answer to "what will my beta users spend?"

### 2.1 Send a chat message — the dominant cost 💰💰💰

`POST /api/chat` is the only endpoint that makes **two** paid calls per request:

1. `generateEmbedding(query)` — embeds the user's question (`lib/together.ts`,
   `intfloat/multilingual-e5-large-instruct`)
2. `generateChatResponse(...)` — the actual answer (`Qwen/Qwen2.5-7B-Instruct-Turbo`,
   `max_tokens: 1024`)

Between them the API runs a pgvector similarity query (`LIMIT 5` chunks) plus several structured
SQL lookups. Those hit Supabase, not Together — effectively free, but see §4.2.

**Input token budget per message** (from `buildSystemPrompt` in `chat.ts`):

| Component | Size | Notes |
|---|---|---|
| Base system prompt | ~600 tokens | Fixed instruction block |
| Structured data | ~200–1,500 tokens | Seasons/licenses/refuges, capped by `LIMIT 15`/`15`/`8`/`20` |
| Vector context | ~750 tokens | 5 chunks × 600-char `chunk_size` from ingestion |
| Conversation history | ~0–1,500 tokens | Capped by `truncateHistory()` — see §5.1 |
| Output | ≤1,024 tokens | Hard cap |

- **Typical message:** ~3,000 in + ~400 out ≈ **3,400 tokens**
- **Worst case:** ~4,400 in + 1,024 out ≈ **5,400 tokens**

History used to be the single biggest cost lever here — the schema allows 20 messages × 4,000
chars (~20,000 tokens), resent every turn, which made a crafted request ~7× a normal one.
`truncateHistory()` now trims to the last 6 messages × 1,000 chars server-side, so **worst case
is within ~1.6× of typical** regardless of what a client sends. See §5.1.

### 2.2 Run a semantic search 💰

`POST /api/search/semantic` calls `generateEmbedding` once (`search.ts:228`), then does a vector
query. **One embedding call, no LLM call** — roughly 1/50th the cost of a chat message.
Embeddings are cheap; this is close to noise.

Note the `/search` route redirects to `/chat` in the UI, so most users reach chat instead.

### 2.3 Force-refresh the weekly migration report 💰💰

`GET /api/migration/weekly-summary` generates an LLM narrative. It's cached **6 hours**
(`SUMMARY_TTL`), keyed `summary:{flyway}:{species}` — so normal traffic collapses to a handful of
generations per day no matter how many users load the page. **This is well designed.**

`?refresh=true` forces a fresh generation, but is now bounded by a **15-minute regeneration
floor** — a forced refresh against a summary younger than that returns the cached copy. Caps this
path at 4 generations/hour per cache key. See §5.2.

### 2.4 Everything else — effectively free

These hit only Supabase and free external APIs. Users can hammer them without generating a
Together bill:

| Action | Endpoint | External cost |
|---|---|---|
| Browse migration dashboard | `/api/refuges/migration/dashboard` | eBird (free) |
| Get hunt recommendations | `/api/hunt/recommendations` | NOAA (free), fans out per candidate |
| Read regulations/seasons/licenses | `/api/regulations/*` | None — pure DB |
| Check weather | `/api/weather/*` | NOAA (free), cached 2h/30min |
| Browse outfitters, geocode a ZIP | `/api/outfitters`, `/api/geo/*` | Nominatim (free, TOS-limited) |

`hunt.ts` and `refuges.ts` both fan out with `Promise.allSettled` across many refuges — dozens of
outbound calls per request. Free in dollars, but it's the throttling risk in §4.3.

---

## 3. Cost scenarios

Assumes a typical 3,400-token chat message and ⚠️ blended Together pricing of roughly
**$0.30/M tokens** for Qwen2.5-7B-Turbo (verify — embeddings are ~10× cheaper and are folded in
here as rounding).

**≈ $0.001 per chat message.** Or: **~1,000 chat messages per dollar.**

| Scenario | Users | Chats/user/day | Chats/mo | Together/mo |
|---|---|---|---|---|
| Friends & family | 10 | 3 | 900 | **~$1** |
| Small beta | 50 | 5 | 7,500 | **~$8** |
| Active beta | 200 | 5 | 30,000 | **~$30** |
| Season-peak beta | 500 | 8 | 120,000 | **~$120** |

Add the weekly report: worst case 4 generations/day × ~2,000 tokens ≈ negligible (**<$1/mo**)
while the cache holds.

### Fixed monthly floor ⚠️

| Service | Plan | Est. |
|---|---|---|
| Railway (API) | Usage-based | ~$5–20 |
| Supabase | Free, or Pro if you outgrow it | $0 or $25 |
| Cloudflare Pages | Free | $0 |
| Sentry | Free tier | $0 |
| **Floor** | | **~$5–45/mo** |

**Conclusion: at beta scale, hosting costs more than usage.** Together.ai only becomes the
dominant line item past roughly 50,000 chats/month — unless abuse changes the math (§5).

---

## 4. Per-service detail

### 4.1 Together.ai — the only real variable cost
Two models, both in `lib/together.ts`: `Qwen/Qwen2.5-7B-Instruct-Turbo` (chat, `max_tokens: 1024`)
and `intfloat/multilingual-e5-large-instruct` (embeddings, 1024-dim — locked by `CONSTRAINTS.md`
§1.2).

**Non-user-driven usage matters too:** the regulation scraper runs LLM extraction per document
(`extract_regulations.py`, `extractors/llm.py`). A full 6-state re-scrape is likely a larger
single Together spend than a day of beta chat traffic — it's just scheduled rather than
user-triggered, so it's predictable. Budget for it separately around season refreshes.

### 4.2 Supabase — flat, but watch pgvector
Every chat does a `<=>` similarity scan over `document_chunks`. Cost is compute/egress on your
plan, not per-query billing. Free tier's 500MB includes embeddings, which are the bulk of the
data (1024 floats/chunk). **Most likely reason you'd ever be forced onto Pro ($25) is storage
growth from ingestion, not user traffic.**

### 4.3 Free APIs — no bill, but real limits
eBird, NOAA (`api.weather.gov`), and Nominatim charge nothing. The exposure is **throttling, not
billing** — and `hunt.ts`/`refuges.ts` fan out heavily. Mitigations already in place: bounded TTL
caches (`lib/cache.ts`, 1,000-entry cap) at 2h forecasts / 30min alerts / 6h eBird geo / 3h eBird
regional, plus Nominatim rate-limiting (`CONSTRAINTS.md` §3.11). Getting rate-limited by NOAA
degrades hunt recommendations; it doesn't cost money.

### 4.4 Cloudflare Pages — free, stays free
Unlimited bandwidth on the free tier. Current build is ~1,038 KB JS (305 KB gzipped) + a 114 KB
`og-image.png`. Not a cost concern at any beta scale.

### 4.5 Sentry — free tier, deliberately cheap
`tracesSampleRate: 0` in **both** `apps/api/src/index.ts` and `apps/web/src/main.tsx` — errors
only, no performance traces. That's what keeps it inside the free quota. **Don't raise that
number without checking the quota.** An error loop in a hot path could burn the monthly event
allowance quickly.

### 4.6 MapTiler — currently $0
`VITE_MAPTILER_KEY` is documented in `.env.example`, but **no code references MapTiler or a map
style anywhere in `apps/web/src`**. `MapPage` is a gated "coming soon" placeholder with no tile
requests. Tile usage is a metered cost at most vendors — worth knowing this turns on the moment
the map ships.

### 4.7 Redis / BullMQ — $0, intentionally unwired
Declared in `package.json`, never connected; `health.ts` reports `redis: 'disabled'`. No hosted
Redis to pay for.

---

## 5. Cost risks — unprotected vectors

**None of the API is authenticated** (`CONSTRAINTS.md` §3.2), so every limit below is IP-based
and evadable by a determined caller.

### 5.1 ✅ FIXED — Conversation history is now truncated server-side
*Implemented 2026-08-18.*

`chat.ts`'s request schema still accepts up to 20 history messages × 4,000 chars (the contract is
unchanged, so existing clients don't break), but `truncateHistory()` now trims to the **last 6
messages, each capped at 1,000 chars** before anything reaches Together.ai.

Worst-case history payload dropped from ~80,000 chars (~20,000 tokens) to **6,000 chars (~1,500
tokens)** — the ~7× cost multiplier on a crafted request is gone, and the bound holds no matter
what a client sends. Covered by tests in `chat.test.ts`, including an explicit assertion on the
worst-case total the schema permits.

Secondary benefit: less prior-turn noise in the prompt keeps Qwen anchored to retrieved context.

### 5.2 ✅ FIXED — Forced report regeneration now has a floor
*Implemented 2026-08-18.*

`/api/migration/weekly-summary?refresh=true` previously bypassed the 6-hour cache entirely, with
only the global 100 req/min as a ceiling — up to 100 forced LLM generations per minute from one
IP.

Fixed with a **15-minute regeneration floor** (`REFRESH_MIN_AGE_MS` in `migration.ts`): if the
cached summary is younger than 15 minutes, `refresh=true` returns the cached copy instead of
regenerating. Worst case is now **4 generations/hour per cache key**, down from 6,000.

**Why a floor instead of an IP rate limit:** the summary is a shared artifact keyed only by
`flyway`/`species` — it isn't per-user — so regenerating more often than that produces no new
information for anyone. A floor also can't be evaded by rotating IPs, which an IP-keyed limit
can. The manual-refresh feature still works for its actual purpose (pulling fresh data when the
underlying counts have genuinely moved).

### 5.3 ✅ FIXED — `/api/search/semantic` has a per-route limit
*Implemented 2026-08-18.* Now **60 requests/hour/IP**, deliberately looser than chat's 20/hour
since an embedding is ~50× cheaper than a completion. It exists to stop a loop, not to ration
normal use.

### 5.4 Every paid path now has a dedicated control
| Route | Control |
|---|---|
| `POST /api/chat` | 20 req/hour/IP + history truncation |
| `POST /api/search/semantic` | 60 req/hour/IP |
| `GET /api/migration/weekly-summary` | 6h cache + 15min regeneration floor |

Unpaid routes still inherit the global 100 req/min, which is appropriate — they cost only DB time.

### 5.5 No spend cap configured ⚠️
Still outstanding from Phase 2: **set a hard billing cap in the Together.ai dashboard.** All the
above are mitigations; the spend cap is the only actual backstop, and it can't be set from code.

---

## 6. Controls — status

| # | Control | Status |
|---|---|---|
| 1 | Together.ai hard spend cap | ⬜ **Outstanding — yours to set** (dashboard only, §5.5) |
| 2 | Bound forced report regeneration | ✅ Done 2026-08-18 — 15min floor (§5.2) |
| 3 | Truncate chat history server-side | ✅ Done 2026-08-18 — 6 msgs × 1,000 chars (§5.1) |
| 4 | Per-route limit on `/search/semantic` | ✅ Done 2026-08-18 — 60/hour/IP (§5.3) |
| 5 | Watch Supabase storage, not request volume | ⬜ Ongoing (§4.2) |
| 6 | Keep Sentry `tracesSampleRate` at 0 | ✅ Already the case (§4.5) |

**Items 2–4 shipped together on 2026-08-18** — all contained API changes, no auth, schema, or
frontend work. Verified by `pnpm --filter @huntstack/api test` (69 tests) and `tsc --noEmit`.

**Item 1 remains the only real ceiling.** Everything shipped above reduces the cost of abuse; only
a billing cap actually stops it.

---

## 7. To verify against real dashboards

Code can't answer these:

- [ ] Actual Railway plan and current monthly compute spend
- [ ] Supabase tier and current DB size (how close is `document_chunks` to a limit?)
- [ ] Together.ai current per-model pricing + historical spend to date ⚠️
- [ ] Sentry event volume vs. free-tier quota
- [ ] Whether a Together spend cap exists yet (§5.5)
