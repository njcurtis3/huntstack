"""
Spider to scrape weekly waterfowl survey data from USFWS refuge pages.

Scrapes HTML survey pages published by individual National Wildlife Refuges
and yields structured count data for the DatabasePipeline.

Data source: Individual refuge pages on fws.gov
Survey frequency: Weekly during fall/winter migration (Oct-Mar)

Usage:
    scrapy crawl refuge_counts
"""

import re
import scrapy
from scrapy.http import Response
from typing import Generator, Any
from datetime import datetime


# Refuge survey page configs
# Each entry: (refuge_name, state_code, url, parse_method)
REFUGE_SURVEY_PAGES = [
    {
        "name": "Washita National Wildlife Refuge",
        "state_code": "OK",
        "url": "https://www.fws.gov/refuge/washita/latest-waterfowl-survey",
        "parser": "fws_refuge_page",
    },
    {
        "name": "Salt Plains National Wildlife Refuge",
        "state_code": "OK",
        "url": "https://www.fws.gov/story/weekly-waterfowl-survey",
        "parser": "fws_story_page",
    },
]

# Regex to extract survey date from page text
DATE_PATTERNS = [
    # "DATE: 1/13/2026" or "DATE:1/13/2026"
    re.compile(r"DATE\s*:\s*(\d{1,2}/\d{1,2}/\d{4})"),
    # "January 13, 2026"
    re.compile(r"((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})"),
    # "1/13/2026" standalone
    re.compile(r"(\d{1,2}/\d{1,2}/\d{4})"),
    # "2/3/2026" at start of content
    re.compile(r"^(\d{1,2}/\d{1,2}/\d{4})"),
]


def parse_survey_date(text: str) -> str | None:
    """Extract and normalize survey date from page text."""
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            date_str = match.group(1)
            # Try M/D/YYYY format
            for fmt in ("%m/%d/%Y", "%B %d, %Y", "%B %d %Y"):
                try:
                    dt = datetime.strptime(date_str.replace(",", ""), fmt)
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    continue
    return None


def parse_count_value(text: str) -> int | None:
    """Parse a count value, handling commas and non-numeric text."""
    cleaned = text.strip().replace(",", "")
    if not cleaned:
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


