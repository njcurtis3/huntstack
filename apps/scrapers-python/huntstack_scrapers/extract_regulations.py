"""
LLM-based extraction of structured regulation data from scraped documents.

Reads raw text from the `documents` table and uses Together.ai LLM to extract
structured seasons, licenses, and regulations into their respective DB tables.

Usage:
    python -m huntstack_scrapers.extract_regulations
    python -m huntstack_scrapers.extract_regulations --state TX
    python -m huntstack_scrapers.extract_regulations --dry-run
    python -m huntstack_scrapers.extract_regulations --model Qwen/Qwen2.5-7B-Instruct-Turbo
"""

import os
import re
import sys
import json
import argparse
import logging
from datetime import datetime

import psycopg2
import requests
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("extract")

# NOTE: Together.ai retired the Llama-3.1 Turbo family from serverless as of ~mid-2026 (now
# dedicated-endpoint only — returns 400 model_not_available). Qwen2.5-7B-Instruct-Turbo is the
# current serverless replacement: same family as the API's chat model and a like-for-like swap
# for the original 8B baseline (fast/cheap, practical for the full 6-state seasonal refresh).
# For a slower, higher-accuracy pass pass --model meta-llama/Llama-3.3-70B-Instruct-Turbo
# (also serverless-verified 2026-07-27, but ~10x slower per call on the 552-doc TX set).
DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct-Turbo"
TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions"
V1_STATES = ["TX", "AR", "NM", "LA", "KS", "OK"]

# ============================================
# SPECIES ALIAS MAPPING
# ============================================

from huntstack_scrapers.species_mapping import SPECIES_ALIASES


# ============================================
# LLM CALLS
# ============================================

