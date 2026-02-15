"""Test the Loess Bluffs PDF parser on a known PDF."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests
from huntstack_scrapers.parsers.loess_bluffs_pdf import parse_loess_bluffs_pdf

url = "https://www.fws.gov/sites/default/files/documents/2026-01/loess_bluffs_waterfowl_survey_20260106.pdf"
resp = requests.get(url, timeout=30)
print(f"Downloaded {len(resp.content)} bytes")

result = parse_loess_bluffs_pdf(resp.content)
if result is None:
    print("ERROR: Parser returned None!")
else:
    print(f"Date: {result.survey_date}")
    print(f"Survey type: {result.survey_type}")
    print(f"Species ({len(result.species_counts)}):")
    for name, count in sorted(result.species_counts.items()):
        print(f"  {name}: {count:,}")
