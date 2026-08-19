# Cloudflare Pages

Hosts the frontend (`apps/web`), project name **`huntstack`**, git-connected to
`njcurtis3/huntstack`, auto-deploys on push to `main`. Build output
`apps/web/dist`.

- Base URL: `https://api.cloudflare.com/client/v4`
- Auth: `Authorization: Bearer $CLOUDFLARE_API_TOKEN`
- Every response is wrapped: `{"success":bool,"errors":[],"result":{...}}`.
  **Check `success` before reading `result`** — a scope error returns HTTP 200
  with `success:false`.

Shorthand used below:

```bash
CF="https://api.cloudflare.com/client/v4"
H="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
ACC="$CLOUDFLARE_ACCOUNT_ID"
```

## Verify token / find account id

**The verify endpoint depends on the token type**, and using the wrong one
returns a confusing error that looks like a scope problem:

```bash
# account-owned token (the recommended kind - created under the
# "Account API Tokens" tab)
curl -s -H "$H" "$CF/accounts/$ACC/tokens/verify"   | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('success'), (d.get('result') or {}).get('status'), d.get('errors'))"

# user token (created under "User API Tokens")
curl -s -H "$H" "$CF/user/tokens/verify"   | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('success'), (d.get('result') or {}).get('status'), d.get('errors'))"
```

If one fails, try the other before concluding the token is bad.

Listing accounts needs a permission this token deliberately does not have:

```bash
curl -s -H "$H" "$CF/accounts"   | python -c "import sys,json; [print(a['id'], a['name']) for a in json.load(sys.stdin).get('result',[])]"
```

A 403 here is **expected and fine** with a Pages-Read-only token - it is not a
sign the token is broken. `CLOUDFLARE_ACCOUNT_ID` is meant to be set explicitly
in `.env.services` (it is an identifier, not a secret; it appears in the
dashboard URL). Do not report this 403 as a finding.

## Project config — the main call

One request returns build config, branch settings, preview settings, and both
environments' variables.

```bash
curl -s -H "$H" "$CF/accounts/$ACC/pages/projects/huntstack" -o "$SCRATCH"/cfproj.json
python - <<'PY'
import json, os
d = json.load(open(os.environ['SCRATCH'] + '/cfproj.json'))
if not d.get('success'):
    print('FAILED:', d.get('errors')); raise SystemExit
r = d['result']
src = (r.get('source') or {}).get('config') or {}
bc  = r.get('build_config') or {}
print('production_branch      :', r.get('production_branch'))
print('build_command          :', bc.get('build_command'))
print('destination_dir        :', bc.get('destination_dir'))
print('root_dir               :', bc.get('root_dir') or '(repo root)')
print('preview_deployment_setting:', src.get('preview_deployment_setting', '<ABSENT>'))
print('preview_branch_includes   :', src.get('preview_branch_includes', '<ABSENT>'))
print('preview_branch_excludes   :', src.get('preview_branch_excludes', '<ABSENT>'))
for env in ('production', 'preview'):
    cfg = (r.get('deployment_configs') or {}).get(env) or {}
    keys = sorted((cfg.get('env_vars') or {}).keys())
    print(f'{env:10} env var NAMES:', keys or '(none)')
PY
```

**Never print `env_vars` values** — only keys, as above. Cloudflare returns
plaintext values for non-encrypted vars.

### Reading `preview_deployment_setting`

| Value | Meaning |
|---|---|
| `all` | every non-production branch builds a preview -> **staging exists for free** |
| `custom` | only branches matching `preview_branch_includes` build; check that list |
| `none` | **no previews** — pushing a branch does nothing, staging must be enabled |
| absent from response | report as *absent*, not as disabled (SKILL.md section 6) |

### The trap worth checking every time

Vite inlines `VITE_*` at **build time**. Cloudflare Pages keeps *separate*
variable sets for production and preview. If `preview` env vars are empty while
`production` has them, preview builds succeed but ship a frontend pointing at
`localhost` with no Supabase and no Sentry — a staging environment that looks
broken for reasons unrelated to the change being tested. Compare the two key
lists and call out anything in production but not preview. Expected set:
`VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_MAPTILER_KEY`, `VITE_SENTRY_DSN`.

Related: `VITE_SENTRY_DSN` missing from *production* means the deployed frontend
has no error reporting at all, regardless of what Sentry's dashboard shows.

## Deployments

```bash
curl -s -H "$H" "$CF/accounts/$ACC/pages/projects/huntstack/deployments?per_page=10" \
  | python -c "
import sys,json
for d in json.load(sys.stdin).get('result',[]):
    st=(d.get('latest_stage') or {})
    src=(d.get('deployment_trigger') or {}).get('metadata') or {}
    print(f\"{d['created_on'][:19]}  {d.get('environment','?'):10} {src.get('branch','?'):20} \"
          f\"{st.get('name','?')}/{st.get('status','?'):9} {(src.get('commit_hash') or '')[:8]}  {d.get('url','')}\")"
```

`environment` is `production` or `preview`. A `preview` row is direct proof that
preview deploys are working — better evidence than the config field.

Terminal `latest_stage.status`: `success`, `failure`, `canceled`. Anything else
means in-flight.

### Why a build failed

```bash
curl -s -H "$H" "$CF/accounts/$ACC/pages/projects/huntstack/deployments/<DEPLOY_ID>/history/logs" \
  | python -c "import sys,json; [print(l['ts'][:19], l['line']) for l in json.load(sys.stdin)['result']['data'][-60:]]"
```

Missing `VITE_*` vars usually do **not** fail the build — Vite substitutes
`undefined` and the app breaks at runtime. Don't conclude the vars are fine from
a green build.

## Not available via API

- Billing / plan usage
- Build-comment (PR) integration settings

Dashboard path for all of the above:
`Cloudflare -> Workers & Pages -> huntstack -> Settings -> Builds & deployments`
(env vars are under `Settings -> Environment variables`).

## Repo cross-reference

`wrangler.toml` at the repo root documents these settings as of 2026-07-20 and
states in its own comments that it does **not** enforce build command or root
directory for git-connected projects. Treat it as a stale expectation to
compare the API against, never as a source of truth. If the API disagrees with
it, that gap is itself a finding worth reporting.