def call_llm(prompt: str, system: str, model: str) -> str:
    """Call Together.ai chat completion and return the response text."""
    api_key = os.getenv("TOGETHER_API_KEY")
    if not api_key:
        raise RuntimeError("TOGETHER_API_KEY not set")

    resp = requests.post(
        TOGETHER_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.0,  # deterministic — classification was flaky at 0.1, causing the
                                 # same doc (e.g. NM's rules PDF) to be flagged for seasons on
                                 # some runs and skipped on others
            "max_tokens": 4096,
            "response_format": {"type": "json_object"},
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def clean_content(text: str) -> str:
    """Strip CSS/JS/style boilerplate the scraper stored alongside the real page text.

    Some source pages (notably ksoutdoors.gov) are stored with tens of thousands of chars
    of leading inline CSS, AngularJS bootstrap, and nav markup before the actual regulation
    text — e.g. a KS 'Ducks' page buries its season-date table past char 32,000. That pushed
    the real content beyond both the classify (6K) and extraction (30K) windows, so pages got
    misclassified as non-waterfowl and their seasons never extracted. Removing the boilerplate
    compacts the real text toward the top so it lands inside the windows.
    """
    if not text:
        return text
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    # CSS rule blocks (selector { ... }) and any leftover brace blocks
    text = re.sub(r"[.#]?[\w-]+(\s*[,>+~]\s*[.#:\w-]+)*\s*\{[^{}]*\}", " ", text)
    text = re.sub(r"\{[^{}]*\}", " ", text)
    # inline JS config assignments (window.foo = {...}; / var foo = {...};)
    text = re.sub(r"(window\.\w+|var\s+\w+)\s*=\s*[^;]{0,4000};", " ", text, flags=re.DOTALL)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_json_response(text: str) -> dict:
    """Parse JSON from LLM response, stripping markdown fences if present."""
    text = text.strip()
    if text.startswith("```"):
        # Remove markdown code fences
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    return json.loads(text)


# ============================================
# DOCUMENT CLASSIFICATION
# ============================================

CLASSIFY_SYSTEM = """You are a document classifier for WATERFOWL hunting regulations.
Classify the document based on whether it contains waterfowl/migratory bird hunting information.
Output JSON: {"categories": ["seasons", "licenses", "regulations"], "is_waterfowl": true}

IMPORTANT: Only classify as relevant if the document is about waterfowl, migratory birds, ducks, geese, teal, or related hunting.
Documents about fishing, deer, turkey, commercial licenses, or other non-waterfowl topics should return: {"categories": [], "is_waterfowl": false}

Categories (only for waterfowl-related content):
- "seasons": contains specific waterfowl hunting season dates, bag limits, or shooting hours
- "licenses": contains license/stamp/permit requirements relevant to waterfowl hunting
- "regulations": contains waterfowl hunting rules, restrictions, or methods

If the document has NO waterfowl content, output: {"categories": [], "is_waterfowl": false}"""


def classify_document(doc: dict, model: str) -> list[str]:
    """Classify a document to determine what waterfowl data it contains."""
    content = doc["content"][:6000]  # First 6K chars for classification (NM pages have nav-heavy headers)
    prompt = f"Document title: {doc['title']}\n\nDocument content:\n{content}"

    try:
        result = parse_json_response(call_llm(prompt, CLASSIFY_SYSTEM, model))
        if not result.get("is_waterfowl", False):
            return []
        return result.get("categories", [])
    except Exception as e:
        log.warning(f"Classification failed for '{doc['title']}': {e}")
        return []


# ============================================
# EXTRACTION PROMPTS
# ============================================

SEASONS_SYSTEM = """You are a hunting regulations data extraction assistant.
Extract ALL waterfowl/migratory bird hunting seasons from the provided state wildlife agency document.
Output ONLY valid JSON matching this schema. Never invent data — only extract what is explicitly stated.

CRITICAL: All dates MUST be in YYYY-MM-DD format (e.g., "2024-10-26", NOT "October 26").
- Fall seasons typically start in Sep-Nov of the season year (e.g., 2024)
- Winter seasons end in Jan-Apr of the following year (e.g., 2025)
- If only month and day are given, use the season year provided in the prompt for fall dates,
  and season year + 1 for winter/spring dates (Jan-Apr).
- If no specific dates are found, set start_date and end_date to null.

Output format:
{
  "seasons": [
    {
      "name": "descriptive name (e.g., 'Duck Season - North Zone')",
      "species": "species name (e.g., 'mallard', 'snow goose', 'canada goose', 'teal')",
      "season_type": "general|teal|conservation-order|archery|muzzleloader|rifle",
      "start_date": "YYYY-MM-DD or null",
      "end_date": "YYYY-MM-DD or null",
      "bag_limit": {"daily": number_or_null, "possession": number_or_null, "season": number_or_null},
      "shooting_hours": {"start": "text", "end": "text"},
      "restrictions": "free text about special rules",
      "zones": ["zone names if zone-specific"]
    }
  ]
}

If no waterfowl seasons are found, output: {"seasons": []}"""

LICENSES_SYSTEM = """You are a hunting regulations data extraction assistant.
Extract ALL license and permit requirements from the provided state wildlife agency document.
Output ONLY valid JSON matching this schema. Never invent data — only extract what is explicitly stated.

Output format:
{
  "licenses": [
    {
      "name": "license name (e.g., 'Resident Hunting License')",
      "license_type": "base|species|stamp|permit",
      "description": "brief description",
      "is_resident_only": true_or_false,
      "price_resident": number_or_null,
      "price_non_resident": number_or_null,
      "valid_for": ["species or categories this covers"],
      "purchase_url": "URL if mentioned"
    }
  ]
}

If no licenses are found, output: {"licenses": []}"""

REGULATIONS_SYSTEM = """You are a hunting regulations data extraction assistant.
Extract distinct hunting regulations/rules from the provided state wildlife agency document.
Group related rules together. Output ONLY valid JSON. Never invent data.

Output format:
{
  "regulations": [
    {
      "category": "waterfowl|big-game|upland|migratory|general",
      "title": "descriptive title",
      "content": "full regulation text (keep original wording)",
      "summary": "1-2 sentence plain-language summary",
      "species": "primary species this applies to, or null"
    }
  ]
}

If no regulations are found, output: {"regulations": []}"""


# ============================================
# EXTRACTION FUNCTIONS
# ============================================

def extract_seasons(doc: dict, state_code: str, model: str, year: int = 2024) -> list[dict]:
    """Extract season data from a document."""
    prompt = f"State: {state_code}\nSeason year: {year}-{year+1} (fall {year} through spring {year+1})\nDocument title: {doc['title']}\nSource URL: {doc.get('source_url', 'unknown')}\n\nDocument content:\n{doc['content'][:30000]}"

    try:
        result = parse_json_response(call_llm(prompt, SEASONS_SYSTEM, model))
        seasons = result.get("seasons", [])
        log.info(f"  Extracted {len(seasons)} seasons from '{doc['title']}'")
        return seasons
    except Exception as e:
        log.warning(f"  Season extraction failed for '{doc['title']}': {e}")
        return []


def extract_licenses(doc: dict, state_code: str, model: str) -> list[dict]:
    """Extract license data from a document."""
    prompt = f"State: {state_code}\nDocument title: {doc['title']}\nSource URL: {doc.get('source_url', 'unknown')}\n\nDocument content:\n{doc['content'][:30000]}"

    try:
        result = parse_json_response(call_llm(prompt, LICENSES_SYSTEM, model))
        licenses = result.get("licenses", [])
        log.info(f"  Extracted {len(licenses)} licenses from '{doc['title']}'")
        return licenses
    except Exception as e:
        log.warning(f"  License extraction failed for '{doc['title']}': {e}")
        return []


def extract_regulations(doc: dict, state_code: str, model: str) -> list[dict]:
    """Extract regulation data from a document."""
    prompt = f"State: {state_code}\nDocument title: {doc['title']}\nSource URL: {doc.get('source_url', 'unknown')}\n\nDocument content:\n{doc['content'][:30000]}"

    try:
        result = parse_json_response(call_llm(prompt, REGULATIONS_SYSTEM, model))
        regs = result.get("regulations", [])
        log.info(f"  Extracted {len(regs)} regulations from '{doc['title']}'")
        return regs
    except Exception as e:
        log.warning(f"  Regulation extraction failed for '{doc['title']}': {e}")
        return []


# ============================================
# VALIDATION
# ============================================

def normalize_season_dates(s: dict) -> dict:
    """Fix the LLM's most common season-date error: mapping a winter/spring END date to the
    season's start year instead of the following year.

    Waterfowl seasons routinely cross the new year (e.g. NM ducks run Oct 10 → Jan 13 of the
    *next* year; conservation orders run into Feb/Mar). The model frequently writes both dates
    with the same year, producing end < start, which `validate_season` would otherwise reject —
    silently dropping real seasons (this is exactly why NM extracted 0 seasons at first). When
    the end month is in the first half of the year and falls on/before the start, roll the end
    year forward by one. Mutates and returns `s`.
    """
    sd, ed = s.get("start_date"), s.get("end_date")
    if sd and ed:
        try:
            start = datetime.strptime(sd, "%Y-%m-%d")
            end = datetime.strptime(ed, "%Y-%m-%d")
            if start >= end and end.month <= 6:
                s["end_date"] = end.replace(year=end.year + 1).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return s


def validate_season(s: dict) -> bool:
    """Validate an extracted season record."""
    if not s.get("name"):
        return False
    # Validate dates if present
    if s.get("start_date") and s.get("end_date"):
        try:
            start = datetime.strptime(s["start_date"], "%Y-%m-%d")
            end = datetime.strptime(s["end_date"], "%Y-%m-%d")
            if start >= end:
                log.warning(f"  Invalid date range: {s['start_date']} >= {s['end_date']} for '{s['name']}'")
                return False
        except ValueError:
            log.warning(f"  Invalid date format in season '{s['name']}'")
            return False
    # Validate bag limits
    bag = s.get("bag_limit", {})
    if bag and isinstance(bag, dict):
        daily = bag.get("daily")
        possession = bag.get("possession")
        if daily is not None and isinstance(daily, (int, float)) and daily < 0:
            return False
        if possession is not None and isinstance(possession, (int, float)) and possession < 0:
            return False
    return True


def validate_license(lic: dict) -> bool:
    """Validate an extracted license record."""
    if not lic.get("name"):
        return False
    if not lic.get("license_type"):
        return False
    # Validate prices
    for field in ("price_resident", "price_non_resident"):
        val = lic.get(field)
        if val is not None and val < 0:
            return False
    return True


# ============================================
# DATABASE OPERATIONS
# ============================================

def load_documents(conn, state_code: str) -> list[dict]:
    """Load documents for a specific state from the DB, deduplicated by source_url."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (d.source_url)
                d.id, d.title, d.content, d.source_url, d.document_type, s.id as state_id
            FROM documents d
            JOIN states s ON d.state_id = s.id
            WHERE s.code = %s
            AND length(d.content) > 200
            AND d.title NOT ILIKE '%%pfas%%'
            AND d.title NOT ILIKE '%%commercial fish%%'
            -- Exclude crawl-trap / non-authoritative noise from the state_regulations scraper's
            -- over-broad link-following. These pages carry no statewide season/license/regulation
            -- content, and feeding them to the LLM extractor is both slow AND a correctness risk:
            -- news articles in particular cause the model to hallucinate "seasons" out of prose
            -- (e.g. AR's /news/ 'Waterfowl Report' pages). Filtering these keeps every state's doc
            -- set small enough to extract in one pass and keeps extraction grounded in real reg
            -- pages. Cuts e.g. TX 558->69, KS 684->69, AR 202->~11. See CONSTRAINTS.md scraper note.
            AND d.source_url NOT ILIKE '%%huntwild/hunt/wma%%'  -- TX per-WMA amenity pages
            AND d.source_url NOT ILIKE '%%/layout/%%'           -- KS CMS template URLs
            AND d.source_url NOT ILIKE '%%/news/%%'             -- news articles (all states)
            AND d.source_url NOT ILIKE '%%/tag/%%'              -- blog/news tag index pages
            AND d.source_url NOT ILIKE '%%/category/%%'         -- blog category index pages
            AND d.source_url NOT ILIKE '%%wp-content%%'         -- WordPress media/attachments
            -- Only extract from the freshest scrape for this state. The documents table
            -- accumulates every historical scrape, so after a source site restructures its
            -- URLs (as TX/KS/NM did in 2026) the old, now-dead pages linger with stale season
            -- dates and would otherwise contaminate the current-year extraction (and bloat it:
            -- KS alone had 1571 stale docs from an old over-crawl). Scoping to within 3 days of
            -- the state's most recent scrape keeps extraction current and fast.
            AND d.created_at >= (
                SELECT MAX(d2.created_at) FROM documents d2 WHERE d2.state_id = d.state_id
            ) - INTERVAL '3 days'
            ORDER BY d.source_url, d.created_at DESC
        """, (state_code,))
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def load_species_map(conn) -> dict:
    """Load species slug -> id mapping."""
    with conn.cursor() as cur:
        cur.execute("SELECT slug, id FROM species")
        return {row[0]: str(row[1]) for row in cur.fetchall()}


