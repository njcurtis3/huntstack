"""
Scrapling-based state regulations scraper.

Replaces apps/scrapers-python/huntstack_scrapers/spiders/state_regulations.py (Scrapy).

For each V1 priority state, fetches regulation pages and PDFs then stores raw
content in the documents table for downstream LLM extraction via extract_regulations.py.

Usage:
    python -m huntstack_scrapers.scrapers.state_regulations
    python -m huntstack_scrapers.scrapers.state_regulations --state TX
    python -m huntstack_scrapers.scrapers.state_regulations --dry-run
"""

import os
import sys
import time
import json
import logging
import argparse
from datetime import datetime
from urllib.parse import urljoin, urlparse

import requests as req
from scrapling.fetchers import Fetcher

log = logging.getLogger(__name__)

DOWNLOAD_DELAY = 2  # seconds between requests

# ─── Source definitions ───────────────────────────────────────────────────────

STATE_SOURCES = {
    "TX": {
        "name": "Texas",
        "start_urls": [
            "https://tpwd.texas.gov/regulations/outdoor-annual/hunting/migratory-game-bird-regulations",
            "https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck",
            "https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose",
            "https://tpwd.texas.gov/regulations/outdoor-annual/hunting/migratory-game-bird-regulations/stamps-permits-and-certification",
            "https://tpwd.texas.gov/regulations/outdoor-annual/licenses",
        ],
        "allowed_domains": ["tpwd.texas.gov"],
        "link_keywords": ["migratory-game-birds", "waterfowl", "licenses", "duck", "goose"],
        "pdf_keywords": ["waterfowl", "migratory", "duck", "goose"],
    },
    "AR": {
        "name": "Arkansas",
        "start_urls": [
            "https://www.agfc.com/regulations/",
            "https://www.agfc.com/hunting/waterfowl/",
            "https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/",
        ],
        "allowed_domains": ["agfc.com"],
        "link_keywords": ["waterfowl", "migratory", "duck", "goose", "migratory-game-bird"],
        "pdf_keywords": ["waterfowl", "migratory", "duck", "goose"],
    },
    "NM": {
        "name": "New Mexico",
        "start_urls": [
            "https://wildlife.dgf.nm.gov/hunting/information-by-animal/migratory-bird/",
            "https://wildlife.dgf.nm.gov/hunting/licenses-and-permits/license-requirements-fees/",
        ],
        "allowed_domains": ["wildlife.dgf.nm.gov"],
        "link_keywords": ["migratory", "waterfowl", "duck", "goose", "licenses"],
        "pdf_keywords": ["waterfowl", "migratory", "duck"],
    },
    "LA": {
        "name": "Louisiana",
        "start_urls": [
            "https://www.wlf.louisiana.gov/page/seasons-and-regulations",
            "https://www.wlf.louisiana.gov/page/hunting-licenses-permits-tags",
        ],
        "allowed_domains": ["wlf.louisiana.gov"],
        "link_keywords": ["waterfowl", "migratory", "duck", "goose"],
        "pdf_keywords": ["waterfowl", "migratory", "duck", "goose"],
    },
    "KS": {
        "name": "Kansas",
        "start_urls": [
            "https://ksoutdoors.gov/Hunting/Migratory-Birds",
            "https://ksoutdoors.gov/Hunting/Migratory-Birds/Ducks",
        ],
        "allowed_domains": ["ksoutdoors.gov"],
        "link_keywords": ["migratory", "waterfowl", "duck", "goose"],
        "pdf_keywords": ["waterfowl", "migratory", "duck"],
    },
    "OK": {
        "name": "Oklahoma",
        "start_urls": [
            "https://www.wildlifedepartment.com/hunting/regs/migratory-game-bird-regulations",
            "https://www.wildlifedepartment.com/hunting/resources/waterfowl",
            "https://www.wildlifedepartment.com/licensing/regs/license-fees",
        ],
        "allowed_domains": ["wildlifedepartment.com"],
        "link_keywords": ["waterfowl", "migratory", "migratory-game-bird"],
        "pdf_keywords": ["waterfowl", "migratory", "duck", "goose"],
    },
}


