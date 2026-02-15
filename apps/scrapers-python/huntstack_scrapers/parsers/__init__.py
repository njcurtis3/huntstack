"""
Parser modules for waterfowl count data sources.

Each module handles a specific data source format (FWS HTML, AGFC PDFs, etc.)
and returns standardized ParseResult objects.
"""

from huntstack_scrapers.parsers.base import ParseResult
from huntstack_scrapers.parsers.fws_html import parse_fws_refuge_page, parse_fws_story_page
from huntstack_scrapers.parsers.agfc_pdf import parse_agfc_pdf
from huntstack_scrapers.parsers.loess_bluffs_pdf import parse_loess_bluffs_pdf
from huntstack_scrapers.parsers.ldwf_pdf import parse_ldwf_pdf

__all__ = [
    "ParseResult",
    "parse_fws_refuge_page",
    "parse_fws_story_page",
    "parse_agfc_pdf",
    "parse_loess_bluffs_pdf",
    "parse_ldwf_pdf",
]
