"""
Centralized registry of waterfowl count data sources.

Each source defines a URL, parser function path, and metadata.
The refuge_counts spider reads this registry to determine what to scrape.

Source types:
  - "html": Single page with survey data (parser receives Scrapy Response)
  - "pdf_index": Index page with links to PDFs (spider follows links, downloads PDFs)
"""

from huntstack_scrapers.parsers.fws_html import parse_fws_refuge_page, parse_fws_story_page
from huntstack_scrapers.parsers.loess_bluffs_pdf import parse_loess_bluffs_pdf, generate_loess_bluffs_urls
from huntstack_scrapers.parsers.ldwf_pdf import parse_ldwf_pdf, generate_ldwf_urls


# Registry of all waterfowl count data sources.
WATERFOWL_SOURCES = [
    # === FWS Refuge HTML Pages (weekly) ===
    {
        "name": "Washita National Wildlife Refuge",
        "state_code": "OK",
        "url": "https://www.fws.gov/refuge/washita/latest-waterfowl-survey",
        "parser": parse_fws_refuge_page,
        "source_type": "html",
        "survey_type": "weekly",
    },
    {
        "name": "Salt Plains National Wildlife Refuge",
        "state_code": "OK",
        "url": "https://www.fws.gov/story/weekly-waterfowl-survey",
        "parser": parse_fws_story_page,
        "source_type": "html",
        "survey_type": "weekly",
    },

    # === Arkansas AGFC Aerial Surveys (biweekly PDFs) ===
    {
        "name": "Arkansas - AGFC Aerial Survey",
        "state_code": "AR",
        "url": "https://www.agfc.com/education/waterfowl-surveys-and-reports/",
        "source_type": "pdf_index",
        "survey_type": "aerial_biweekly",
        "pdf_link_selector": 'a[href*="drive.google.com"]::attr(href)',
        "season_filter": "2025-2026",  # only follow links under current season
    },

    # === Loess Bluffs NWR Weekly PDFs ===
    {
        "name": "Loess Bluffs National Wildlife Refuge",
        "state_code": "MO",
        "url": "https://www.fws.gov/library/collections/loess-bluffs-2025-waterfowl-and-bald-eagle-surveys",
        "source_type": "pdf_url_list",
        "survey_type": "weekly",
        "pdf_urls": generate_loess_bluffs_urls(),
        "pdf_parser": parse_loess_bluffs_pdf,
    },

    # === Louisiana LDWF Aerial Surveys (monthly PDFs) ===
    {
        "name": "Louisiana - LDWF Aerial Survey",
        "state_code": "LA",
        "url": "https://www.wlf.louisiana.gov/page/aerial-waterfowl-surveys",
        "source_type": "pdf_url_list",
        "survey_type": "aerial_monthly",
        "pdf_urls": generate_ldwf_urls(),
        "pdf_parser": parse_ldwf_pdf,
    },
]
