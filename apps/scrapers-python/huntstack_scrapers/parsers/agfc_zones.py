"""
AGFC aerial survey zone tables: where in Arkansas the ducks were, survey by survey.

Every AGFC report carries two tables of mallard and total-duck estimates by survey zone for
every survey period since November 2011 (before that, only the total):
  Table 1  Mississippi Alluvial Valley (Delta): 11 zones + MAV total
  Table 2  Arkansas River Valley:               9 zones + ARV total
Rows come in pairs, "Mallards" then "Total Ducks", with the period label (Nov-11, Dec-11,
MWS-12, Jan-12) printed between them. Southwest Arkansas has no zone table.

The table text comes out of the PDF in reading order that scrambles rows, so this reads word
positions instead: rows by height, columns by each number's right edge (the numbers are
right-aligned). Every row is checked: the zone figures must add up to the row's total
(they do exactly; the estimates are stratified by zone). A row that doesn't add up, or a page
whose columns don't line up with the expected zones, is reported and skipped, never guessed.

"-" in a cell means the zone wasn't flown that period; it's stored as missing, not zero.
"""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field
from datetime import date

log = logging.getLogger(__name__)

DELTA_ZONES = [
    "Bayou Bartholomew - Bayou Boeuf", "Bayou Macon", "Bayou Meto - Lower Arkansas", "Big Creek",
    "Black - Upper White", "Cache", "L'Anguille", "Lower White - Bayou Des Arc", "Little River Ditches",
    "Lower St. Francis", "Lower White",
]
ARV_ZONES = [
    "Bigelow - Lake Conway", "Cadron", "East Dardanelle Reservoir", "Fourche La Fave", "Frog Bayou",
    "Holla Bend", "Petit Jean", "Pt. Remove - Plumerville", "West Dardanelle Reservoir",
]
TABLES = {1: ("Delta", DELTA_ZONES), 2: ("Arkansas River Valley", ARV_ZONES)}

_PERIOD = re.compile(r"^(Nov|Dec|MWS|Jan)-(\d\d)$")
_VALUE = re.compile(r"^(?:\d{1,3}(?:,\d{3})*|-)$")

# A table's period label gives month and year only. Rows for surveys we have a report for get
# that report's date (see period_window); older ones get this nominal day, flagged inexact.
_NOMINAL = {"Nov": (11, 20), "Dec": (12, 15), "MWS": (1, 8), "Jan": (1, 25)}


@dataclass
class ZoneRow:
    region: str             # "Delta" | "Arkansas River Valley"
    zone: str
    period: str             # "Jan-26"
    mallards: int | None    # None: not flown that period
    total_ducks: int | None


@dataclass
class ZoneTables:
    rows: list[ZoneRow] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    # Region totals by period, as printed: {("Delta", "Jan-26"): (mallards, total ducks)}
    totals: dict[tuple[str, str], tuple[int | None, int | None]] = field(default_factory=dict)


def period_year_month(period: str) -> tuple[int, int]:
    """'Nov-11' -> (2011, 11); 'MWS-12' and 'Jan-12' -> (2012, 1)."""
    kind, yy = _PERIOD.match(period).groups()
    return 2000 + int(yy), _NOMINAL[kind][0]


def nominal_date(period: str) -> date:
    kind, _ = _PERIOD.match(period).groups()
    year, month = period_year_month(period)
    return date(year, month, _NOMINAL[kind][1])


def period_window(period: str) -> tuple[date, date]:
    """Dates a survey of this period can end on, to match it to a report's real date:
    Nov and Dec are their months; the midwinter survey (MWS) ends by Jan 15; the late-January
    survey ends Jan 16 - Feb 10 (2024's ran to Feb 1)."""
    kind, _ = _PERIOD.match(period).groups()
    year, _m = period_year_month(period)
    return {
        "Nov": (date(year, 11, 1), date(year, 11, 30)),
        "Dec": (date(year, 12, 1), date(year, 12, 31)),
        "MWS": (date(year, 1, 1), date(year, 1, 15)),
        "Jan": (date(year, 1, 16), date(year, 2, 10)),
    }[kind]


def _num(text: str) -> int | None:
    return None if text == "-" else int(text.replace(",", ""))


def tokens(chars: list[dict]) -> list[dict]:
    """Words rebuilt from characters. pdfplumber's own word grouping splits some AGFC rows
    into single characters ("3 0 , 4 3 8"), so rows are grouped by height and characters
    joined when they touch."""
    out: list[dict] = []
    rows: list[list[dict]] = []
    for c in sorted(chars, key=lambda c: c["top"]):
        if not c["text"].strip():
            continue
        if rows and c["top"] - rows[-1][0]["top"] <= 2.5:
            rows[-1].append(c)
        else:
            rows.append([c])
    for row in rows:
        cur: dict | None = None
        for c in sorted(row, key=lambda c: c["x0"]):
            if cur and c["x0"] - cur["x1"] <= 1.2:
                cur["text"] += c["text"]
                cur["x1"] = c["x1"]
            else:
                cur = {"text": c["text"], "x0": c["x0"], "x1": c["x1"], "top": row[0]["top"]}
                out.append(cur)
    return out


