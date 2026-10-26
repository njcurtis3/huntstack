"""
Ingest the USFWS Central Flyway Mid-Winter Waterfowl Survey report (PDF) into refuge_counts.

The report reprints the per-state species tables for the last ~11 Januaries
("JANUARY 2024 MID-WINTER WATERFOWL SURVEY - CENTRAL FLYWAY": SPECIES x ND..TX + TOTAL).
That extends the Statewide MWI history for KS/OK/NM/TX past 2016, where the CSV behind
ingest_mwi.py stops.

Older tables leave cells blank instead of printing 0, so values are assigned to a state by
their horizontal position under the column header, not by their order in the line. Every
row is then checked: the ten state columns must add up to its TOTAL column, or the row is
dropped.

Existing years are never overwritten (ON CONFLICT DO NOTHING). The CSV and this report are
different compilations — TX 2015 mallards are 586,048 in one and 564,868 in the other — so
keeping one source per year avoids mixing them inside a year.

Usage:
    python -m huntstack_scrapers.ingest_cf_mws --pdf central-flyway-midwinter-survey-report-2024.pdf --dry-run
    python -m huntstack_scrapers.ingest_cf_mws --pdf central-flyway-midwinter-survey-report-2024.pdf
Source: https://fws.gov/sites/default/files/documents/2025-02/central-flyway-midwinter-survey-report-2024.pdf
"""

import argparse
import logging
import os
import re

from dotenv import load_dotenv

log = logging.getLogger("ingest_cf_mws")

STATE_COLUMNS = ["ND", "MT", "SD", "WY", "CO", "NE", "KS", "OK", "NM", "TX"]
INGEST_STATES = {"KS", "OK", "NM", "TX"}  # states with a "<State> - Statewide MWI" location

# Report row label -> species slug (same slugs ingest_mwi.py writes). Totals, swans, coots,
# mergansers, goldeneyes and unidentified ducks are not tracked species.
ROW_TO_SLUG = {
    "Mallard": "mallard",
    "Mottled Duck": "mottled-duck",
    "Gadwall": "gadwall",
    "Wigeon": "american-wigeon",
    "G-W Teal": "green-winged-teal",
    "BW/CIN Teal": "blue-winged-teal",
    "Shoveler": "northern-shoveler",
    "Pintail": "pintail",
    "Wood Duck": "wood-duck",
    "Redhead": "redhead",
    "Canvasback": "canvasback",
    "Scaup": "scaup",
    "Ringnecked duck": "ring-necked-duck",
    "Ringneck": "ring-necked-duck",
    "Bufflehead": "bufflehead",
    "Ruddy Duck": "ruddy-duck",
    "Snow/Blue Goose": "snow-goose",
    "Ross's Goose": "ross-goose",
    "Whitefront": "white-fronted-goose",
    "Canada/Cackling Goose": "canada-goose",
    "Canada Goose": "canada-goose",
}

_TITLE_RE = re.compile(r"JANUARY (\d{4}) MID-WINTER WATERFOWL SURVEY - CENTRAL FLYWAY")
_NUM_RE = re.compile(r"^\d[\d,]*$")


def _norm(label: str) -> str:
    return label.replace("’", "'").strip()


