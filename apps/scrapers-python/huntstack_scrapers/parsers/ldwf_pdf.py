"""
Parser for Louisiana LDWF aerial waterfowl survey PDFs.

LDWF conducts monthly aerial surveys Sep-Jan covering coastal Louisiana,
Little River Basin, NW and NE regions. PDFs contain Table 1 with species
counts by region and a TOTALS column.

Source: https://www.wlf.louisiana.gov/page/aerial-waterfowl-surveys

Previously used hand-written regex with two different format variants
(Format A: 2023+ numbers-then-species, Format B: 2019-2022 same-line).
Then the LLM (extractors/llm.py), which shifted species a row and stored total rows as
species in most surveys before Dec 2024. Since 2026-11-18 Table 1 is read by position again
(read_ldwf_table), every layout from 2019 on, checked against the table's own total rows; the
LLM is only the fallback.

URL discovery: file names change between seasons ("waterdec2024.pdf",
"Louisiana_Aerial_Waterfowl_Survey_December_2024.pdf"), so we read the list LDWF's own
resources page loads rather than guessing names.

LDWF redesigned the site in 2026: the old /resources/category/waterfowl/aerial-surveys page
now redirects to /resources?cat=45&s=16, and the old resource._resources.snip endpoint
returns an empty page (405 from GitHub Actions). The page's script (build/js/resources/
resources.js) now fetches /?action=resource._home_results.snip with the filter form's
fields: cat (45 = Waterfowl), s (16 = Aerial Surveys), sort_t, sort_o and pn (page).
"""

import re
import logging
import requests

from io import BytesIO

import pdfplumber

from huntstack_scrapers.parsers.base import ParseResult
from huntstack_scrapers.extractors.pdf import extract_counts_from_pdf_bytes
from huntstack_scrapers.species_mapping import resolve_species_slug

log = logging.getLogger(__name__)

_LDWF_BASE = "https://www.wlf.louisiana.gov"
_RESULTS_URL = f"{_LDWF_BASE}/"
_RESULTS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "text/html, */*",
    "Referer": f"{_LDWF_BASE}/resources?cat=45&s=16",
}
# Filter values from the resources page's <select>s: Waterfowl > Aerial Surveys
_CATEGORY = "45"
_SUBCATEGORY = "16"
# 12 results a page, newest first. One page is the last two seasons; every PDF listed is
# downloaded and read by the LLM on every run, and older surveys are already stored.
_PAGES = 1


# The LLM reads the species, which it sometimes gets wrong (Nov 2026: wigeon 2,000 where the
# table says 1,000). The table's own "TOTAL DUCKS" row is read here without it, and the
# species have to add up to it. One retry, since the LLM's reads vary from call to call.
_ATTEMPTS = 2
_NUMBER = re.compile(r"\d{1,3}(?:,\d{3})+|\d+")


def ldwf_total_ducks(text: str) -> int | None:
    """The statewide TOTAL DUCKS figure (the row's last number), or None if the layout hides it.

    Recent reports print "TOTAL DUCKS 438,000 169,000 79,000 686,000" on one line (a footnote
    "*" may follow a number). Some older ones put the numbers on another line; those return None.
    """
    for line in text.splitlines():
        if re.search(r"TOTAL\s*DUCKS", line, re.IGNORECASE):
            numbers = _NUMBER.findall(line.split("DUCKS", 1)[-1] if "DUCKS" in line else line)
            return int(numbers[-1].replace(",", "")) if numbers else None
    return None


def duck_sum(species_counts: dict[str, int]) -> int:
    """The species that count toward TOTAL DUCKS: stored species other than geese and swans
    (coots and the table's own total rows resolve to no species)."""
    total = 0
    for name, count in species_counts.items():
        slug = resolve_species_slug(name)
        if slug and "goose" not in slug and "swan" not in slug and isinstance(count, (int, float)):
            total += int(count)
    return total


def _page_text(pdf_bytes: bytes) -> str:
    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            return (pdf.pages[0].extract_text() or "") if pdf.pages else ""
    except Exception as e:
        log.error(f"LDWF: could not read the PDF's text: {e}")
        return ""


