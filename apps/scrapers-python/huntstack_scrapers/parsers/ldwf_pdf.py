"""
Parser for Louisiana LDWF aerial waterfowl survey PDFs.

LDWF conducts monthly aerial surveys Sep-Jan covering coastal Louisiana,
Little River Basin, NW and NE regions. PDFs contain Table 1 with species
counts by region and a TOTALS column.

URL pattern (both separators work):
  .../Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_{Month}_{Year}.pdf
  .../Aerial-Surveys/Louisiana-Aerial-Waterfowl-Survey-{Month}-{Year}.pdf

Source: https://www.wlf.louisiana.gov/page/aerial-waterfowl-surveys

Previously used hand-written regex with two different format variants
(Format A: 2023+ numbers-then-species, Format B: 2019-2022 same-line).
Now uses LLM extraction (extractors/llm.py) which handles both formats
naturally without explicit branching logic.
"""

from huntstack_scrapers.parsers.base import ParseResult
from huntstack_scrapers.extractors.pdf import extract_counts_from_pdf_bytes


def parse_ldwf_pdf(pdf_bytes: bytes) -> ParseResult | None:
    """
    Extract statewide species totals from an LDWF aerial survey PDF using LLM.

    Reads page 0 only — Table 1 with species counts by region and TOTALS column.
    The LLM is instructed to use the TOTALS (last column) for each species.
    """
    return extract_counts_from_pdf_bytes(
        pdf_bytes=pdf_bytes,
        survey_type="aerial_monthly",
        pages=[0],  # Page 1 only — Table 1 with current survey counts
    )


def generate_ldwf_urls() -> list[str]:
    """
    Generate candidate PDF URLs for all LDWF aerial surveys.

    Surveys run monthly Sep-Jan. Both underscore and hyphen URL patterns
    exist — we only need one (underscore is more consistent).
    """
    base = "https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys"
    months = ["September", "October", "November", "December", "January"]
    urls = []

    for year in range(2019, 2027):
        for month in months:
            # Both underscore and hyphen URL patterns exist across years
            urls.append(f"{base}/Louisiana_Aerial_Waterfowl_Survey_{month}_{year}.pdf")
            urls.append(f"{base}/Louisiana-Aerial-Waterfowl-Survey-{month}-{year}.pdf")

    return urls
