"""
Hagerman National Wildlife Refuge (Grayson Co., TX, on Lake Texoma): the Friends of
Hagerman NWR weekly bird census.

Every Tuesday a volunteer team counts every bird along about 35 miles of refuge roads and
trails and submits the count as one eBird checklist at the refuge hotspot (L815117). The
census page (CENSUS_PAGE_URL) has a short write-up per week with a link to that checklist,
newest first. The write-ups give only a few numbers, so counts come from the checklists
themselves, read through the eBird API (EBIRD_API_KEY, the same key the API server uses).

It's a volunteer census, not an agency survey: the location's metadata and notes say so.
The checklists report every species seen ("all species reported"), so a duck species seen
on the previous census and missing now is stored as 0, as with the INHS sites.
"""

from __future__ import annotations

import logging
import os
import re
import time

import requests

from huntstack_scrapers.parsers.base import ParseResult

log = logging.getLogger(__name__)

CENSUS_PAGE_URL = "https://friendsofhagerman.com/Birding-Jack"
CHECKLIST_URL = "https://ebird.org/checklist/{sub_id}"
EBIRD_CHECKLIST_API = "https://api.ebird.org/v2/product/checklist/view/{sub_id}"
HAGERMAN_HOTSPOT = "L815117"
USER_AGENT = "HuntStack/1.0 (waterfowl migration research; https://huntstack.com)"
REQUEST_DELAY = 2  # seconds between eBird API calls
RATE_LIMIT_RETRIES = 4  # waits on a 429 before giving up (30s, 60s, 120s, 240s unless eBird says)

# Checklists the weekly run reads (newest first). None = every checklist on the page
# (backfill_hagerman sets it).
RECENT_CHECKLISTS: int | None = 6

# eBird species codes -> HuntStack slugs, the waterfowl HuntStack tracks. Same codes as the
# API's lib/ebird.ts EBIRD_SPECIES (checked against eBird's taxonomy 2026-10-27), plus wood duck.
EBIRD_WATERFOWL: dict[str, str] = {
    "mallar3": "mallard",
    "norpin": "pintail",
    "snogoo": "snow-goose",
    "cangoo": "canada-goose",
    "cacgoo1": "canada-goose",
    "y00470": "canada-goose",  # Cackling/Canada Goose
    "gwfgoo": "white-fronted-goose",
    "rosgoo": "ross-goose",
    "sxrgoo1": "snow-goose",
    "y00469": "snow-goose",  # Snow/Ross's Goose
    "gadwal": "gadwall",
    "norsho": "northern-shoveler",
    "amewig": "american-wigeon",
    "gnwtea": "green-winged-teal",
    "buwtea": "blue-winged-teal",
    "y00314": "blue-winged-teal",  # Blue-winged/Cinnamon Teal
    "canvas": "canvasback",
    "redhea": "redhead",
    "lessca": "scaup",
    "gresca": "scaup",
    "scaup": "scaup",
    "buffle": "bufflehead",
    "rudduc": "ruddy-duck",
    "rinduc": "ring-necked-duck",
    "motduc": "mottled-duck",
    "wooduc": "wood-duck",
}

_CHECKLIST_LINK_RE = re.compile(r"ebird\.org/checklist/(S\d+)")
_OBSERVERS_RE = re.compile(r"Observers?:\s*(.+)", re.IGNORECASE)


def checklist_ids(html: str) -> list[str]:
    """eBird checklist ids linked from the census page, in page order (newest first), once each."""
    seen: dict[str, None] = {}
    for sub_id in _CHECKLIST_LINK_RE.findall(html):
        seen.setdefault(sub_id, None)
    return list(seen)


def parse_checklist(checklist: dict) -> dict | None:
    """One eBird checklist (API 'view' JSON) -> date, waterfowl counts and details.

    Returns None for a checklist that isn't at the Hagerman hotspot (a stray link).
    Species reported as present without a number ("X") are left out.
    """
    if checklist.get("locId") != HAGERMAN_HOTSPOT:
        return None
    counts: dict[str, int] = {}
    for obs in checklist.get("obs", []):
        slug = EBIRD_WATERFOWL.get(obs.get("speciesCode", ""))
        how_many = str(obs.get("howManyStr", "")).strip()
        if not slug or not how_many.isdigit():
            continue
        counts[slug] = counts.get(slug, 0) + int(how_many)
    observers = None
    match = _OBSERVERS_RE.search(checklist.get("comments") or "")
    if match:
        observers = match.group(1).strip()[:500]
    return {
        "sub_id": checklist["subId"],
        "date": str(checklist["obsDt"])[:10],
        "counts": counts,
        "complete": bool(checklist.get("allObsReported")),
        "observers": observers,
        "species_total": checklist.get("numSpecies"),
    }


