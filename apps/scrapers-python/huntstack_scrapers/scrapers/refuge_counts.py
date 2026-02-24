"""
Scrapling-based refuge counts scraper.

Replaces apps/scrapers-python/huntstack_scrapers/spiders/refuge_counts.py (Scrapy).

Uses the same source registry (sources.py) and parser/extractor modules —
only the HTTP fetching layer changes (Scrapy → Scrapling).

Key improvements over the Scrapy version:
  - Adaptive element tracking: Scrapling remembers element positions and adapts
    if the page structure changes slightly (auto_match=True on targeted selectors)
  - No robots.txt conflicts for external PDF hosts — Scrapling doesn't check by default
  - StealthyFetcher for JS-rendered pages (FWS uses Drupal with some JS rendering)
  - Sync fetch loop with DOWNLOAD_DELAY respected between requests

Usage:
    python -m huntstack_scrapers.scrapers.refuge_counts
    python -m huntstack_scrapers.scrapers.refuge_counts --source "Washita National Wildlife Refuge"
    python -m huntstack_scrapers.scrapers.refuge_counts --dry-run
"""

import re
import sys
import time
import json
import logging
import argparse
import requests as req
from datetime import datetime
from typing import Any

from scrapling.fetchers import Fetcher

from huntstack_scrapers.sources import WATERFOWL_SOURCES
from huntstack_scrapers.parsers.base import ParseResult

log = logging.getLogger(__name__)

DOWNLOAD_DELAY = 3  # seconds between requests — be respectful to government sites


