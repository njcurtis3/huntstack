"""
Job definitions for the data pipeline, and the pure logic that decides what is due.

A job wraps an existing scraper or ingester. It does not reimplement it. Each job says:
  - kind: "auto" jobs run from `update all` when due. "manual" jobs never run on their
    own: they need a file someone has to download, or they overwrite hand-checked data.
    `status` still shows how fresh their data is, along with the steps to run them.
  - when it is due: every `every_days` days, and only in `active_months` (None = all year).
  - how to tell its data is stale: `newest(conn)` returns the newest data date, and
    `stale_after_days` says how old that may be during the active months.
  - how to run it: `run(ctx)` returns an Outcome. The run also judges its own result:
    warnings for things like nothing parsed or unknown species names, failure for errors.

Nothing here touches the database except the `newest`/`note`/`run` callables, so the
decisions themselves (is_due, freshness) are unit-tested without one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Callable

SEASON_MONTHS = {10, 11, 12, 1, 2, 3}  # Oct–Mar: when refuges and states fly or count


@dataclass
class Outcome:
    status: str                      # "success" | "warning" | "failed"
    message: str = ""
    items: int | None = None
    rows: int | None = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class RunContext:
    dry_run: bool
    today: date


@dataclass
class Job:
    name: str
    title: str
    kind: str                                    # "auto" | "manual"
    every_days: int | None = None
    active_months: set[int] | None = None
    stale_after_days: int | None = None
    run: Callable[[RunContext], Outcome] | None = None
    newest: Callable[[Any], date | None] | None = None   # conn -> newest data date
    note: Callable[[Any, date], str] | None = None       # conn, today -> extra status text
    manual_steps: str | None = None
    group: str = ""


def slugify(name: str) -> str:
    s = name.lower()
    s = s.replace("national wildlife refuge", "nwr")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def in_season(job: Job, today: date) -> bool:
    return job.active_months is None or today.month in job.active_months


def is_due(job: Job, now: datetime, last_ok: datetime | None) -> tuple[bool, str]:
    """Whether `update all` should run this job now, and why (shown by `status`).

    `last_ok` is the start of its last success or warning run (a failed run doesn't count,
    so a failure is retried next time). Both times are naive UTC.
    """
    if job.kind != "auto" or job.run is None:
        return False, "manual"
    if not in_season(job, now.date()):
        return False, "off-season"
    if last_ok is None:
        return True, "never run"
    every = timedelta(days=job.every_days or 1)
    # Half a day of slack, so last Monday's 6:05 run doesn't push this Monday's 6:00 run out
    if now - last_ok >= every - timedelta(hours=12):
        return True, f"last good run {(now - last_ok).days}d ago"
    return False, f"next {(last_ok + every).date().isoformat()}"


def freshness(job: Job, today: date, newest: date | None) -> str:
    """'ok', 'stale' or '-' (no expectation): newest data vs the job's staleness limit,
    judged only during its active months."""
    if job.stale_after_days is None or not in_season(job, today):
        return "-"
    if newest is None:
        return "stale"
    return "stale" if (today - newest).days > job.stale_after_days else "ok"


# How often each kind of survey is checked, how old its newest survey may get in season,
# and which months it runs. Checked weekly even when the survey itself is less frequent,
# so a new report is picked up within a week of being posted.
SURVEY_TYPE_SCHEDULE: dict[str, dict[str, Any]] = {
    "weekly":           {"every_days": 7,  "stale_after_days": 21, "active_months": SEASON_MONTHS},
    "aerial_weekly":    {"every_days": 7,  "stale_after_days": 21, "active_months": {9, 10, 11, 12, 1}},
    "aerial_biweekly":  {"every_days": 7,  "stale_after_days": 35, "active_months": {11, 12, 1, 2}},
    "aerial_monthly":   {"every_days": 7,  "stale_after_days": 50, "active_months": {11, 12, 1, 2}},
    # TPWD's workbooks: historical, not updated since 2018. Checked monthly after the
    # January survey in case TPWD posts a new year; never "stale".
    "annual_midwinter": {"every_days": 30, "stale_after_days": None, "active_months": {2, 3, 4, 5, 6}},
}


def judge_refuge_run(stats: dict | None, today: date, active: bool) -> Outcome:
    """Turn one source's RefugeCountsScraper.source_stats entry into an Outcome."""
    if stats is None:
        return Outcome("failed", "source did not run (name not found in WATERFOWL_SOURCES?)")
    details = {
        "unknown_names": sorted(stats.get("unknown_names") or []),
        "missing_slugs": sorted(stats.get("missing_slugs") or []),
        "store_errors": stats.get("store_errors", 0),
    }
    items, rows = stats.get("items", 0), stats.get("rows", 0)
    if stats.get("error"):
        return Outcome("failed", f"scrape error: {stats['error']}", items, rows, details)
    if stats.get("no_location"):
        return Outcome("failed", "no matching row in locations (add it with a scripts/ SQL file)", items, rows, details)
    if stats.get("store_errors"):
        return Outcome("failed", f"{stats['store_errors']} survey(s) failed to save", items, rows, details)
    problems = []
    if items == 0 and active:
        problems.append("nothing parsed (site changed, or no survey posted yet)")
    if details["unknown_names"]:
        problems.append("unmapped species names (map them in species_mapping.py): "
                        + ", ".join(details["unknown_names"][:8]))
    if details["missing_slugs"]:
        problems.append("species with no row in the species table: " + ", ".join(details["missing_slugs"]))
    if problems:
        return Outcome("warning", "; ".join(problems), items, rows, details)
    return Outcome("success", f"{items} survey date(s), {rows} rows", items, rows, details)


def expected_cf_mws_year(today: date) -> int:
    """Newest January survey the USFWS Central Flyway report should cover by `today`. The
    report for a January survey is posted about a year later (2024's came out Feb 2025), so
    from March the expected year is two Januaries back; before March, three."""
    return today.year - 2 if today.month >= 3 else today.year - 3


def season_year(today: date) -> int:
    """Hunting season year as stored in seasons.year: the 2026-27 season is 2026. The new
    season's regulations are set by late summer, so from August on it's this year."""
    return today.year if today.month >= 8 else today.year - 1
