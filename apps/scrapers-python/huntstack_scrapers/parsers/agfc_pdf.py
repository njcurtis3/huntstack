"""
Parser for Arkansas Game & Fish Commission aerial waterfowl survey PDFs.

AGFC publishes three or four aerial survey reports a winter (December, the January midwinter
survey, late January) as Google Drive PDFs linked from its index page:
https://www.agfc.com/education/waterfowl-surveys-and-reports/

Page 1 opens with one paragraph that gives every number we store, in very regular wording:

    "...in the Delta estimated 337,479 mallards and 694,286 total ducks (Table 1), while duck
    population estimates in the Arkansas River Valley totaled 25,542 ducks, including 12,075
    mallards (Table 2). Staff performing cruise surveys in southwest Arkansas reported an
    estimated 19,365 ducks, with 8,030 of those being mallards (Table 2). Arctic goose population
    estimates totaled 1,478,989 light (lesser snow and Ross's) geese and 246,472 greater
    white-fronted geese in the Delta."

So this reads it with patterns, not an LLM. The LLM extractor it replaced (until 2026-10-27)
stored only the Delta's mallards, took "531,850 mallards below the long-term average" as the
mallard count, put the combined light-goose figure in both snow and Ross's goose, and stored
southwest Arkansas's 4,500 light geese as Ross's geese.

What gets stored, statewide (Delta + Arkansas River Valley + southwest Arkansas):
- mallard: mallards
- other-ducks: total ducks minus mallards. AGFC only splits out mallards. Storing the remainder
  instead of "total ducks" keeps every sum across species correct (mallard + other ducks = AGFC's
  total ducks) without the API having to know a total row from a species row.
- snow-goose: light geese (AGFC counts lesser snow and Ross's geese together)
- white-fronted-goose: greater white-fronted geese
The regional breakdown goes in ParseResult.notes, which is stored on every row.

A report whose wording no longer matches returns None and is logged, instead of storing a
guess; the data pipeline then flags the source.
"""

from __future__ import annotations

import logging
import re

from huntstack_scrapers.parsers.base import ParseResult

log = logging.getLogger(__name__)

_NUM = r"(\d{1,3}(?:,\d{3})+|\d+)"
_MONTHS = ("January February March April May June July August September October November "
           "December").split()
_MONTH_RE = "|".join(_MONTHS)

# Delta (Mississippi Alluvial Valley): "estimated 334,110 mallards and 544,705 total ducks",
# or the December 2023 order: "estimated 449,860 total ducks, 79,365 of which were mallards"
_DELTA = [
    (re.compile(rf"Delta,? (?:and )?estimated {_NUM} mallards and {_NUM} total ducks", re.I), "mallards_first"),
    (re.compile(rf"Delta,? (?:and )?estimated {_NUM} total ducks,? {_NUM} of which were mallards", re.I), "ducks_first"),
]
# "...in the Arkansas River Valley totaled 24,110 ducks, including 15,985 mallards"
# "...in the Arkansas River Valley were 21,347 total ducks, including 3,841 mallards"
# "17,878 ducks in the Arkansas River Valley, including 9,920 mallards"
_ARV = [
    re.compile(rf"Arkansas River Valley (?:totaled|were) {_NUM} (?:total )?ducks,? including {_NUM} mallards", re.I),
    re.compile(rf"{_NUM} (?:total )?ducks in the Arkansas River Valley,? including {_NUM} mallards", re.I),
]
# "southwest Arkansas reported an estimated 6,125 ducks, with 1,805 of those being mallards"
# "southwest Arkansas and estimated 7,960 ducks with 3,710 of those being mallards"
# "southwest Arkansas reported an estimated 28,200 ducks with 2,980 mallards"
_SW = re.compile(
    rf"southwest Arkansas[^.]*?estimated {_NUM} (?:total )?ducks,? with {_NUM} (?:of (?:those|which) (?:being|were) )?mallards",
    re.I,
)
# "totaled 1,409,809 light (lesser snow and Ross's) geese and 466,550 greater white-fronted geese"
_DELTA_GEESE = re.compile(
    rf"{_NUM} light (?:\([^)]*\) )?geese and {_NUM} greater white-?\s?fronted geese in the Delta", re.I)
# "Biologists noted 4,500 light geese and 1,000 greater white-fronted geese in southwest Arkansas."
_SW_GEESE = re.compile(
    rf"{_NUM} light (?:\([^)]*\) )?geese and {_NUM} greater white-?\s?fronted geese in southwest Arkansas", re.I)


def _n(s: str) -> int:
    return int(s.replace(",", ""))


def _fmt(n: int) -> str:
    return f"{n:,}"


