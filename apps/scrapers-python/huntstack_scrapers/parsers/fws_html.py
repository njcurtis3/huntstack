"""
Parser for FWS refuge HTML survey pages.

Handles two page formats:
- fws_refuge_page: Standard refuge survey pages (e.g., Washita NWR)
- fws_story_page: FWS "story" format pages (e.g., Salt Plains NWR)
"""

from scrapy.http import Response

from huntstack_scrapers.parsers.base import (
    ParseResult,
    parse_survey_date,
    extract_observers,
    extract_table_counts,
    extract_counts_from_text,
)


def parse_fws_refuge_page(response: Response) -> ParseResult | None:
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


def parse_fws_story_page(response: Response) -> ParseResult | None:
    """
    Parse FWS 'story' format survey pages (e.g., Salt Plains).
    Content in article body with sections for ducks, geese, etc.
    """
    page_text = " ".join(response.css("article *::text, main *::text, body *::text").getall())

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
