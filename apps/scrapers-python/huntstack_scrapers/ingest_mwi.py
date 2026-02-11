"""
Ingest USFWS Mid-Winter Waterfowl Inventory (MWI) CSV data into refuge_counts.

Reads the pre-downloaded MWI CSV files (CF.csv for Central Flyway, MF.csv for
Mississippi Flyway) and inserts annual state-level bird count records.

Data source: USFWS Migratory Bird Data Center
GitHub mirror: github.com/aannanie/USFWS_Mid-Winter_Waterfowl_Survey_App

Usage:
    python -m huntstack_scrapers.ingest_mwi --csv data/CF.csv
    python -m huntstack_scrapers.ingest_mwi --csv data/MF.csv
    python -m huntstack_scrapers.ingest_mwi --csv data/CF.csv --dry-run
"""

import os
import csv
import argparse
import logging
from datetime import datetime

import psycopg2
from dotenv import load_dotenv

from huntstack_scrapers.species_mapping import MWI_COLUMN_MAPPING

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ingest_mwi")

# V1 priority state codes
V1_STATES = {"TX", "NM", "AR", "LA", "KS", "OK"}

# Non-species columns in the CSV
META_COLUMNS = {"Year", "State", "Flyway", "Zone"}


def load_mappings(conn) -> tuple[dict, dict]:
    """Load location and species mappings from DB."""
    # State code -> MWI aggregate location_id
    location_map: dict[str, str] = {}
    with conn.cursor() as cur:
        cur.execute("""
            SELECT l.id, s.code
            FROM locations l
            JOIN states s ON l.state_id = s.id
            WHERE l.name LIKE '%% - Statewide MWI'
        """)
        for loc_id, state_code in cur.fetchall():
            location_map[state_code] = str(loc_id)

    # Species slug -> species_id
    species_map: dict[str, str] = {}
    with conn.cursor() as cur:
        cur.execute("SELECT slug, id FROM species")
        for slug, sp_id in cur.fetchall():
            species_map[slug] = str(sp_id)

    return location_map, species_map


def parse_count(value: str) -> int | None:
    """Parse a count value from CSV, handling commas and empty strings."""
    if not value or not value.strip():
        return None
    try:
        return int(value.strip().replace(",", ""))
    except ValueError:
        return None


def ingest_csv(csv_path: str, dry_run: bool = False):
    """Read MWI CSV and insert counts into refuge_counts."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url and not dry_run:
        log.error("DATABASE_URL not set")
        return

    conn = None
    if not dry_run:
        conn = psycopg2.connect(db_url)

    # Load mappings
    if conn:
        location_map, species_map = load_mappings(conn)
    else:
        location_map, species_map = {}, {}

    log.info(f"Loaded {len(location_map)} MWI location mappings, {len(species_map)} species")

    # Build column name -> (species_slug, species_id) mapping
    column_species: dict[str, tuple[str, str | None]] = {}
    for col_name, slug in MWI_COLUMN_MAPPING.items():
        if slug is not None:
            species_id = species_map.get(slug)
            column_species[col_name] = (slug, species_id)

    log.info(f"Mapped {len(column_species)} species columns")
    for col, (slug, sp_id) in column_species.items():
        status = "OK" if sp_id else "MISSING IN DB"
        log.info(f"  {col} -> {slug} [{status}]")

    # Read CSV
    total_rows = 0
    inserted = 0
    skipped_state = 0
    skipped_species = 0

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)

        # Normalize column names (handle extra spaces)
        if reader.fieldnames:
            reader.fieldnames = [name.strip() for name in reader.fieldnames]

        for row in reader:
            year = row.get("Year", "").strip()
            state = row.get("State", "").strip()

            if not year or not state:
                continue

            # Only process V1 states
            if state not in V1_STATES:
                skipped_state += 1
                continue

            total_rows += 1
            location_id = location_map.get(state)
            if not location_id:
                log.warning(f"  No MWI location for state {state}")
                continue

            survey_date = f"{year}-01-15"  # MWI surveys happen mid-January
            zone = row.get("Zone", "").strip()

            for col_name, (slug, species_id) in column_species.items():
                if not species_id:
                    continue

                count = parse_count(row.get(col_name, ""))
                if count is None or count == 0:
                    continue

                if dry_run:
                    log.info(f"  [DRY RUN] {state} {year} {slug}: {count:,}")
                    inserted += 1
                    continue

                try:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO refuge_counts
                                (location_id, species_id, survey_date, count, survey_type,
                                 source_url, notes, metadata)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                            ON CONFLICT (location_id, species_id, survey_date, survey_type)
                            DO NOTHING
                        """, (
                            location_id,
                            species_id,
                            survey_date,
                            count,
                            "mwi_annual",
                            "https://migbirdapps.fws.gov/mbdc/databases/mwi/mwidb.asp",
                            f"Zone: {zone}" if zone else None,
                            f'{{"zone": "{zone}", "flyway": "{row.get("Flyway", "").strip()}"}}',
                        ))
                    inserted += 1
                except Exception as e:
                    log.warning(f"  Error inserting {state} {year} {slug}: {e}")
                    conn.rollback()

            if conn and total_rows % 10 == 0:
                conn.commit()

    if conn:
        conn.commit()

    log.info(f"\nSummary:")
    log.info(f"  CSV rows processed: {total_rows}")
    log.info(f"  Rows skipped (non-V1 state): {skipped_state}")
    log.info(f"  Count records inserted: {inserted}")

    if conn:
        # Show per-state counts
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.code, count(*)
                FROM refuge_counts rc
                JOIN locations l ON rc.location_id = l.id
                JOIN states s ON l.state_id = s.id
                WHERE rc.survey_type = 'mwi_annual'
                GROUP BY s.code
                ORDER BY s.code
            """)
            log.info(f"\nMWI counts per state:")
            for code, cnt in cur.fetchall():
                log.info(f"  {code}: {cnt} records")

        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Ingest USFWS MWI CSV data")
    parser.add_argument("--csv", required=True, help="Path to MWI CSV file")
    parser.add_argument("--dry-run", action="store_true", help="Parse and validate only")
    args = parser.parse_args()

    if not os.path.exists(args.csv):
        log.error(f"CSV file not found: {args.csv}")
        return

    log.info(f"Ingesting MWI data from: {args.csv}")
    log.info(f"Dry run: {args.dry_run}")

    ingest_csv(args.csv, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
