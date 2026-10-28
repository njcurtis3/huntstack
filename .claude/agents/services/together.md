# Together.ai and OpenRouter

The only usage-priced dependency in the stack, and therefore the main cost risk.
Read `INFRASTRUCTURE_COSTS.md` before answering any cost question — it has the
per-route cost model already worked out.

## Production runs on OpenRouter (since Oct 2026)

Railway sets `LLM_BASE_URL` and `EMBEDDINGS_BASE_URL` to `https://openrouter.ai/api/v1`
(`LLM_MODEL=meta-llama/llama-3.3-70b-instruct`, `EMBEDDINGS_MODEL=openai/text-embedding-3-small`),
and the local scrapers do the same. Together below is the fallback when `LLM_API_KEY` is
missing. The spend cap belongs on the OpenRouter key: a credit limit, no auto top-up.

**Chat searches the web.** `POST /api/chat` adds OpenRouter's web plugin
(`plugins: [{id: 'web', engine: 'exa', max_results: 5}]`, `lib/together.ts`
`generateChatWithWebSearch`): about $0.007 per question for the search, on top of
~$0.001 of tokens. The search results come back as `url_citation` annotations and
reach the user as sources with `kind: 'web'`. `CHAT_WEB_SEARCH=off` turns it off
without a code change. If a search request fails, chat answers once more without it.

**Provider routing.** OpenRouter requests send `provider: {ignore: ['novita', 'cloudflare']}`
(`OPENROUTER_IGNORE_PROVIDERS`). Those two serve Llama 3.3 70B with 12k / 24k contexts, and a
broad question plus web results overflowed Novita with a hard 400 instead of a reroute. List
a model's providers with `curl -s https://openrouter.ai/api/v1/models/<model>/endpoints`
before changing `LLM_MODEL`.

**Usage is visible here, unlike Together:** each response carries `usage.cost`, and the
OpenRouter dashboard shows spend per key.

- Base URL: `https://api.together.xyz/v1`
- Auth: `Authorization: Bearer $TOGETHER_API_KEY` (reuse the repo `.env` key)

## Models in use

| Model | Where |
|---|---|
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` | API chat and weekly summary (`apps/api`), and LLM extraction in `apps/scrapers-python` |
| — | embeddings moved to OpenAI in Oct 2026, see below |

## Model availability probe

The failure mode this catches has happened twice: Together retired the
`Meta-Llama-3.1-*-Turbo` family from serverless around mid-2026, then
`Qwen/Qwen2.5-7B-Instruct-Turbo` and `multilingual-e5-large-instruct` around
Oct 2026. A pinned model can disappear again.

**Call the models; do not trust `GET /v1/models`.** In Oct 2026 the listing
still showed `Qwen2.5-7B-Instruct-Turbo` while every call to it returned
`400 model_not_available`. Only a real request tells you.

```bash
for m in meta-llama/Llama-3.3-70B-Instruct-Turbo; do
  curl -s https://api.together.xyz/v1/chat/completions -H "Authorization: Bearer $TOGETHER_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$m\",\"max_tokens\":5,\"messages\":[{\"role\":\"user\",\"content\":\"Say OK\"}]}" \
    | python -c "import sys,json; d=json.load(sys.stdin); print(('OK   ' if 'choices' in d else 'GONE ') + '$m', d.get('error',{}).get('code',''))"
done
```

A `GONE` chat model is a live incident, not a note: chat fails and the next
scrape produces zero items. Report it as the headline finding.

When picking a replacement chat model, prefer a non-reasoning one. Reasoning
models (Qwen3.5, DeepSeek V4, gpt-oss) spend hidden tokens before answering:
in the Oct 2026 swap Qwen3.5-9B used the whole 1024-token `max_tokens` budget
and returned an empty answer.

### Embeddings left Together (Oct 2026)

Together retired `e5-large-instruct` from serverless and no embedding model on
this key works (`bge-base-en-v1.5`, the only one listed, fails too). It is the
third embedding model Together has pulled. Embeddings now come from OpenAI's
`text-embedding-3-small` at `dimensions: 1024` (`apps/api/src/lib/embeddings.ts`,
`embed_texts` in `pipelines.py`), keyed by `OPENAI_API_KEY`. Stored e5 vectors
are not comparable with OpenAI ones: until `reembed_all.py` has run against
Supabase, expect retrieval to find little or nothing above the 0.3 similarity
cut (unmeasured — the two spaces are unrelated), leaving chat on structured
data. Run the re-embed before, or right after, `OPENAI_API_KEY` reaches Railway.

## Usage and spend — not available

**Together exposes no public usage or billing API.** Spend, token counts, and
the spend cap are dashboard-only, at `api.together.ai` -> Settings -> Billing.

Say this plainly. Do not estimate spend from row counts and call it a reading,
and do not imply you checked a number you cannot see. If the user wants actual
spend, the answer is "open the billing page" — that is a real answer, not a
failure.

**Outstanding action, unresolved since Phase 2:** a hard billing spend-cap /
alert in the Together dashboard. It is the only true ceiling on cost. The
in-code controls (below) bound the *rate* of spending; nothing in code can stop
it. Worth re-raising whenever a cost question comes up.

## In-code controls (verify against the repo, not from memory)

Per `RUNBOOK.md` and `CONSTRAINTS.md` §3.12 / §4.8, every route that spends
Together money has a dedicated control:

| Route | Control |
|---|---|
| `POST /api/chat` | 20 req/hour/IP + server-side history truncation (`MAX_HISTORY_MESSAGES`, `MAX_HISTORY_CHARS`); each question also pays one web search (~$0.007, `CHAT_WEB_SEARCH=off` to stop) |
| `POST /api/search/semantic` | 60 req/hour/IP |
| `GET /api/migration/weekly-summary` | 6h cache + 15-minute regeneration floor on `?refresh=true` |

If asked whether these are still in place, check the source
(`apps/api/src/routes/`), not this table. And if a *new* route calls Together
without a per-route limit, that is a finding — it is the most likely cause of an
unexpected bill.

Non-obvious cost fact worth repeating to the user: a full 6-state regulation
re-scrape costs more than a day of normal beta chat traffic. Scraper runs, not
users, are the spikiest line item.
