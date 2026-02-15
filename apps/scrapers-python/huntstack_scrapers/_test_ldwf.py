"""Test the LDWF PDF parser."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests
from huntstack_scrapers.parsers.ldwf_pdf import parse_ldwf_pdf

# Test with November 2023 (known to exist)
url = "https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf"
resp = requests.get(url, timeout=30)
print(f"Downloaded {len(resp.content)} bytes")

result = parse_ldwf_pdf(resp.content)
if result is None:
    print("ERROR: Parser returned None!")
else:
    print(f"Date: {result.survey_date}")
    print(f"Survey type: {result.survey_type}")
    print(f"Observers: {result.observers}")
    print(f"Species ({len(result.species_counts)}):")
    for name, count in sorted(result.species_counts.items()):
        print(f"  {name}: {count:,}")

# Test with January 2026 (latest)
print("\n--- January 2026 ---")
url2 = "https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_January_2026.pdf"
resp2 = requests.get(url2, timeout=30)
print(f"Downloaded {len(resp2.content)} bytes, status={resp2.status_code}")
if resp2.status_code == 200:
    result2 = parse_ldwf_pdf(resp2.content)
    if result2:
        print(f"Date: {result2.survey_date}")
        print(f"Species ({len(result2.species_counts)}):")
        for name, count in sorted(result2.species_counts.items()):
            print(f"  {name}: {count:,}")
