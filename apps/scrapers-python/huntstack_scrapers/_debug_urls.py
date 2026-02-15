"""Check generated URLs."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from huntstack_scrapers.parsers.loess_bluffs_pdf import generate_loess_bluffs_urls

urls = generate_loess_bluffs_urls()
known = "https://www.fws.gov/sites/default/files/documents/2026-01/loess_bluffs_waterfowl_survey_20260106.pdf"
print(f"Generated {len(urls)} URLs")
print(f"Contains known URL: {known in urls}")

# Show Jan 2026 URLs
jan_urls = [u for u in urls if "2026-01" in u]
print(f"\nJan 2026 URLs ({len(jan_urls)}):")
for u in jan_urls:
    print(f"  {u}")
