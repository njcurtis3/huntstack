# Browser (Playwright MCP) — billing pages only

The APIs cover almost everything. This exists for the handful of pages that have
**no API at all** — billing, spend, and plan-usage. Reach for it only after
confirming the per-service reference says "dashboard-only."

Configured in `.mcp.json` at the repo root: headed Chrome, persistent profile at
`.claude/agents/services/.browser-profile` (gitignored), navigation origins
allowlisted to the six platforms.

## The scope — this list is the whole permitted surface

| Service | URL | What it answers |
|---|---|---|
| Together.ai | `https://api.together.ai/settings/billing` | **current spend**, and whether a spend cap / alert is set |
| Cloudflare | `https://dash.cloudflare.com/?to=/:account/billing` | plan, current usage vs plan limits |
| Railway | `https://railway.com/account/billing` | current cycle usage + estimated charge |
| Railway | `https://railway.com/project/<id>/usage` | per-service resource usage |
| Supabase | `https://supabase.com/dashboard/project/<ref>/settings/billing` | plan, DB size / bandwidth vs free tier |
| Sentry | `https://sentry.io/settings/<org>/billing/overview/` | event quota consumed, overage |

**Do not navigate anywhere else.** Not to deploy pages, not to project settings,
not to logs — those all have APIs, and the API answer is faster, cheaper, and
structured. If you find yourself wanting a page not on this list, that is a
signal to go back to the per-service reference and find the API call.

Adding a URL to this table is a decision for the user, not for you.

## Honest limits of the allowlist

`--allowed-origins` is **not a security boundary** — Playwright's own docs say
so, and it does not constrain redirects. It reduces accidental drift; it does
not prevent a determined navigation. The real constraint on this agent is the
scope table above plus the read-only rule, both of which are instructions you
are expected to follow, not walls that stop you.

Treat that as a reason for more care, not less.

## Read-only, and it matters much more here

With API tokens, read-only is structural: the scopes literally cannot write.
A logged-in browser session has **your full account privileges** — it can cancel
a subscription, delete a project, rotate a key. Nothing in the tooling stops it.

So, in the browser:

- **Never click anything that changes state.** No "Upgrade", "Cancel", "Delete",
  "Save", "Rotate", "Add payment method", "Set limit" — not even when the user's
  question was about that setting.
- **Navigate and read. That is the entire job.** Clicking is permitted only to
  expand a disclosure or move between read-only tabs.
- **Never type into a form** other than a login field during the one-time
  authentication described below.
- Reporting "no spend cap is set; here is where you'd set it" is the correct
  output. Setting it is the user's click.

If the user explicitly asks you to change a billing setting: stop, state exactly
what you would click, and get confirmation in that same turn. Billing changes
are outward-facing and hard to reverse — an accidental plan change costs real
money.

## First-time login

The browser is headed and the profile persists, so this happens once per service.

1. Navigate to the target URL.
2. If a login page appears, **stop and tell the user**. Do not type credentials.
   Do not attempt SSO. The user completes login in the open window — including
   2FA — and tells you to continue.
3. Snapshot again; the session now persists in the profile for future runs.

**Never handle a password, TOTP code, or recovery code.** If the user offers to
paste one, decline and ask them to type it into the browser window directly.
Anything you receive lands in a transcript.

Sessions expire — expect to repeat this occasionally. A login page appearing is
normal, not an error to route around.

## Working efficiently

- `browser_snapshot` (accessibility tree) is the default. It is text, it is what
  you should read, and it costs far less than an image.
- `browser_take_screenshot` only when the layout itself is the question, or when
  the user wants to see the number with their own eyes. `--image-responses` is
  set to `omit`, so screenshots go to disk — reference the path.
- Billing figures are often rendered late by JS. If the number is missing from
  the snapshot, `browser_wait_for` on the text, then re-snapshot. Do not report
  an absent value as zero.
- **Close the browser when done.** A headed Chrome left open with authenticated
  sessions is a loose end.

## Reporting from a browser read

Say plainly that the figure was read off a dashboard page, and give the date —
these are point-in-time values with no API to re-verify them. Quote the number
and the period it covers ("$4.12 month-to-date, cycle resets the 1st"), not just
the number. If a page did not load or a session had expired, report that rather
than filling the gap with an estimate.

## The standing question

Together.ai's spend cap has been outstanding since Phase 2 and is the only hard
ceiling on HuntStack's costs — every in-code control bounds the *rate* of
spending, not the total. Whenever you are on that billing page for any reason,
check whether a cap exists and surface the answer, even if it was not what you
were asked.
