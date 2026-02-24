"""
Parser for Arkansas Game & Fish Commission aerial waterfowl survey PDFs.

AGFC publishes biweekly aerial survey reports as PDFs via Google Drive.
Each PDF contains narrative text on page 1 with statewide species counts,
plus historical tables and maps on subsequent pages.

Source: https://www.agfc.com/education/waterfowl-surveys-and-reports/

Previously used hand-written regex patterns to extract dates and species.
Now uses LLM extraction (extractors/llm.py) for resilience — the AGFC
narrative style varies between authors and survey periods.
"""

import re

from huntstack_scrapers.parsers.base import ParseResult
from huntstack_scrapers.extractors.pdf import extract_counts_from_pdf_bytes


def parse_agfc_pdf(pdf_bytes: bytes) -> ParseResult | None:
    """
    Extract survey data from an AGFC aerial survey PDF using LLM extraction.

    Reads page 0 only — the narrative with current survey counts.
    Pages 1+ contain historical tables that would confuse species totals.
    """
    return extract_counts_from_pdf_bytes(
        pdf_bytes=pdf_bytes,
        survey_type="aerial_biweekly",
        pages=[0],  # Page 1 only — narrative with current counts
    )


def parse_agfc_index(response) -> list[str]:
    """
    Parse the AGFC waterfowl reports index page to extract PDF links.
    Returns Google Drive download URLs for the current season's PDFs.

    Note: Called by the spider to discover PDF URLs,
    not to extract count data directly.
    """
    links = response.css('a[href*="drive.google.com"]::attr(href)').getall()
    pdf_urls = []

    for link in links:
        file_id_match = re.search(r"/d/([a-zA-Z0-9_-]+)", link)
        if file_id_match:
            file_id = file_id_match.group(1)
            download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            pdf_urls.append(download_url)

    return pdf_urls
