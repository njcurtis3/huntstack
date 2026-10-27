"""
Every data job HuntStack has, built from the scrapers and ingesters that already exist.

Auto (run by `update all` when due):
  counts:<source>    one per WATERFOWL_SOURCES entry (refuge, state aerial and TPWD surveys)
  state-regulations  agency regulation pages -> documents (+ embeddings) for chat

Manual (status only; never run by `update all`):
  counts:<source>      a "manual_pdf" source (AGFC): `status` says when to look for a new
                       report; `add-report <alias> <link>` loads it
  cf-mws               USFWS Central Flyway midwinter report: a PDF someone has to download
  seasons              hand-entered, agency-checked season dates and bag limits
  extract-regulations  LLM extraction that REPLACES a state's seasons and licenses

eBird and NOAA weather aren't jobs: the API fetches them live on each request.
"""

from __future__ import annotations

from datetime import date

from huntstack_scrapers.pipeline.jobs import (
    SURVEY_TYPE_SCHEDULE,
    Job,
    Outcome,
    RunContext,
    expected_cf_mws_year,
    in_season,
    judge_refuge_run,
    manual_report_note,
    season_year,
    slugify,
)

V1_STATES = ["TX", "AR", "NM", "LA", "KS", "OK"]


def _scalar(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
    return row[0] if row else None


# ─── Bird counts ─────────────────────────────────────────────────────────────

def _newest_count(conn, name: str) -> date | None:
    return _scalar(conn, """
        SELECT max(rc.survey_date)::date FROM refuge_counts rc
        JOIN locations l ON l.id = rc.location_id WHERE l.name = %s
    """, (name,))


def _manual_report_job(source: dict) -> Job:
    name = source["name"]
    return Job(
        name=f"counts:{slugify(name)}",
        title=f"{name} ({source['state_code']}), added by hand",
        kind="manual",
        group="Bird counts",
        newest=lambda conn: _newest_count(conn, name),
        note=lambda conn, today: manual_report_note(
            _newest_count(conn, name), today, source["report_months"], source["report_gap_days"], source["url"]),
        manual_steps=(
            f"Open {source['url']} in a browser. For each report newer than the newest loaded, copy its "
            f"link and run: python -m huntstack_scrapers.pipeline add-report {source['alias']} <link> "
            "(add --dry-run first to check what it reads)"
        ),
    )


def _refuge_job(source: dict) -> Job:
    name = source["name"]
    if source.get("source_type") == "manual_pdf":
        return _manual_report_job(source)
    schedule = SURVEY_TYPE_SCHEDULE.get(source.get("survey_type", "weekly"), SURVEY_TYPE_SCHEDULE["weekly"])
    job = Job(
        name=f"counts:{slugify(name)}",
        title=f"{name} ({source['state_code']})",
        kind="auto",
        group="Bird counts",
        **schedule,
    )

    def run(ctx: RunContext) -> Outcome:
        from huntstack_scrapers.scrapers.refuge_counts import RefugeCountsScraper

        scraper = RefugeCountsScraper(dry_run=ctx.dry_run)
        scraper.run(filter_name=name)
        return judge_refuge_run(scraper.source_stats.get(name), ctx.today, in_season(job, ctx.today))

    job.run, job.newest = run, (lambda conn: _newest_count(conn, name))
    return job


def _cf_mws_job() -> Job:
    def newest(conn) -> date | None:
        return _scalar(conn, """
            SELECT max(rc.survey_date)::date FROM refuge_counts rc
            JOIN locations l ON l.id = rc.location_id
            WHERE rc.survey_type = 'mwi_annual'
              AND l.name IN ('Texas - Statewide MWI', 'Kansas - Statewide MWI',
                             'Oklahoma - Statewide MWI', 'New Mexico - Statewide MWI')
        """)

    def note(conn, today: date) -> str:
        have = newest(conn)
        want = expected_cf_mws_year(today)
        if have and have.year >= want:
            return f"up to date (January {have.year} survey loaded)"
        return (f"January {want} survey report should be out (have {have.year if have else 'none'}): "
                "find it on fws.gov, then run the steps")

    return Job(
        name="cf-mws",
        title="USFWS Central Flyway midwinter report (KS, OK, NM, TX history)",
        kind="manual",
        group="Bird counts",
        newest=newest,
        note=note,
        manual_steps=(
            "Download the newest 'Central Flyway Midwinter Survey Report' PDF from fws.gov, then from "
            "apps/scrapers-python: python -m huntstack_scrapers.ingest_cf_mws --pdf <file> --dry-run, "
            "check the output, and rerun without --dry-run"
        ),
    )


# ─── Regulations ─────────────────────────────────────────────────────────────

def _state_regulations_job() -> Job:
    def run(ctx: RunContext) -> Outcome:
        from huntstack_scrapers.scrapers.state_regulations import StateRegulationsScraper

        results = StateRegulationsScraper(dry_run=ctx.dry_run).run()
        total = sum(results.values())
        empty = sorted(code for code, n in results.items() if n == 0)
        if not results:
            return Outcome("failed", "no states scraped", 0, 0)
        if empty:
            return Outcome("warning", f"no pages stored for {', '.join(empty)} (site changed or blocking us?)",
                           total, total, {"pages_by_state": results})
        return Outcome("success", f"{total} pages across {len(results)} states", total, total,
                       {"pages_by_state": results})

    def newest(conn) -> date | None:
        return _scalar(conn, "SELECT max(updated_at)::date FROM documents WHERE state_id IS NOT NULL")

    return Job(
        name="state-regulations",
        title="State regulation pages for chat (all 6 states)",
        kind="auto",
        group="Regulations",
        every_days=30,
        active_months=None,
        stale_after_days=45,
        run=run,
        newest=newest,
    )


def _seasons_job() -> Job:
    def note(conn, today: date) -> str:
        year = season_year(today)
        with conn.cursor() as cur:
            cur.execute("""
                SELECT st.code, count(*), count(*) FILTER (WHERE se.source_url IS NULL)
                FROM seasons se JOIN states st ON st.id = se.state_id
                WHERE se.year = %s GROUP BY st.code
            """, (year,))
            rows = {code: (n, unsourced) for code, n, unsourced in cur.fetchall()}
        parts = [f"{code} {rows[code][0]}" for code in V1_STATES if code in rows]
        missing = [code for code in V1_STATES if code not in rows]
        unsourced = [code for code in V1_STATES if code in rows and rows[code][1]]
        text = f"{year}-{str(year + 1)[2:]}: " + (", ".join(parts) or "none")
        if missing:
            text += f"; MISSING {', '.join(missing)}"
        if unsourced:
            text += f"; rows without source_url in {', '.join(unsourced)}"
        return text

    return Job(
        name="seasons",
        title="Season dates and bag limits (hand-checked)",
        kind="manual",
        group="Regulations",
        note=note,
        manual_steps=(
            "Enter each state's seasons from its agency regulations as scripts/<state>-waterfowl-seasons-<year>.sql "
            "(see the 2026-27 files), with a source_url on every row"
        ),
    )


def _extract_regulations_job() -> Job:
    return Job(
        name="extract-regulations",
        title="LLM extraction of seasons/licenses from scraped pages",
        kind="manual",
        group="Regulations",
        note=lambda conn, today: "do not run for the current season: it would replace hand-checked seasons",
        manual_steps=(
            "huntstack_scrapers.extract_regulations DELETES every season and license for a state/year and "
            "re-inserts LLM output. Only run it with --dry-run, for comparison"
        ),
    )


def build_jobs() -> list[Job]:
    from huntstack_scrapers.sources import WATERFOWL_SOURCES

    return [
        *(_refuge_job(s) for s in WATERFOWL_SOURCES),
        _cf_mws_job(),
        _state_regulations_job(),
        _seasons_job(),
        _extract_regulations_job(),
    ]