class RefugeCountsSpider(scrapy.Spider):
    """
    Spider for weekly waterfowl survey data from USFWS refuge pages.
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
        for refuge in REFUGE_SURVEY_PAGES:
            yield scrapy.Request(
                refuge["url"],
                callback=self.parse,
                meta={
                    "refuge_name": refuge["name"],
                    "state_code": refuge["state_code"],
                    "parser": refuge["parser"],
                },
            )

    def parse(self, response: Response) -> Generator[Any, None, None]:
        parser_name = response.meta.get("parser", "fws_refuge_page")

        if parser_name == "fws_story_page":
            yield from self.parse_fws_story(response)
        else:
            yield from self.parse_fws_refuge(response)

    def parse_fws_refuge(self, response: Response) -> Generator[dict, None, None]:
        """
        Parse FWS refuge survey pages (e.g., Washita).
        Format: HTML tables with Species | Count columns, organized under
        section headers like "DUCK NUMBERS", "GOOSE NUMBERS".
        """
        refuge_name = response.meta["refuge_name"]
        state_code = response.meta["state_code"]
        page_text = " ".join(response.css("body *::text").getall())

        survey_date = parse_survey_date(page_text)
        if not survey_date:
            self.logger.warning(f"Could not extract survey date from {response.url}")
            return

        # Extract observer info (stop at TEMP, WEATHER, DUCK, or next section)
        observers = None
        obs_match = re.search(
            r"OBSERVER\(?S?\)?\s*:\s*(.+?)(?=\s*(?:TEMP|WEATHER|WIND|DUCK|GOOSE|LAKE|DATE|\d+\s*F\b))",
            page_text, re.IGNORECASE,
        )
        if obs_match:
            observers = obs_match.group(1).strip().rstrip(",. ")

        # Extract species counts from tables
        species_counts: dict[str, int] = {}

        # Try table rows first (th/td or td/td pairs)
        tables = response.css("table")
        for table in tables:
            rows = table.css("tr")
            for row in rows:
                cells = row.css("td::text, th::text").getall()
                cells = [c.strip() for c in cells if c.strip()]

                if len(cells) >= 2:
                    name = cells[0]
                    count = parse_count_value(cells[-1])

                    # Skip header rows and total rows
                    if name.lower() in ("species", "count", ""):
                        continue
                    if "total" in name.lower() or "grand" in name.lower():
                        continue

                    if count is not None and count > 0:
                        species_counts[name] = count

        # If no tables found, try text-based extraction
        if not species_counts:
            species_counts = self._extract_counts_from_text(page_text)

        if not species_counts:
            self.logger.warning(f"No species counts found at {response.url}")
            return

        self.logger.info(
            f"Extracted {len(species_counts)} species from {refuge_name} "
            f"(date: {survey_date})"
        )

        yield {
            "type": "refuge_count",
            "refuge_name": refuge_name,
            "state_code": state_code,
            "survey_date": survey_date,
            "species_counts": species_counts,
            "observers": observers,
            "source_url": response.url,
            "scraped_at": datetime.utcnow().isoformat(),
        }

    def parse_fws_story(self, response: Response) -> Generator[dict, None, None]:
        """
        Parse FWS 'story' format survey pages (e.g., Salt Plains).
        Similar data but different page structure — content is in article body
        with sections for ducks, geese, etc.
        """
        refuge_name = response.meta["refuge_name"]
        state_code = response.meta["state_code"]

        # Get all text content
        page_text = " ".join(response.css("article *::text, main *::text, body *::text").getall())

        survey_date = parse_survey_date(page_text)
        if not survey_date:
            self.logger.warning(f"Could not extract survey date from {response.url}")
            return

        # Extract observer info (stop at TEMP, WEATHER, DUCK, or next section)
        observers = None
        obs_match = re.search(
            r"OBSERVER\(?S?\)?\s*:\s*(.+?)(?=\s*(?:TEMP|WEATHER|WIND|DUCK|GOOSE|LAKE|DATE|\d+\s*F\b))",
            page_text, re.IGNORECASE,
        )
        if obs_match:
            observers = obs_match.group(1).strip().rstrip(",. ")

        # Extract species counts — try tables first, fall back to text
        species_counts: dict[str, int] = {}

        tables = response.css("table")
        for table in tables:
            rows = table.css("tr")
            for row in rows:
                cells = row.css("td::text, th::text").getall()
                cells = [c.strip() for c in cells if c.strip()]

                if len(cells) >= 2:
                    name = cells[0]
                    count = parse_count_value(cells[-1])

                    if name.lower() in ("species", "count", ""):
                        continue
                    if "total" in name.lower() or "grand" in name.lower():
                        continue

                    if count is not None and count > 0:
                        species_counts[name] = count

        if not species_counts:
            species_counts = self._extract_counts_from_text(page_text)

        if not species_counts:
            self.logger.warning(f"No species counts found at {response.url}")
            return

        self.logger.info(
            f"Extracted {len(species_counts)} species from {refuge_name} "
            f"(date: {survey_date})"
        )

        yield {
            "type": "refuge_count",
            "refuge_name": refuge_name,
            "state_code": state_code,
            "survey_date": survey_date,
            "species_counts": species_counts,
            "observers": observers,
            "source_url": response.url,
            "scraped_at": datetime.utcnow().isoformat(),
        }

    def _extract_counts_from_text(self, text: str) -> dict[str, int]:
        """
        Fallback: extract species:count pairs from unstructured text.
        Looks for patterns like "Mallard: 240" or "Mallard 240".
        """
        counts: dict[str, int] = {}

        # Pattern: "Species Name: 1,234" or "Species Name  1234"
        pattern = re.compile(
            r"([A-Z][a-z]+(?:[-/\s][A-Za-z']+)*)\s*[:]\s*([\d,]+)"
            r"|([A-Z][a-z]+(?:[-/\s][A-Za-z']+)*)\s+([\d,]+)"
        )

        for match in pattern.finditer(text):
            if match.group(1):
                name, count_str = match.group(1), match.group(2)
            else:
                name, count_str = match.group(3), match.group(4)

            name = name.strip()
            count = parse_count_value(count_str)

            # Filter out non-species entries
            skip_words = {
                "total", "grand", "date", "observer", "temperature",
                "wind", "weather", "lake", "level", "conditions",
                "page", "section", "chapter",
            }
            if name.lower() in skip_words:
                continue
            if count is not None and count > 0:
                counts[name] = count

        return counts