class StateRegulationsScraper:
    """
    Scrapling-based scraper for state wildlife agency regulation pages.
    Fetches pages + PDFs and stores raw content in the documents table.
    LLM extraction (extract_regulations.py) runs separately as a post-processing step.
    """

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.fetcher = Fetcher()
        self._conn = None
        self._state_id_map: dict[str, str] = {}

    # ─── DB helpers ───────────────────────────────────────────────────────────

    def _open_db(self):
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            log.warning("DATABASE_URL not set — documents will not be stored")
            return
        import psycopg2
        self._conn = psycopg2.connect(db_url)
        with self._conn.cursor() as cur:
            cur.execute("SELECT code, id FROM states")
            self._state_id_map = {code: str(sid) for code, sid in cur.fetchall()}
        log.info(f"DB connected, {len(self._state_id_map)} states loaded")

    def _store_document(self, state_code: str, title: str, content: str, source_url: str, doc_type: str):
        if not self._conn:
            return
        state_id = self._state_id_map.get(state_code)
        try:
            with self._conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO documents (title, content, document_type, source_url, source_type, state_id, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    title, content, doc_type, source_url, "state_agency", state_id,
                    json.dumps({"state_code": state_code, "scraped_at": datetime.utcnow().isoformat()}),
                ))
            self._conn.commit()
            log.info(f"Stored {doc_type}: {source_url[:80]}")
        except Exception as e:
            log.error(f"DB error storing document: {e}")
            self._conn.rollback()

    # ─── Fetch helpers ────────────────────────────────────────────────────────

    def _fetch(self, url: str):
        log.info(f"GET {url}")
        try:
            response = self.fetcher.get(url, timeout=30, stealthy_headers=True)
            time.sleep(DOWNLOAD_DELAY)
            return response
        except Exception as e:
            log.error(f"Fetch failed for {url}: {e}")
            return None

    def _download_pdf(self, url: str) -> bytes | None:
        try:
            resp = req.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
            time.sleep(DOWNLOAD_DELAY)
            if resp.status_code == 200:
                return resp.content
        except Exception as e:
            log.error(f"PDF download failed {url}: {e}")
        return None

    def _extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        import pdfplumber
        from io import BytesIO
        try:
            parts = []
            with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        parts.append(text)
            return "\n\n".join(parts)
        except Exception as e:
            log.error(f"pdfplumber failed: {e}")
            return ""

    def _is_allowed_domain(self, url: str, allowed_domains: list[str]) -> bool:
        host = urlparse(url).netloc.lstrip("www.")
        return any(host == d.lstrip("www.") or host.endswith("." + d.lstrip("www.")) for d in allowed_domains)

    def _is_relevant_link(self, href: str, keywords: list[str]) -> bool:
        # Strip fragment and query string — compare path only
        path = urlparse(href).path.lower()
        return any(kw in path for kw in keywords)

    def _is_relevant_pdf(self, href: str, keywords: list[str]) -> bool:
        href_lower = href.lower()
        return href_lower.endswith(".pdf") and any(kw in href_lower for kw in keywords)

    # ─── State scraper ────────────────────────────────────────────────────────

    def _scrape_state(self, state_code: str, config: dict) -> int:
        """
        Scrape all pages + PDFs for a state. Returns number of documents stored.
        """
        visited: set[str] = set()
        # Strip fragments from start URLs before queuing
        queue: list[str] = [u.split("#")[0] for u in config["start_urls"]]
        stored = 0

        while queue:
            url = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)

            response = self._fetch(url)
            if not response or response.status != 200:
                continue

            # Extract page text — h1 text may be nested in spans.
            # Try child elements first, then the h1 directly, then <title>.
            h1_parts = response.css("h1 *::text").getall() or response.css("h1::text").getall()
            title = (
                " ".join(h1_parts).strip()
                or " ".join(response.css("title::text").getall()).strip()
                or url
            )

            # Prefer main content area, fall back to full body
            content_areas = response.css("main, article, div.content-area, div.main-content, div.field-item")
            if content_areas:
                content = " ".join(content_areas.css("*::text").getall())
            else:
                content = " ".join(response.css("body *::text").getall())

            content = content.strip()
            if content and len(content) > 200:
                if self.dry_run:
                    log.info(f"[DRY RUN] Would store page: {title[:60]} ({url[:80]})")
                else:
                    self._store_document(state_code, title, content, url, "page")
                stored += 1

            # Follow relevant links within allowed domain
            all_links = response.css("a[href]")
            for a in all_links:
                href = a.attrib.get("href", "")
                if not href:
                    continue
                full_url = response.urljoin(href).split("#")[0]  # strip fragments

                if full_url in visited or full_url in queue:
                    continue
                if not self._is_allowed_domain(full_url, config["allowed_domains"]):
                    continue

                if self._is_relevant_link(full_url, config["link_keywords"]):
                    queue.append(full_url)
                    continue

                # Download relevant PDFs
                if self._is_relevant_pdf(href, config["pdf_keywords"]):
                    if self.dry_run:
                        log.info(f"[DRY RUN] Would download PDF: {full_url[:80]}")
                        stored += 1
                        continue

                    pdf_bytes = self._download_pdf(full_url)
                    if not pdf_bytes:
                        continue

                    pdf_text = self._extract_text_from_pdf(pdf_bytes)
                    if pdf_text and len(pdf_text) > 200:
                        link_title = a.attrib.get("title") or a.css("::text").get() or "PDF Document"
                        self._store_document(state_code, link_title.strip(), pdf_text, full_url, "regulation")
                        stored += 1

        return stored

    # ─── Main run ─────────────────────────────────────────────────────────────

    def run(self, states: list[str] | None = None) -> dict[str, int]:
        if not self.dry_run:
            self._open_db()

        target_states = states or list(STATE_SOURCES.keys())
        results: dict[str, int] = {}

        for state_code in target_states:
            config = STATE_SOURCES.get(state_code)
            if not config:
                log.warning(f"No config for state: {state_code}")
                continue

            log.info(f"\n{'='*50}")
            log.info(f"Scraping {state_code} — {config['name']}")
            log.info(f"{'='*50}")

            try:
                n = self._scrape_state(state_code, config)
                results[state_code] = n
                log.info(f"{state_code}: {n} documents stored")
            except Exception as e:
                log.error(f"Error scraping {state_code}: {e}")
                results[state_code] = 0

        if self._conn:
            self._conn.close()

        return results


def main():
    from dotenv import load_dotenv
    _here = os.path.abspath(__file__)
    for _ in range(8):
        _here = os.path.dirname(_here)
        if os.path.exists(os.path.join(_here, ".env")):
            load_dotenv(os.path.join(_here, ".env"))
            break

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    parser = argparse.ArgumentParser(description="Scrapling-based state regulations scraper")
    parser.add_argument("--state", type=str, help="Scrape only this state (e.g. TX)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch but don't write to DB")
    args = parser.parse_args()

    scraper = StateRegulationsScraper(dry_run=args.dry_run)
    states = [args.state.upper()] if args.state else None
    results = scraper.run(states=states)

    print("\nResults:")
    for state, count in results.items():
        print(f"  {state}: {count} documents")


if __name__ == "__main__":
    main()