def _columns(right_edges: list[float], gap: float) -> list[float]:
    """Cluster right edges into column positions (mean of each cluster)."""
    clusters: list[list[float]] = []
    for x in sorted(right_edges):
        if clusters and x - clusters[-1][-1] <= gap:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    return [sum(c) / len(c) for c in clusters]


def parse_table_page(words: list[dict], table_no: int) -> ZoneTables:
    """One page of Table 1 or 2, from tokens() output.

    Value rows come in pairs (mallards, then total ducks) around their period label; the
    pairing is by order, since row labels are sometimes drawn on top of each other."""
    region, zones = TABLES[table_no]
    n_cols = len(zones) + 1
    out = ZoneTables()
    periods = sorted((w for w in words if _PERIOD.match(w["text"])), key=lambda w: w["top"])
    if not periods:
        return out
    label_x = max(w["x1"] for w in periods)
    cells = [w for w in words if w["x0"] > label_x + 5 and _VALUE.match(w["text"])
             and periods[0]["top"] - 12 < w["top"] < periods[-1]["top"] + 12]
    if not cells:
        return out
    numeric = [w["x1"] for w in cells if w["text"] != "-"]
    spacing = (max(numeric) - min(numeric)) / max(n_cols - 1, 1)
    columns = _columns(numeric, gap=spacing * 0.35)
    # Some reports add a southwest Arkansas total after Table 2's ARV total; it isn't a zone
    if table_no == 2 and len(columns) == n_cols + 1:
        n_cols += 1
        spacing = (max(numeric) - min(numeric)) / (n_cols - 1)
    if len(columns) != n_cols:
        out.problems.append(f"Table {table_no}: found {len(columns)} columns, expected {n_cols}")
        return out

    # Value rows, top to bottom
    by_row: dict[float, list[dict]] = {}
    for w in cells:
        key = next((k for k in by_row if abs(k - w["top"]) <= 2.5), w["top"])
        by_row.setdefault(key, []).append(w)
    row_tops = sorted(by_row)

    def values(top: float) -> list[int | None] | None:
        vals: list[int | None] = [None] * n_cols
        for w in by_row[top]:
            # "-" is centred in its column, numbers are right-aligned
            x = w["x1"] + (spacing * 0.2 if w["text"] == "-" else 0)
            i = min(range(n_cols), key=lambda c: abs(columns[c] - x))
            if abs(columns[i] - x) > spacing * 0.45:
                return None
            vals[i] = _num(w["text"])
        return vals

    for p in periods:
        above = [t for t in row_tops if 0 < p["top"] - t < 10]
        below = [t for t in row_tops if 0 < t - p["top"] < 10]
        if not above or not below:
            out.problems.append(f"Table {table_no} {p['text']}: no value rows beside the label")
            continue
        m, t = values(above[-1]), values(below[0])
        if m is None or t is None:
            out.problems.append(f"Table {table_no} {p['text']}: a value sits outside the columns")
            continue
        total_i = len(zones)  # the region total column
        out.totals[(region, p["text"])] = (m[total_i], t[total_i])
        if all(v is None for v in m[:total_i]) and all(v is None for v in t[:total_i]):
            continue  # a total-only period (before November 2011)
        bad = []
        for name, vals in (("mallards", m), ("total ducks", t)):
            zone_sum = sum(v for v in vals[:total_i] if v is not None)
            # Estimates are rounded zone by zone, so the sum can be off by a few birds
            if vals[total_i] is not None and abs(zone_sum - vals[total_i]) > len(zones):
                bad.append(f"{name} zones add to {zone_sum:,}, total says {vals[total_i]:,}")
        if bad:
            out.problems.append(f"Table {table_no} {p['text']}: " + "; ".join(bad))
            continue
        for i, zone in enumerate(zones):
            if m[i] is None and t[i] is None:
                continue
            if m[i] is not None and t[i] is not None and m[i] > t[i]:
                out.problems.append(f"Table {table_no} {p['text']} {zone}: more mallards than ducks")
                continue
            out.rows.append(ZoneRow(region, zone, p["text"], m[i], t[i]))
    return out


def parse_zone_tables(pdf_bytes: bytes) -> ZoneTables:
    """Every zone row in a report's Tables 1 and 2 (all periods since November 2011)."""
    import pdfplumber

    out = ZoneTables()
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages[:8]:
            head = (page.extract_text() or "").lstrip()[:20]
            m = re.match(r"Table (\d)\b", head)
            if not m or int(m.group(1)) not in TABLES:
                continue
            part = parse_table_page(tokens(page.chars), int(m.group(1)))
            out.rows += part.rows
            out.problems += part.problems
            out.totals.update(part.totals)
    # A period can't appear twice for the same zone
    seen: dict[tuple[str, str], ZoneRow] = {}
    for r in out.rows:
        seen[(r.zone, r.period)] = r
    out.rows = list(seen.values())
    return out


