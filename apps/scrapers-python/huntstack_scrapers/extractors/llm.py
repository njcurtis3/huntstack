"""
LLM-based extraction of bird count data from survey PDFs and HTML.

Replaces hand-written regex parsers in parsers/agfc_pdf.py and parsers/ldwf_pdf.py.
Reuses the same Together.ai API key and calling pattern as extract_regulations.py.

The extractor returns a list of ParseResult objects, so it plugs directly into
the existing refuge_counts spider pipeline with zero changes to pipelines.py.
"""

import os
import json
import logging
import requests

log = logging.getLogger(__name__)

TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions"
DEFAULT_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"

BIRD_COUNT_SYSTEM = """You are a wildlife survey data extraction assistant.
Extract ALL bird species count data from this waterfowl survey document.

Return ONLY valid JSON in this exact format:
{
  "survey_date": "YYYY-MM-DD",
  "species_counts": {
    "Mallard": 12500,
    "Northern Pintail": 3400,
    "Snow Goose": 85000
  },
  "observers": "Name1, Name2 or null"
}

Rules:
- survey_date: the date this survey was conducted (not published), YYYY-MM-DD format
- species_counts: use proper common names (e.g. "Mallard" not "MALL", "Northern Pintail" not "NOPI")
- Only include species where a specific count number is given — skip totals/subtotals
- Skip "Total Ducks", "Total Geese", "Total Waterfowl", "Total Dabblers", etc.
- For ranges like "19-23" or "survey period Jan 19-23, 2026", use the LAST date as survey_date
- counts must be integers (strip commas from numbers like "12,500" → 12500)
- If you cannot find a clear survey date, return null for survey_date
- If no species counts are present, return empty object for species_counts

Return ONLY the JSON object. No explanation, no markdown fences."""


def _call_llm(text: str, source_url: str = "") -> dict:
    """
    Call Together.ai to extract bird count data from survey text.
    Returns a dict with survey_date, species_counts, observers.
    """
    api_key = os.getenv("TOGETHER_API_KEY")
    if not api_key:
        raise RuntimeError("TOGETHER_API_KEY not set")

    model = os.getenv("SCRAPEGRAPHAI_MODEL", DEFAULT_MODEL)

    # Truncate to avoid token limits — survey pages are usually < 10k chars
    content = text[:12000] if len(text) > 12000 else text

    prompt = f"Source: {source_url}\n\nSurvey text:\n{content}"

    resp = requests.post(
        TOGETHER_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": BIRD_COUNT_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.0,
            "max_tokens": 2048,
            "response_format": {"type": "json_object"},
        },
        timeout=60,
    )
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip markdown fences if model adds them despite json_object mode
    if raw.startswith("```"):
        lines = raw.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        raw = "\n".join(lines)

    return json.loads(raw)


def extract_bird_counts_from_text(text: str, source_url: str = "") -> dict | None:
    """
    Use LLM to extract bird count data from survey text.

    Returns dict: {survey_date, species_counts, observers} or None on failure.

    Usage (replaces regex logic in agfc_pdf.py / ldwf_pdf.py):
        result = extract_bird_counts_from_text(pdf_text, source_url=pdf_url)
        if result and result.get("survey_date") and result.get("species_counts"):
            return ParseResult(
                survey_date=result["survey_date"],
                species_counts=result["species_counts"],
                observers=result.get("observers"),
                survey_type="aerial_biweekly",
            )
    """
    if not text or len(text) < 50:
        return None

    try:
        data = _call_llm(text, source_url)

        survey_date = data.get("survey_date")
        species_counts = data.get("species_counts", {})
        observers = data.get("observers")

        # Coerce counts to int (LLM might return floats or strings)
        cleaned_counts = {}
        for name, count in species_counts.items():
            if not name or not count:
                continue
            try:
                cleaned_counts[name] = int(count)
            except (TypeError, ValueError):
                log.debug(f"Skipping non-integer count for '{name}': {count!r}")

        if not cleaned_counts:
            log.warning(f"LLM returned no species counts for {source_url or 'unknown'}")
            return None

        if not survey_date:
            log.warning(f"LLM could not determine survey date for {source_url or 'unknown'}")
            return None

        # Validate date format
        from datetime import datetime
        try:
            datetime.strptime(survey_date, "%Y-%m-%d")
        except ValueError:
            log.warning(f"LLM returned invalid date format '{survey_date}' for {source_url}")
            return None

        return {
            "survey_date": survey_date,
            "species_counts": cleaned_counts,
            "observers": observers if observers and observers != "null" else None,
        }

    except Exception as e:
        log.error(f"LLM extraction failed for {source_url or 'unknown'}: {e}")
        return None