# ── Table 1, read by position (no LLM) ──
# Rows are a species label and its numbers: SW, SE, Little River Basin (or Catahoula), TOTALS.
# Layouts vary by year and even by row: numbers on the label's line ("MALLARD 64,000 21,000
# 3,000 88,000"), on the line above it, or split across both (Jan 2022: "1,000 ** 23,000" then
# "MALLARD 22,000"). A label takes its own numbers plus an unused numbers line just above it,
# and its total is the largest of them, since TOTALS is never smaller than a region. "*" or
# "**" is under 1,000 (0 here, as in LDWF's own totals); a row with no numbers is 0.
_TABLE_SPECIES = {
    "MALLARD": "Mallard", "MOTTLED": "Mottled Duck", "GADWALL": "Gadwall", "WIGEON": "American Wigeon",
    "GW TEAL": "Green-winged Teal", "BW TEAL": "Blue-winged Teal", "SHOVELER": "Northern Shoveler",
    "PINTAIL": "Northern Pintail", "SCAUP": "Scaup", "RINGNECKED": "Ring-necked Duck",
    "CANVASBACK": "Canvasback", "REDHEAD": "Redhead",
}
_DIVERS = {"Scaup", "Ring-necked Duck", "Canvasback", "Redhead"}
_TABLE_LABELS = sorted([*_TABLE_SPECIES, "DABBLERS", "DIVERS", "TOTAL DUCKS"], key=len, reverse=True)
_CELL = re.compile(r"^(\d{1,3}(?:,\.?\d{3})+\*?|\d+\*?|\*+)$")  # "2,.000" and "89,000*" occur
_REPORT_DATE = re.compile(
    r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$", re.IGNORECASE)


def _cells(s: str) -> list[str] | None:
    toks = s.split()
    return toks if toks and all(_CELL.match(t) for t in toks) else None


def _row_total(cells: list[str]) -> int:
    nums = [int(c.rstrip("*").replace(",", "").replace(".", "")) for c in cells if not c.startswith("*")]
    return max(nums) if nums else 0


def read_ldwf_table(text: str) -> tuple[dict[str, int], int] | None:
    """Table 1's species totals and TOTAL DUCKS, or None unless the species add up exactly to the
    table's own TOTAL DABBLERS, TOTAL DIVERS and TOTAL DUCKS rows. Species under 1,000 are left
    out. An empty table (a survey LDWF didn't complete) returns ({}, 0).

    Checked 2026-11-18 on all 32 coastal reports from Jan 2019 to Nov 2026: every one adds up.
    """
    lines = [l.strip() for l in text.splitlines()]
    start = next((i for i, l in enumerate(lines) if l.startswith("SPECIES")), None)
    if start is None:
        return None
    rows: dict[str, int] = {}
    pending: list[str] | None = None
    for l in lines[start + 1:]:
        if l.startswith(("COOTS", "COMMENTS")) or (l.startswith("*") and _cells(l) is None):
            break
        cells = _cells(l)
        if cells is not None:
            if pending is not None:
                return None  # two numbers lines in a row: not a layout this reader knows
            pending = cells
            continue
        if l == "TOTAL":
            continue
        if l.startswith("TOTAL ") and not l.startswith("TOTAL DUCKS") and _cells(l[6:]) is not None:
            if pending is not None:
                return None
            pending = _cells(l[6:])
            continue
        label = next((n for n in _TABLE_LABELS if l == n or l.startswith(n + " ")), None)
        if label is None:
            continue  # header lines ("LAKE", "Basin")
        own = l[len(label):].split()
        if own and _cells(" ".join(own)) is None:
            return None
        rows[_TABLE_SPECIES.get(label, label)] = _row_total(own + (pending or []))
        pending = None
    if not {"DABBLERS", "DIVERS", "TOTAL DUCKS"} <= rows.keys():
        return None
    species = {k: v for k, v in rows.items() if k in _TABLE_SPECIES.values()}
    dabblers = sum(v for k, v in species.items() if k not in _DIVERS)
    divers = sum(v for k, v in species.items() if k in _DIVERS)
    if (rows["DABBLERS"], rows["DIVERS"], rows["TOTAL DUCKS"]) != (dabblers, divers, dabblers + divers):
        return None
    return {k: v for k, v in species.items() if v > 0}, rows["TOTAL DUCKS"]


def ldwf_report_date(text: str) -> str | None:
    """The report's date, on its own line under the authors ("January 17, 2025", "Jan. 23, 2025")"""
    for line in text.splitlines():
        m = _REPORT_DATE.match(line.strip())
        if m:
            month = _MONTHS[m.group(1).lower()[:3]]
            return f"{int(m.group(3)):04d}-{month:02d}-{int(m.group(2)):02d}"
    return None


def parse_ldwf_pdf(pdf_bytes: bytes) -> ParseResult | None:
    """
    Statewide species totals from an LDWF aerial survey PDF.

    Table 1 is read by position first (read_ldwf_table): it must add up to the table's own
    total rows, and when it does it is stored as checked. An empty table is a survey LDWF
    didn't complete (Sept 2024, Hurricane Francine) and stores nothing.

    Otherwise the LLM reads page 0, and the species must add up to the table's TOTAL DUCKS.
    A read that doesn't is retried once and then dropped (None), so a misread is never stored;
    the run logs it as a warning. When the total can't be found, the read is kept and logged.
    An LLM read can add up and still be wrong (Sept 2025: 70,000 of the 101,000 blue-winged
    teal stored as green-winged), which is why the table comes first.
    """
    text = _page_text(pdf_bytes)
    table = read_ldwf_table(text)
    date = ldwf_report_date(text)
    if table is not None and date:
        species, total = table
        if total == 0:
            log.info(f"LDWF {date}: Table 1 has no ducks (survey not completed); nothing stored")
            return None
        return ParseResult(survey_date=date, species_counts=species, survey_type="aerial_monthly",
                           verified_total=total)
    log.info(f"LDWF {date}: Table 1 could not be read by position; using the LLM")
    expected = ldwf_total_ducks(text)
    got = None
    for attempt in range(1, _ATTEMPTS + 1):
        result = extract_counts_from_pdf_bytes(
            pdf_bytes=pdf_bytes,
            survey_type="aerial_monthly",
            pages=[0],  # Page 1 only — Table 1 with current survey counts
        )
        if result is None:
            return None
        if expected is None:
            log.info(f"LDWF {result.survey_date}: no TOTAL DUCKS figure found; species not checked")
            return result
        got = duck_sum(result.species_counts)
        if got == expected:
            result.verified_total = expected
            return result
        log.warning(
            f"LDWF {result.survey_date}: species add up to {got:,}, the table says {expected:,} "
            f"(attempt {attempt} of {_ATTEMPTS})"
        )
    log.warning(f"LDWF: dropped a survey whose species never matched TOTAL DUCKS {expected:,} (last read {got:,})")
    return None


def _fetch_ldwf_pdf_urls_page(page: int) -> list[str]:
    """One page of LDWF's Waterfowl > Aerial Surveys resource list, newest first: its PDF hrefs."""
    params = {
        "action": "resource._home_results.snip",
        "cat": _CATEGORY,
        "s": _SUBCATEGORY,
        "sort_t": "date",
        "sort_o": "desc",
        "pn": str(page),
    }
    try:
        r = requests.get(_RESULTS_URL, params=params, headers=_RESULTS_HEADERS, timeout=15)
        r.raise_for_status()
        return re.findall(r'href=["\']([^"\']*\.pdf)["\']', r.text, flags=re.IGNORECASE)
    except Exception as e:
        log.error(f"LDWF resource list failed for page {page}: {e}")
        return []


def fetch_ldwf_pdf_urls() -> list[str]:
    """
    The newest LDWF aerial waterfowl survey PDFs, as deduplicated absolute URLs.

    An empty list means the site changed again (or blocked us): the caller logs
    "Found 0 PDFs" and the pipeline records a warning.
    """
    seen: set[str] = set()
    urls: list[str] = []
    for page in range(1, _PAGES + 1):
        for href in _fetch_ldwf_pdf_urls_page(page):
            if href.startswith("/"):
                href = _LDWF_BASE + href
            if href not in seen:
                seen.add(href)
                urls.append(href)
                log.debug(f"LDWF PDF discovered: {href}")

    log.info(f"LDWF: discovered {len(urls)} PDF URLs from the resource list")
    return urls


_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7,
    "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
# A full month name or its three-letter form right before the year ("waternov2026",
# "Survey_January_2024"); not any word that happens to start with one ("summary-2024")
_FILE_MONTH_YEAR = re.compile(
    r"(january|february|march|april|may|june|july|august|september|october|november|december"
    r"|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[^a-z0-9]{0,3}(20\d\d)",
    re.IGNORECASE,
)


def fix_ldwf_survey_date(result: ParseResult, url: str) -> ParseResult:
    """
    Correct the survey year from the file name when the report's own date has a typo.

    waterjan2026.pdf (the January 2026 survey) is dated "Jan. 23, 2025" on its face; stored
    as read, it lands on the January 2025 survey. When the file name gives a month and year
    and the parsed date is in that month but another year, the file name's year wins.
    Any other disagreement is logged and left alone.
    """
    name = url.rsplit("/", 1)[-1]
    m = _FILE_MONTH_YEAR.search(name)
    if not m or not result.survey_date or len(result.survey_date) < 10:
        return result
    file_month, file_year = _MONTHS[m.group(1).lower()[:3]], int(m.group(2))
    year, month = int(result.survey_date[:4]), int(result.survey_date[5:7])
    if (year, month) == (file_year, file_month):
        return result
    if month == file_month:
        fixed = f"{file_year:04d}{result.survey_date[4:]}"
        log.warning(f"LDWF: {name} is dated {result.survey_date}; using {fixed} from the file name")
        result.survey_date = fixed
    else:
        log.warning(f"LDWF: {name} is dated {result.survey_date}, which does not match its file name")
    return result
