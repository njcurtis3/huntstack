"""
Parser for Arkansas Game & Fish Commission aerial waterfowl survey PDFs.

AGFC publishes biweekly aerial survey reports as PDFs via Google Drive.
Each PDF contains narrative text on page 1 with statewide species counts,
plus historical tables and maps on subsequent pages.

Source: https://www.agfc.com/education/waterfowl-surveys-and-reports/
"""

import re
import pdfplumber
from io import BytesIO
from datetime import datetime

from huntstack_scrapers.parsers.base import ParseResult, parse_count_value


# Date patterns found in AGFC PDF titles/headers
AGFC_DATE_PATTERNS = [
    # "January 19-23, 2026" (survey range — use end date)
    re.compile(r"((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:-\d{1,2})?,?\s+\d{4})"),
    # "Dec. 10, 15-23, 2025" (abbreviated month)
    re.compile(r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:[,-]\s*\d{1,2})?,?\s+\d{4})"),
]

# Species extraction patterns from AGFC narrative text.
# AGFC reports mallards and total ducks by region, plus goose species statewide.
AGFC_SPECIES_PATTERNS = [
    # "estimated 337,479 mallards"
    (re.compile(r"estimated\s+([\d,]+)\s+mallards", re.IGNORECASE), "Mallard"),
    # "694,286 total ducks"
    (re.compile(r"([\d,]+)\s+total\s+ducks", re.IGNORECASE), None),  # skip totals
    # "1,478,989 light (lesser snow and Ross's) geese" or "lesser snow and Ross's geese"
    (re.compile(r"([\d,]+)\s+light\s*\(lesser\s+snow\s+and\s+Ross.s\)\s*geese", re.IGNORECASE), "Snow/Ross's Goose"),
    # "246,472 greater white-fronted geese"
    (re.compile(r"([\d,]+)\s+greater\s+white-fronted\s+geese", re.IGNORECASE), "Greater White-fronted Goose"),
    # "X,XXX Canada geese" (sometimes mentioned)
    (re.compile(r"([\d,]+)\s+Canada\s+geese", re.IGNORECASE), "Canada Goose"),
    # Fallback: "estimated X,XXX mallards and Y,YYY total ducks"
    (re.compile(r"([\d,]+)\s+mallards\s+and\s+([\d,]+)\s+total\s+ducks", re.IGNORECASE), None),
]

# Aggregate regional mallard counts from text like:
# "estimated 337,479 mallards" in Delta
# "including 12,075 mallards" in ARV
# "with 8,030 of those being mallards" in SW
MALLARD_PATTERNS = [
    re.compile(r"(?:estimated|totaled?|including|reported)\s+([\d,]+)\s+mallards", re.IGNORECASE),
    re.compile(r"([\d,]+)\s+(?:of those being|being)\s+mallards", re.IGNORECASE),
    re.compile(r"([\d,]+)\s+mallards", re.IGNORECASE),
]


def parse_agfc_date(text: str) -> str | None:
    """Extract survey date from AGFC PDF text. Uses the last date in a range."""
    for pattern in AGFC_DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            date_str = match.group(1)
            # Handle range like "January 19-23, 2026" — extract end date
            range_match = re.search(
                r"(\w+\.?)\s+\d{1,2}-(\d{1,2}),?\s+(\d{4})", date_str
            )
            if range_match:
                month = range_match.group(1).rstrip(".")
                day = range_match.group(2)
                year = range_match.group(3)
                date_str = f"{month} {day}, {year}"

            # Handle "Dec. 10, 15-23, 2025" → "Dec 23, 2025"
            multi_match = re.search(
                r"(\w+\.?)\s+\d{1,2},?\s+\d{1,2}-(\d{1,2}),?\s+(\d{4})", date_str
            )
            if multi_match:
                month = multi_match.group(1).rstrip(".")
                day = multi_match.group(2)
                year = multi_match.group(3)
                date_str = f"{month} {day}, {year}"

            for fmt in ("%B %d, %Y", "%B %d %Y", "%b %d, %Y", "%b %d %Y"):
                try:
                    dt = datetime.strptime(date_str.replace(",", ",").strip(), fmt)
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    continue
    return None


def parse_agfc_pdf(pdf_bytes: bytes) -> ParseResult | None:
    """
    Extract survey data from an AGFC aerial survey PDF.
    Reads page 1 narrative to get current survey counts.
    """
    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                return None

            # Only page 0 — the narrative with current survey counts.
            # Pages 1+ contain historical tables with large cumulative numbers
            # that would incorrectly inflate the current count via max().
            text = pdf.pages[0].extract_text() or ""
    except Exception:
        return None

    if not text or len(text) < 100:
        return None

    # Extract date from header
    survey_date = parse_agfc_date(text)
    if not survey_date:
        return None

    species_counts: dict[str, int] = {}

    # Extract mallard count — sum all regional mentions
    # The first/largest mention is typically the Delta (main) estimate
    mallard_counts = []
    for pattern in MALLARD_PATTERNS:
        for m in pattern.finditer(text):
            val = parse_count_value(m.group(1))
            if val and val > 1000:  # filter noise
                mallard_counts.append(val)

    if mallard_counts:
        # Sum all regional estimates (Delta + ARV + SW Arkansas)
        species_counts["Mallard"] = sum(mallard_counts)

    # Extract snow/Ross's geese
    snow_match = re.search(
        r"([\d,]+)\s+light\s*\(?lesser\s+snow\s+and\s+Ross.s\)?\s*geese",
        text, re.IGNORECASE,
    )
    if snow_match:
        val = parse_count_value(snow_match.group(1))
        if val:
            species_counts["Snow/Ross's Goose"] = val

    # Extract white-fronted geese
    wfg_match = re.search(
        r"([\d,]+)\s+greater\s+white-fronted\s+geese",
        text, re.IGNORECASE,
    )
    if wfg_match:
        val = parse_count_value(wfg_match.group(1))
        if val:
            species_counts["Greater White-fronted Goose"] = val

    # Extract Canada geese if mentioned
    cg_match = re.search(r"([\d,]+)\s+Canada\s+geese", text, re.IGNORECASE)
    if cg_match:
        val = parse_count_value(cg_match.group(1))
        if val:
            species_counts["Canada Goose"] = val

    if not species_counts:
        return None

    # Extract observers from the opening paragraph
    observers = None
    obs_match = re.search(
        r"employees?\s+(.+?)\s+conducted",
        text, re.IGNORECASE,
    )
    if obs_match:
        observers = obs_match.group(1).strip()

    return ParseResult(
        survey_date=survey_date,
        species_counts=species_counts,
        observers=observers,
        survey_type="aerial_biweekly",
    )


def parse_agfc_index(response) -> list[str]:
    """
    Parse the AGFC waterfowl reports index page to extract PDF links.
    Returns Google Drive file IDs for the current season's PDFs.

    Note: This is called by the spider to discover PDF URLs,
    not to extract count data directly.
    """
    # Extract Google Drive links
    links = response.css('a[href*="drive.google.com"]::attr(href)').getall()
    pdf_urls = []

    for link in links:
        # Convert share links to direct download: extract file ID
        file_id_match = re.search(r"/d/([a-zA-Z0-9_-]+)", link)
        if file_id_match:
            file_id = file_id_match.group(1)
            download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            pdf_urls.append(download_url)

    return pdf_urls
