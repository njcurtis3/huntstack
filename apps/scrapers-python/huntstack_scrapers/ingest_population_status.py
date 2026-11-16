"""
Load the USFWS "Waterfowl Population Status" report (the May breeding survey) into the
documents chat searches, so Ask AI can answer "how are pintail numbers this year?".

The report is two columns of prose around full-width tables and charts, and plain text
extraction interleaves the columns ("...similar to the 2025 estimate and term average...").
So the document is built from the parts that extract cleanly:

  1. the Executive Summary (single column): every duck species, ponds, and the goose and
     swan populations, in sentences;
  2. Tables 2-12 (total ducks, then mallard through scaup), each row written out as a sentence:
     "Mallard breeding population, Eastern Dakotas: 614 thousand in 2026, 833 thousand in
     2025 (-26%), long-term average 1,103 thousand (-44%)."

A change the report does not call significant (P >= 0.10, the report's own threshold for
"similar") is written as "similar", so chat doesn't present noise as a trend.

The document has no state (the survey covers the northern breeding grounds, not a state), so
chat finds it on questions that name no state. The Migration page's "2026 breeding
population" card (apps/web/src/lib/breedingPopulation.ts) carries the same Total rows; a
dry run prints them to check against it.

Usage (from apps/scrapers-python):
    python -m huntstack_scrapers.ingest_population_status --pdf waterfowl-population-status-report-2026.pdf --dry-run
    python -m huntstack_scrapers.ingest_population_status --pdf waterfowl-population-status-report-2026.pdf
Source: https://www.fws.gov/sites/default/files/documents/2026-09/waterfowl-population-status-report-2026.pdf
"""

import argparse
import json
import logging
import os
import re
import sys

import pdfplumber
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))

from huntstack_scrapers.pipelines import EmbeddingPipeline  # noqa: E402

log = logging.getLogger("ingest_population_status")

YEAR = 2026
SOURCE_URL = ("https://www.fws.gov/sites/default/files/documents/2026-09/"
              "waterfowl-population-status-report-2026.pdf")
TITLE = f"Waterfowl Population Status, {YEAR} (USFWS breeding population survey)"

# Table number -> what its rows count
TABLES = {
    2: "Total duck",
    3: "Mallard",
    4: "Gadwall",
    5: "American wigeon",
    6: "Green-winged teal",
    7: "Northern shoveler",
    8: "Blue-winged teal",
    9: "Northern pintail",
    10: "Redhead",
    11: "Canvasback",
    12: "Scaup (greater and lesser)",
}

# "S. Manitoba 194 336 −42 <0.001 393 −51 <0.001": name, 2026, prior year, %, P, LTA, %, P
ROW_RE = re.compile(
    r"^(?P<name>.*?)\s*(?P<now>[\d,]+) (?P<prev>[\d,]+) (?P<pct>[+−-]?[\d,]+) (?P<p><?[\d.]+) "
    r"(?P<lta>[\d,]+) (?P<ltapct>[+−-]?[\d,]+) (?P<ltap><?[\d.]+)$"
)


def _num(s: str) -> int:
    return int(s.replace(",", ""))


def _pct(s: str) -> int:
    return int(s.replace("−", "-").replace("+", "").replace(",", ""))


def _p(s: str) -> float:
    return float(s.lstrip("<"))


def page_texts(pdf_path: str) -> list[str]:
    with pdfplumber.open(pdf_path) as pdf:
        return [(p.extract_text() or "") for p in pdf.pages]


def executive_summary(pages: list[str]) -> str:
    """The text from "Executive Summary" up to the table of contents, page numbers dropped."""
    text = "\n".join(pages[:8])
    start = text.index("Executive Summary")
    end = text.index("Table of Contents", start)
    lines = [ln for ln in text[start:end].splitlines() if not re.fullmatch(r"[ivx]+", ln.strip())]
    # Rejoin the hard-wrapped lines into paragraphs; a heading is a short line with no period
    out, para = [], []
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if len(s) < 60 and not s.endswith(".") and not para:
            out.append(s)
            continue
        para.append(s)
        if s.endswith("."):
            out.append(" ".join(para))
            para = []
    if para:
        out.append(" ".join(para))
    return "\n\n".join(out)


def parse_tables(pages: list[str]) -> dict[int, list[dict]]:
    """Rows of Tables 2-12. A region name wrapped around its numbers ("Alaska—Yukon
    Territory—" / numbers / "Old Crow Flats") is put back together."""
    tables: dict[int, list[dict]] = {}
    for page in pages:
        lines = page.splitlines()
        current = None
        section = None
        for i, line in enumerate(lines):
            m = re.match(r"^Table (\d+)\. ", line)
            if m:
                n = int(m.group(1))
                current = n if n in TABLES and n not in tables else None
                if current:
                    tables[current] = []
                    section = None
                continue
            if current is None:
                continue
            s = line.strip()
            if s in ("Traditional Survey Area", "Other Regions"):
                section = s
                continue
            if re.match(r"^[a-z] ", s) or s.startswith("Figure"):
                current = None  # footnotes: the table is over
                continue
            r = ROW_RE.match(s)
            if not r:
                continue
            name = r.group("name").strip()
            if not name or name.endswith("—") or name.endswith("British"):
                before = lines[i - 1].strip() if not name else name
                after = lines[i + 1].strip() if i + 1 < len(lines) else ""
                if not name:
                    name = f"{before} {after}" if not before.endswith("—") else f"{before}{after}"
                else:
                    name = f"{name}{after}" if name.endswith("—") else f"{name} {after}"
            tables[current].append({
                "region": name,
                "section": section,
                "now": _num(r.group("now")),
                "prev": _num(r.group("prev")),
                "pct": _pct(r.group("pct")),
                "p": _p(r.group("p")),
                "lta": _num(r.group("lta")),
                "ltaPct": _pct(r.group("ltapct")),
                "ltaP": _p(r.group("ltap")),
            })
    return tables


