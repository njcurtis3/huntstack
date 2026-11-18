"""
Parser for FWS refuge HTML survey pages.

Handles two page formats:
- fws_refuge_page: Standard refuge survey pages (e.g., Washita NWR)
- fws_story_page: FWS "story" format pages (e.g., Salt Plains NWR)
"""

import re

from huntstack_scrapers.parsers.base import (
    ParseResult,
    ParserResponse,
    parse_survey_date,
    extract_observers,
    extract_table_counts,
    extract_counts_from_text,
)
from huntstack_scrapers.species_mapping import resolve_species_slug

# Salt Plains' story page since Nov 2026: the date alone in the sub-title ("11/4/26"), then
# the body as <h3> section headings (DUCKS, GEESE, CRANES, SHOREBIRDS...) and one <p> per row,
# "Teal, Green-Winged" + padding + "62". Only the DUCKS and GEESE sections are waterfowl.
_STORY_ROW = re.compile(r"^(.+?)\s+(\d{1,3}(?:,\d{3})+|\d+)$")
_WATERFOWL_SECTIONS = {"DUCKS", "GEESE"}


def _story_name(raw: str, section: str) -> str:
    """'Teal, Green-Winged' -> 'Green-Winged Teal'; in GEESE, 'Canada, Large' -> 'Canada Goose'"""
    if "," not in raw:
        return raw
    head, tail = (p.strip() for p in raw.split(",", 1))
    flipped = f"{tail} {head}"
    if section == "GEESE" and not resolve_species_slug(flipped):
        return f"{head} Goose"
    return flipped


def parse_story_sections(response: ParserResponse) -> tuple[str | None, dict[str, int]]:
    """The sub-title's date and the DUCKS and GEESE rows of a story page's body."""
    title = " ".join(response.css(".field--name-field-sub-title *::text, .field--name-field-sub-title::text").getall())
    survey_date = parse_survey_date(title)
    counts: dict[str, int] = {}
    section = ""
    for node in response.css(".field--name-body *::text").getall():
        text = " ".join(node.replace(" ", " ").split())
        if not text:
            continue
        if text.isupper() and not any(c.isdigit() for c in text):
            section = text
            continue
        m = _STORY_ROW.match(text)
        if not m or section not in _WATERFOWL_SECTIONS:
            continue
        raw = m.group(1).strip()
        if raw.upper().startswith(("TOTAL", "UNIDENTIFIED")):
            continue
        name = _story_name(raw, section)
        counts[name] = counts.get(name, 0) + int(m.group(2).replace(",", ""))
    return survey_date, counts


def parse_fws_refuge_page(response: ParserResponse) -> ParseResult | None:
    """
    Parse FWS refuge survey pages (e.g., Washita).
    Format: HTML tables with Species | Count columns, organized under
    section headers like "DUCK NUMBERS", "GOOSE NUMBERS".
    """
    page_text = " ".join(response.css("body *::text").getall())

    survey_date = parse_survey_date(page_text)
    if not survey_date:
        return None

    observers = extract_observers(page_text)
    species_counts = extract_table_counts(response)

    if not species_counts:
        species_counts = extract_counts_from_text(page_text)

    if not species_counts:
        return None

    return ParseResult(
        survey_date=survey_date,
        species_counts=species_counts,
        observers=observers,
    )


def parse_fws_story_page(response: ParserResponse) -> ParseResult | None:
    """
    Parse FWS 'story' format survey pages (e.g., Salt Plains).
    Content in article body with sections for ducks, geese, etc.
    """
    page_text = " ".join(response.css("article *::text, main *::text, body *::text").getall())
    observers = extract_observers(page_text)

    survey_date, species_counts = parse_story_sections(response)
    if survey_date and species_counts:
        return ParseResult(survey_date=survey_date, species_counts=species_counts, observers=observers)

    survey_date = parse_survey_date(page_text)
    if not survey_date:
        return None

    species_counts = extract_table_counts(response)

    if not species_counts:
        species_counts = extract_counts_from_text(page_text)

    if not species_counts:
        return None

    return ParseResult(
        survey_date=survey_date,
        species_counts=species_counts,
        observers=observers,
    )
