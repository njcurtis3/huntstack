# Together.ai

The only usage-priced dependency in the stack, and therefore the main cost risk.
Read `INFRASTRUCTURE_COSTS.md` before answering any cost question — it has the
per-route cost model already worked out.

- Base URL: `https://api.together.xyz/v1`
- Auth: `Authorization: Bearer $TOGETHER_API_KEY` (reuse the repo `.env` key)

## Models in use

| Model | Where |
|---|---|
| `Qwen/Qwen2.5-7B-Instruct-Turbo` | API chat (`apps/api`), and LLM extraction in `apps/scrapers-python` |
| `intfloat/multilingual-e5-large-instruct` | embeddings, 1024-dim |

## Model availability probe

The failure mode this catches has already happened once: Together retired the
`Meta-Llama-3.1-*-Turbo` family from serverless around mid-2026, which broke
extraction until the model was swapped. A pinned model can disappear again.

```bash
curl -s -H "Authorization: Bearer $TOGETHER_API_KEY" https://api.together.xyz/v1/models -o "$SCRATCH"/tmodels.json
python -c "
import json, os
want = ['Qwen/Qwen2.5-7B-Instruct-Turbo', 'intfloat/multilingual-e5-large-instruct']
have = {m['id'] for m in json.load(open(os.environ['SCRATCH'] + '/tmodels.json'))}
for w in want:
    print(('OK   ' if w in have else 'GONE ') + w)"
```

A `GONE` result is a live incident, not a note: chat returns 503 and the next
scrape produces zero items. Report it as the headline finding.

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
