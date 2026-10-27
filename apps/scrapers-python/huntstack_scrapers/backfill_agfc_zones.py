"""
Load AGFC survey-zone history (November 2011 on) from saved report PDFs.

    python -m huntstack_scrapers.backfill_agfc_zones <report.pdf> [<report.pdf> ...] [--dry-run]

Every AGFC report repeats the whole zone history in Tables 1 and 2, but reading a table can
go wrong near a page break (a Mallards row paired with the wrong Total Ducks row still adds
up). So each zone and period is taken from the value most reports agree on, and a value only
one report has is used only for that report's own survey period, which is checked against
the report's opening paragraph (agfc_zones.report_zone_rows).

Dates: a period matching a survey already loaded for "Arkansas - AGFC Aerial Survey" gets
that survey's date; older periods get a nominal date and are flagged as approximate.

New reports don't need this: `pipeline add-report agfc <link>` stores each report's own
period as it comes in.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from collections import Counter, defaultdict
from datetime import date

from dotenv import load_dotenv

from huntstack_scrapers.parsers.agfc_pdf import parse_agfc_pdf
from huntstack_scrapers.parsers.agfc_zones import (
    PARENT_LOCATION, ZoneRow, nominal_date, parse_zone_tables, period_window, report_zone_rows, store_zone_rows,
)

log = logging.getLogger("backfill_agfc_zones")


def pick_rows(reports: list[tuple[bytes, object]]) -> tuple[list[ZoneRow], list[str]]:
    """Agreed zone rows across reports: the most common value per (zone, period), when at
    least two reports give it; plus each report's own, text-checked period."""
    votes: dict[tuple[str, str], Counter] = defaultdict(Counter)
    rows_by_value: dict[tuple, ZoneRow] = {}
    own: dict[tuple[str, str], ZoneRow] = {}
    notes: list[str] = []
    for pdf_bytes, result in reports:
        for r in parse_zone_tables(pdf_bytes).rows:
            key = (r.zone, r.period)
            value = (r.mallards, r.total_ducks)
            votes[key][value] += 1
            rows_by_value[key + value] = r
        checked, problems = report_zone_rows(pdf_bytes, date.fromisoformat(result.survey_date), result.regions)
        notes += [f"{result.survey_date}: {p}" for p in problems]
        for r in checked:
            own[(r.zone, r.period)] = r
    picked: list[ZoneRow] = []
    for key, counter in votes.items():
        if key in own:
            picked.append(own[key])
            continue
        (value, n), *rest = counter.most_common()
        if n >= 2 and (not rest or rest[0][1] < n):
            picked.append(rows_by_value[key + value])
        else:
            notes.append(f"{key[0]} {key[1]}: reports disagree or only one has it {dict(counter)}; skipped")
    return picked, notes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pdfs", nargs="+")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    here = os.path.abspath(__file__)
    for _ in range(6):
        here = os.path.dirname(here)
        if os.path.exists(os.path.join(here, ".env")):
            load_dotenv(os.path.join(here, ".env"))
            break

    reports = []
    for path in args.pdfs:
        pdf_bytes = open(path, "rb").read()
        result = parse_agfc_pdf(pdf_bytes)
        if result is None:
            log.warning(f"{path}: not an AGFC report the parser recognises; skipped")
            continue
        reports.append((pdf_bytes, result))
    rows, notes = pick_rows(reports)
    for n in notes:
        log.info(n)

    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT rc.survey_date::date, rc.source_url FROM refuge_counts rc
                JOIN locations l ON l.id = rc.location_id WHERE l.name = %s
            """, (PARENT_LOCATION,))
            surveys = cur.fetchall()
        dates: dict[str, tuple[date, bool]] = {}
        for period in {r.period for r in rows}:
            lo, hi = period_window(period)
            match = [d for d, _ in surveys if lo <= d <= hi]
            dates[period] = (max(match), True) if match else (nominal_date(period), False)
        exact = sum(1 for d in dates.values() if d[1])
        written = store_zone_rows(conn, rows, dates, None)
        print(f"{len(rows)} zone rows over {len(dates)} periods ({exact} with an exact survey date): "
              f"{written} count rows{' (dry run: rolled back)' if args.dry_run else ''}")
        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