def census_results(parsed: list[dict]) -> list[tuple[ParseResult, str]]:
    """Parsed checklists (any order) -> one ParseResult per census date, oldest first.

    A waterfowl species seen on the previous census and absent from a complete checklist
    is stored as 0, so a drop to nothing shows up as a drop. Two checklists on one date
    (a split team) are added together.
    """
    by_date: dict[str, dict] = {}
    for p in parsed:
        day = by_date.setdefault(p["date"], {"counts": {}, "complete": True, "sub_ids": [], "observers": p["observers"]})
        for slug, n in p["counts"].items():
            day["counts"][slug] = day["counts"].get(slug, 0) + n
        day["complete"] = day["complete"] and p["complete"]
        day["sub_ids"].append(p["sub_id"])

    results = []
    previous: dict[str, int] = {}
    for date in sorted(by_date):
        day = by_date[date]
        counts = dict(day["counts"])
        if day["complete"]:
            for slug, n in previous.items():
                if n > 0 and slug not in counts:
                    counts[slug] = 0
        previous = counts
        if not counts:
            continue
        sub_ids = ", ".join(day["sub_ids"])
        result = ParseResult(
            survey_date=date,
            species_counts=counts,
            observers=day["observers"],
            notes=f"Friends of Hagerman NWR weekly bird census (volunteers, refuge roads and trails); eBird checklist {sub_ids}",
            survey_type="weekly",
        )
        results.append((result, CHECKLIST_URL.format(sub_id=day["sub_ids"][0])))
    return results


def _get_checklist(sub_id: str, api_key: str) -> requests.Response:
    """GET one checklist, waiting and retrying when eBird answers 429 (too many requests)."""
    for attempt in range(RATE_LIMIT_RETRIES + 1):
        resp = requests.get(
            EBIRD_CHECKLIST_API.format(sub_id=sub_id),
            headers={"X-eBirdApiToken": api_key, "User-Agent": USER_AGENT},
            timeout=30,
        )
        if resp.status_code != 429 or attempt == RATE_LIMIT_RETRIES:
            return resp
        retry_after = resp.headers.get("Retry-After", "")
        wait = int(retry_after) if retry_after.isdigit() else 30 * 2 ** attempt
        log.warning(f"Hagerman: eBird rate limit on {sub_id}; waiting {wait}s")
        time.sleep(wait)
    return resp


def fetch_census_results() -> list[tuple[ParseResult, str]]:
    """Download the census page and its newest checklists; return stored-ready results."""
    api_key = os.environ.get("EBIRD_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("EBIRD_API_KEY is not set (needed to read the census checklists)")

    page = requests.get(CENSUS_PAGE_URL, headers={"User-Agent": USER_AGENT}, timeout=60)
    page.raise_for_status()
    ids = checklist_ids(page.text)
    if not ids:
        raise RuntimeError("no eBird checklist links found on the census page (layout changed?)")
    # One extra so the oldest kept census knows what the week before it held
    if RECENT_CHECKLISTS is not None:
        ids = ids[: RECENT_CHECKLISTS + 1]

    parsed = []
    for sub_id in ids:
        resp = _get_checklist(sub_id, api_key)
        if resp.status_code == 404:
            log.warning(f"Hagerman: checklist {sub_id} not found (deleted or private); skipping")
            continue
        resp.raise_for_status()
        p = parse_checklist(resp.json())
        if p is None:
            log.warning(f"Hagerman: checklist {sub_id} isn't at the refuge hotspot; skipping")
        else:
            parsed.append(p)
        time.sleep(REQUEST_DELAY)

    results = census_results(parsed)
    if RECENT_CHECKLISTS is not None and len(results) > RECENT_CHECKLISTS:
        results = results[1:]  # the extra one only served as "the week before"
    log.info(f"Hagerman: {len(parsed)} checklists read, {len(results)} census dates with waterfowl")
    return results
