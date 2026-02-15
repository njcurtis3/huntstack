"""Debug: check LDWF PDF format and discover available URLs."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests
import pdfplumber
from io import BytesIO

# Try the latest known PDF
url = "https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/Louisiana_Aerial_Waterfowl_Survey_November_2023.pdf"
resp = requests.get(url, timeout=30)
print(f"Downloaded {len(resp.content)} bytes, status={resp.status_code}")

with pdfplumber.open(BytesIO(resp.content)) as pdf:
    print(f"Pages: {len(pdf.pages)}")
    for i, page in enumerate(pdf.pages[:3]):
        text = page.extract_text() or ""
        print(f"\n{'='*60}")
        print(f"PAGE {i} ({len(text)} chars)")
        print(f"{'='*60}")
        print(text[:3000].encode('ascii', 'replace').decode())

# Try to discover more URLs
print("\n\n=== URL DISCOVERY ===\n")
months = ["September", "October", "November", "December", "January"]
years = range(2019, 2027)
separators = ["_", "-"]

found = []
for year in years:
    for month in months:
        for sep in separators:
            name = f"Louisiana{sep}Aerial{sep}Waterfowl{sep}Survey{sep}{month}{sep}{year}.pdf"
            url = f"https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/{name}"
            try:
                head = requests.head(url, timeout=5, allow_redirects=True)
                if head.status_code == 200:
                    found.append((year, month, url))
                    print(f"  FOUND: {month} {year} ({sep})")
            except:
                pass

print(f"\nTotal found: {len(found)}")
for year, month, url in found:
    print(f"  {month} {year}: {url}")