def parse_state_table(words: list[dict]) -> tuple[int, dict[str, dict[str, int]]] | None:
    """
    Parse one report page from pdfplumber words (dicts with text, x0, x1, top).
    Returns (year, {state: {slug: count}}) for the species rows that pass the TOTAL check.
    """
    text = " ".join(w["text"] for w in words)
    title = _TITLE_RE.search(text)
    if not title:
        return None
    year = int(title.group(1))

    header = next((w for w in words if w["text"] == "SPECIES"), None)
    if not header:
        return None
    header_line = [w for w in words if abs(w["top"] - header["top"]) < 3]
    columns: dict[str, float] = {}
    for w in header_line:
        if w["text"] in STATE_COLUMNS or w["text"] == "TOTAL":
            columns[w["text"]] = (w["x0"] + w["x1"]) / 2
    if len(columns) != len(STATE_COLUMNS) + 1:
        log.warning(f"{year}: header has {sorted(columns)}; skipping page")
        return None
    first_col_x = min(columns.values())
    col_gap = min(abs(a - b) for i, a in enumerate(sorted(columns.values())) for b in sorted(columns.values())[i + 1:])

    # Group words into lines by vertical position
    lines: dict[int, list[dict]] = {}
    for w in words:
        if w["top"] <= header["top"] + 2:
            continue
        lines.setdefault(round(w["top"]), []).append(w)

    out: dict[str, dict[str, int]] = {s: {} for s in INGEST_STATES}
    for _, line in sorted(lines.items()):
        line.sort(key=lambda w: w["x0"])
        label_words = [w for w in line if not _NUM_RE.match(w["text"]) and w["x1"] < first_col_x - col_gap / 2]
        label = _norm(" ".join(w["text"] for w in label_words))
        slug = ROW_TO_SLUG.get(label)
        if not slug:
            continue

        values: dict[str, int] = {}
        for w in line:
            if not _NUM_RE.match(w["text"]) or w in label_words:
                continue
            centre = (w["x0"] + w["x1"]) / 2
            col, x = min(columns.items(), key=lambda kv: abs(kv[1] - centre))
            # 3/4 of a column gap: the 2022 table prints its totals ~20pt right of the heading.
            # A value assigned to the wrong column still fails the TOTAL check below.
            if abs(x - centre) > col_gap * 0.75:
                continue  # doesn't sit under any column
            values[col] = int(w["text"].replace(",", ""))

        total = values.get("TOTAL")
        states_sum = sum(values.get(s, 0) for s in STATE_COLUMNS)
        if total is None or states_sum != total:
            log.warning(f"{year} {label}: states sum {states_sum:,} != TOTAL {total}; row dropped")
            continue
        for s in INGEST_STATES:
            count = values.get(s, 0)
            if count > 0:
                # Two report rows can share a slug (Canada Goose naming changed); keep the larger
                out[s][slug] = max(out[s].get(slug, 0), count)
    return year, out


def parse_report(pdf_path: str) -> dict[int, dict[str, dict[str, int]]]:
    import pdfplumber

    years: dict[int, dict[str, dict[str, int]]] = {}
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            parsed = parse_state_table(page.extract_words(keep_blank_chars=False, use_text_flow=False))
            if parsed:
                year, by_state = parsed
                years[year] = by_state
    return years


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    years = parse_report(args.pdf)
    log.info(f"Parsed {len(years)} survey years: {sorted(years)}")
    for year in sorted(years):
        tx = years[year].get("TX", {})
        log.info(f"  {year}: TX mallard {tx.get('mallard', 0):,}, TX species {len(tx)}")
    if args.dry_run:
        return

    import psycopg2

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    with conn, conn.cursor() as cur:
        cur.execute("""
            SELECT s.code, l.id FROM locations l JOIN states s ON s.id = l.state_id
            WHERE l.name LIKE '%% - Statewide MWI'
        """)
        location = {code: lid for code, lid in cur.fetchall()}
        cur.execute("SELECT slug, id FROM species")
        species = {slug: sid for slug, sid in cur.fetchall()}

        inserted = 0
        for year, by_state in sorted(years.items()):
            for state, counts in by_state.items():
                if state not in location:
                    continue
                for slug, count in counts.items():
                    if slug not in species:
                        continue
                    cur.execute("""
                        INSERT INTO refuge_counts (location_id, species_id, survey_date, count, survey_type, source_url, notes)
                        VALUES (%s, %s, %s, %s, 'mwi_annual', %s, %s)
                        ON CONFLICT (location_id, species_id, survey_date, survey_type) DO NOTHING
                    """, (
                        location[state], species[slug], f"{year}-01-15", count,
                        "https://fws.gov/sites/default/files/documents/2025-02/central-flyway-midwinter-survey-report-2024.pdf",
                        "USFWS Central Flyway Mid-Winter Survey report (2024 edition)",
                    ))
                    inserted += cur.rowcount
        log.info(f"Inserted {inserted} new rows (existing years left untouched)")
    conn.close()


if __name__ == "__main__":
    main()
