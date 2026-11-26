"""
Add a state to HuntStack, or update one: the state registry entry, the national data builds, and a
checklist of the state-specific work that's left.

Usage (from the repo root):
  python -I scripts/add-state.py MS --flyway mississippi --center -89.7,32.7 \\
      --agency-name "Mississippi Dept. of Wildlife, Fisheries & Parks" \\
      --agency-url https://www.mdwfp.com/ \\
      --waterfowl-url https://www.mdwfp.com/wildlife-hunting/wildlife-species-program/waterfowl-program \\
      --gazetteer <2024_Gaz_place_national.txt> --population <sub-est2023.csv>

  --dry-run      show the registry entry and the steps; change nothing
  --skip-builds  only write the registry entry (e.g. the builds were run already)

What it does:
  1. Adds or updates the entry in packages/shared/src/states.json and marks it covered. A state
     already in the registry (a neighbour, covered false) keeps what it has unless a flag changes it.
  2. Runs the national-data builds for the new list of covered states, in order:
       build-places.py (Census towns; needs --gazetteer and --population),
       build-public-lands.py (USGS PAD-US; needs the towns),
       build-river-gauges.py (USGS stream gauges; about 20 minutes).
  3. Prints the SQL that adds the state to the production `states` table. It never writes to the
     database: the owner runs it (ask before production DB changes).
  4. Prints the state-specific checklist (seasons, licenses, zone shapes, surveys...).

Once deployed with the rebuilt data files, these switch on by themselves: Where to Hunt and the
map's areas (eBird hotspots and hunter reports), eBird activity, Ask AI's defaults, public land,
river levels, the state guide page, weather and NWS alerts, and the Data Sources coverage table.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "packages" / "shared" / "src" / "states.json"
FLYWAYS = ("central", "mississippi", "pacific", "atlantic")


def write_registry(doc: dict) -> None:
    """One state per line, so a diff shows exactly which state changed."""
    lines = ["{", f'  "_comment": {json.dumps(doc["_comment"], ensure_ascii=False)},', '  "states": [']
    rows = [f"    {json.dumps(s, ensure_ascii=False)}" for s in doc["states"]]
    lines.append(",\n".join(rows))
    lines += ["  ]", "}", ""]
    REGISTRY.write_text("\n".join(lines), encoding="utf-8")


def run(args: list[str], dry: bool) -> None:
    print("  $ python -I " + " ".join(args))
    if dry:
        return
    r = subprocess.run([sys.executable, "-I", *args], cwd=ROOT)
    if r.returncode != 0:
        sys.exit(f"{args[0]} failed (exit {r.returncode}); the registry entry is written, fix and re-run with --skip-builds or by hand")


def sql_text(v: str | None) -> str:
    return "NULL" if v is None else "'" + v.replace("'", "''") + "'"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("code")
    p.add_argument("--name")
    p.add_argument("--slug")
    p.add_argument("--flyway", choices=FLYWAYS)
    p.add_argument("--center", help="lng,lat of the state's centre")
    p.add_argument("--agency-name")
    p.add_argument("--agency-url")
    p.add_argument("--waterfowl-url")
    p.add_argument("--gazetteer", help="2024_Gaz_place_national.txt (Census)")
    p.add_argument("--population", help="sub-est2023.csv (Census)")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--skip-builds", action="store_true")
    a = p.parse_args()

    code = a.code.upper()
    if not re.fullmatch(r"[A-Z]{2}", code):
        sys.exit("code must be a two-letter state code")
    doc = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entry = next((s for s in doc["states"] if s["code"] == code), None)
    new = entry is None
    if new:
        missing = [f for f in ("name", "flyway", "center", "agency_name", "agency_url") if getattr(a, f) is None]
        if missing:
            sys.exit(f"{code} isn't in the registry yet: give --{' --'.join(m.replace('_', '-') for m in missing)}")
        entry = {"code": code, "statewideSurvey": None, "siteCountsOnly": False, "outfitters": False}

    if a.name:
        entry["name"] = a.name
    if a.slug or new:
        entry["slug"] = a.slug or re.sub(r"[^a-z]+", "-", entry["name"].lower()).strip("-")
    if a.flyway:
        entry["flyway"] = a.flyway
    if a.center:
        lng, lat = (float(x) for x in a.center.split(","))
        if not (-125 < lng < -66 and 24 < lat < 50):
            sys.exit("--center is lng,lat inside the lower 48, e.g. -89.7,32.7")
        entry["center"] = [lng, lat]
    if a.agency_name or a.agency_url or a.waterfowl_url:
        ag = entry.get("agency") or {}
        ag["name"] = a.agency_name or ag.get("name")
        ag["url"] = a.agency_url or ag.get("url")
        ag["waterfowlUrl"] = a.waterfowl_url or ag.get("waterfowlUrl")
        entry["agency"] = ag
    if not entry.get("agency") or not entry["agency"].get("name") or not entry["agency"].get("url"):
        sys.exit(f"{code} needs an agency: give --agency-name and --agency-url")
    entry["covered"] = True
    # Keep the registry's field order
    order = ["code", "name", "slug", "covered", "flyway", "center", "agency", "statewideSurvey", "siteCountsOnly", "outfitters"]
    entry = {k: entry[k] for k in order}

    print(f"{'Adding' if new else 'Updating'} {code} in {REGISTRY.relative_to(ROOT)}:")
    print("  " + json.dumps(entry, ensure_ascii=False))
    if not a.dry_run:
        if new:
            doc["states"].append(entry)
        else:
            doc["states"] = [entry if s["code"] == code else s for s in doc["states"]]
        write_registry(doc)

    if not a.skip_builds:
        if not a.gazetteer or not a.population:
            sys.exit("The towns build needs --gazetteer and --population (Census files, see scripts/build-places.py), "
                     "or pass --skip-builds and run the three builds by hand")
        print("\nNational data builds:")
        run(["scripts/build-places.py", a.gazetteer, a.population], a.dry_run)
        run(["scripts/build-public-lands.py"], a.dry_run)
        run(["scripts/build-river-gauges.py"], a.dry_run)

    ag = entry["agency"]
    print(f"""