# ─── Storage ─────────────────────────────────────────────────────────────────

PARENT_LOCATION = "Arkansas - AGFC Aerial Survey"


def location_name(zone: str) -> str:
    """The locations row for a zone (scripts/add-agfc-survey-zones.sql)."""
    return f"AGFC survey zone: {zone}"


def period_of(d: date) -> str | None:
    """The table period a survey ending on d belongs to: 2026-01-23 -> 'Jan-26'."""
    yy = f"{d.year % 100:02d}"
    if d.month == 11:
        return f"Nov-{yy}"
    if d.month == 12:
        return f"Dec-{yy}"
    if d.month == 1:
        return f"{'MWS' if d.day <= 15 else 'Jan'}-{yy}"
    if d.month == 2 and d.day <= 10:
        return f"Jan-{yy}"
    return None


def store_zone_rows(conn, rows: list[ZoneRow], dates: dict[str, tuple[date, bool]],
                    source_url: str | None) -> int:
    """Upsert zone rows as refuge_counts on the zone locations: mallard and other-ducks
    (total ducks minus mallards, as for the statewide row). dates maps a period to
    (survey date, exact?). A period's earlier rows for a zone are replaced, so a nominal
    date can later become the exact one without leaving a duplicate. Doesn't commit."""
    import json

    from psycopg2.extras import execute_values

    with conn.cursor() as cur:
        cur.execute("SELECT name, id FROM locations WHERE location_type = 'survey_zone'")
        loc = dict(cur.fetchall())
        cur.execute("SELECT slug, id FROM species WHERE slug IN ('mallard', 'other-ducks')")
        sp = dict(cur.fetchall())
        out: list[tuple] = []
        for r in rows:
            loc_id = loc.get(location_name(r.zone))
            if loc_id is None:
                raise LookupError(f"no survey_zone location for {r.zone!r} (run scripts/add-agfc-survey-zones.sql)")
            when, exact = dates[r.period]
            counts = {"mallard": r.mallards}
            if r.total_ducks is not None and r.mallards is not None:
                counts["other-ducks"] = r.total_ducks - r.mallards
            note = (f"AGFC {r.region} survey zone estimate, period {r.period}: "
                    f"{'' if r.mallards is None else f'{r.mallards:,} mallards'}"
                    f"{'' if r.total_ducks is None else f' of {r.total_ducks:,} total ducks'}."
                    + ("" if exact else " Date approximate: AGFC's tables give the survey period, not the day."))
            for slug, n in counts.items():
                if n is None:
                    continue
                out.append((loc_id, sp[slug], when, n, source_url, note,
                            json.dumps({"period": r.period, "dateExact": exact, "region": r.region,
                                        "totalDucks": r.total_ducks})))
        # Two statements however many rows: one delete, one insert (the history is ~3,400 rows)
        if not out:
            return 0
        cur.execute("""
            DELETE FROM refuge_counts rc
            USING unnest(%s::uuid[], %s::uuid[], %s::text[]) AS d(loc, sp, period)
            WHERE rc.location_id = d.loc AND rc.species_id = d.sp AND rc.metadata->>'period' = d.period
        """, ([o[0] for o in out], [o[1] for o in out], [json.loads(o[6])["period"] for o in out]))
        execute_values(cur, """
            INSERT INTO refuge_counts (location_id, species_id, survey_date, count, survey_type,
                                       source_url, notes, metadata)
            VALUES %s
        """, out, template="(%s, %s, %s, %s, 'aerial_biweekly', %s, %s, %s::jsonb)", page_size=500)
        written = len(out)
    return written


def report_zone_rows(pdf_bytes: bytes, report_date: date, regions: dict | None) -> tuple[list[ZoneRow], list[str]]:
    """A new report's zone rows for its own survey period, checked against the figures in its
    opening paragraph (regions from parse_agfc_text): each table's region total must equal
    them. Only its own period is taken; older periods were checked when their report came in."""
    period = period_of(report_date)
    if period is None:
        return [], [f"zone tables: {report_date} isn't in an AGFC survey period"]
    tables = parse_zone_tables(pdf_bytes)
    problems = [p for p in tables.problems if period in p]
    rows = [r for r in tables.rows if r.period == period]
    for region in {r.region for r in rows}:
        printed = tables.totals.get((region, period))
        stated = (regions or {}).get(region)
        if stated and printed != tuple(stated):
            problems.append(f"zone tables: {region} {period} total {printed} doesn't match the report text {tuple(stated)}")
            rows = [r for r in rows if r.region != region]
    if not rows:
        problems.append(f"zone tables: no zone rows for {period}")
    return rows, problems


def zones_for_report(pdf_bytes: bytes, result) -> tuple[list[ZoneRow], list[str]]:
    """sources.py zones_fn: report_zone_rows for a parsed report (agfc_pdf ParseResult)."""
    return report_zone_rows(pdf_bytes, date.fromisoformat(result.survey_date), result.regions)