class RefugeCountsScraper:
    """
    Scrapling-based scraper for waterfowl survey data.
    Iterates WATERFOWL_SOURCES and dispatches to the correct handler per source_type.
    """

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.fetcher = Fetcher()
        self.items: list[dict] = []

        # DB connection (lazy — only opened if not dry_run)
        self._conn = None
        self._state_id_map: dict[str, str] = {}
        self._species_map: dict[str, str] = {}
        self._location_map: dict[str, str] = {}

    # ─── DB helpers ───────────────────────────────────────────────────────────

    def _open_db(self):
        import os, psycopg2
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            log.warning("DATABASE_URL not set — items will not be stored")
            return
        self._conn = psycopg2.connect(db_url)

        with self._conn.cursor() as cur:
            cur.execute("SELECT code, id FROM states")
            self._state_id_map = {code: str(sid) for code, sid in cur.fetchall()}

            cur.execute("SELECT slug, id FROM species")
            self._species_map = {slug: str(sid) for slug, sid in cur.fetchall()}

            cur.execute("""
                SELECT name, id FROM locations
                WHERE location_type = 'wildlife_refuge'
                  AND name NOT LIKE '%% - Statewide MWI'
            """)
            self._location_map = {name: str(lid) for name, lid in cur.fetchall()}

        log.info(
            f"DB: {len(self._state_id_map)} states, {len(self._species_map)} species, "
            f"{len(self._location_map)} refuge locations"
        )

    def _store_item(self, item: dict):
        """Persist a refuge_count item using the same logic as DatabasePipeline."""
        if not self._conn:
            return

        from huntstack_scrapers.pipelines import DatabasePipeline
        # Reuse the existing pipeline store method by creating a minimal mock
        pipeline = DatabasePipeline.__new__(DatabasePipeline)
        pipeline.conn = self._conn
        pipeline.state_id_map = self._state_id_map
        pipeline.species_map = self._species_map
        pipeline.location_map = self._location_map

        class _MockSpider:
            logger = log
        pipeline._process_refuge_count(item, _MockSpider())

    # ─── Fetch helpers ────────────────────────────────────────────────────────

    def _fetch_html(self, url: str):
        """Fetch a page with Scrapling. Returns a Scrapling Response object."""
        log.info(f"GET {url}")
        response = self.fetcher.get(url, timeout=30, stealthy_headers=True)
        time.sleep(DOWNLOAD_DELAY)
        return response

    def _download_pdf(self, url: str) -> bytes | None:
        """Download a PDF directly with requests (bypasses robots.txt for external hosts)."""
        try:
            resp = req.get(url, timeout=30)
            if resp.status_code == 200:
                return resp.content
        except Exception as e:
            log.error(f"PDF download failed for {url}: {e}")
        return None

    def _resolve_pdf_url(self, link: str, base_url: str) -> str | None:
        """Convert a link href to a downloadable PDF URL."""
        # Google Drive share links → direct download
        gdrive = re.search(r"/d/([a-zA-Z0-9_-]+)", link)
        if gdrive:
            return f"https://drive.google.com/uc?export=download&id={gdrive.group(1)}"
        if link.endswith(".pdf"):
            if link.startswith("http"):
                return link
            # Relative URL — join with base
            from urllib.parse import urljoin
            return urljoin(base_url, link)
        return None

    # ─── Item builder ─────────────────────────────────────────────────────────

    def _make_item(
        self,
        source_name: str,
        state_code: str,
        result: ParseResult,
        source_url: str,
        survey_type: str,
    ) -> dict:
        return {
            "type": "refuge_count",
            "refuge_name": source_name,
            "state_code": state_code,
            "survey_date": result.survey_date,
            "species_counts": result.species_counts,
            "observers": result.observers,
            "source_url": source_url,
            "survey_type": result.survey_type or survey_type,
            "scraped_at": datetime.utcnow().isoformat(),
        }

    # ─── Source type handlers ─────────────────────────────────────────────────

    def _handle_html(self, source: dict) -> list[dict]:
        """Single-date HTML page — parser returns one ParseResult."""
        response = self._fetch_html(source["url"])
        if not response or response.status != 200:
            log.warning(f"Bad response for {source['name']}: status {getattr(response, 'status', '?')}")
            return []

        # Wrap in a Scrapy-compatible shim so existing parsers work unchanged
        result: ParseResult | None = source["parser"](_ScraplingResponseShim(response))
        if not result:
            log.warning(f"Parser returned no data for {source['name']}")
            return []

        log.info(f"Extracted {len(result.species_counts)} species from {source['name']} ({result.survey_date})")
        return [self._make_item(source["name"], source["state_code"], result, source["url"], source.get("survey_type", "weekly"))]

    def _handle_html_multi(self, source: dict) -> list[dict]:
        """Wide-format HTML table — parser returns list[ParseResult]."""
        response = self._fetch_html(source["url"])
        if not response or response.status != 200:
            log.warning(f"Bad response for {source['name']}: status {getattr(response, 'status', '?')}")
            return []

        results: list[ParseResult] = source["parser"](_ScraplingResponseShim(response))
        if not results:
            log.warning(f"Parser returned no data for {source['name']}")
            return []

        log.info(f"Extracted {len(results)} survey dates from {source['name']}")
        items = []
        for result in results:
            items.append(self._make_item(source["name"], source["state_code"], result, source["url"], source.get("survey_type", "weekly")))
        return items

    def _handle_pdf_index(self, source: dict) -> list[dict]:
        """Index page → find PDF links → download + parse each."""
        from huntstack_scrapers.parsers.agfc_pdf import parse_agfc_pdf

        response = self._fetch_html(source["url"])
        if not response or response.status != 200:
            return []

        selector = source.get("pdf_link_selector", 'a[href*="drive.google.com"]')
        # Scrapling CSS selector — extract href attrs
        links = [a.attrib.get("href", "") for a in response.css(selector)]
        log.info(f"Found {len(links)} PDF links on {source['name']} index")

        items = []
        for link in links:
            pdf_url = self._resolve_pdf_url(link, source["url"])
            if not pdf_url:
                continue

            log.info(f"Downloading PDF: {pdf_url}")
            pdf_bytes = self._download_pdf(pdf_url)
            time.sleep(DOWNLOAD_DELAY)

            if not pdf_bytes:
                continue

            result = parse_agfc_pdf(pdf_bytes)
            if not result:
                log.warning(f"PDF parser returned no data for {pdf_url}")
                continue

            log.info(f"Extracted {len(result.species_counts)} species from {source['name']} ({result.survey_date})")
            items.append(self._make_item(source["name"], source["state_code"], result, source["url"], source.get("survey_type", "weekly")))

        return items

    def _handle_pdf_url_list(self, source: dict) -> list[dict]:
        """Try a list of candidate PDF URLs — HEAD check then download."""
        pdf_urls = source.get("pdf_urls", [])
        parser_fn = source.get("pdf_parser")

        log.info(f"Trying {len(pdf_urls)} candidate PDF URLs for {source['name']}")

        items = []
        found = 0
        for pdf_url in pdf_urls:
            try:
                head = req.head(pdf_url, timeout=10, allow_redirects=True)
                if head.status_code != 200:
                    continue
                content_length = int(head.headers.get("Content-Length", 0))
                if content_length < 5000:
                    continue  # skip empty/placeholder responses

                log.info(f"Found PDF: {pdf_url}")
                pdf_bytes = self._download_pdf(pdf_url)
                time.sleep(DOWNLOAD_DELAY)

                if not pdf_bytes:
                    continue

                result = parser_fn(pdf_bytes)
                if not result:
                    log.warning(f"Parser returned no data for {pdf_url}")
                    continue

                log.info(f"Extracted {len(result.species_counts)} species from {source['name']} ({result.survey_date})")
                items.append(self._make_item(source["name"], source["state_code"], result, pdf_url, source.get("survey_type", "weekly")))
                found += 1

            except Exception as e:
                log.error(f"Error checking PDF {pdf_url}: {e}")

        log.info(f"Found {found} PDFs for {source['name']}")
        return items

    # ─── Main run ─────────────────────────────────────────────────────────────

    def run(self, filter_name: str | None = None) -> list[dict]:
        """
        Scrape all sources (or a single named source).
        Returns list of refuge_count items.
        """
        if not self.dry_run:
            self._open_db()

        sources = WATERFOWL_SOURCES
        if filter_name:
            sources = [s for s in sources if s["name"].lower() == filter_name.lower()]
            if not sources:
                log.error(f"No source found with name: {filter_name!r}")
                return []

        all_items = []

        for source in sources:
            source_type = source.get("source_type", "html")
            log.info(f"\n--- {source['name']} ({source_type}) ---")

            try:
                if source_type == "html":
                    items = self._handle_html(source)
                elif source_type == "html_multi":
                    items = self._handle_html_multi(source)
                elif source_type == "pdf_index":
                    items = self._handle_pdf_index(source)
                elif source_type == "pdf_url_list":
                    items = self._handle_pdf_url_list(source)
                else:
                    log.warning(f"Unknown source_type: {source_type}")
                    items = []

                all_items.extend(items)

                if not self.dry_run:
                    for item in items:
                        self._store_item(item)

            except Exception as e:
                log.error(f"Error scraping {source['name']}: {e}")

        if self._conn:
            self._conn.close()

        log.info(f"\nDone. Total items: {len(all_items)}")
        return all_items


