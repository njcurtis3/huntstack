"""
Parser for Loess Bluffs NWR weekly waterfowl survey PDFs.

Loess Bluffs (MO, Central Flyway) publishes weekly PDF surveys with
species-level counts in a structured table format.

Each PDF contains 4 weeks of data in columns. We extract the most recent
week's counts (rightmost column).

PDF URL pattern:
  https://www.fws.gov/sites/default/files/documents/YYYY-MM/loess_bluffs_waterfowl_survey_YYYYMMDD.pdf

Source: https://www.fws.gov/library/collections/loess-bluffs-2025-waterfowl-and-bald-eagle-surveys
"""

import re
import pdfplumber
from io import BytesIO
from datetime import datetime, timedelta

from huntstack_scrapers.parsers.base import ParseResult, parse_count_value


# Aggregate/summary row names and non-species text to skip
_SKIP_NAMES = frozenset({
    "Species Group", "Bald Eagles", "Species",
    "Geese", "Dabblers", "Divers", "All Ducks",
    "Shorebirds", "Adult", "Immature", "All Eagles",
    "Habitat Condition", "Habitat Fair", "Habitat Good",
    "Habitat Poor", "Habitat Excellent",
})


def parse_loess_bluffs_pdf(pdf_bytes: bytes) -> ParseResult | None:
    """
    Extract the most recent week's species counts from a Loess Bluffs survey PDF.

    The PDF has a header with "Date: YYYY-MM-DD" and a table spanning 2 pages
    with 4 weeks of data. We extract the rightmost (most recent) column.
    """
    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                return None
            text = ""
            for page in pdf.pages:
                text += (page.extract_text() or "") + "\n"
    except Exception:
        return None

    if not text or len(text) < 100:
        return None

    # Extract survey date from "Date: 2026-01-06"
    date_match = re.search(r"Date:\s*(\d{4}-\d{2}-\d{2})", text)
    if not date_match:
        return None
    survey_date = date_match.group(1)

    # Extract the 4 column dates to find the most recent actual survey date
    column_dates = re.findall(r"(\d{2}/\d{2}/\d{4})", text)
    seen = set()
    unique_dates = []
    for d in column_dates:
        if d not in seen:
            seen.add(d)
            unique_dates.append(d)

    if unique_dates:
        last_date_str = unique_dates[-1]
        try:
            dt = datetime.strptime(last_date_str, "%m/%d/%Y")
            survey_date = dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Parse species counts from text lines.
    # Format: "Species Name    count1  count2  count3  count4"
    species_counts: dict[str, int] = {}

    species_line_pattern = re.compile(
        r"^([A-Z][A-Za-z\s\u2019'-]+?)\s+([\d,]+(?:\s+[\d,Present]+)*)\s*$",
        re.MULTILINE,
    )

    for match in species_line_pattern.finditer(text):
        species_name = match.group(1).strip()
        values_str = match.group(2).strip()

        if species_name in _SKIP_NAMES:
            continue
        # Skip non-species rows (habitat table text, headers)
        if any(w in species_name for w in ("Habitat", "Condition", "Acres", "Percentage", "Wetland")):
            continue

        values = re.findall(r"[\d,]+|Present", values_str)
        if not values:
            continue

        last_val = values[-1]
        if last_val == "Present":
            count = 1
        else:
            count = parse_count_value(last_val)

        if count is not None and count > 0:
            species_counts[species_name] = count

    if not species_counts:
        return None

    return ParseResult(
        survey_date=survey_date,
        species_counts=species_counts,
        survey_type="weekly",
    )


def generate_loess_bluffs_urls() -> list[str]:
    """
    Generate candidate PDF URLs for the current Loess Bluffs season.

    Surveys are weekly during Oct-Apr, typically published Mon-Thu.
    We try Mon/Tue/Wed/Thu each week (~120 URLs, checked via HEAD).
    """
    urls = []
    # Current season: Oct 2025 - Apr 2026
    start = datetime(2025, 10, 1)
    end = datetime(2026, 4, 30)

    # Find first Monday
    dt = start
    while dt.weekday() != 0:
        dt += timedelta(days=1)

    while dt <= end:
        for offset in range(4):  # Mon, Tue, Wed, Thu
            day = dt + timedelta(days=offset)
            url = (
                f"https://www.fws.gov/sites/default/files/documents/"
                f"{day.strftime('%Y-%m')}/loess_bluffs_waterfowl_survey_{day.strftime('%Y%m%d')}.pdf"
            )
            urls.append(url)
        dt += timedelta(days=7)

    return urls
