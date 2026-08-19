# Credentials

## Where they live

All service tokens go in **`.claude/agents/services/.env.services`**, which is
gitignored. It is separate from the repo's `.env` on purpose: `.env` holds
runtime application secrets (DB, Together, Supabase keys the app itself uses),
while this file holds *platform control-plane* tokens that only this agent uses.
Mixing them would put dashboard-admin credentials into the app's runtime
environment for no reason.

`.env.services.example` in this folder is the committed template.

## File format — strict

```
NAME=value
```

**No space around the `=`.** `set -a` + `.` only exports `NAME=value`; with a
space, bash assigns an empty string and then tries to *run the value as a
command*, which echoes the secret into the terminal and into any transcript.
This has already happened once. Same for quotes — strip them; the loader does
not.

If a variable reads as MISSING even though it is clearly in the file, this is
the cause. Check with:

```bash
python -c "
for i, l in enumerate(open('.claude/agents/services/.env.services', encoding='utf-8-sig'), 1):
    s = l.strip()
    if not s or s.startswith('#') or '=' not in s: continue
    k, v = s.split('=', 1)
    if k != k.strip() or v != v.strip() or v[:1] in (''', '\"'):
        print('line', i, 'BAD FORMAT:', k.strip())"
```

That prints offending line numbers and key names only — never values. **Do not
debug this by echoing the variable or by letting bash error on it.** If a secret
does get printed, treat it as leaked and tell the user to rotate it immediately.

## Loading them

```bash
set -a; . .claude/agents/services/.env.services; set +a
```

Run that once per session, in the same Bash call as the command that needs it
(shell state does not persist between Bash tool calls — the variable will be
gone on the next call). In practice: prefix every call.

```bash
set -a; . .claude/agents/services/.env.services 2>/dev/null; set +a
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" ...
```

Check what is available without printing values:

```bash
set -a; . .claude/agents/services/.env.services 2>/dev/null; set +a
for v in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID RAILWAY_API_TOKEN \
         SENTRY_AUTH_TOKEN SENTRY_ORG SUPABASE_ACCESS_TOKEN \
         TOGETHER_API_KEY GITHUB_TOKEN; do
  eval "val=\$$v"
  if [ -n "$val" ]; then echo "$v: set (${#val} chars)"; else echo "$v: MISSING"; fi
done
```

If `.env.services` does not exist, say so and point the user at the setup table
below. Do not attempt unauthenticated calls.

## What each token needs

| Variable | Service | How to create | Minimum scope |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare | API Tokens -> **Account API Tokens** tab -> Create Token -> Custom. Account-owned, not user-owned — it verifies at `/accounts/{id}/tokens/verify`, not `/user/tokens/verify` | **Account / Cloudflare Pages / Read**, scoped to the one account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare | The 32-hex string in the dashboard URL (`dash.cloudflare.com/<account-id>/...`), or the Workers & Pages sidebar. `GET /accounts` will 403 with a Pages-Read-only token — that is expected | n/a (an ID, not a secret) |
| `RAILWAY_API_TOKEN` | Railway | railway.com -> Account Settings -> Tokens -> Create (**account** token, not project) | account-wide read |
| `SENTRY_AUTH_TOKEN` | Sentry | sentry.io -> Settings -> Developer Settings -> Personal Tokens | `project:read`, `org:read`, `event:read` |
| `SENTRY_ORG` | Sentry | org slug from the dashboard URL | n/a |
| `SUPABASE_ACCESS_TOKEN` | Supabase | supabase.com/dashboard/account/tokens | read |
| `SUPABASE_PROJECT_REF` | Supabase | project ref from the dashboard URL / `SUPABASE_URL` host | n/a |
| `TOGETHER_API_KEY` | Together.ai | already in the repo `.env` — reuse it, no second key needed | n/a |
| `GITHUB_TOKEN` | GitHub | github.com -> Settings -> Developer settings -> Fine-grained token, repo `njcurtis3/huntstack` | **Actions: Read**, Contents: Read |

Read-only scopes are deliberate. This agent is read-only (SKILL.md section 2),
so a read-only token makes that structural rather than a promise. If the user
later approves a specific write, they can widen the scope then — narrower is the
right default for a credential that sits on disk.

## Missing token handling

A missing token is not a failure of the whole run. Skip that service, complete
every other check, and report:

> Skipped Sentry — `SENTRY_AUTH_TOKEN` not set. To enable: create a personal
> token at sentry.io -> Settings -> Developer Settings -> Personal Tokens with
> `project:read`, `org:read`, `event:read`, and add it to
> `.claude/agents/services/.env.services`.

## What no token can reach

Be upfront about these instead of implying you checked:

- **Together.ai billing spend cap** — dashboard-only, no API. This is the
  outstanding backstop noted in `RUNBOOK.md`.
- **Cloudflare/Railway/Supabase plan and billing pages** — generally not exposed
  to a read-scoped token.
- Anything requiring a browser session (SSO-gated org settings).

## Rotation

If a token is ever printed, pasted into a commit, or leaked, tell the user to
revoke it at the source immediately. Do not try to revoke it yourself — that is
a write operation.
