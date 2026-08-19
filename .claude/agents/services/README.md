# `services` agent

A read-only operator for HuntStack's hosted services. Ask it a question about
live infrastructure state and it calls the platform APIs instead of you opening
six dashboards.

## Setup (once)

```bash
cp .claude/agents/services/.env.services.example .claude/agents/services/.env.services
```

**Copy, don't move** — the template is the committed one; `.env.services` is the
gitignored one. And keep the `NAME=value` format exact: no space after the `=`,
no quotes, or bash will run your token as a command and echo it.

Fill in the tokens you want. `credentials.md` has the creation steps and the
minimum scope for each. Every token is optional — a missing one means that
service is reported as skipped, not that the run fails. The file is gitignored
(`.gitignore:68`).

Start with `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`; that alone unlocks
the deploy and staging checks, which are the ones that come up most.

## Use

Ask in plain language, naming the agent:

- "Use the services agent to check whether Cloudflare preview deployments are enabled" (CHECK-01)
- "Have the services agent verify commit abc1234 deployed on both platforms" (CHECK-02)
- "Services agent: production health sweep" (CHECK-03)
- "Services agent: audit env vars across Cloudflare and Railway" (CHECK-04)
- "Services agent: what is everything costing right now?" (CHECK-07, uses the browser)

### Browser setup (once per service)

`.mcp.json` configures Playwright MCP, scoped to billing pages. The first time it
opens a service you will get a login page in a real Chrome window — **you log in,
including 2FA; the agent never handles credentials.** The session then persists
in `.claude/agents/services/.browser-profile` (gitignored) for future runs.

Requires restarting Claude Code to pick up `.mcp.json`, and approving the server
when prompted.

## Files

| File | Purpose |
|---|---|
| `../services.md` | Agent definition — frontmatter + pointers. This is what Claude Code loads. |
| `SKILL.md` | Operating manual: environment facts, read-only rule, secrets hygiene, report format |
| `credentials.md` | Token setup, scopes, missing-token handling |
| `checks.md` | Catalog of named checks with worked interpretations |
| `cloudflare.md` `railway.md` `sentry.md` `supabase.md` `together.md` `github.md` | Per-service API reference |
| `browser.md` | Playwright scope: the exhaustive list of billing pages it may open |
| `.env.services.example` | Token template |

## Two things it will not do

**It does not write.** No deploys, rollbacks, setting changes, env var edits, or
non-`SELECT` SQL — and in the browser, no clicking anything that changes state.
It reports what it would change and waits for you. These platforms have no undo,
and a wrong env var on Pages silently ships a broken frontend on the next build.

**It does not guess.** If a token is missing or an API doesn't expose something,
it says so rather than inferring from the repo or from what a platform usually
does by default. `wrangler.toml` documenting a Cloudflare setting is not the
same as that setting being live, and the agent is instructed to treat it that
way.

## Maintaining it

Two files go stale in opposite directions. `checks.md` gains value as you add
checks — when a question gets asked twice, write it down with its
interpretation. The per-service files lose value when a vendor changes an API;
Railway's GraphQL schema is the most likely to drift, and `railway.md` tells the
agent to introspect and report the correction rather than guess around it.
