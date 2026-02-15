"""
Parser for Louisiana LDWF aerial waterfowl survey PDFs.

LDWF conducts monthly aerial surveys Sep-Jan covering coastal Louisiana,
Little River Basin, NW and NE regions. PDFs contain Table 1 with species
counts by region and a TOTALS column.

URL pattern (both separators work):
  .../Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_{Month}_{Year}.pdf
  .../Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-{Month}-{Year}.pdf

Source: https://www.wlf.louisiana.gov/page/aerial-waterfowl-surveys
"""

import re
import pdfplumber
from io import BytesIO
from datetime import datetime

from huntstack_scrapers.parsers.base import ParseResult, parse_count_value


# Map LDWF uppercase species names to our standard names
_LDWF_SPECIES_MAP = {
    "MALLARD": "Mallard",
    "MOTTLED": None,  # Mottled Duck — skip for V1
    "GADWALL": None,  # skip for V1
    "WIGEON": None,  # American Wigeon — skip
    "GW TEAL": "Green-winged Teal",
    "BW TEAL": "Blue-winged Teal",
    "SHOVELER": None,  # Northern Shoveler — skip
    "PINTAIL": "Northern Pintail",
    "SCAUP": None,  # skip
    "RINGNECKED": None,  # Ring-necked Duck — skip
    "CANVASBACK": None,  # skip
    "COOTS": None,  # skip
    "TOTAL DABBLERS": None,
    "TOTAL DIVERS": None,
    "TOTAL DUCKS": None,
}


def parse_ldwf_pdf(pdf_bytes: bytes) -> ParseResult | None:
    """
    Extract statewide species totals from an LDWF aerial survey PDF.

    The PDF's page 0 has Table 1 with columns:
      SPECIES | SOUTHWEST | SOUTHEAST | Little River Basin | TOTALS

    pdfplumber extracts numbers on one line, species name on the next.
    The TOTALS value is the last number on each line.
    """
    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                return None
            text = pdf.pages[0].extract_text() or ""
    except Exception:
        return None

    if not text or len(text) < 100:
        return None

    # Extract date from header.
    # Pattern: "November 9, 2023" or "January 15, 2026"
    date_match = re.search(
        r"((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})",
        text,
    )
    if not date_match:
        return None

    date_str = date_match.group(1).replace(",", ",").strip()
    try:
        dt = datetime.strptime(date_str, "%B %d, %Y")
    except ValueError:
        try:
            dt = datetime.strptime(date_str, "%B %d %Y")
        except ValueError:
            return None
    survey_date = dt.strftime("%Y-%m-%d")

    # Parse Table 1 — two format variants exist across years:
    #
    # Format A (2023+): numbers on one line, species name on the next:
    #   2,000 2,000 2,000 6,000
    #   MALLARD
    #
    # Format B (2019-2022): species name and numbers on the same line:
    #   MALLARD 18,000 2,000 ** 20,000
    species_counts: dict[str, int] = {}

    lines = text.split("\n")
    for i, line in enumerate(lines):
        stripped = line.strip()
        upper = stripped.upper()

        # --- Format A: line is just a species name ---
        if upper in _LDWF_SPECIES_MAP:
            mapped_name = _LDWF_SPECIES_MAP[upper]
            if mapped_name is None:
                continue
            if i > 0:
                prev_line = lines[i - 1].strip()
                numbers = re.findall(r"[\d,]+", prev_line)
                if numbers:
                    total = parse_count_value(numbers[-1])
                    if total is not None and total > 0:
                        species_counts[mapped_name] = total
            continue

        # --- Format B: species name followed by numbers on same line ---
        for species_key, mapped_name in _LDWF_SPECIES_MAP.items():
            if mapped_name is None:
                continue
            if upper.startswith(species_key + " "):
                rest = stripped[len(species_key):].strip()
                numbers = re.findall(r"[\d,]+", rest)
                if numbers:
                    total = parse_count_value(numbers[-1])
                    if total is not None and total > 0:
                        species_counts[mapped_name] = total
                break

    # Also try to extract goose counts from the comments/narrative.
    # LDWF sometimes mentions geese in the text but not in the duck table.
    # Look for patterns like "X,XXX snow geese" or "X,XXX geese"
    goose_patterns = [
        (re.compile(r"([\d,]+)\s+(?:snow|light)\s+geese", re.IGNORECASE), "Snow Goose"),
        (re.compile(r"([\d,]+)\s+(?:white-fronted|specklebelly)\s+geese", re.IGNORECASE), "Greater White-fronted Goose"),
    ]
    for pattern, name in goose_patterns:
        match = pattern.search(text)
        if match:
            val = parse_count_value(match.group(1))
            if val and val > 100:
                species_counts[name] = val

    if not species_counts:
        return None

    # Extract observers from "Reported By:" line
    observers = None
    obs_match = re.search(r"Reported By:\s*(.+?)(?:\n|Pilot)", text, re.DOTALL)
    if obs_match:
        observers = re.sub(r"\s+", " ", obs_match.group(1).strip())

    return ParseResult(
        survey_date=survey_date,
        species_counts=species_counts,
        observers=observers,
        survey_type="aerial_monthly",
    )


def generate_ldwf_urls() -> list[str]:
    """
    Generate candidate PDF URLs for all LDWF aerial surveys.

    Surveys run monthly Sep-Jan. Both underscore and hyphen URL patterns
    exist — we only need one (underscore is more consistent).
    """
    base = "https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys"
    months = ["September", "October", "November", "December", "January"]
    urls = []

    for year in range(2019, 2027):
        for month in months:
            # Both underscore and hyphen URL patterns exist across years
            urls.append(f"{base}/Louisiana_Aerial_Waterfowl_Survey_{month}_{year}.pdf")
            urls.append(f"{base}/Louisiana-Aerial-Waterfowl-Survey-{month}-{year}.pdf")

    return urls
