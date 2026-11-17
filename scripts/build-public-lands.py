"""
Build apps/api/src/data/public-lands.ts: public land near Where to Hunt's areas.

Source: USGS Protected Areas Database of the United States (PAD-US), "PAD-US Public Access"
(public domain), queried from USGS's ArcGIS Online service:
  https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/PADUS_Public_Access/FeatureServer/0

Usage:
  python -I scripts/build-public-lands.py            (fetches; about a minute)

Kept: land the public owns outright (Category 'Fee'), open (OA) or open by permit/season (RA),
at least 40 acres, of the kinds where waterfowl hunting is usually allowed somewhere on the
unit: state wildlife and conservation areas, national wildlife refuges, USFWS management areas
(waterfowl production areas), Corps of Engineers land and state fish-and-wildlife recreation
areas. Parks, private conservation land, state trust land (leased), national forests and BLM
land are left out, and so are natural areas and nature preserves. PAD-US records public access, not hunting rules: every unit is "check the
managing agency's rules".

Each unit's polygons are merged by name and manager. Its point is the largest polygon's
centroid. Its state is the nearest town's (apps/api/src/data/places.ts); units more than 30 km
from any town in the covered states are dropped.
"""

import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "api" / "src" / "data" / "public-lands.ts"
PLACES = ROOT / "apps" / "api" / "src" / "data" / "places.ts"
SERVICE = "https://services.arcgis.com/v01gqwM5QqNysAAi/ArcGIS/rest/services/PADUS_Public_Access/FeatureServer/0/query"
# The covered states (TX NM KS OK AR LA MO IL IA), with a margin
BBOX = "-109.1,25.8,-87.4,43.6"
PAGE = 2000
MIN_ACRES = 40

# (designation, manager) -> kind shown on the page
KINDS = {
    ("State Conservation Area", "State Fish and Wildlife"): "State wildlife area",
    ("State Conservation Area", "State Department of Natural Resources"): "State wildlife area",
    ("State Conservation Area", "Other or Unknown State Land"): "State conservation area",
    ("State Conservation Area", "Unknown"): "State conservation area",
    ("State Recreation Area", "State Fish and Wildlife"): "State wildlife recreation area",
    ("National Wildlife Refuge", "U.S. Fish and Wildlife Service"): "National wildlife refuge",
    ("Resource Management Area", "U.S. Fish and Wildlife Service"): "USFWS management area",
    ("Recreation Management Area", "Army Corps of Engineers"): "Corps of Engineers land",
}


def fetch() -> list[dict]:
    feats: list[dict] = []
    offset = 0
    while True:
        params = {
            "where": f"Category='Fee' AND Pub_Access IN ('OA','RA') AND GIS_Acres >= {MIN_ACRES}"
                     f" AND DesTp_Desc IN ({', '.join(sorted({repr(d) for d, _ in KINDS}))})",
            "geometry": BBOX, "geometryType": "esriGeometryEnvelope", "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "Unit_Nm,Pub_Access,MngNm_Desc,DesTp_Desc,GIS_Acres",
            "returnGeometry": "false", "returnCentroid": "true", "outSR": "4326",
            "orderByFields": "OBJECTID", "resultOffset": str(offset), "resultRecordCount": str(PAGE), "f": "json",
        }
        url = SERVICE + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "HuntStack data build"})
        for attempt in range(4):
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.load(r)
            # The service allows 60 geometry queries a minute; wait it out rather than hammer it
            if d.get("error", {}).get("code") == 429 and attempt < 3:
                print("  rate limited; waiting 65 s", file=sys.stderr)
                time.sleep(65)
                continue
            break
        if "error" in d:
            sys.exit(f"PAD-US error: {d['error']}")
        page = d.get("features", [])
        feats += page
        print(f"  {len(feats)} polygons", file=sys.stderr)
        if not d.get("exceededTransferLimit") and len(page) < PAGE:
            return feats
        offset += len(page)
        time.sleep(1.5)


