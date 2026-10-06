# Together.ai

The only usage-priced dependency in the stack, and therefore the main cost risk.
Read `INFRASTRUCTURE_COSTS.md` before answering any cost question — it has the
per-route cost model already worked out.

- Base URL: `https://api.together.xyz/v1`
- Auth: `Authorization: Bearer $TOGETHER_API_KEY` (reuse the repo `.env` key)

## Models in use

| Model | Where |
|---|---|
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` | API chat and weekly summary (`apps/api`), and LLM extraction in `apps/scrapers-python` |
| `intfloat/multilingual-e5-large-instruct` | embeddings, 1024-dim — **not callable since ~Oct 2026**, see below |

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
curl -s https://api.together.xyz/v1/embeddings -H "Authorization: Bearer $TOGETHER_API_KEY" \
  -H "Content-Type: application/json" -d '{"model":"intfloat/multilingual-e5-large-instruct","input":"x"}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print(('OK   ' if 'data' in d else 'GONE ') + 'embeddings', d.get('error',{}).get('code',''))"
```

A `GONE` chat model is a live incident, not a note: chat fails and the next
scrape produces zero items. Report it as the headline finding.

When picking a replacement chat model, prefer a non-reasoning one. Reasoning
models (Qwen3.5, DeepSeek V4, gpt-oss) spend hidden tokens before answering:
in the Oct 2026 swap Qwen3.5-9B used the whole 1024-token `max_tokens` budget
and returned an empty answer.

### Embeddings are down (Oct 2026)

No embedding model is serverless-callable on this key — `e5-large-instruct`
and `bge-base-en-v1.5` (the only one listed) both return `model_not_available`.
Chat degrades gracefully: `retrieveContext` in `chat.ts` catches the error and
answers from structured data only, without document chunks. `POST
/api/search/semantic` returns an error, and the scrapers' `EmbeddingPipeline`
logs an error per chunk and stores no new embeddings. Any
replacement must be 1024-dim or ship a migration and re-embed every chunk
(`CONSTRAINTS.md §1.2`).

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
| `POST /api/chat` | 20 req/hour/IP + server-side history truncation (`MAX_HISTORY_MESSAGES`, `MAX_HISTORY_CHARS`) |
| `POST /api/search/semantic` | 60 req/hour/IP |
| `GET /api/migration/weekly-summary` | 6h cache + 15-minute regeneration floor on `?refresh=true` |

If asked whether these are still in place, check the source
(`apps/api/src/routes/`), not this table. And if a *new* route calls Together
without a per-route limit, that is a finding — it is the most likely cause of an
unexpected bill.

Non-obvious cost fact worth repeating to the user: a full 6-state regulation
re-scrape costs more than a day of normal beta chat traffic. Scraper runs, not
users, are the spikiest line item.
