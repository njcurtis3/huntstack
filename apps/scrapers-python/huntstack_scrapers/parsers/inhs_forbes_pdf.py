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
columns from MALL through SWN.

Two kinds of location are stored:
  - the river-wide total, one location per river (survey_only since 2026-11-02: a summary
    of the sites, so its birds aren't counted twice);
  - each survey site (INHS_SITES below, 25 Illinois River + 18 Mississippi River), with its
    own map point. Only the regular layout has them: "UPPER/LOWER ... RIVER VALLEY" sections,
    used every fall-winter flight since Jan 2025. The Feb-Apr 2025 flights used a longer,
    finer-grained site list; their sites aren't stored (their river totals are).
"""

import io
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta

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


# ─── Survey sites ────────────────────────────────────────────────────────────
# One entry per site row of the regular layout: (river, section, label as printed, nth time
# that label appears in the section) -> location. Labels repeat ("Goose Lake" is in Upper
# Illinois twice and Lower Illinois once), so the nth occurrence tells them apart; rows come
# in the same order in every file. Points are from OpenStreetMap where it names the place,
# otherwise placed by hand from the site order on the river ("approx": within a few miles).
# scripts/add-inhs-site-locations.sql creates the locations from this table.

@dataclass(frozen=True)
class InhsSite:
    name: str          # locations.name
    state: str
    lat: float
    lng: float
    approx: bool = False


_IL, _MS = "Illinois River", "Mississippi River"


def _site(label: str, river: str, state: str, lat: float, lng: float, approx: bool = False) -> InhsSite:
    return InhsSite(f"{label} - {river} (INHS)", state, lat, lng, approx)


INHS_SITES: dict[tuple[str, str, str, int], InhsSite] = {
    # Illinois River, upper (Hennepin to Pekin)
    ("ILLINOIS", "UPPER", "Hennepin/Hopper", 1): _site("Hennepin & Hopper Lakes", _IL, "IL", 41.235, -89.330, True),
    ("ILLINOIS", "UPPER", "Goose Lake", 1): _site("Goose Lake (Putnam Co.)", _IL, "IL", 41.210, -89.360, True),
    ("ILLINOIS", "UPPER", "Senachwine Lake", 1): _site("Senachwine Lake", _IL, "IL", 41.1914, -89.3562),
    ("ILLINOIS", "UPPER", "Hitchcock Slough", 1): _site("Hitchcock Slough", _IL, "IL", 41.130, -89.380, True),
    ("ILLINOIS", "UPPER", "Douglas Lake", 1): _site("Douglas Lake", _IL, "IL", 41.100, -89.390, True),
    ("ILLINOIS", "UPPER", "Goose Lake", 2): _site("Goose Lake (Marshall Co.)", _IL, "IL", 41.0615, -89.4028),
    ("ILLINOIS", "UPPER", "Upper Peoria", 1): _site("Upper Peoria Lake", _IL, "IL", 40.820, -89.550, True),
    ("ILLINOIS", "UPPER", "Powerton", 1): _site("Powerton Lake", _IL, "IL", 40.5487, -89.6954),
    # Illinois River, lower (Banner to Meredosia)
    ("ILLINOIS", "LOWER", "Goose Lake", 1): _site("Goose Lake (Fulton Co.)", _IL, "IL", 40.4426, -89.9326),
    ("ILLINOIS", "LOWER", "Rice Lake", 1): _site("Rice Lake", _IL, "IL", 40.4695, -89.9468),
    ("ILLINOIS", "LOWER", "Big Lake", 1): _site("Big Lake (Fulton Co.)", _IL, "IL", 40.455, -89.965, True),
    ("ILLINOIS", "LOWER", "Banner Marsh", 1): _site("Banner Marsh", _IL, "IL", 40.5235, -89.8681),
    ("ILLINOIS", "LOWER", "Duck Creek", 1): _site("Duck Creek", _IL, "IL", 40.5226, -89.9658),
    ("ILLINOIS", "LOWER", "Clear Lake", 1): _site("Clear Lake (Mason Co.)", _IL, "IL", 40.440, -89.860, True),
    ("ILLINOIS", "LOWER", "Chautauqua", 1): _site("Chautauqua NWR", _IL, "IL", 40.370, -89.990, True),
    ("ILLINOIS", "LOWER", "Emiquon/Spoon Btm", 1): _site("Emiquon & Spoon River Bottoms", _IL, "IL", 40.3497, -90.0709),
    ("ILLINOIS", "LOWER", "Grass Lake", 1): _site("Grass Lake", _IL, "IL", 40.220, -90.130, True),
    ("ILLINOIS", "LOWER", "Jack Lake", 1): _site("Jack Lake", _IL, "IL", 40.180, -90.170, True),
    ("ILLINOIS", "LOWER", "Stewart Lake", 1): _site("Stewart Lake", _IL, "IL", 40.140, -90.230, True),
    ("ILLINOIS", "LOWER", "Crane Lake", 1): _site("Crane Lake", _IL, "IL", 40.1175, -90.2768),
    ("ILLINOIS", "LOWER", "Cuba Island", 1): _site("Cuba Island", _IL, "IL", 40.0719, -90.2879),
    ("ILLINOIS", "LOWER", "Sanganois", 1): _site("Sanganois", _IL, "IL", 40.0995, -90.3474),
    ("ILLINOIS", "LOWER", "Big Lake", 2): _site("Big Lake (Schuyler/Brown Co.)", _IL, "IL", 39.990, -90.430, True),
    ("ILLINOIS", "LOWER", "Spunky Bottoms", 1): _site("Spunky Bottoms", _IL, "IL", 39.940, -90.570, True),
    ("ILLINOIS", "LOWER", "Meredosia Lake", 1): _site("Meredosia Lake", _IL, "IL", 39.8752, -90.5516),
    # Mississippi River, upper (Keokuk to Louisa)
    ("MISSISSIPPI", "UPPER", "Keokuk-Nauvoo", 1): _site("Keokuk to Nauvoo", _MS, "IL", 40.470, -91.400, True),
    ("MISSISSIPPI", "UPPER", "Arthur Refuge", 1): _site("Arthur Refuge", _MS, "IL", 40.520, -91.390, True),
    ("MISSISSIPPI", "UPPER", "Nauvoo-Ft. Madison", 1): _site("Nauvoo to Fort Madison", _MS, "IL", 40.590, -91.340, True),
    ("MISSISSIPPI", "UPPER", "Ft. Madison-Dallas", 1): _site("Fort Madison to Dallas City", _MS, "IL", 40.635, -91.240, True),
    ("MISSISSIPPI", "UPPER", "Henderson Creek", 1): _site("Henderson Creek", _MS, "IL", 40.900, -90.960, True),
    ("MISSISSIPPI", "UPPER", "Keithsburg Refuge", 1): _site("Keithsburg Division, Port Louisa NWR", _MS, "IL", 41.080, -90.960, True),
    ("MISSISSIPPI", "UPPER", "Louisa Refuge", 1): _site("Louisa Division, Port Louisa NWR", _MS, "IA", 41.2181, -91.1116),
    # Mississippi River, lower (Alton to Meyer)
    ("MISSISSIPPI", "LOWER", "Swan Lake", 1): _site("Swan Lake (Two Rivers NWR)", _MS, "IL", 38.9990, -90.5791),
    ("MISSISSIPPI", "LOWER", "Gilbert Lake", 1): _site("Gilbert Lake", _MS, "IL", 38.9625, -90.5085),
    ("MISSISSIPPI", "LOWER", "Long Lake", 1): _site("Long Lake (St. Charles Co.)", _MS, "MO", 38.9557, -90.4226, True),
    ("MISSISSIPPI", "LOWER", "Dardenne Club", 1): _site("Dardenne Club", _MS, "MO", 38.870, -90.530, True),
    ("MISSISSIPPI", "LOWER", "Cuivre Club", 1): _site("Cuivre Club", _MS, "MO", 38.930, -90.680, True),
    ("MISSISSIPPI", "LOWER", "Batchtown Refuge", 1): _site("Batchtown Division, Two Rivers NWR", _MS, "IL", 39.030, -90.660, True),
    # Clarence Cannon NWR stopped posting its own counts in 2023; the flights continue them
    ("MISSISSIPPI", "LOWER", "Cannon Refuge", 1): InhsSite("Clarence Cannon National Wildlife Refuge", "MO", 39.275, -90.785, True),
    ("MISSISSIPPI", "LOWER", "Towhead Lake", 1): _site("Towhead Lake", _MS, "IL", 39.420, -90.990, True),
    ("MISSISSIPPI", "LOWER", "Delair Refuge", 1): _site("Delair Division, Great River NWR", _MS, "IL", 39.470, -91.040, True),
    ("MISSISSIPPI", "LOWER", "Shanks Refuge", 1): _site("Ted Shanks Conservation Area", _MS, "MO", 39.5134, -91.1136),
    ("MISSISSIPPI", "LOWER", "Meyer-Keokuk", 1): _site("Meyer to Keokuk", _MS, "IL", 40.270, -91.470, True),
}

# A site row: label, then %WET, %ICE and the 27 species columns of TOTAL_ROW_COLUMNS
_SECTION_RE = re.compile(r"^(UPPER|LOWER) (ILLINOIS|MISSISSIPPI) RIVER VALLEY", re.IGNORECASE | re.MULTILINE)
_SITE_ROW_RE = re.compile(r"^([A-Za-z][A-Za-z .,/'&()-]*?)\s+(\d[\d,]*(?:\s+\d[\d,]*)*)\s*$")
_SITE_ROW_VALUES = 2 + len(TOTAL_ROW_COLUMNS)


@dataclass
class SiteCount:
    site: InhsSite
    survey_date: str
    counts: dict[str, int]       # species name -> count, every tracked species (0 included)
    total_ducks: int
    checksum_ok: bool


def parse_forbes_sites(text: str) -> tuple[list[SiteCount], list[str]]:
    """Site rows of one inventory PDF in the regular layout, and problems found.

    A file in another layout (the Feb-Apr 2025 long list, shorebird surveys) gives nothing.
    A label not in INHS_SITES is a problem, so a renamed or new site is noticed.
    """
    date = _DATE_RE.search(text)
    if not date or not _SECTION_RE.search(text):
        return [], []
    survey_date = datetime.strptime(date.group(1), "%m/%d/%Y").strftime("%Y-%m-%d")
    sites: list[SiteCount] = []
    problems: list[str] = []
    river = section = None
    seen: dict[tuple[str, str, str], int] = {}
    ducks_end = TOTAL_ROW_COLUMNS.index("TOTAL_DUCKS")
    for line in text.splitlines():
        line = line.strip()
        header = _SECTION_RE.match(line)
        if header:
            section, river = header.group(1).upper(), header.group(2).upper()
            continue
        row = _SITE_ROW_RE.match(line)
        if not row or section is None:
            continue
        label = row.group(1).strip()
        if re.match(r"(total|10-year|date)", label, re.IGNORECASE):
            continue
        values = [int(v.replace(",", "")) for v in row.group(2).split()]
        nth = seen[(river, section, label)] = seen.get((river, section, label), 0) + 1
        site = INHS_SITES.get((river, section, label, nth))
        if site is None:
            problems.append(f"INHS {survey_date}: unknown site {label!r} ({river} {section} #{nth})")
            continue
        if len(values) != _SITE_ROW_VALUES:
            problems.append(f"INHS {survey_date}: {label} has {len(values)} values, expected {_SITE_ROW_VALUES}; skipped")
            continue
        by_code = dict(zip(TOTAL_ROW_COLUMNS, values[2:]))
        ducks = [by_code[c] for c in TOTAL_ROW_COLUMNS[:ducks_end]]
        sites.append(SiteCount(
            site=site,
            survey_date=survey_date,
            counts={name: by_code[code] for code, name in CODE_TO_SPECIES.items()},
            total_ducks=by_code["TOTAL_DUCKS"],
            # INHS's sheets occasionally misadd a row (4 of ~1,000 since 2025); the species
            # columns are kept and the note says so
            checksum_ok=sum(ducks) == by_code["TOTAL_DUCKS"],
        ))
    return sites, problems


def site_results(site_counts: list[SiteCount]) -> list[tuple[ParseResult, str]]:
    """(result, location name) per site and date, oldest first. Each keeps the species seen
    there, plus a 0 for any species seen on the site's previous flight and gone now, so the
    newest count is never an older non-zero one. Zeros otherwise aren't stored."""
    out: list[tuple[ParseResult, str]] = []
    previous: dict[str, set[str]] = {}
    for sc in sorted(site_counts, key=lambda s: s.survey_date):
        seen_now = {name for name, n in sc.counts.items() if n > 0}
        keep = seen_now | previous.get(sc.site.name, set())
        previous[sc.site.name] = seen_now
        note = f"INHS aerial inventory site; {sc.total_ducks:,} total ducks"
        if not sc.checksum_ok:
            note += " (as printed; INHS's species columns add up differently)"
        out.append((ParseResult(
            survey_date=sc.survey_date,
            species_counts={name: sc.counts[name] for name in sorted(keep)},
            notes=note,
            survey_type="aerial_weekly",
        ), sc.site.name))
    return out


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


def pdf_text(pdf_bytes: bytes) -> str | None:
    import pdfplumber

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            return "\n".join((page.extract_text() or "") for page in pdf.pages)
    except Exception as e:
        log.error(f"Could not read INHS PDF: {e}")
        return None


def parse_forbes_pdf(pdf_bytes: bytes) -> tuple[str, ParseResult] | None:
    text = pdf_text(pdf_bytes)
    return parse_forbes_text(text) if text else None


def extract_box_ids(index_html: str) -> list[str]:
    """Box share ids linked from the index page, in page order, de-duplicated."""
    seen: list[str] = []
    for box_id in re.findall(r"uofi\.box\.com/s/([A-Za-z0-9]+)", index_html):
        if box_id not in seen:
            seen.append(box_id)
    return seen


# Weekly runs re-store site counts from the last SITE_DAYS only (the river totals are small
# and re-stored in full); backfill_inhs_sites.py sets None to load every flight on the index.
SITE_DAYS: int | None = 45

# river -> [(result, source_url, location name)], shared by both river sources in one process
_results_cache: dict[str, list[tuple[ParseResult, str, str]]] | None = None


def _collect_all() -> dict[str, list[tuple[ParseResult, str, str]]]:
    """Download and parse every linked PDF once per process; both river sources share it."""
    global _results_cache
    if _results_cache is not None:
        return _results_cache

    headers = {"User-Agent": USER_AGENT}
    _results_cache = {river: [] for river in RIVER_SOURCES}
    site_counts: dict[str, list[tuple[SiteCount, str]]] = {river: [] for river in RIVER_SOURCES}
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
        text = pdf_text(resp.content) or ""
        parsed = parse_forbes_text(text)
        if parsed:
            river, result = parsed
            _results_cache[river].append((result, url, RIVER_SOURCES[river]))
        # Site rows don't depend on the total row: a misadded total still has good sites
        sites, problems = parse_forbes_sites(text)
        for problem in problems:
            log.warning(problem)
        section = _SECTION_RE.search(text)
        if sites and section:
            site_counts[section.group(2).upper()] += [(sc, url) for sc in sites]
        if not parsed and not sites:
            log.warning(f"INHS {url}: no total row or survey sites found (another survey?); skipping")

    cutoff = None
    if SITE_DAYS is not None:
        cutoff = (datetime.now() - timedelta(days=SITE_DAYS)).strftime("%Y-%m-%d")
    for river, pairs in site_counts.items():
        url_of = {(sc.site.name, sc.survey_date): url for sc, url in pairs}
        for result, name in site_results([sc for sc, _ in pairs]):
            if cutoff is None or result.survey_date >= cutoff:
                _results_cache[river].append((result, url_of[(name, result.survey_date)], name))
    return _results_cache


def fetch_forbes_results(river: str) -> list[tuple[ParseResult, str, str]]:
    """(result, source_url, location name) for one river ("ILLINOIS" or "MISSISSIPPI"): the
    river-wide totals, then its sites."""
    return _collect_all().get(river, [])
