# Sentry

Error tracking for both apps, **errors only** (`tracesSampleRate: 0`, so no
performance/tracing data exists — do not go looking for it). Both SDKs are gated
on a DSN being set: `SENTRY_DSN` (API, runtime) and `VITE_SENTRY_DSN`
(frontend, **build-time** — it must be set on Cloudflare Pages *before* the
build or the shipped bundle has no reporting).

- Base URL: `https://sentry.io/api/0`
- Auth: `Authorization: Bearer $SENTRY_AUTH_TOKEN`
- Org slug: `$SENTRY_ORG`

## Whoami / find projects

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" https://sentry.io/api/0/projects/ \
  | python -c "import sys,json; [print(p['organization']['slug'], '/', p['slug'], '-', p.get('platform')) for p in json.load(sys.stdin)]"
```

Doubles as the token check, and finds the org slug if it isn't set.

## Unresolved issues, last 24h

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/$SENTRY_ORG/PROJECT_SLUG/issues/?query=is:unresolved&statsPeriod=24h&limit=25" \
  -o "$SCRATCH"/sentry-issues.json
python -c "
import json, os
issues = json.load(open(os.environ['SCRATCH'] + '/sentry-issues.json'))
if not issues: print('(no unresolved issues in the window)')
for i in issues:
    print('%6sx %4su  %s  %s' % (i['count'], i.get('userCount',0), i['lastSeen'][:19], i['title'][:90]))
    print('        ' + i['permalink'])"
```

`statsPeriod` accepts `1h`, `24h`, `14d`. Add `&sort=freq` (most frequent) or
`&sort=new` (newest first). Org-wide across both projects:
`https://sentry.io/api/0/organizations/$SENTRY_ORG/issues/?query=is:unresolved&statsPeriod=24h`.

## One issue in detail

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/issues/ISSUE_ID/events/latest/" -o "$SCRATCH"/sentry-event.json
python -c "
import json, os
e = json.load(open(os.environ['SCRATCH'] + '/sentry-event.json'))
print(e.get('title')); print('when:', e.get('dateCreated'))
for en in e.get('entries', []):
    if en['type'] == 'request': print('url:', en['data'].get('url'))
    if en['type'] == 'exception':
        for v in en['data']['values']:
            print(v['type'], ':', v.get('value'))
            for f in (v.get('stacktrace') or {}).get('frames', [])[-8:]:
                print('   ', f.get('filename'), f.get('lineno'), f.get('function'))"
```

Event payloads are large — always write to a file and extract, never print whole.

## Is reporting actually wired up?

An empty issue list is ambiguous: healthy app, or a DSN that was never set.
Resolve it before reporting "no errors":

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/$SENTRY_ORG/PROJECT_SLUG/" \
  | python -c "import sys,json; d=json.load(sys.stdin); print('firstEvent:', d.get('firstEvent'))"
```

`firstEvent: null` means the project has **never received an event** — the DSN
is almost certainly not configured on the platform. Cross-check: frontend ->
`VITE_SENTRY_DSN` in the Cloudflare *production* env var list; API ->
`SENTRY_DSN` in the Railway variable list. Report which side is missing rather
than reporting silence as health.

## Quota

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/$SENTRY_ORG/stats_v2/?field=sum(quantity)&category=error&statsPeriod=30d&interval=1d&groupBy=outcome" \
  -o "$SCRATCH"/sentry-stats.json
python -c "
import json, os
d = json.load(open(os.environ['SCRATCH'] + '/sentry-stats.json'))
for g in d.get('groups', []):
    print(g['by'].get('outcome'), sum(g['series']['sum(quantity)']))"
```

An `outcome` of `rate_limited` or `dropped` with a nonzero total means the free
tier quota is being hit and errors are being silently discarded — surface it,
because it makes Sentry look quiet when it isn't.

## Write operations — do not

Resolving, ignoring, deleting, merging, or assigning issues are all writes.
Report what you found and let the user act.