Production database (not run by this script; ask the owner before running it):
  INSERT INTO states (code, name, agency_name, agency_url, regulations_url)
  VALUES ('{code}', {sql_text(entry['name'])}, {sql_text(ag['name'])}, {sql_text(ag['url'])}, {sql_text(ag.get('waterfowlUrl'))})
  ON CONFLICT (code) DO UPDATE SET agency_name = EXCLUDED.agency_name, agency_url = EXCLUDED.agency_url,
    regulations_url = COALESCE(states.regulations_url, EXCLUDED.regulations_url), updated_at = now();

State-specific work, by hand:
  [ ] Season dates and limits for the season year, from the agency (hand-entered SQL in scripts/,
      as for every state, each row with source_url)
  [ ] Licenses and prices; regulation documents for Ask AI
  [ ] Zone shapes: add {code} to scripts/zones/build-zones.mjs (a statewide state is one line:
      add('{code}', '{code}', stateShape('{code}'), ...)), its outline to scripts/zones/.cache/states.json
      (scripts/zones/fetch-sources.mjs), then python -I scripts/build-api-zones.py
  [ ] Weather push points: push scores vote over the state's refuge points (locations); a state
      with none has no push score until some are added
  [ ] Survey count sources, if the agency publishes any (then statewideSurvey / siteCountsOnly in
      the registry, and a source in the scrapers)
  [ ] Access checks for the state's survey sites and public land
  [ ] Prose: How It Works, Data Sources, CLAUDE.md, CONSTRAINTS.md
  [ ] pnpm --filter @huntstack/api test (the registry guards check the data files), then deploy
  [ ] Check the Data Sources page's "What HuntStack has for each state" row for {code}""")


if __name__ == "__main__":
    main()