def _change(pct: int, p: float) -> str:
    if p >= 0.10:
        return "similar"
    return f"{'+' if pct > 0 else ''}{pct}%"


def table_sentences(tables: dict[int, list[dict]]) -> str:
    out = []
    for n, what in TABLES.items():
        rows = tables.get(n, [])
        total = next(r for r in rows if r["region"] == "Total")
        # The overall number first, in the words a question uses ("how are pintail numbers this
        # year?"), so the chunk that answers it is the one with the species name in it. Chat
        # quoted regional rows and missed the total when it came last.
        lines = [
            f"How are {what.lower()} numbers this year? {what} breeding population, {YEAR}, whole "
            f"traditional survey area: {total['now']:,} thousand birds ({total['now'] / 1000:.1f} million). "
            f"Change from {YEAR - 1} ({total['prev']:,} thousand): {_change(total['pct'], total['p'])}. "
            f"Change from the long-term average ({total['lta']:,} thousand, 1955-{YEAR - 1}): "
            f"{_change(total['ltaPct'], total['ltaP'])}.",
            f"{what} breeding population by region, {YEAR} (thousands of birds; Table {n} of the report):",
        ]
        for r in rows:
            if r is total:
                continue
            where = ("traditional survey area (all regions above)" if r["region"] == "Total"
                     else r["region"] + (" (outside the traditional survey area)" if r["section"] == "Other Regions" else ""))
            lines.append(
                f"{what} breeding population, {where}: {r['now']:,} thousand in {YEAR}, "
                f"{r['prev']:,} thousand in {YEAR - 1} ({_change(r['pct'], r['p'])}), "
                f"long-term average {r['lta']:,} thousand ({_change(r['ltaPct'], r['ltaP'])})."
            )
        out.append("\n".join(lines))
    return "\n\n".join(out)


def build_document(pdf_path: str) -> tuple[str, dict[int, list[dict]]]:
    pages = page_texts(pdf_path)
    tables = parse_tables(pages)
    missing = [n for n in TABLES if not any(r["region"] == "Total" for r in tables.get(n, []))]
    if missing:
        raise SystemExit(f"No Total row found in table(s) {missing}; the report's layout changed")
    intro = (
        f"U.S. Fish and Wildlife Service, Waterfowl Population Status, {YEAR}. Results of the May "
        f"{YEAR} Waterfowl Breeding Population and Habitat Survey (USFWS and Canadian Wildlife "
        "Service), flown over the breeding grounds of the north-central U.S., Canada and Alaska. "
        "These are breeding population estimates for the continent, not counts of birds in any "
        "hunting state. The traditional survey area long-term average is 1955-2025."
    )
    content = "\n\n".join([intro, executive_summary(pages), table_sentences(tables)])
    return content, tables


def store(content: str) -> None:
    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                INSERT INTO documents (title, content, document_type, source_url, source_type, state_id, metadata)
                VALUES (%s, %s, 'page', %s, 'federal', NULL, %s)
                ON CONFLICT (source_url, document_type) DO UPDATE SET
                    title = EXCLUDED.title,
                    content = EXCLUDED.content,
                    source_type = EXCLUDED.source_type,
                    metadata = EXCLUDED.metadata,
                    updated_at = now()
            """, (TITLE, content, SOURCE_URL, json.dumps({"report": "waterfowl-population-status", "year": YEAR})))
    finally:
        conn.close()


class _Spider:
    logger = log


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pdf", required=True, help="Path to the downloaded report PDF")
    parser.add_argument("--dry-run", action="store_true", help="Print the totals and chunk count; write nothing")
    parser.add_argument("--show", action="store_true", help="Print the whole document text")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    content, tables = build_document(args.pdf)
    for n, what in TABLES.items():
        total = next(r for r in tables[n] if r["region"] == "Total")
        print(f"{what:28} {total['now']:>7,} {total['prev']:>7,} {total['pct']:+4d}% p={total['p']:<6} "
              f"LTA {total['lta']:>7,} {total['ltaPct']:+4d}% p={total['ltaP']}  ({len(tables[n])} rows)")
    pipeline = EmbeddingPipeline()
    chunks = pipeline._chunk_text(content)
    print(f"{len(content):,} characters, {len(chunks)} chunks")
    if args.show:
        print(content)
    if args.dry_run:
        return 0

    if not pipeline.api_key:
        sys.exit("EMBEDDINGS_API_KEY (or OPENAI_API_KEY) is not set")
    store(content)
    pipeline.process_item({"url": SOURCE_URL, "type": "page", "content": content}, _Spider())
    print(f"Stored {TITLE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
