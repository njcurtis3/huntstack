"""
Parser for the Illinois Natural History Survey (Forbes Biological Station) weekly
waterfowl aerial inventory — Illinois River and central Mississippi River, Sept-Jan.

Index: https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/
lists each flight as uofi.box.com/s/<id> links labelled only with the date, two per
date (one per river) in no guaranteed order. Box serves the file itself at
uofi.box.com/shared/static/<id> on GET (HEAD returns 404, so the generic pdf_url_list
handler can't be used). Which river a PDF covers is read from its own header.

Each PDF is one page: per-location rows, then a river-wide total row
("TOTAL ILLINOIS" / "TOTAL MISSISSIPPI") whose 27 numbers line up with the species
columns from MALL through SWN. Only that total row is stored — one location per river.
"""

import io
import logging
import re
import time
from datetime import datetime

import requests

from huntstack_scrapers.parsers.base import ParseResult

log = logging.getLogger(__name__)

FORBES_INDEX_URL = "https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/"
BOX_STATIC_URL = "https://uofi.box.com/shared/static/{box_id}"
USER_AGENT = "HuntStack/1.0 (waterfowl migration research; https://huntstack.com)"
REQUEST_DELAY = 2  # seconds between Box downloads

# River key (from the PDF header) -> registry source name, which is also the location name
RIVER_SOURCES = {
    "ILLINOIS": "Illinois River - INHS Aerial Inventory",
    "MISSISSIPPI": "Central Mississippi River - INHS Aerial Inventory",
}

# Column order of the numbers on the total row, after the location name. %WET/%ICE
# appear only on per-location rows, not the total row.
TOTAL_ROW_COLUMNS = [
    "MALL", "ABDU", "NOPI", "BWTE", "GWTE", "AMWI", "GADW", "NSHO", "LESC", "RNDU",
    "CANV", "REDH", "RUDU", "COGO", "BUFF", "COME", "HOME", "TOTAL_DUCKS",
    "CAGO", "GWFG", "LSGO", "AWPE", "AMCO", "BAEA_AD", "BAEA_IMM", "DCCO", "SWAN",
]

# Banding codes -> names resolve_species_slug() understands. Codes for species HuntStack
# doesn't track (black duck, goldeneye, mergansers, pelicans, coots, eagles, cormorants,
# swans) are left out; the pipeline would skip them anyway.
CODE_TO_SPECIES = {
    "MALL": "Mallard",
    "NOPI": "Northern Pintail",
    "BWTE": "Blue-winged Teal",
    "GWTE": "Green-winged Teal",
    "AMWI": "American Wigeon",
    "GADW": "Gadwall",
    "NSHO": "Northern Shoveler",
    "LESC": "Scaup",
    "RNDU": "Ring-necked Duck",
    "CANV": "Canvasback",
    "REDH": "Redhead",
    "RUDU": "Ruddy Duck",
    "BUFF": "Bufflehead",
    "CAGO": "Canada Goose",
    "GWFG": "Greater White-fronted Goose",
    "LSGO": "Snow Goose",
}

_DATE_RE = re.compile(r"Date:\s*(\d{1,2}/\d{1,2}/\d{4})")
_OBSERVER_RE = re.compile(r"Observer:\s*([^\n]+?)\s+(?:BAEA|Pilot:|Eagle|$)", re.MULTILINE)
# Older (early-2025) files say "Total Mississippi"; the current ones "TOTAL MISSISSIPPI"
_TOTAL_RE = re.compile(r"^TOTAL (ILLINOIS|MISSISSIPPI)\s+([\d,\s]+)$", re.MULTILINE | re.IGNORECASE)
_NUMBER_RE = re.compile(r"\d[\d,]*")


