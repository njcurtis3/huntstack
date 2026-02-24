"""
Parser for Louisiana LDWF aerial waterfowl survey PDFs.

LDWF conducts monthly aerial surveys Sep-Jan covering coastal Louisiana,
Little River Basin, NW and NE regions. PDFs contain Table 1 with species
counts by region and a TOTALS column.

Source: https://www.wlf.louisiana.gov/page/aerial-waterfowl-surveys

Previously used hand-written regex with two different format variants
(Format A: 2023+ numbers-then-species, Format B: 2019-2022 same-line).
Now uses LLM extraction (extractors/llm.py) which handles both formats
naturally without explicit branching logic.

URL discovery: LDWF changed file naming conventions in 2024 (e.g. "waterdec2024.pdf"
instead of "Louisiana_Aerial_Waterfowl_Survey_December_2024.pdf"). We now query
the LDWF resources AJAX endpoint to dynamically discover all current PDF URLs
instead of guessing URL patterns.
"""

import re
import logging
import requests

from huntstack_scrapers.parsers.base import ParseResult
from huntstack_scrapers.extractors.pdf import extract_counts_from_pdf_bytes

log = logging.getLogger(__name__)

_LDWF_BASE = "https://www.wlf.louisiana.gov"
_AJAX_URL = f"{_LDWF_BASE}/"
_AJAX_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "text/html, */*",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": f"{_LDWF_BASE}/resources/category/waterfowl/aerial-surveys",
}


def parse_ldwf_pdf(pdf_bytes: bytes) -> ParseResult | None:
    """
    Extract statewide species totals from an LDWF aerial survey PDF using LLM.

    Reads page 0 only — Table 1 with species counts by region and TOTALS column.
    The LLM is instructed to use the TOTALS (last column) for each species.
    """
    return extract_counts_from_pdf_bytes(
        pdf_bytes=pdf_bytes,
        survey_type="aerial_monthly",
        pages=[0],  # Page 1 only — Table 1 with current survey counts
    )


def _fetch_ldwf_pdf_urls_page(query: str) -> list[str]:
    """
    Query the LDWF resources AJAX endpoint and return all PDF hrefs found.

    LDWF uses a jQuery .load() call to /?action=resource._resources.snip
    with form params. The search (q_resources) param is used as a free-text
    filter. We run two queries: "Louisiana Aerial" (finds 2019-2023 surveys
    with the old naming convention) and "2024" / "2025" etc. (finds newer
    surveys with abbreviated names like waterdec2024.pdf).
    """
    params = {
        "action": "resource._resources.snip",
        "mainCategoryID": "waterfowl",
        "categoryID": "aerial-surveys",
        "q_resources": query,
        "startDate": "",
        "endDate": "",
        "publicationTypeID": "0",
        "pageNum": "1",
    }
    try:
        r = requests.get(_AJAX_URL, params=params, headers=_AJAX_HEADERS, timeout=15)
        r.raise_for_status()
        hrefs = re.findall(r'href=["\']([^"\']*\.pdf)["\']', r.text)
        return hrefs
    except Exception as e:
        log.error(f"LDWF AJAX query failed for {query!r}: {e}")
        return []


def fetch_ldwf_pdf_urls() -> list[str]:
    """
    Discover all LDWF aerial waterfowl survey PDF URLs via the AJAX resource endpoint.

    Runs multiple search queries to catch both old naming conventions (pre-2024)
    and new abbreviated names (2024+: waterdec2024.pdf, waterJan2025.pdf, etc.).
    Returns deduplicated absolute URLs.
    """
    from datetime import datetime

    # Build search queries: one broad + one per recent year to catch abbreviated names
    current_year = datetime.today().year
    queries = ["Louisiana Aerial Waterfowl Survey"]
    for year in range(2024, current_year + 2):
        queries.append(str(year))

    seen: set[str] = set()
    urls: list[str] = []

    for query in queries:
        hrefs = _fetch_ldwf_pdf_urls_page(query)
        for href in hrefs:
            # Make absolute
            if href.startswith("/"):
                href = _LDWF_BASE + href
            if href not in seen:
                seen.add(href)
                urls.append(href)
                log.debug(f"LDWF PDF discovered: {href}")

    log.info(f"LDWF: discovered {len(urls)} unique PDF URLs via AJAX")
    return urls