def parse_report_date(header: str) -> str | None:
    """The survey's last day, from the report title's date range:
    "January 5-13, 2026" -> 2026-01-13; "January 19-20, January 25-February 1, 2024" -> 2024-02-01;
    "December 10; December 15-23, 2025" -> 2025-12-23."""
    year = re.search(r"\b(20\d\d)\b", header)
    if not year:
        return None
    before_year = header[:year.start()]
    months = list(re.finditer(rf"\b({_MONTH_RE})\b", before_year))
    if not months:
        return None
    last_month = months[-1]
    days = re.findall(r"\b(\d{1,2})\b", before_year[last_month.end():])
    if not days:
        return None
    month = _MONTHS.index(last_month.group(1)) + 1
    return f"{year.group(1)}-{month:02d}-{int(days[-1]):02d}"


def parse_agfc_text(text: str) -> ParseResult | None:
    """Parse page 1 of an AGFC aerial survey report (plain text)."""
    flat = re.sub(r"\s+", " ", text).replace("’", "'")
    # transect-based is sometimes "transectbased"; the patterns don't depend on it

    title = re.search(rf"Aerial Waterfowl Survey Report\s*(.{{0,80}}?\b20\d\d)\b", flat)
    survey_date = parse_report_date(title.group(1)) if title else None
    if not survey_date:
        log.warning("AGFC report: no survey date in the title")
        return None

    # Only the opening paragraph: later ones compare against averages ("343,221 mallards below
    # the long-term average") and must never be read as counts
    end = re.search(r"The Delta mallard population estimate", flat)
    lead = flat[:end.start()] if end else flat[:3000]

    delta = None
    for pattern, order in _DELTA:
        m = pattern.search(lead)
        if m:
            a, b = _n(m.group(1)), _n(m.group(2))
            delta = (a, b) if order == "mallards_first" else (b, a)  # (mallards, total ducks)
            break
    if not delta:
        log.warning(f"AGFC report {survey_date}: no Delta mallard/total-duck estimate found")
        return None

    regions: list[tuple[str, int, int]] = [("Delta", *delta)]
    for pattern in _ARV:
        m = pattern.search(lead)
        if m:
            regions.append(("Arkansas River Valley", _n(m.group(2)), _n(m.group(1))))
            break
    m = _SW.search(lead)
    if m:
        regions.append(("southwest Arkansas", _n(m.group(2)), _n(m.group(1))))

    for name, mallards, ducks in regions:
        if mallards > ducks:
            log.warning(f"AGFC report {survey_date}: {name} has more mallards ({mallards}) than ducks ({ducks})")
            return None

    mallards = sum(r[1] for r in regions)
    ducks = sum(r[2] for r in regions)
    counts: dict[str, int] = {"mallard": mallards, "other-ducks": ducks - mallards}

    geese_notes = []
    light = white_fronted = 0
    m = _DELTA_GEESE.search(lead)
    if m:
        light, white_fronted = _n(m.group(1)), _n(m.group(2))
        geese_notes.append(f"Delta {_fmt(light)} light geese and {_fmt(white_fronted)} white-fronted geese")
    m = _SW_GEESE.search(lead)
    if m:
        light += _n(m.group(1))
        white_fronted += _n(m.group(2))
        geese_notes.append(f"southwest Arkansas {_fmt(_n(m.group(1)))} light geese and "
                           f"{_fmt(_n(m.group(2)))} white-fronted geese")
    if light:
        counts["snow-goose"] = light
    if white_fronted:
        counts["white-fronted-goose"] = white_fronted

    missing = {"Arkansas River Valley", "southwest Arkansas"} - {r[0] for r in regions}
    notes = (
        "AGFC aerial survey, statewide = "
        + "; ".join(f"{name} {_fmt(m_)} mallards of {_fmt(d)} total ducks" for name, m_, d in regions)
        + (f" ({' and '.join(sorted(missing))} not surveyed or not reported)" if missing else "")
        + ". Other ducks = total ducks minus mallards; AGFC reports no other species."
        + (f" Snow goose = light geese (lesser snow and Ross's combined): {'; '.join(geese_notes)}." if geese_notes else "")
    )
    return ParseResult(
        survey_date=survey_date,
        species_counts=counts,
        notes=notes,
        survey_type="aerial_biweekly",
    )


def parse_agfc_pdf(pdf_bytes: bytes) -> ParseResult | None:
    """Extract survey data from an AGFC aerial survey PDF (page 1 only; later pages are
    historical tables and maps)."""
    import io

    import pdfplumber

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        if not pdf.pages:
            return None
        text = pdf.pages[0].extract_text() or ""
    return parse_agfc_text(text)


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
