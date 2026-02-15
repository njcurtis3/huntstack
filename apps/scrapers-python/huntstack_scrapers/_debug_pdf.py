"""Debug: dump AGFC PDF page text to see what's being parsed."""
import requests
import pdfplumber
from io import BytesIO

# Latest PDF (2026-01-23)
url = "https://drive.google.com/uc?export=download&id=18z4J9oCkHmz-nB-YwryN1EcmA3fIOm5S"
resp = requests.get(url, timeout=30)
print(f"Downloaded {len(resp.content)} bytes")

with pdfplumber.open(BytesIO(resp.content)) as pdf:
    for i, page in enumerate(pdf.pages[:3]):
        text = page.extract_text() or ""
        print(f"\n{'='*60}")
        print(f"PAGE {i} ({len(text)} chars)")
        print(f"{'='*60}")
        print(text[:2000])
