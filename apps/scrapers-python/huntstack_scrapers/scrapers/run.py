"""
Unified scraper entry point for HuntStack.

This is the single CLI command that runs any scraper by name.
It replaces both the old Scrapy `scrapy crawl <spider>` command and the
scrapers-node BullMQ worker. Invoke directly or via child_process from Node.

Usage:
    python -m huntstack_scrapers.scrapers.run refuge_counts
    python -m huntstack_scrapers.scrapers.run refuge_counts --source "Washita National Wildlife Refuge"
    python -m huntstack_scrapers.scrapers.run refuge_counts --dry-run

    python -m huntstack_scrapers.scrapers.run state_regulations
    python -m huntstack_scrapers.scrapers.run state_regulations --state TX
    python -m huntstack_scrapers.scrapers.run state_regulations --dry-run

Exit codes:
    0  — completed successfully (even if 0 items found)
    1  — unknown spider name or unhandled exception
"""

import sys
import json
import logging
import argparse
import os
from dotenv import load_dotenv

# Load .env from repo root (3 levels up from this file)
_HERE = os.path.dirname(__file__)
load_dotenv(os.path.join(_HERE, "..", "..", "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("huntstack.run")

SPIDERS = ["refuge_counts", "state_regulations"]


def run_refuge_counts(args) -> int:
    from huntstack_scrapers.scrapers.refuge_counts import RefugeCountsScraper

    scraper = RefugeCountsScraper(dry_run=args.dry_run)
    items = scraper.run(filter_name=getattr(args, "source", None))

    if args.dry_run:
        log.info(f"[DRY RUN] {len(items)} items extracted (not written to DB)")
        for item in items:
            log.info(
                f"  {item['refuge_name']} | {item['survey_date']} | "
                f"{len(item['species_counts'])} species"
            )
    else:
        log.info(f"Stored {len(items)} refuge count records")

    # Emit JSON summary to stdout for Node.js caller
    print(json.dumps({
        "spider": "refuge_counts",
        "items_count": len(items),
        "dry_run": args.dry_run,
    }))
    return 0


def run_state_regulations(args) -> int:
    from huntstack_scrapers.scrapers.state_regulations import StateRegulationsScraper

    states = None
    if getattr(args, "state", None):
        states = [args.state.upper()]

    scraper = StateRegulationsScraper(dry_run=args.dry_run)
    results = scraper.run(states=states)

    total_pages = sum(results.values())
    log.info(f"Stored {total_pages} regulation pages across {len(results)} states: {results}")

    print(json.dumps({
        "spider": "state_regulations",
        "pages_by_state": results,
        "total_pages": total_pages,
        "dry_run": args.dry_run,
    }))
    return 0


RUNNERS = {
    "refuge_counts": run_refuge_counts,
    "state_regulations": run_state_regulations,
}


def main():
    parser = argparse.ArgumentParser(
        description="HuntStack unified scraper runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"Available spiders: {', '.join(SPIDERS)}",
    )
    parser.add_argument("spider", choices=SPIDERS, help="Which scraper to run")
    parser.add_argument("--dry-run", action="store_true", help="Parse but don't write to DB")

    # refuge_counts args
    parser.add_argument("--source", type=str, help="[refuge_counts] Run only this source (exact name)")

    # state_regulations args
    parser.add_argument("--state", type=str, help="[state_regulations] Run only this state (e.g. TX)")

    args = parser.parse_args()
    runner = RUNNERS[args.spider]

    try:
        exit_code = runner(args)
        sys.exit(exit_code)
    except Exception as e:
        log.exception(f"Scraper '{args.spider}' failed: {e}")
        # Emit error JSON so Node.js caller can parse it
        print(json.dumps({"spider": args.spider, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
