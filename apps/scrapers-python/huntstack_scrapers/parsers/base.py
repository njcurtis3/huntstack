"""
Base types and shared utilities for waterfowl count parsers.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ParseResult:
    """Standardized output from any waterfowl count parser."""
    survey_date: str  # YYYY-MM-DD
    species_counts: dict[str, int]  # raw species name → count
    observers: str | None = None
    notes: str | None = None
    survey_type: str = "weekly"  # weekly, aerial_biweekly, etc.


# Shared date extraction patterns
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
    """Extract and normalize survey date from text. Returns YYYY-MM-DD or None."""
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            date_str = match.group(1)
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


def extract_observers(text: str) -> str | None:
    """Extract observer names from survey text."""
    obs_match = re.search(
        r"OBSERVER\(?S?\)?\s*:\s*(.+?)(?=\s*(?:TEMP|WEATHER|WIND|DUCK|GOOSE|LAKE|DATE|\d+\s*F\b))",
        text, re.IGNORECASE,
    )
    if obs_match:
        return obs_match.group(1).strip().rstrip(",. ")
    return None


def extract_table_counts(response) -> dict[str, int]:
    """Extract species:count pairs from HTML tables in a Scrapy response."""
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

    return species_counts


def extract_counts_from_text(text: str) -> dict[str, int]:
    """Fallback: extract species:count pairs from unstructured text."""
    counts: dict[str, int] = {}

    pattern = re.compile(
        r"([A-Z][a-z]+(?:[-/\s][A-Za-z']+)*)\s*[:]\s*([\d,]+)"
        r"|([A-Z][a-z]+(?:[-/\s][A-Za-z']+)*)\s+([\d,]+)"
    )

    skip_words = {
        "total", "grand", "date", "observer", "temperature",
        "wind", "weather", "lake", "level", "conditions",
        "page", "section", "chapter",
    }

    for match in pattern.finditer(text):
        if match.group(1):
            name, count_str = match.group(1), match.group(2)
        else:
            name, count_str = match.group(3), match.group(4)

        name = name.strip()
        count = parse_count_value(count_str)

        if name.lower() in skip_words:
            continue
        if count is not None and count > 0:
            counts[name] = count

    return counts