def resolve_species_id(species_name: str, species_map: dict) -> str | None:
    """Resolve a species name to its database ID using alias mapping."""
    if not species_name:
        return None
    slug = SPECIES_ALIASES.get(species_name.lower().strip())
    if slug:
        return species_map.get(slug)
    # Try direct slug match
    return species_map.get(species_name.lower().strip().replace(" ", "-"))


def upsert_seasons(conn, state_id: str, seasons: list[dict], species_map: dict, year: int, source_url: str | None):
    """Delete existing seasons for this state/year and insert new ones.
    Only deletes if we have valid replacements (seasons with dates)."""
    # Pre-check: count how many seasons have valid dates
    valid_count = sum(1 for s in seasons if s.get("start_date") and s.get("end_date"))
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM seasons WHERE state_id = %s AND year = %s", (state_id, year))
        existing = cur.fetchone()[0]

        if valid_count == 0 and existing > 0:
            log.warning(f"  Keeping {existing} existing seasons (no valid replacements extracted)")
            return

        cur.execute("DELETE FROM seasons WHERE state_id = %s AND year = %s", (state_id, year))
        deleted = cur.rowcount
        if deleted:
            log.info(f"  Deleted {deleted} existing seasons for year {year}")

        inserted = 0
        for s in seasons:
            species_id = resolve_species_id(s.get("species"), species_map)
            if not species_id:
                # Default to mallard for generic duck seasons
                species_id = species_map.get("mallard")

            bag_limit = s.get("bag_limit")
            shooting_hours = s.get("shooting_hours")

            start_date = None
            end_date = None
            if s.get("start_date"):
                try:
                    start_date = datetime.strptime(s["start_date"], "%Y-%m-%d")
                except ValueError:
                    pass
            if s.get("end_date"):
                try:
                    end_date = datetime.strptime(s["end_date"], "%Y-%m-%d")
                except ValueError:
                    pass

            if not start_date or not end_date:
                log.warning(f"  Skipping season '{s['name']}' — missing dates")
                continue

            cur.execute("""
                INSERT INTO seasons (state_id, species_id, name, season_type, start_date, end_date, year,
                                     bag_limit, shooting_hours, restrictions, units, source_url, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                state_id, species_id, s["name"], s.get("season_type", "general"),
                start_date, end_date, year,
                json.dumps(bag_limit) if bag_limit else None,
                json.dumps(shooting_hours) if shooting_hours else None,
                s.get("restrictions"),
                json.dumps(s.get("zones")) if s.get("zones") else None,
                source_url,
                json.dumps({"extracted_at": datetime.utcnow().isoformat(), "source": "llm_extraction"}),
            ))
            inserted += 1

        conn.commit()
        log.info(f"  Inserted {inserted} seasons")


def upsert_licenses(conn, state_id: str, licenses: list[dict]):
    """Delete existing licenses for this state and insert new ones."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM licenses WHERE state_id = %s", (state_id,))
        deleted = cur.rowcount
        if deleted:
            log.info(f"  Deleted {deleted} existing licenses")

        inserted = 0
        for lic in licenses:
            cur.execute("""
                INSERT INTO licenses (state_id, name, license_type, description, is_resident_only,
                                      price_resident, price_non_resident, valid_for, purchase_url, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                state_id, lic["name"], lic.get("license_type", "base"),
                lic.get("description"),
                lic.get("is_resident_only", False),
                lic.get("price_resident"),
                lic.get("price_non_resident"),
                json.dumps(lic.get("valid_for")) if lic.get("valid_for") else None,
                lic.get("purchase_url"),
                json.dumps({"extracted_at": datetime.utcnow().isoformat(), "source": "llm_extraction"}),
            ))
            inserted += 1

        conn.commit()
        log.info(f"  Inserted {inserted} licenses")


def upsert_regulations(conn, state_id: str, regs: list[dict], species_map: dict, year: int):
    """Deactivate existing regulations and insert new ones."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE regulations SET is_active = false
            WHERE state_id = %s AND season_year = %s
        """, (state_id, year))
        deactivated = cur.rowcount
        if deactivated:
            log.info(f"  Deactivated {deactivated} existing regulations")

        inserted = 0
        for reg in regs:
            species_id = resolve_species_id(reg.get("species"), species_map)
            cur.execute("""
                INSERT INTO regulations (state_id, species_id, category, title, content, summary,
                                         season_year, is_active, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                state_id, species_id, reg.get("category", "waterfowl"),
                reg["title"], reg["content"], reg.get("summary"),
                year, True,
                json.dumps({"extracted_at": datetime.utcnow().isoformat(), "source": "llm_extraction"}),
            ))
            inserted += 1

        conn.commit()
        log.info(f"  Inserted {inserted} regulations")


