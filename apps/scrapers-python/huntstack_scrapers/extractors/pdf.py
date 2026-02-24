"""
PDF text extraction for bird count survey PDFs.

Wraps pdfplumber to pull text from a PDF, then passes it to the LLM extractor.
Used by the new agfc_pdf.py and ldwf_pdf.py parsers as their extraction backend.
"""

import logging
import pdfplumber
from io import BytesIO

from huntstack_scrapers.extractors.llm import extract_bird_counts_from_text
from huntstack_scrapers.parsers.base import ParseResult

log = logging.getLogger(__name__)


def extract_counts_from_pdf_bytes(
    pdf_bytes: bytes,
    source_url: str = "",
    survey_type: str = "weekly",
    pages: list[int] | None = None,
) -> ParseResult | None:
    """
    Extract bird count data from a PDF's raw bytes using pdfplumber + LLM.

    Args:
        pdf_bytes:   Raw PDF content
        source_url:  URL the PDF was downloaded from (for logging/context)
        survey_type: Passed through to ParseResult (e.g. "aerial_biweekly")
        pages:       Which pages to extract text from (0-indexed). None = all pages.
                     Pass [0] to read only page 1 (as AGFC and LDWF parsers did).

    Returns:
        ParseResult or None if extraction fails.
    """
    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                log.warning(f"PDF has no pages: {source_url}")
                return None

            target_pages = pdf.pages if pages is None else [pdf.pages[i] for i in pages if i < len(pdf.pages)]

            text_parts = []
            for page in target_pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

            text = "\n".join(text_parts)

    except Exception as e:
        log.error(f"pdfplumber failed for {source_url}: {e}")
        return None

    if not text or len(text) < 50:
        log.warning(f"No text extracted from PDF: {source_url}")
        return None

    result = extract_bird_counts_from_text(text, source_url=source_url)
    if not result:
        return None

    return ParseResult(
        survey_date=result["survey_date"],
        species_counts=result["species_counts"],
        observers=result.get("observers"),
        survey_type=survey_type,
    )
