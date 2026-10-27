"""
The pipeline_runs table (scripts/add-pipeline-runs-table.sql): one row per job run.

Each call opens its own short connection. Some jobs run for many minutes, and an idle
connection held across them can be dropped by the Supabase pooler.
"""

from __future__ import annotations

import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone

from huntstack_scrapers.pipeline.jobs import Outcome


def utcnow() -> datetime:
    """Naive UTC, the form jobs.is_due compares."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


@contextmanager
def connect():
    import psycopg2

    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set (the pipeline loads the repo-root .env)")
    conn = psycopg2.connect(url)
    try:
        yield conn
    finally:
        conn.close()


def last_runs() -> dict[str, dict]:
    """job -> {last_at, last_status, last_message, last_ok_at}."""
    out: dict[str, dict] = {}
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (job) job, status, started_at, message
            FROM pipeline_runs ORDER BY job, started_at DESC
        """)
        for job, status, started, message in cur.fetchall():
            out[job] = {"last_status": status, "last_at": _naive_utc(started), "last_message": message, "last_ok_at": None}
        cur.execute("""
            SELECT job, max(started_at) FROM pipeline_runs
            WHERE status IN ('success', 'warning') GROUP BY job
        """)
        for job, ok_at in cur.fetchall():
            out.setdefault(job, {"last_status": None, "last_at": None, "last_message": None})["last_ok_at"] = _naive_utc(ok_at)
    return out


def close_interrupted(older_than_hours: int = 6) -> int:
    """Mark runs still 'running' after hours as failed: the process was killed (machine
    asleep, out of memory) before it could record a result. Returns how many."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""
            UPDATE pipeline_runs SET status = 'failed', finished_at = now(),
                   message = 'interrupted: the process stopped before recording a result'
            WHERE status = 'running' AND started_at < now() - make_interval(hours => %s)
        """, (older_than_hours,))
        n = cur.rowcount
        conn.commit()
    return n


def start(job: str, trigger: str) -> str:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO pipeline_runs (job, trigger, status) VALUES (%s, %s, 'running') RETURNING id",
            (job, trigger),
        )
        run_id = cur.fetchone()[0]
        conn.commit()
    return str(run_id)


def finish(run_id: str, outcome: Outcome) -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""
            UPDATE pipeline_runs
            SET status = %s, finished_at = now(), items = %s, rows_written = %s,
                message = %s, details = %s::jsonb
            WHERE id = %s
        """, (outcome.status, outcome.items, outcome.rows, outcome.message[:2000],
              json.dumps(outcome.details, default=list), run_id))
        conn.commit()