# ============================================
# MAIN
# ============================================

FLUSH_EVERY = 50  # Flush to DB after this many docs to survive DNS failures on long runs


def _reconnect(conn):
    """Close old connection and return a fresh one."""
    db_url = os.getenv("DATABASE_URL")
    try:
        conn.close()
    except Exception:
        pass
    return psycopg2.connect(db_url)


def _clear_state_data(conn, state_id: str, year: int):
    """Delete all existing extraction data for a state before a fresh run."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM seasons WHERE state_id = %s AND year = %s", (state_id, year))
        cur.execute("DELETE FROM licenses WHERE state_id = %s", (state_id,))
        cur.execute("UPDATE regulations SET is_active = false WHERE state_id = %s AND season_year = %s", (state_id, year))
    conn.commit()
    log.info(f"  Cleared existing data for state_id={state_id} year={year}")


def _append_seasons(conn, state_id: str, seasons: list[dict], species_map: dict, year: int, seen: set):
    """Append new (deduped) seasons to DB, skipping names already seen."""
    inserted = 0
    with conn.cursor() as cur:
        for s in seasons:
            key = s["name"].lower().strip()
            if key in seen:
                continue
            seen.add(key)

            species_id = resolve_species_id(s.get("species"), species_map)
            if not species_id:
                species_id = species_map.get("mallard")

            start_date = end_date = None
            if s.get("start_date"):
                try:
                    start_date = datetime.strptime(s["start_date"], "%Y-%m-%d")
                except ValueError:
                    pass
            if s.get("end_date"):
                try:
                    end_date = datetime.strptime(s["end_date"], "%Y-%m-%d")
                except ValueError:
                    pass

            if not start_date or not end_date:
                log.warning(f"  Skipping season '{s['name']}' — missing dates")
                continue

            bag_limit = s.get("bag_limit")
            shooting_hours = s.get("shooting_hours")
            cur.execute("""
                INSERT INTO seasons (state_id, species_id, name, season_type, start_date, end_date, year,
                                     bag_limit, shooting_hours, restrictions, units, source_url, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                state_id, species_id, s["name"], s.get("season_type", "general"),
                start_date, end_date, year,
                json.dumps(bag_limit) if bag_limit else None,
                json.dumps(shooting_hours) if shooting_hours else None,
                s.get("restrictions"),
                json.dumps(s.get("zones")) if s.get("zones") else None,
                None,
                json.dumps({"extracted_at": datetime.utcnow().isoformat(), "source": "llm_extraction"}),
            ))
            inserted += 1
    conn.commit()
    return inserted