def load_places() -> list[tuple[str, float, float]]:
    rows = []
    for line in PLACES.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*\['(?:[^'\\]|\\.)*', '([A-Z]{2})', '(?:[^'\\]|\\.)*', \d+, (-?[\d.]+), (-?[\d.]+)\],", line)
        if m:
            rows.append((m.group(1), float(m.group(2)), float(m.group(3))))
    if not rows:
        sys.exit("No places read from places.ts: run scripts/build-places.py first")
    return rows


# Natural areas and nature preserves protect a habitat, not hunting ground
NOT_HUNTING = re.compile(r"natural area|nature preserve", re.IGNORECASE)

# Missouri lists people's names surname first: "Shanks (Ted) Conservation Area"
SURNAME_FIRST = re.compile(r"^([A-Z][\w.'-]*(?: [A-Z][\w.'-]*)?) \(([^)]+)\) (.+)$")


def display_name(name: str) -> str:
    m = SURNAME_FIRST.match(name.strip())
    return f"{m.group(2)} {m.group(1)} {m.group(3)}" if m else name.strip()


def km(lat1, lng1, lat2, lng2) -> float:
    r = math.pi / 180
    a = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lng2 - lng1) * r / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def main() -> None:
    places = load_places()
    feats = fetch()
    units: dict[tuple[str, str, str], dict] = {}
    for f in feats:
        a, c = f["attributes"], f.get("centroid")
        kind = KINDS.get((a["DesTp_Desc"], a["MngNm_Desc"]))
        if not kind or not c or not a.get("Unit_Nm") or NOT_HUNTING.search(a["Unit_Nm"]):
            continue
        key = (a["Unit_Nm"].strip(), a["MngNm_Desc"], kind)
        acres = float(a["GIS_Acres"] or 0)
        u = units.get(key)
        if not u:
            units[key] = {"acres": acres, "big": acres, "lat": c["y"], "lng": c["x"], "access": a["Pub_Access"]}
        else:
            u["acres"] += acres
            if acres > u["big"]:
                u.update(big=acres, lat=c["y"], lng=c["x"])
            if a["Pub_Access"] == "OA":
                u["access"] = "OA"

    rows = []
    for (name, manager, kind), u in units.items():
        best = min(((km(u["lat"], u["lng"], la, lo), st) for st, la, lo in places
                    if abs(la - u["lat"]) < 0.4 and abs(lo - u["lng"]) < 0.5), default=None)
        if not best or best[0] > 30:
            continue
        rows.append((display_name(name), kind, manager, best[1], u["access"], round(u["acres"]), round(u["lat"], 4), round(u["lng"], 4)))
    rows.sort(key=lambda r: (r[3], r[0]))

    def q(s: str) -> str:
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

    lines = [
        "// Generated by scripts/build-public-lands.py from USGS PAD-US Public Access (public domain).",
        "// Do not edit by hand. PAD-US records public access, not hunting rules.",
        "// [name, kind, manager, state, access ('OA' open | 'RA' permit or seasonal), acres, lat, lng]",
        "",
        "export type PublicLand = readonly [name: string, kind: string, manager: string, state: string, access: 'OA' | 'RA', acres: number, lat: number, lng: number]",
        "",
        "export const PUBLIC_LANDS: readonly PublicLand[] = [",
    ]
    lines += [f"  [{q(n)}, {q(k)}, {q(m)}, {q(s)}, {q(ac)}, {a}, {la}, {lo}]," for n, k, m, s, ac, a, la, lo in rows]
    lines += ["]", ""]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    by_state: dict[str, int] = {}
    for r in rows:
        by_state[r[3]] = by_state.get(r[3], 0) + 1
    print(f"wrote {len(rows)} units to {OUT}: {dict(sorted(by_state.items()))}")


if __name__ == "__main__":
    main()
