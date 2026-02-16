"""
LLM-based extraction of structured regulation data from scraped documents.

Reads raw text from the `documents` table and uses Together.ai LLM to extract
structured seasons, licenses, and regulations into their respective DB tables.

Usage:
    python -m huntstack_scrapers.extract_regulations
    python -m huntstack_scrapers.extract_regulations --state TX
    python -m huntstack_scrapers.extract_regulations --dry-run
    python -m huntstack_scrapers.extract_regulations --model meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo
"""

import os
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

DEFAULT_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"
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
            "temperature": 0.1,
            "max_tokens": 4096,
            "response_format": {"type": "json_object"},
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


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
    prompt = f"State: {state_code}\nSeason year: {year}-{year+1} (fall {year} through spring {year+1})\nDocument title: {doc['title']}\nSource URL: {doc.get('source_url', 'unknown')}\n\nDocument content:\n{doc['content'][:16000]}"

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
    prompt = f"State: {state_code}\nDocument title: {doc['title']}\nSource URL: {doc.get('source_url', 'unknown')}\n\nDocument content:\n{doc['content'][:16000]}"

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
    prompt = f"State: {state_code}\nDocument title: {doc['title']}\nSource URL: {doc.get('source_url', 'unknown')}\n\nDocument content:\n{doc['content'][:16000]}"

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
    state_id = docs[0]["state_id"]

    all_seasons = []
    all_licenses = []
    all_regulations = []

    for doc in docs:
        log.info(f"\nClassifying: '{doc['title']}'")
        categories = classify_document(doc, model)

        if not categories:
            log.info(f"  Skipped (no relevant content)")
            continue

        log.info(f"  Categories: {categories}")

        # Extract all types for any waterfowl-relevant doc (classifier sometimes
        # misses "seasons" when dates are embedded in regulation text)
        seasons = extract_seasons(doc, state_code, model, year=year)
        valid = [s for s in seasons if validate_season(s)]
        if len(valid) < len(seasons):
            log.warning(f"  {len(seasons) - len(valid)} seasons failed validation")
        all_seasons.extend(valid)

        licenses = extract_licenses(doc, state_code, model)
        valid = [l for l in licenses if validate_license(l)]
        if len(valid) < len(licenses):
            log.warning(f"  {len(licenses) - len(valid)} licenses failed validation")
        all_licenses.extend(valid)

        regs = extract_regulations(doc, state_code, model)
        all_regulations.extend([r for r in regs if r.get("title") and r.get("content")])

    # Deduplicate by name
    seen_seasons = set()
    deduped_seasons = []
    for s in all_seasons:
        key = s["name"].lower().strip()
        if key not in seen_seasons:
            seen_seasons.add(key)
            deduped_seasons.append(s)

    seen_licenses = set()
    deduped_licenses = []
    for l in all_licenses:
        key = l["name"].lower().strip()
        if key not in seen_licenses:
            seen_licenses.add(key)
            deduped_licenses.append(l)

    seen_regs = set()
    deduped_regs = []
    for r in all_regulations:
        key = r["title"].lower().strip()
        if key not in seen_regs:
            seen_regs.add(key)
            deduped_regs.append(r)

    # Summary
    log.info(f"\n--- {state_code} Summary ---")
    log.info(f"  Seasons:     {len(deduped_seasons)}")
    log.info(f"  Licenses:    {len(deduped_licenses)}")
    log.info(f"  Regulations: {len(deduped_regs)}")

    if dry_run:
        log.info("\n[DRY RUN] Extracted data (not written to DB):")
        if deduped_seasons:
            log.info("\nSeasons:")
            for s in deduped_seasons:
                log.info(f"  {s['name']}: {s.get('start_date')} to {s.get('end_date')} | bag: {s.get('bag_limit')}")
        if deduped_licenses:
            log.info("\nLicenses:")
            for l in deduped_licenses:
                log.info(f"  {l['name']} ({l.get('license_type')}) R:${l.get('price_resident')} NR:${l.get('price_non_resident')}")
        if deduped_regs:
            log.info("\nRegulations:")
            for r in deduped_regs:
                log.info(f"  [{r.get('category')}] {r['title']}")
        return

    # Reconnect before writing (long extraction can cause Supabase connection timeout)
    db_url = os.getenv("DATABASE_URL")
    try:
        conn.close()
    except Exception:
        pass
    conn = psycopg2.connect(db_url)

    # Write to DB
    if deduped_seasons:
        upsert_seasons(conn, str(state_id), deduped_seasons, species_map, year, None)
    if deduped_licenses:
        upsert_licenses(conn, str(state_id), deduped_licenses)
    if deduped_regs:
        upsert_regulations(conn, str(state_id), deduped_regs, species_map, year)

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
