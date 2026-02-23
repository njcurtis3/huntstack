"""
Parser for Clarence Cannon NWR waterfowl survey HTML page.

The page has a wide-format table: species as rows, survey dates as columns.
Each cell is a count for that species on that date. The table covers a full
season (Oct–Mar) with ~25 weekly survey dates.

URL: https://www.fws.gov/refuge/clarence-cannon/clarence-cannon-nwr-waterfowl-surveys

Table format:
- Single <table class="table-striped"> (no <thead>, no <th> tags)
- First row: header with "SPECIES & CODE" + date strings (e.g., "10/3/22")
- Data rows: species name (possibly wrapped in <p>) + count cells
- Two logical sections separated by a blank row + repeated header row
  (ducks first, then other waterbirds)
- "TOTAL DUCKS" / summary rows: detected by bold <strong> → skipped
- Cell values may be wrapped in <p> tags

Returns a list[ParseResult], one per non-zero survey date in the table.
"""

import re
from datetime import datetime

from scrapy.http import Response

from huntstack_scrapers.parsers.base import ParseResult, parse_count_value


# Aggregate / summary row names to skip
_SKIP_NAMES = frozenset({
    "total ducks",
    "total geese",
    "total waterfowl",
    "total",
    "species & code",
    "species",
})


def _cell_text(cell) -> str:
    """Extract text from a <td>, stripping inner tags like <p> and <strong>."""
    return " ".join(cell.css("::text").getall()).strip()


def _parse_date_header(cell_text: str) -> str | None:
    """
    Try to parse a column header cell as a date.
    Handles formats: "10/3/22", "10/11/22", "01/04/23", "3/27/23"
    Returns YYYY-MM-DD string or None.
    """
    match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$", cell_text.strip())
    if not match:
        return None
    m, d, y = match.groups()
    year = int(y)
    if year < 100:
        year += 2000
    try:
        dt = datetime(year, int(m), int(d))
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return None


def _is_skip_row(first_cell: str) -> bool:
    """True if this row should be skipped (header, totals, blank)."""
    normalized = first_cell.lower().strip()
    if not normalized:
        return True
    for skip in _SKIP_NAMES:
        if skip in normalized:
            return True
    return False


def parse_clarence_cannon_html(response: Response) -> list[ParseResult]:
    """
    Parse the Clarence Cannon NWR waterfowl survey page.

    Returns a list of ParseResult — one per survey date column in the table
    that has at least one non-zero count.
    """
    table = response.css("table.table-striped")
    if not table:
        return []

    rows = table.css("tbody tr")
    if not rows:
        return []

    # --- Pass 1: extract date columns from header row(s) ---
    # The first row where td[0] contains "SPECIES" is the header.
    date_columns: list[str] = []  # YYYY-MM-DD per column index (index 0 = species col, skip)

    for row in rows:
        cells = row.css("td")
        if not cells:
            continue
        first = _cell_text(cells[0])
        if "SPECIES" in first.upper():
            # This is a header row — parse date columns
            date_columns = []
            for cell in cells[1:]:
                date_str = _parse_date_header(_cell_text(cell))
                date_columns.append(date_str or "")
            break  # use the first header row found

    if not date_columns:
        return []

    # --- Pass 2: accumulate counts per date column ---
    # counts_by_date[YYYY-MM-DD] = {species: count}
    counts_by_date: dict[str, dict[str, int]] = {}

    for row in rows:
        cells = row.css("td")
        if not cells:
            continue

        first = _cell_text(cells[0])

        # Skip blank rows and header rows
        if not first or "SPECIES" in first.upper():
            continue

        # Skip totals and summary rows
        if _is_skip_row(first):
            continue

        # Clean species name — strip trailing code like " (MALL)" or " (NOPI)"
        species_name = re.sub(r"\s*\([A-Z/]+\)\s*$", "", first).strip()
        if not species_name:
            continue

        # Read counts from each date column
        data_cells = cells[1:]
        for i, cell in enumerate(data_cells):
            if i >= len(date_columns):
                break
            date_str = date_columns[i]
            if not date_str:
                continue

            count = parse_count_value(_cell_text(cell))
            if count is None or count == 0:
                continue

            if date_str not in counts_by_date:
                counts_by_date[date_str] = {}
            counts_by_date[date_str][species_name] = count

    if not counts_by_date:
        return []

    # --- Build one ParseResult per date ---
    results = []
    for date_str, species_counts in sorted(counts_by_date.items()):
        results.append(ParseResult(
            survey_date=date_str,
            species_counts=species_counts,
            survey_type="weekly",
        ))

    return results