def _append_licenses(conn, state_id: str, licenses: list[dict], seen: set):
    """Append new (deduped) licenses to DB, skipping names already seen."""
    inserted = 0
    with conn.cursor() as cur:
        for lic in licenses:
            key = lic["name"].lower().strip()
            if key in seen:
                continue
            seen.add(key)
            cur.execute("""
                INSERT INTO licenses (state_id, name, license_type, description, is_resident_only,
                                      price_resident, price_non_resident, valid_for, purchase_url, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                state_id, lic["name"], lic.get("license_type", "base"),
                lic.get("description"),
                lic.get("is_resident_only", False),
                lic.get("price_resident"),
                lic.get("price_non_resident"),
                json.dumps(lic.get("valid_for")) if lic.get("valid_for") else None,
                lic.get("purchase_url"),
                json.dumps({"extracted_at": datetime.utcnow().isoformat(), "source": "llm_extraction"}),
            ))
            inserted += 1
    conn.commit()
    return inserted


def _append_regulations(conn, state_id: str, regs: list[dict], species_map: dict, year: int, seen: set):
    """Append new (deduped) regulations to DB, skipping titles already seen."""
    inserted = 0
    with conn.cursor() as cur:
        for reg in regs:
            if not reg.get("title") or not reg.get("content"):
                continue
            key = reg["title"].lower().strip()
            if key in seen:
                continue
            seen.add(key)
            species_id = resolve_species_id(reg.get("species"), species_map)
            cur.execute("""
                INSERT INTO regulations (state_id, species_id, category, title, content, summary,
                                         season_year, is_active, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                state_id, species_id, reg.get("category", "waterfowl"),
                reg["title"], reg["content"], reg.get("summary"),
                year, True,
                json.dumps({"extracted_at": datetime.utcnow().isoformat(), "source": "llm_extraction"}),
            ))
            inserted += 1
    conn.commit()
    return inserted


