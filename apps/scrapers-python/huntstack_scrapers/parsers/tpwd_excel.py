"""
Parser for TPWD Mid-Winter Waterfowl Survey Excel files.

TPWD publishes two Excel files at:
https://tpwd.texas.gov/huntwild/wild/game_management/waterfowl/

1. mw_estimates_97-18.xls  — historical 1997-2018, "State Wide estimates" sheet
   Layout: row 2 = year headers (cols 2–23), rows 3+ = species rows (col 1 = name)
   Skip total rows ("TOTAL DABBLERS", "TOTAL DIVERS", "TOTAL DUCKS")

2. tx-mws-yearly-summary.xls — current, one sheet per year ("MWS 2018", etc.)
   Layout: col 0 = species name, col 8 = state total (header row 1 says "2018 STATE TOTALS")
   Row 0 = zone headers, row 1 = column labels, rows 2+ = species data

Survey dates are set to YYYY-01-15 (mid-January convention, matching when surveys occur).
"""

import re
import logging
import requests
from io import BytesIO
from datetime import datetime

from huntstack_scrapers.parsers.base import ParseResult
from huntstack_scrapers.species_mapping import resolve_species_slug

log = logging.getLogger(__name__)

_TPWD_BASE = "https://tpwd.texas.gov"
_WATERFOWL_PAGE = f"{_TPWD_BASE}/huntwild/wild/game_management/waterfowl/"

# Species names to skip (total rows, blank rows)
_SKIP_NAMES = {
    "total dabblers", "total divers", "total ducks", "total geese",
    "total swans", "total coots", "total", "survey zone",
}


def fetch_tpwd_excel_urls() -> list[str]:
    """
    Fetch the TPWD waterfowl management page and return absolute URLs
    to all .xls/.xlsx links found.
    """
    try:
        resp = requests.get(
            _WATERFOWL_PAGE,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            timeout=20,
        )
        resp.raise_for_status()
    except Exception as e:
        log.error(f"Failed to fetch TPWD waterfowl page: {e}")
        return []

    urls: list[str] = []
    seen: set[str] = set()
    for match in re.finditer(r'href=["\']([^"\']+\.xls[x]?)["\']', resp.text, re.IGNORECASE):
        href = match.group(1)
        if href.startswith("/"):
            href = _TPWD_BASE + href
        elif not href.startswith("http"):
            href = _TPWD_BASE + "/" + href.lstrip("/")
        if href not in seen:
            seen.add(href)
            urls.append(href)
            log.debug(f"TPWD Excel discovered: {href}")

    log.info(f"TPWD: discovered {len(urls)} Excel URLs")
    return urls


def parse_tpwd_excel(excel_bytes: bytes, filename: str) -> list[ParseResult]:
    """
    Parse a TPWD Mid-Winter Survey Excel file.

    Detects format by filename:
    - mw_estimates_97-18.xls  → multi-year historical (parse_historical)
    - tx-mws-yearly-summary.xls → per-sheet yearly (parse_yearly_summary)

    Returns a list of ParseResult objects, one per survey year.
    """
    try:
        import pandas as pd
    except ImportError:
        log.error("pandas not installed — cannot parse Excel files")
        return []

    fname = filename.lower()

    if "estimates_97" in fname or "estimates" in fname:
        return _parse_historical(excel_bytes)
    elif "yearly-summary" in fname or "yearly_summary" in fname or "summary" in fname:
        return _parse_yearly_summary(excel_bytes)
    else:
        # Try yearly summary first (more recent data), fallback to historical
        results = _parse_yearly_summary(excel_bytes)
        if not results:
            results = _parse_historical(excel_bytes)
        return results


