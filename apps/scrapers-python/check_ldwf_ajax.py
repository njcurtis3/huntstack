"""Hit the LDWF AJAX endpoint with correct params to get aerial survey PDF links."""
import requests
import re

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "text/html, */*",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.wlf.louisiana.gov/resources/category/waterfowl/aerial-surveys",
}

params = {
    "action": "resource._resources.snip",
    "mainCategoryID": "waterfowl",
    "categoryID": "aerial-surveys",
    "q_resources": "",
    "startDate": "",
    "endDate": "",
    "publicationTypeID": "0",
    "pageNum": "1",
}

r = requests.get("https://www.wlf.louisiana.gov/", params=params, headers=headers, timeout=15)
print("Status:", r.status_code)
print("URL:", r.url)
print("Content-Type:", r.headers.get("Content-Type"))
print("Response length:", len(r.text))

# Find all PDF links
pdfs = re.findall(r'href=["\']([^"\']*\.pdf)["\']', r.text)
print(f"\nPDF links ({len(pdfs)}):")
for p in pdfs[:30]:
    print(" ", p)

# Also look for resource titles/dates
titles = re.findall(r'<h\d[^>]*>([^<]+)</h\d>', r.text)
for t in titles[:20]:
    if any(x in t.lower() for x in ["aerial", "survey", "2024", "2025", "2026", "waterfowl"]):
        print("Title:", t)
