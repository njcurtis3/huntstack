"""
Load every Hagerman NWR census checklist linked from the Friends of Hagerman census page
(back to about Dec 2024). The weekly pipeline reads only the newest few
(hagerman_census.RECENT_CHECKLISTS); run this once after scripts/add-hagerman-location.sql,
or again after a long gap.

    python -m huntstack_scrapers.backfill_hagerman [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

from dotenv import load_dotenv

SOURCE_NAME = "Hagerman National Wildlife Refuge"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="download and parse only: nothing written")
    args = parser.parse_args(argv)

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                        datefmt="%H:%M:%S", stream=sys.stderr)

    from huntstack_scrapers.parsers import hagerman_census
    from huntstack_scrapers.scrapers.refuge_counts import RefugeCountsScraper

    hagerman_census.RECENT_CHECKLISTS = None
    scraper = RefugeCountsScraper(dry_run=args.dry_run)
    scraper.run(filter_name=SOURCE_NAME)
    stats = scraper.source_stats.get(SOURCE_NAME, {})
    print(f"{SOURCE_NAME}: {stats.get('items', 0)} results, {stats.get('rows', 0)} rows written"
          f"{' (dry run)' if args.dry_run else ''}; error={stats.get('error')}, "
          f"missing location={stats.get('no_location')}, save errors={stats.get('store_errors')}")
    failed = bool(stats.get("error") or stats.get("no_location") or stats.get("store_errors"))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
