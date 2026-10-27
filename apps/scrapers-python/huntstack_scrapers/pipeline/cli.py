"""
HuntStack data pipeline.

    python -m huntstack_scrapers.pipeline status              what's fresh, stale, failing or due
    python -m huntstack_scrapers.pipeline update all          run every auto job that's due
    python -m huntstack_scrapers.pipeline update all --force  run every auto job now
    python -m huntstack_scrapers.pipeline update <job|glob>   run named jobs now, e.g. "counts:*"
    python -m huntstack_scrapers.pipeline list                every job and its schedule

Add --dry-run to `update` to parse without writing data or recording runs.

`update` records every run in pipeline_runs, posts warnings and failures to
SCRAPER_ALERT_WEBHOOK (Slack or Discord) when it's set, prints a JSON summary as its last
line, and exits 1 if any job failed.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import logging
import os
import sys
import traceback
from datetime import date

from dotenv import load_dotenv

from huntstack_scrapers.pipeline import runlog
from huntstack_scrapers.pipeline.jobs import Job, Outcome, RunContext, freshness, is_due
from huntstack_scrapers.pipeline.registry import build_jobs

log = logging.getLogger("huntstack.pipeline")


def _find_dotenv() -> str:
    here = os.path.abspath(__file__)
    for _ in range(8):
        here = os.path.dirname(here)
        candidate = os.path.join(here, ".env")
        if os.path.exists(candidate):
            return candidate
    return ".env"


def _schedule(job: Job) -> str:
    if job.kind != "auto":
        return "manual"
    months = "all year" if job.active_months is None else _months(job.active_months)
    return f"every {job.every_days}d, {months}"


def _months(months: set[int]) -> str:
    names = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    # Print a wrapping run like Oct–Mar as one range
    ordered = sorted(months, key=lambda m: (m - 7) % 12)  # start the year in July
    return f"{names[ordered[0] - 1]}–{names[ordered[-1] - 1]}"


def _age(dt) -> str:
    if dt is None:
        return "never"
    days = (runlog.utcnow() - dt).days
    return "today" if days == 0 else f"{days}d ago"


def _select(jobs: list[Job], patterns: list[str]) -> list[Job]:
    picked: list[Job] = []
    for pattern in patterns:
        matches = [j for j in jobs if fnmatch.fnmatch(j.name, pattern)]
        if not matches:
            raise SystemExit(f"No job matches {pattern!r}. See: python -m huntstack_scrapers.pipeline list")
        picked += [j for j in matches if j not in picked]
    return picked


# ─── Commands ────────────────────────────────────────────────────────────────

def cmd_list(jobs: list[Job]) -> int:
    group = None
    for job in jobs:
        if job.group != group:
            group = job.group
            print(f"\n{group}")
        print(f"  {job.name:54} {_schedule(job):26} {job.title}")
    return 0


def cmd_status(jobs: list[Job]) -> int:
    today = date.today()
    now = runlog.utcnow()
    runs = runlog.last_runs()
    print(f"{'job':54} {'last run':22} {'newest data':12} {'fresh':6} due")
    with runlog.connect() as conn:
        for job in jobs:
            r = runs.get(job.name, {})
            last = f"{r.get('last_status') or '-'} {_age(r.get('last_at'))}" if r else "never"
            newest = job.newest(conn) if job.newest else None
            fresh = freshness(job, today, newest)
            _, why = is_due(job, now, r.get("last_ok_at"))
            due_text = "DUE" if is_due(job, now, r.get("last_ok_at"))[0] else why
            print(f"{job.name:54} {last:22} {str(newest or '-'):12} {fresh:6} {due_text}")
            if r.get("last_status") in ("warning", "failed") and r.get("last_message"):
                print(f"{'':56}↳ {r['last_message'][:150]}")
            if job.note:
                print(f"{'':56}↳ {job.note(conn, today)}")
    return 0


def _run_one(job: Job, ctx: RunContext, trigger: str) -> Outcome:
    if job.kind != "auto" or job.run is None:
        print(f"\n{job.name} is manual and isn't run by the pipeline:\n  {job.manual_steps}")
        return Outcome("skipped-manual", job.manual_steps or "")
    print(f"\n▶ {job.name}  ({job.title})", flush=True)
    run_id = None if ctx.dry_run else runlog.start(job.name, trigger)
    try:
        outcome = job.run(ctx)
    except Exception as e:  # a crashing job must not stop the others
        outcome = Outcome("failed", f"{type(e).__name__}: {e}", details={"traceback": traceback.format_exc()[-4000:]})
    # A run can "succeed" against a page that still shows an old survey; that's the case
    # worth an alert, so stale data after a good run is a warning
    if outcome.status == "success" and job.newest and not ctx.dry_run:
        with runlog.connect() as conn:
            newest = job.newest(conn)
        if freshness(job, ctx.today, newest) == "stale":
            outcome.status = "warning"
            outcome.message += (f"; newest data is {newest or 'missing'}, older than {job.stale_after_days} days "
                                "(source not updated, or the parser is reading an old page?)")
    if run_id:
        runlog.finish(run_id, outcome)
    mark = {"success": "✓", "warning": "!", "failed": "✗"}.get(outcome.status, "?")
    print(f"  {mark} {outcome.status}: {outcome.message}", flush=True)
    return outcome


def _alert(text: str) -> None:
    webhook = os.getenv("SCRAPER_ALERT_WEBHOOK")
    if not webhook:
        log.info("SCRAPER_ALERT_WEBHOOK not set; not sending: %s", text.splitlines()[0])
        return
    import requests

    try:
        # "text" for Slack, "content" for Discord, so one URL works for either
        requests.post(webhook, json={"text": text, "content": text[:1900]}, timeout=15)
    except Exception as e:
        log.warning("alert webhook failed: %s", e)


def cmd_update(jobs: list[Job], targets: list[str], force: bool, dry_run: bool) -> int:
    ctx = RunContext(dry_run=dry_run, today=date.today())
    if not dry_run and (n := runlog.close_interrupted()):
        print(f"  · marked {n} interrupted run(s) from earlier as failed")
    if targets == ["all"]:
        trigger = "forced" if force else "update-all"
        runs = {} if force else runlog.last_runs()
        now = runlog.utcnow()
        selected = []
        for job in jobs:
            if job.kind != "auto":
                continue
            due, why = (True, "forced") if force else is_due(job, now, runs.get(job.name, {}).get("last_ok_at"))
            if due:
                selected.append(job)
            else:
                print(f"  · {job.name}: skipped ({why})")
    else:
        trigger = "named"
        selected = _select(jobs, targets)

    results = {job.name: _run_one(job, ctx, trigger) for job in selected}
    ran = {n: o for n, o in results.items() if o.status != "skipped-manual"}
    failed = [n for n, o in ran.items() if o.status == "failed"]
    warned = [n for n, o in ran.items() if o.status == "warning"]

    print(f"\n{len(ran)} job(s) ran: {len(ran) - len(failed) - len(warned)} ok, "
          f"{len(warned)} warning, {len(failed)} failed{' (dry run: nothing written)' if dry_run else ''}")
    if (failed or warned) and not dry_run:
        lines = [f"[HuntStack data] {len(failed)} failed, {len(warned)} warning on {ctx.today.isoformat()}"]
        lines += [f"✗ {n}: {ran[n].message}" for n in failed]
        lines += [f"! {n}: {ran[n].message}" for n in warned]
        _alert("\n".join(lines))
    print(json.dumps({
        "pipeline": "update", "targets": targets, "dry_run": dry_run,
        "ran": len(ran), "failed": failed, "warning": warned,
        "items": sum(o.items or 0 for o in ran.values()),
    }))
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    load_dotenv(_find_dotenv())
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                        datefmt="%H:%M:%S", stream=sys.stderr)
    # Windows consoles default to cp1252, which can't print ✓/▶
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(prog="python -m huntstack_scrapers.pipeline",
                                     description="HuntStack data pipeline",
                                     formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="every job and its schedule")
    sub.add_parser("status", help="freshness, last run and next due date of every job")
    up = sub.add_parser("update", help="run jobs")
    up.add_argument("targets", nargs="+", help='"all", or job names / globs such as "counts:*"')
    up.add_argument("--force", action="store_true", help="with all: run every auto job, due or not")
    up.add_argument("--dry-run", action="store_true", help="parse only: no data written, no runs recorded")
    args = parser.parse_args(argv)

    jobs = build_jobs()
    if args.command == "list":
        return cmd_list(jobs)
    if args.command == "status":
        return cmd_status(jobs)
    if "all" in args.targets and args.targets != ["all"]:
        parser.error('"all" can\'t be combined with job names')
    if args.force and args.targets != ["all"]:
        parser.error("--force only applies to `update all` (named jobs always run)")
    return cmd_update(jobs, args.targets, args.force, args.dry_run)