def process_state(conn, state_code: str, model: str, dry_run: bool, year: int):
    """Process all documents for a single state."""
    log.info(f"\n{'='*50}")
    log.info(f"Processing {state_code}")
    log.info(f"{'='*50}")

    docs = load_documents(conn, state_code)
    log.info(f"Found {len(docs)} documents for {state_code}")

    if not docs:
        return

    species_map = load_species_map(conn)
    state_id = str(docs[0]["state_id"])

    # Accumulate for dry-run display; for live runs flush periodically
    all_seasons = []
    all_licenses = []
    all_regulations = []

    # Seen-name sets used for dedup across flushes
    seen_seasons: set = set()
    seen_licenses: set = set()
    seen_regs: set = set()

    if not dry_run:
        conn = _reconnect(conn)
        _clear_state_data(conn, state_id, year)

    batch_seasons: list = []
    batch_licenses: list = []
    batch_regs: list = []
    docs_since_flush = 0

    def flush(force=False):
        nonlocal conn, docs_since_flush, batch_seasons, batch_licenses, batch_regs
        if dry_run:
            return
        if not force and docs_since_flush < FLUSH_EVERY:
            return
        try:
            s = _append_seasons(conn, state_id, batch_seasons, species_map, year, seen_seasons)
            l = _append_licenses(conn, state_id, batch_licenses, seen_licenses)
            r = _append_regulations(conn, state_id, batch_regs, species_map, year, seen_regs)
            if s or l or r:
                log.info(f"  [flush] +{s} seasons, +{l} licenses, +{r} regs")
        except Exception as e:
            log.warning(f"  [flush] DB error, reconnecting: {e}")
            conn = _reconnect(conn)
            s = _append_seasons(conn, state_id, batch_seasons, species_map, year, seen_seasons)
            l = _append_licenses(conn, state_id, batch_licenses, seen_licenses)
            r = _append_regulations(conn, state_id, batch_regs, species_map, year, seen_regs)
            log.info(f"  [flush retry] +{s} seasons, +{l} licenses, +{r} regs")
        batch_seasons = []
        batch_licenses = []
        batch_regs = []
        docs_since_flush = 0

    for doc in docs:
        # Strip CSS/JS/nav boilerplate once so the real regulation text lands inside the
        # classify/extraction windows (see clean_content docstring — fixes KS pages whose
        # season tables sat past char 32,000 behind inline styles and AngularJS bootstrap).
        doc["content"] = clean_content(doc["content"])
        log.info(f"\nClassifying: '{doc['title']}'")
        categories = classify_document(doc, model)

        if not categories:
            log.info(f"  Skipped (no relevant content)")
            docs_since_flush += 1
            flush()
            continue

        log.info(f"  Categories: {categories}")

        # Only run each extractor for a category the classifier actually flagged. Calling all
        # three on every relevant doc tripled the LLM calls (and wall-clock) for no gain — a
        # season-only page still paid for license+regulation extractions that returned nothing.
        if "seasons" in categories:
            seasons = [normalize_season_dates(s) for s in extract_seasons(doc, state_code, model, year=year)]
            valid = [s for s in seasons if validate_season(s)]
            if len(valid) < len(seasons):
                log.warning(f"  {len(seasons) - len(valid)} seasons failed validation")
            batch_seasons.extend(valid)
            all_seasons.extend(valid)

        if "licenses" in categories:
            licenses = extract_licenses(doc, state_code, model)
            valid = [l for l in licenses if validate_license(l)]
            if len(valid) < len(licenses):
                log.warning(f"  {len(licenses) - len(valid)} licenses failed validation")
            batch_licenses.extend(valid)
            all_licenses.extend(valid)

        if "regulations" in categories:
            regs = extract_regulations(doc, state_code, model)
            valid_regs = [r for r in regs if r.get("title") and r.get("content")]
            batch_regs.extend(valid_regs)
            all_regulations.extend(valid_regs)

        docs_since_flush += 1
        flush()

    # Final flush
    flush(force=True)

    # Summary
    log.info(f"\n--- {state_code} Summary ---")
    log.info(f"  Seasons:     {len(seen_seasons)}")
    log.info(f"  Licenses:    {len(seen_licenses)}")
    log.info(f"  Regulations: {len(seen_regs)}")

    if dry_run:
        log.info("\n[DRY RUN] Extracted data (not written to DB):")
        # Deduplicate for display
        seen = set()
        for s in all_seasons:
            key = s["name"].lower().strip()
            if key not in seen:
                seen.add(key)
                log.info(f"  Season: {s['name']}: {s.get('start_date')} to {s.get('end_date')} | bag: {s.get('bag_limit')}")
        seen = set()
        for l in all_licenses:
            key = l["name"].lower().strip()
            if key not in seen:
                seen.add(key)
                log.info(f"  License: {l['name']} ({l.get('license_type')}) R:${l.get('price_resident')} NR:${l.get('price_non_resident')}")
        seen = set()
        for r in all_regulations:
            key = r["title"].lower().strip()
            if key not in seen:
                seen.add(key)
                log.info(f"  Reg: [{r.get('category')}] {r['title']}")

    if not dry_run:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Extract structured regulation data from scraped documents")
    parser.add_argument("--state", type=str, help="Process a specific state (e.g., TX)")
    parser.add_argument("--dry-run", action="store_true", help="Extract and validate but don't write to DB")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Together.ai model to use")
    parser.add_argument("--year", type=int, default=2024, help="Season year (default: 2024)")
    args = parser.parse_args()

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        log.error("DATABASE_URL not set")
        sys.exit(1)

    if not os.getenv("TOGETHER_API_KEY"):
        log.error("TOGETHER_API_KEY not set")
        sys.exit(1)

    conn = psycopg2.connect(db_url)

    states_to_process = [args.state.upper()] if args.state else V1_STATES

    log.info(f"Extraction settings:")
    log.info(f"  Model:  {args.model}")
    log.info(f"  States: {', '.join(states_to_process)}")
    log.info(f"  Year:   {args.year}")
    log.info(f"  Mode:   {'DRY RUN' if args.dry_run else 'LIVE'}")

    for state_code in states_to_process:
        try:
            process_state(conn, state_code, args.model, args.dry_run, args.year)
        except Exception as e:
            log.error(f"Error processing {state_code}: {e}")
            conn.rollback()

    conn.close()
    log.info("\nExtraction complete!")


if __name__ == "__main__":
    main()
