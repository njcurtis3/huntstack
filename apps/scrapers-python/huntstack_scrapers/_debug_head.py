"""Debug: check if HEAD requests work for fws.gov PDFs."""
import requests

url = "https://www.fws.gov/sites/default/files/documents/2026-01/loess_bluffs_waterfowl_survey_20260106.pdf"

# Try HEAD
resp = requests.head(url, timeout=10, allow_redirects=True)
print(f"HEAD {url}")
print(f"  Status: {resp.status_code}")
print(f"  Headers: {dict(resp.headers)}")

# Try GET
resp2 = requests.get(url, timeout=10)
print(f"\nGET {url}")
print(f"  Status: {resp2.status_code}")
print(f"  Content-Length: {len(resp2.content)}")

# Check URL pattern from generator
from huntstack_scrapers.parsers.loess_bluffs_pdf import generate_loess_bluffs_urls
urls = generate_loess_bluffs_urls()
print(f"\nGenerated {len(urls)} candidate URLs")
print(f"First 5: {urls[:5]}")
print(f"Contains known URL: {url in urls}")