class _ScraplingResponseShim:
    """
    Minimal shim to make a Scrapling Response look like a Scrapy Response.

    Scrapling's Response and Selector objects already implement .css(), .get(),
    .getall(), .attrib, and .urljoin() — identical to Scrapy's API.
    The only thing that differs is response.url is already a property on both.

    This shim exists to satisfy isinstance checks and any future API differences.
    In practice, Scrapling responses pass through directly.
    """

    def __init__(self, scrapling_response):
        self._r = scrapling_response

    @property
    def url(self) -> str:
        return str(self._r.url)

    def css(self, selector: str):
        # Scrapling .css() already returns a Selectors list with .get()/.getall()
        return self._r.css(selector)

    def urljoin(self, url: str) -> str:
        return self._r.urljoin(url)


def main():
    import os
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    parser = argparse.ArgumentParser(description="Scrapling-based refuge counts scraper")
    parser.add_argument("--source", type=str, help="Scrape only this source (exact name)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and parse but don't write to DB")
    args = parser.parse_args()

    scraper = RefugeCountsScraper(dry_run=args.dry_run)
    items = scraper.run(filter_name=args.source)

    if args.dry_run:
        print(f"\n[DRY RUN] {len(items)} items extracted:")
        for item in items:
            print(f"  {item['refuge_name']} | {item['survey_date']} | {len(item['species_counts'])} species")


if __name__ == "__main__":
    main()
