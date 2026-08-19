# GitHub Actions

Repo `njcurtis3/huntstack`. CI runs on every push and PR to `main`:
`typecheck` -> `test` (vitest for `apps/api`, pytest for `apps/scrapers-python`)
-> `build`. Workflow at `.github/workflows/ci.yml`.

**The `gh` CLI is not installed.** Use the REST API via curl.

- Base URL: `https://api.github.com`
- Auth: `Authorization: Bearer $GITHUB_TOKEN`
- Always send `-H 'Accept: application/vnd.github+json'`

## Recent runs

```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' \
  'https://api.github.com/repos/njcurtis3/huntstack/actions/runs?per_page=10' -o "$SCRATCH"/gh-runs.json
python -c "
import json, os
d = json.load(open(os.environ['SCRATCH'] + '/gh-runs.json'))
for r in d['workflow_runs']:
    print('%s  %-9s %-12s %s  %s' % (r['created_at'][:19], r['status'], r['conclusion'] or '-',
                                     r['head_sha'][:8], r['head_branch']))
    print('   ' + r['html_url'])"
```

`conclusion`: `success`, `failure`, `cancelled`, `skipped`, or `null` while
still running.

## Which job failed, and why

```bash
# jobs in a run
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' \
  'https://api.github.com/repos/njcurtis3/huntstack/actions/runs/RUN_ID/jobs' \
  | python -c "
import sys,json
for j in json.load(sys.stdin)['jobs']:
    print(j['name'], j['conclusion'])
    for s in j['steps']:
        if s['conclusion'] not in ('success', 'skipped', None):
            print('   FAILED STEP:', s['name'])"

# logs for one job (returns a zip via redirect)
curl -sL -H "Authorization: Bearer $GITHUB_TOKEN" \
  'https://api.github.com/repos/njcurtis3/huntstack/actions/jobs/JOB_ID/logs' | tail -c 8000
```

## Correlating a bad deploy

Both Cloudflare and Railway auto-deploy from `main` and **do not wait for CI** —
they build in parallel with it. So a red CI run does not block a deploy. When
production breaks after a push, the useful sequence is:

1. Which commit is live? (Cloudflare deployment `commit_hash`, Railway deploy `meta`)
2. Did CI pass for that same SHA? (`head_sha` above)
3. If CI failed and the deploy succeeded, the deploy shipped known-broken code.

That third case is the one worth flagging loudly.

## Not needed

Do not create PRs, issues, or comments. Do not push. Read-only.
