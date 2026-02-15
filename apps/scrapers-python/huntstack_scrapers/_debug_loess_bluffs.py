"""Debug: dump Loess Bluffs PDF text to understand format."""
import requests
import pdfplumber
from io import BytesIO

url = "https://www.fws.gov/sites/default/files/documents/2026-01/loess_bluffs_waterfowl_survey_20260106.pdf"
resp = requests.get(url, timeout=30)
print(f"Downloaded {len(resp.content)} bytes, status={resp.status_code}")

with pdfplumber.open(BytesIO(resp.content)) as pdf:
    print(f"Pages: {len(pdf.pages)}")
    for i, page in enumerate(pdf.pages[:3]):
        text = page.extract_text() or ""
        print(f"\n{'='*60}")
        print(f"PAGE {i} ({len(text)} chars)")
        print(f"{'='*60}")
        print(text[:3000])

        # Also try extracting tables
        tables = page.extract_tables()
        if tables:
            print(f"\n--- {len(tables)} TABLE(S) FOUND ---")
            for ti, table in enumerate(tables):
                print(f"Table {ti}: {len(table)} rows")
                for row in table[:10]:
                    print(f"  {row}")
