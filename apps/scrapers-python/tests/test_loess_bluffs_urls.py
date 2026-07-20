"""Tests for huntstack_scrapers.parsers.loess_bluffs_pdf's URL generator."""

import re
from datetime import datetime

from huntstack_scrapers.parsers.base import current_waterfowl_season_bounds
from huntstack_scrapers.parsers.loess_bluffs_pdf import generate_loess_bluffs_urls

_URL_RE = re.compile(
    r"^https://www\.fws\.gov/sites/default/files/documents/"
    r"(\d{4}-\d{2})/loess_bluffs_waterfowl_survey_(\d{8})\.pdf$"
)


class TestGenerateLoessBluffsUrls:
    def test_urls_match_expected_pattern(self):
        urls = generate_loess_bluffs_urls()
        assert urls, "expected at least one candidate URL"
        for url in urls:
            assert _URL_RE.match(url), url

    def test_four_urls_per_week(self):
        urls = generate_loess_bluffs_urls()
        assert len(urls) % 4 == 0

    def test_dates_fall_within_current_season_bounds(self):
        # Not hardcoded to any specific season (that was the bug this test
        # guards against) — bounds are derived dynamically from today, same
        # as the generator itself, so this stays valid every season.
        start, end = current_waterfowl_season_bounds()
        urls = generate_loess_bluffs_urls()

        for url in urls:
            match = _URL_RE.match(url)
            day = datetime.strptime(match.group(2), "%Y%m%d")
            assert start <= day <= end, f"{day} outside season bounds {start}..{end}"

    def test_dates_are_mon_through_thu(self):
        urls = generate_loess_bluffs_urls()
        for url in urls:
            match = _URL_RE.match(url)
            day = datetime.strptime(match.group(2), "%Y%m%d")
            assert day.weekday() in (0, 1, 2, 3), f"{day} is not Mon-Thu"