def _parse_historical(excel_bytes: bytes) -> list[ParseResult]:
    """
    Parse mw_estimates_97-18.xls.
    Sheet: 'State Wide estimates'
    Row 2: year headers starting at col 2
    Rows 3+: species in col 1, counts in cols 2–N
    """
    import pandas as pd

    try:
        df = pd.read_excel(BytesIO(excel_bytes), sheet_name="State Wide estimates", header=None)
    except Exception as e:
        log.error(f"Failed to read historical Excel: {e}")
        return []

    # Row 2 (index 2) contains year headers
    header_row = df.iloc[2]
    year_cols: dict[int, int] = {}  # col_index → year
    for col_idx, val in enumerate(header_row):
        try:
            year = int(float(str(val)))
            if 1990 <= year <= 2030:
                year_cols[col_idx] = year
        except (ValueError, TypeError):
            pass

    if not year_cols:
        log.warning("No year columns found in historical Excel")
        return []

    # Accumulate counts per year
    counts_by_year: dict[int, dict[str, int]] = {y: {} for y in year_cols.values()}

    for row_idx in range(3, len(df)):
        row = df.iloc[row_idx]
        species_raw = str(row.iloc[1]).strip() if not _is_blank(row.iloc[1]) else ""
        if not species_raw:
            continue
        if species_raw.lower() in _SKIP_NAMES:
            continue

        slug = resolve_species_slug(species_raw)
        if slug is None:
            log.debug(f"No slug for species: {species_raw!r}")
            continue

        for col_idx, year in year_cols.items():
            val = row.iloc[col_idx]
            count = _parse_count(val)
            if count is not None and count > 0:
                # Sum in case multiple rows resolve to same slug
                counts_by_year[year][slug] = counts_by_year[year].get(slug, 0) + count

    results: list[ParseResult] = []
    for year in sorted(counts_by_year.keys()):
        species_counts = counts_by_year[year]
        if not species_counts:
            continue
        results.append(ParseResult(
            survey_date=f"{year}-01-15",
            species_counts=species_counts,
            survey_type="annual_midwinter",
        ))

    log.info(f"Historical Excel: parsed {len(results)} survey years")
    return results


def _parse_yearly_summary(excel_bytes: bytes) -> list[ParseResult]:
    """
    Parse tx-mws-yearly-summary.xls.
    Each sheet is named "MWS YYYY". Layout:
    - Row 0: zone column headers
    - Row 1: includes "YYYY STATE TOTALS" in col 8
    - Rows 2+: species name (col 0), statewide total (col 8)
    """
    import pandas as pd

    try:
        all_sheets = pd.read_excel(BytesIO(excel_bytes), sheet_name=None, header=None)
    except Exception as e:
        log.error(f"Failed to read yearly summary Excel: {e}")
        return []

    results: list[ParseResult] = []

    for sheet_name, df in all_sheets.items():
        # Extract year from sheet name ("MWS 2018" → 2018)
        year_match = re.search(r"(\d{4})", str(sheet_name))
        if not year_match:
            continue
        year = int(year_match.group(1))

        # Find state total column — look in row 1 for a cell containing "STATE TOTAL"
        if df.shape[0] < 3 or df.shape[1] < 9:
            continue

        total_col = None
        for col_idx in range(df.shape[1]):
            cell = str(df.iloc[1, col_idx]).strip()
            if "state total" in cell.lower():
                total_col = col_idx
                break
        if total_col is None:
            # Default to col 8 (known position from inspection)
            total_col = 8

        species_counts: dict[str, int] = {}

        for row_idx in range(2, df.shape[0]):
            species_raw = str(df.iloc[row_idx, 0]).strip() if not _is_blank(df.iloc[row_idx, 0]) else ""
            if not species_raw:
                continue
            if species_raw.lower() in _SKIP_NAMES:
                continue

            slug = resolve_species_slug(species_raw)
            if slug is None:
                log.debug(f"No slug for species: {species_raw!r}")
                continue

            count = _parse_count(df.iloc[row_idx, total_col])
            if count is not None and count > 0:
                species_counts[slug] = species_counts.get(slug, 0) + count

        if species_counts:
            results.append(ParseResult(
                survey_date=f"{year}-01-15",
                species_counts=species_counts,
                survey_type="annual_midwinter",
            ))

    results.sort(key=lambda r: r.survey_date)
    log.info(f"Yearly summary Excel: parsed {len(results)} survey years")
    return results


def _is_blank(val) -> bool:
    """Return True if a cell value is blank/NaN."""
    if val is None:
        return True
    import math
    try:
        return math.isnan(float(val))
    except (ValueError, TypeError):
        return str(val).strip() in ("", "nan", "None", "NaN")


def _parse_count(val) -> int | None:
    """Parse a cell value to an integer count."""
    if _is_blank(val):
        return None
    try:
        f = float(val)
        if f < 0:
            return None
        return int(round(f))
    except (ValueError, TypeError):
        return None