def parse_forbes_text(text: str) -> tuple[str, ParseResult] | None:
    """Parse the extracted text of one inventory PDF. Returns (river_key, result) or None."""
    total = _TOTAL_RE.search(text)
    date = _DATE_RE.search(text)
    if not total or not date:
        return None

    river = total.group(1).upper()
    numbers = [int(n.replace(",", "")) for n in _NUMBER_RE.findall(total.group(2))]

    # Checksum: the 17 duck columns must add up to TOTAL DUCKS. That proves the duck
    # columns are aligned. Narrow columns (eagles, cormorants) sometimes run together in
    # older files ("842752"), which shortens the row; that happens after the geese, but
    # the geese are only trusted when every column is present.
    ducks_end = TOTAL_ROW_COLUMNS.index("TOTAL_DUCKS")
    if len(numbers) <= ducks_end or sum(numbers[:ducks_end]) != numbers[ducks_end]:
        log.warning(f"INHS {river} total row failed the duck checksum ({len(numbers)} values); skipping")
        return None
    usable = TOTAL_ROW_COLUMNS if len(numbers) == len(TOTAL_ROW_COLUMNS) else TOTAL_ROW_COLUMNS[: ducks_end + 1]
    by_code = dict(zip(usable, numbers))
    species_counts = {
        name: by_code[code] for code, name in CODE_TO_SPECIES.items() if by_code.get(code, 0) > 0
    }
    observer = _OBSERVER_RE.search(text)
    survey_date = datetime.strptime(date.group(1), "%m/%d/%Y").strftime("%Y-%m-%d")
    return river, ParseResult(
        survey_date=survey_date,
        species_counts=species_counts,
        observers=observer.group(1).strip() if observer else None,
        notes=f"River-wide total; {by_code['TOTAL_DUCKS']:,} total ducks",
        survey_type="aerial_weekly",
    )


def parse_forbes_pdf(pdf_bytes: bytes) -> tuple[str, ParseResult] | None:
    import pdfplumber

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = "\n".join((page.extract_text() or "") for page in pdf.pages)
    except Exception as e:
        log.error(f"Could not read INHS PDF: {e}")
        return None
    return parse_forbes_text(text)


def extract_box_ids(index_html: str) -> list[str]:
    """Box share ids linked from the index page, in page order, de-duplicated."""
    seen: list[str] = []
    for box_id in re.findall(r"uofi\.box\.com/s/([A-Za-z0-9]+)", index_html):
        if box_id not in seen:
            seen.append(box_id)
    return seen


_results_cache: dict[str, list[tuple[ParseResult, str]]] | None = None


def _collect_all() -> dict[str, list[tuple[ParseResult, str]]]:
    """Download and parse every linked PDF once per process; both river sources share it."""
    global _results_cache
    if _results_cache is not None:
        return _results_cache

    headers = {"User-Agent": USER_AGENT}
    _results_cache = {river: [] for river in RIVER_SOURCES}
    index = requests.get(FORBES_INDEX_URL, timeout=30, headers=headers)
    index.raise_for_status()
    box_ids = extract_box_ids(index.text)
    log.info(f"INHS index lists {len(box_ids)} inventory files")

    for box_id in box_ids:
        url = BOX_STATIC_URL.format(box_id=box_id)
        try:
            resp = requests.get(url, timeout=30, headers=headers)
            time.sleep(REQUEST_DELAY)
        except Exception as e:
            log.warning(f"INHS download failed for {url}: {e}")
            continue
        if resp.status_code != 200 or not resp.content.startswith(b"%PDF"):
            log.warning(f"INHS {url}: HTTP {resp.status_code}, not a PDF; skipping")
            continue
        parsed = parse_forbes_pdf(resp.content)
        if not parsed:
            log.warning(f"INHS {url}: no total row found; skipping")
            continue
        river, result = parsed
        _results_cache[river].append((result, url))
    return _results_cache


def fetch_forbes_results(river: str) -> list[tuple[ParseResult, str]]:
    """(result, source_url) pairs for one river ("ILLINOIS" or "MISSISSIPPI")."""
    return _collect_all().get(river, [])
