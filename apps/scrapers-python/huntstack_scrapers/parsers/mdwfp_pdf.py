"""
MDWFP aerial waterfowl survey reports: the Mississippi Delta, flown in November, December and
early January (some years also late January).

MDWFP lists every report on one page (REPORTS_URL), a few seasons back. Each report gives:
  - its flight dates on page 1 ("November 17 - 20, 2026");
  - Table 1: that month's estimates for every year since 2007 (mallards, other dabblers,
    divers, total ducks), the newest row being this survey;
  - Table 2: this survey against the long-term average.

Stored like AGFC's survey: "mallard" and "other ducks" (total ducks - mallards), so the two add
up to the report's total. Table 1's dabbler and diver columns are separate estimates and don't
add up to the total exactly (Nov 2026: 548 + 19,569 + 1,843 = 21,960 against 21,864), so they
aren't stored.

Every report's own survey is stored under its last flight day. Earlier years come from Table 1,
which gives no dates: each is stored on a fixed day of its month (HISTORY_DAY) and says so in its
notes, unless a report for that survey is on the page, whose real date wins. The source has
same_survey_within_days, so a survey stored under its real date is not stored again on the fixed
day once its report drops off MDWFP's page.
"""

import io
import logging
import re
import time
from dataclasses import dataclass
from datetime import date

import requests

from huntstack_scrapers.parsers.base import ParseResult

log = logging.getLogger(__name__)

REPORTS_URL = "https://www.mdwfp.com/wildlife-hunting/wildlife-species-program/waterfowl-program/aerial-survey-reports"
USER_AGENT = "HuntStack/1.0 (waterfowl migration research; https://huntstack.net)"
REQUEST_DELAY = 2  # seconds between downloads

_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], start=1)}
_MONTH = r"(January|February|March|April|May|June|July|August|September|October|November|December)"

# "November 17 - 20, 2026", "January 5-20, 2026", "November 30 - December 3, 2026"
_FLIGHT_DATES = re.compile(_MONTH + r"\.?\s+(\d{1,2})\s*[-–—]\s*(?:" + _MONTH + r"\.?\s+)?(\d{1,2}),\s*(\d{4})")
# "during the November survey", "during the early January survey", "during the late January"
_TABLE1 = re.compile(r"Table 1\..*?during the\s+(early |late )?" + _MONTH, re.IGNORECASE | re.DOTALL)
_NUM = r"(\d{1,3}(?:,\d{3})*)"
# "2007-08 25,872 34,241 27,992 88,106" (November) or "2007 50,368 ..." (December, January)
_ROW = re.compile(r"^(\d{4})(?:-\d{2})?\s+" + r"\s+".join([_NUM] * 4) + r"\s*$", re.MULTILINE)

# Where a Table 1 year with no report of its own is stored: mid-month, early/late January
HISTORY_DAY = {11: 15, 12: 15, (1, "early"): 10, (1, "late"): 25, 1: 10}


@dataclass
class Survey:
    month: int            # 11, 12 or 1
    part: str             # "early", "late" or "" (January has two surveys some years)
    year: int             # calendar year of the survey
    mallards: int
    total: int
    flown: date | None    # last flight day; None for a Table 1 year (date not given)


def _n(s: str) -> int:
    return int(s.replace(",", ""))


