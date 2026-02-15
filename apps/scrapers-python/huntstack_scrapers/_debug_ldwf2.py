"""Debug: check multiple LDWF PDFs across years."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests
import pdfplumber
from io import BytesIO
from huntstack_scrapers.parsers.ldwf_pdf import parse_ldwf_pdf

base = "https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys"

# Test across years
tests = [
    ("Nov 2025", f"{base}/Louisiana_Aerial_Waterfowl_Survey_November_2025.pdf"),
    ("Dec 2024", f"{base}/Louisiana_Aerial_Waterfowl_Survey_December_2024.pdf"),
    ("Jan 2024", f"{base}/Louisiana_Aerial_Waterfowl_Survey_January_2024.pdf"),
    ("Nov 2021", f"{base}/Louisiana_Aerial_Waterfowl_Survey_November_2021.pdf"),
    ("Sep 2025", f"{base}/Louisiana_Aerial_Waterfowl_Survey_September_2025.pdf"),
]

for label, url in tests:
    resp = requests.get(url, timeout=30)
    if resp.status_code != 200 or len(resp.content) < 5000:
        print(f"{label}: SKIPPED (status={resp.status_code}, size={len(resp.content)})")
        continue

    result = parse_ldwf_pdf(resp.content)
    if result:
        print(f"{label}: OK - date={result.survey_date}, species={len(result.species_counts)}")
        for name, count in sorted(result.species_counts.items()):
            print(f"  {name}: {count:,}")
    else:
        # Debug: dump page 0 text
        print(f"{label}: FAILED to parse. Page 0 text:")
        with pdfplumber.open(BytesIO(resp.content)) as pdf:
            text = pdf.pages[0].extract_text() or ""
            # Print first 800 chars safely
            safe = text[:800].encode('ascii', 'replace').decode()
            print(safe)
    print()
