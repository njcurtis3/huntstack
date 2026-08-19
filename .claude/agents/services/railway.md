# Railway

Hosts the API (`apps/api`), nixpacks build via `railway.toml`, auto-deploys on
push to `main`. Deploys are gated on the health check `/api/health/ready`
(DB reachability), so a failed deploy usually means the DB is unreachable.

- Endpoint: `https://backboard.railway.com/graphql/v2` (POST only, GraphQL)
- Auth: `Authorization: Bearer $RAILWAY_API_TOKEN`
- Use an **account** token. A project token authenticates differently
  (`Project-Access-Token` header) and cannot list projects.

## Important: the schema moves

Railway's public GraphQL schema changes without notice, and field names in this
file may drift. **If a query returns `errors` mentioning an unknown field, do
not guess variations** — introspect and correct:

```bash
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"{ __type(name:\"Deployment\"){ fields { name } } }"}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print([f['name'] for f in d['data']['__type']['fields']])"
```

Swap `Deployment` for `Project`, `Service`, `Query`, etc. When you find a
correction, report it so this file can be updated.

## Query helper

Write the GraphQL query to a file and post it as JSON — this avoids quoting
pain in Git Bash entirely:

```bash
python - <<'PY' > "$SCRATCH"/q.json
import json, os
q = """
{ me { id email } }
"""
print(json.dumps({"query": q}))
PY
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -H 'Content-Type: application/json' --data @"$SCRATCH"/q.json
```

Always print `errors` before reading `data` — GraphQL returns HTTP 200 on
failure.

## Whoami

Query: `{ me { id email } }` — doubles as the token check.

## Projects, services, environments

```graphql
{
  projects {
    edges { node {
      id name
      environments { edges { node { id name } } }
      services     { edges { node { id name } } }
    } }
  }
}
```

Capture the project / environment / service IDs — every other query needs them.

## Recent deploys

```graphql
query {
  deployments(first: 10, input: {
    projectId: "PID", environmentId: "EID", serviceId: "SID"
  }) {
    edges { node { id status createdAt staticUrl meta } }
  }
}
```

`status`: `SUCCESS`, `FAILED`, `CRASHED`, `BUILDING`, `DEPLOYING`, `REMOVED`,
`SKIPPED`. `CRASHED` means it built and deployed but the process died — look at
runtime logs and the health check, not the build.

## Logs

```graphql
query { deploymentLogs(deploymentId: "DID", limit: 100) { message timestamp severity } }
```

`buildLogs(deploymentId:)` is the build-phase equivalent, for a deploy that
failed before it ever started.

## Environment variables

```graphql
query { variables(projectId: "PID", environmentId: "EID", serviceId: "SID") }
```

Returns an object of name -> **plaintext value**. **Print keys only:**

```bash
python -c "import sys,json; d=json.load(sys.stdin); print(sorted((d.get('data') or {}).get('variables',{}).keys()))"
```

Expected on the API service: `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `TOGETHER_API_KEY`, `EBIRD_API_KEY`, `SENTRY_DSN`,
`CORS_ORIGIN`, `NODE_ENV`, `PORT`, `HOST`, `LOG_LEVEL`.

Two things worth flagging if you see them:

- `SENTRY_DSN` absent -> the API is running with no error reporting at all.
- `CORS_ORIGIN` still `http://localhost:3000` -> the deployed frontend cannot
  call the API from the real domain.

## Cheapest check of all

The API is public. This needs no Railway token and tells you what actually
matters — whether the service is up and can reach the DB:

```bash
curl -s -w '\nHTTP %{http_code}\n' https://<api-host>/api/health/ready
```

Get `<api-host>` from `staticUrl` above, or from `VITE_API_URL` in the
Cloudflare production env var list. Prefer this when the question is just "is
the API up?" — faster and more direct than GraphQL. `GET /api/health` is the
liveness variant (no DB check).

## Not available

Billing, plan usage, and spend history are dashboard-only.

## Repo cross-reference

`railway.toml` deliberately omits `pnpm db:migrate`. That is a documented
decision, not a gap — see `RUNBOOK.md` "Why migrations aren't automated" and
`CONSTRAINTS.md` §6.8. **Do not report its absence as a misconfiguration.**