def parse_mdwfp_text(text: str) -> tuple[Survey, list[Survey]] | None:
    """(this report's survey, every earlier year in Table 1), or None if the text isn't a
    report this parser understands. The report's row must be Table 1's newest and agree with
    Table 2's mallard and total figures."""
    m = _FLIGHT_DATES.search(text)
    t1 = _TABLE1.search(text)
    if not m or not t1:
        return None
    m1, d1, m2, d2, year = m.groups()
    end_month = _MONTHS[(m2 or m1).lower()]
    flown = date(int(year), end_month, int(d2))
    part = (t1.group(1) or "").strip().lower()
    month = _MONTHS[t1.group(2).lower()]

    table1 = text[t1.start():]
    stop = re.search(r"^Average\b", table1, re.MULTILINE)
    if not stop:
        return None
    rows = [(int(r[0]), _n(r[1]), _n(r[4])) for r in _ROW.findall(table1[:stop.start()])]
    if len(rows) < 5:
        return None

    # The label is the season's first year in November ("2025-26") and the calendar year in
    # December and January
    def survey_year(label: int) -> int:
        return label

    *earlier, newest = rows
    if survey_year(newest[0]) != flown.year:
        log.warning(f"MDWFP: Table 1's newest row is {newest[0]}, the flights end {flown}; skipping")
        return None
    # Table 2: "Mallards 548 33,696 -98%" and "Total Ducks 21,864 233,238 -91%"
    t2_mall = re.search(r"^Mallards\s+" + _NUM + r"\s+" + _NUM, text, re.MULTILINE)
    t2_total = re.search(r"^Total Ducks\s+" + _NUM + r"\s+" + _NUM, text, re.MULTILINE)
    if not t2_mall or not t2_total or _n(t2_mall.group(1)) != newest[1] or _n(t2_total.group(1)) != newest[2]:
        log.warning(f"MDWFP {flown}: Table 1 and Table 2 disagree; skipping")
        return None

    this = Survey(month, part, flown.year, newest[1], newest[2], flown)
    history = [Survey(month, part, survey_year(y), mall, tot, None)
               for y, mall, tot in earlier if 0 < mall <= tot]
    return this, history


def _result(s: Survey) -> ParseResult:
    if s.flown:
        when = s.flown.isoformat()
        notes = "MDWFP aerial survey of the Mississippi Delta; other ducks = total ducks - mallards."
    else:
        day = HISTORY_DAY.get((s.month, s.part)) or HISTORY_DAY[s.month]
        when = date(s.year, s.month, day).isoformat()
        label = f"{s.part + ' ' if s.part else ''}{date(2000, s.month, 1):%B}"
        notes = (f"{label} {s.year} estimate from a later report's Table 1; MDWFP gives no flight "
                 f"dates for it, so it is stored on the {day}th.")
    return ParseResult(
        survey_date=when,
        species_counts={"mallard": s.mallards, "other ducks": s.total - s.mallards},
        notes=notes,
        survey_type="aerial_monthly",
        verified_total=s.total,
    )


def merge_reports(parsed: list[tuple[tuple[Survey, list[Survey]], str]]) -> list[tuple[ParseResult, str]]:
    """Each report's own survey, then every Table 1 year that no report on the page covers
    (the newest report's figure for it)."""
    out: list[tuple[ParseResult, str]] = []
    covered = set()
    for (this, _), url in parsed:
        key = (this.month, this.part, this.year)
        if key not in covered:
            covered.add(key)
            out.append((_result(this), url))
    newest_first = sorted(parsed, key=lambda p: p[0][0].flown or date.min, reverse=True)
    for (_, history), url in newest_first:
        for s in history:
            key = (s.month, s.part, s.year)
            if key not in covered:
                covered.add(key)
                out.append((_result(s), url))
    return out


def fetch_report_urls(headers: dict) -> list[str]:
    resp = requests.get(REPORTS_URL, timeout=30, headers=headers)
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code} from {REPORTS_URL}")
    urls = []
    for href in re.findall(r'href="([^"]+\.pdf)"', resp.text, re.IGNORECASE):
        if "aerial" in href.lower() and href not in urls:
            urls.append(href if href.startswith("http") else "https://www.mdwfp.com" + href)
    return urls


def report_text(pdf_bytes: bytes) -> str:
    """The first four pages: the text and tables. The rest are maps, slow to read."""
    import pdfplumber

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages[:4])


def fetch_mdwfp_results() -> list[tuple[ParseResult, str]]:
    headers = {"User-Agent": USER_AGENT}
    urls = fetch_report_urls(headers)
    log.info(f"MDWFP lists {len(urls)} aerial survey reports")
    parsed = []
    for url in urls:
        try:
            resp = requests.get(url, timeout=60, headers=headers)
            time.sleep(REQUEST_DELAY)
        except Exception as e:
            log.warning(f"MDWFP download failed for {url}: {e}")
            continue
        if resp.status_code != 200 or not resp.content.startswith(b"%PDF"):
            log.warning(f"MDWFP {url}: HTTP {resp.status_code}, not a PDF; skipping")
            continue
        p = parse_mdwfp_text(report_text(resp.content))
        if p:
            parsed.append((p, url))
        else:
            log.warning(f"MDWFP {url}: not read (layout changed?)")
    if urls and not parsed:
        raise RuntimeError("MDWFP: no report could be read")
    return merge_reports(parsed)
