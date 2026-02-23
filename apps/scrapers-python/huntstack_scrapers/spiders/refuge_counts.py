"""
Spider to scrape waterfowl survey data from multiple sources.

Uses the source registry (sources.py) and parser modules (parsers/)
to handle different data formats (FWS HTML, state agency PDFs, etc.).

Supports four source types:
  - "html": Direct HTML page parsing — parser returns a single ParseResult
  - "html_multi": Wide-format HTML table — parser returns list[ParseResult] (one per date column)
  - "pdf_index": Index page → follow PDF links → download + parse PDFs
  - "pdf_url_list": Try a list of candidate PDF URLs directly (for JS-rendered index pages)

Usage:
    scrapy crawl refuge_counts
"""

import re
import scrapy
from scrapy.http import Response
from typing import Generator, Any
from datetime import datetime

from huntstack_scrapers.sources import WATERFOWL_SOURCES
from huntstack_scrapers.parsers.base import ParseResult


class RefugeCountsSpider(scrapy.Spider):
    """
    Spider for waterfowl survey data from multiple sources.
    Reads the WATERFOWL_SOURCES registry and dispatches to the correct parser.
    Yields items with type='refuge_count' for pipeline processing.
    """

    name = "refuge_counts"

    custom_settings = {
        "DOWNLOAD_DELAY": 3,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
        # Skip the EmbeddingPipeline — refuge counts don't need embeddings
        "ITEM_PIPELINES": {
            "huntstack_scrapers.pipelines.DatabasePipeline": 300,
        },
    }

    def start_requests(self) -> Generator[scrapy.Request, None, None]:
        for source in WATERFOWL_SOURCES:
            source_type = source.get("source_type", "html")

            if source_type == "pdf_index":
                yield scrapy.Request(
                    source["url"],
                    callback=self.parse_pdf_index,
                    meta={
                        "source_name": source["name"],
                        "state_code": source["state_code"],
                        "source_type": source_type,
                        "survey_type": source.get("survey_type", "weekly"),
                        "pdf_link_selector": source.get("pdf_link_selector", 'a[href$=".pdf"]::attr(href)'),
                    },
                )
            elif source_type == "pdf_url_list":
                # No index page to fetch — go straight to downloading PDFs
                # Use a dummy request to trigger the callback
                yield scrapy.Request(
                    source["url"],
                    callback=self.parse_pdf_url_list,
                    meta={
                        "source_name": source["name"],
                        "state_code": source["state_code"],
                        "source_type": source_type,
                        "survey_type": source.get("survey_type", "weekly"),
                        "pdf_urls": source.get("pdf_urls", []),
                        "pdf_parser": source.get("pdf_parser"),
                    },
                )
            elif source_type == "html_multi":
                yield scrapy.Request(
                    source["url"],
                    callback=self.parse_html_multi,
                    meta={
                        "source_name": source["name"],
                        "state_code": source["state_code"],
                        "parser": source["parser"],
                        "source_type": source_type,
                        "survey_type": source.get("survey_type", "weekly"),
                    },
                )
            else:
                yield scrapy.Request(
                    source["url"],
                    callback=self.parse_html,
                    meta={
                        "source_name": source["name"],
                        "state_code": source["state_code"],
                        "parser": source["parser"],
                        "source_type": source_type,
                        "survey_type": source.get("survey_type", "weekly"),
                    },
                )

    def parse_html(self, response: Response) -> Generator[Any, None, None]:
        """Parse an HTML page directly using the registered parser function."""
        source_name = response.meta["source_name"]
        parser_fn = response.meta["parser"]

        self.logger.info(f"Parsing HTML: {source_name} at {response.url}")

        result: ParseResult | None = parser_fn(response)

        if result is None:
            self.logger.warning(f"Parser returned no data for {source_name} at {response.url}")
            return

        self.logger.info(
            f"Extracted {len(result.species_counts)} species from {source_name} "
            f"(date: {result.survey_date})"
        )

        yield self._make_item(response, result)

    def parse_html_multi(self, response: Response) -> Generator[Any, None, None]:
        """
        Parse a wide-format HTML table where parser returns list[ParseResult].
        Each result is one survey date column. Yields one item per date.
        """
        source_name = response.meta["source_name"]
        parser_fn = response.meta["parser"]

        self.logger.info(f"Parsing HTML (multi-date): {source_name} at {response.url}")

        results: list = parser_fn(response)

        if not results:
            self.logger.warning(f"Parser returned no data for {source_name} at {response.url}")
            return

        self.logger.info(
            f"Extracted {len(results)} survey dates from {source_name}"
        )

        for result in results:
            self.logger.debug(
                f"  {result.survey_date}: {len(result.species_counts)} species"
            )
            yield self._make_item(response, result)

    def parse_pdf_index(self, response: Response) -> Generator[Any, None, None]:
        """Parse an index page to find PDF links, download each directly, and parse."""
        import requests as req
        from huntstack_scrapers.parsers.agfc_pdf import parse_agfc_pdf

        source_name = response.meta["source_name"]
        selector = response.meta["pdf_link_selector"]

        self.logger.info(f"Parsing PDF index: {source_name} at {response.url}")

        links = response.css(selector).getall()
        self.logger.info(f"Found {len(links)} PDF links on {source_name} index")

        for link in links:
            pdf_url = self._resolve_pdf_url(link, response)
            if not pdf_url:
                continue

            # Download PDF directly (bypasses Scrapy robots.txt for external hosts)
            try:
                self.logger.info(f"Downloading PDF: {pdf_url}")
                pdf_resp = req.get(pdf_url, timeout=30)
                if pdf_resp.status_code != 200:
                    self.logger.warning(f"PDF download failed ({pdf_resp.status_code}): {pdf_url}")
                    continue

                result = parse_agfc_pdf(pdf_resp.content)
                if result is None:
                    self.logger.warning(f"PDF parser returned no data for {pdf_url}")
                    continue

                self.logger.info(
                    f"Extracted {len(result.species_counts)} species from {source_name} PDF "
                    f"(date: {result.survey_date})"
                )

                yield {
                    "type": "refuge_count",
                    "refuge_name": source_name,
                    "state_code": response.meta["state_code"],
                    "survey_date": result.survey_date,
                    "species_counts": result.species_counts,
                    "observers": result.observers,
                    "source_url": response.url,
                    "survey_type": result.survey_type or response.meta.get("survey_type", "weekly"),
                    "scraped_at": datetime.utcnow().isoformat(),
                }

            except Exception as e:
                self.logger.error(f"Error processing PDF {pdf_url}: {e}")

    def parse_pdf_url_list(self, response: Response) -> Generator[Any, None, None]:
        """Try a list of candidate PDF URLs directly, downloading each with requests."""
        import requests as req

        source_name = response.meta["source_name"]
        pdf_urls = response.meta.get("pdf_urls", [])
        parser_fn = response.meta.get("pdf_parser")
        if parser_fn is None:
            from huntstack_scrapers.parsers.loess_bluffs_pdf import parse_loess_bluffs_pdf
            parser_fn = parse_loess_bluffs_pdf

        self.logger.info(f"Trying {len(pdf_urls)} candidate PDF URLs for {source_name}")

        found = 0
        for pdf_url in pdf_urls:
            try:
                # Use HEAD first to avoid downloading 404s or tiny placeholders
                head_resp = req.head(pdf_url, timeout=10, allow_redirects=True)
                if head_resp.status_code != 200:
                    continue
                content_length = int(head_resp.headers.get("Content-Length", 0))
                if content_length < 5000:
                    continue  # skip placeholder/empty responses

                self.logger.info(f"Found PDF: {pdf_url}")
                pdf_resp = req.get(pdf_url, timeout=30)
                if pdf_resp.status_code != 200:
                    continue

                result = parser_fn(pdf_resp.content)
                if result is None:
                    self.logger.warning(f"Parser returned no data for {pdf_url}")
                    continue

                self.logger.info(
                    f"Extracted {len(result.species_counts)} species from {source_name} "
                    f"(date: {result.survey_date})"
                )

                yield {
                    "type": "refuge_count",
                    "refuge_name": source_name,
                    "state_code": response.meta["state_code"],
                    "survey_date": result.survey_date,
                    "species_counts": result.species_counts,
                    "observers": result.observers,
                    "source_url": pdf_url,
                    "survey_type": result.survey_type or response.meta.get("survey_type", "weekly"),
                    "scraped_at": datetime.utcnow().isoformat(),
                }
                found += 1

            except Exception as e:
                self.logger.error(f"Error checking PDF {pdf_url}: {e}")

        self.logger.info(f"Found {found} PDFs for {source_name}")

    def _make_item(self, response: Response, result: ParseResult) -> dict:
        """Convert a ParseResult into a standard refuge_count item."""
        return {
            "type": "refuge_count",
            "refuge_name": response.meta["source_name"],
            "state_code": response.meta["state_code"],
            "survey_date": result.survey_date,
            "species_counts": result.species_counts,
            "observers": result.observers,
            "source_url": response.meta.get("index_url", response.url),
            "survey_type": result.survey_type or response.meta.get("survey_type", "weekly"),
            "scraped_at": datetime.utcnow().isoformat(),
        }

    def _resolve_pdf_url(self, link: str, response: Response) -> str | None:
        """Convert a link to a downloadable PDF URL."""
        # Google Drive share links → direct download
        gdrive_match = re.search(r"/d/([a-zA-Z0-9_-]+)", link)
        if gdrive_match:
            file_id = gdrive_match.group(1)
            return f"https://drive.google.com/uc?export=download&id={file_id}"

        # Regular URLs
        if link.endswith(".pdf"):
            return response.urljoin(link)

        return None
