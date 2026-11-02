"""
Load every INHS flight on the Forbes index (Jan 2025 on) for the river totals and each survey
site. The weekly pipeline re-stores site counts from the last 45 days only
(inhs_forbes_pdf.SITE_DAYS); run this once after scripts/add-inhs-site-locations.sql, or
again if a run was missed for longer than that.

    python -m huntstack_scrapers.backfill_inhs_sites [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

from dotenv import load_dotenv


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="download and parse only: nothing written")
    args = parser.parse_args(argv)

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                        datefmt="%H:%M:%S", stream=sys.stderr)

    from huntstack_scrapers.parsers import inhs_forbes_pdf
    from huntstack_scrapers.scrapers.refuge_counts import RefugeCountsScraper

    inhs_forbes_pdf.SITE_DAYS = None
    failed = False
    for river_name in inhs_forbes_pdf.RIVER_SOURCES.values():
        scraper = RefugeCountsScraper(dry_run=args.dry_run)
        scraper.run(filter_name=river_name)
        stats = scraper.source_stats.get(river_name, {})
        print(f"{river_name}: {stats.get('items', 0)} results, {stats.get('rows', 0)} rows written"
              f"{' (dry run)' if args.dry_run else ''}; error={stats.get('error')}, "
              f"missing location={stats.get('no_location')}, save errors={stats.get('store_errors')}")
        failed = failed or bool(stats.get("error") or stats.get("no_location") or stats.get("store_errors"))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
