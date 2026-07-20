"""Tests for huntstack_scrapers.parsers.base — shared parser utilities."""

from datetime import datetime

import parsel
import pytest

from huntstack_scrapers.parsers.base import (
    current_waterfowl_season_bounds,
    current_waterfowl_season_label,
    extract_counts_from_text,
    extract_observers,
    extract_table_counts,
    parse_count_value,
    parse_survey_date,
)


class TestParseSurveyDate:
    def test_date_colon_format(self):
        assert parse_survey_date("Survey DATE: 1/13/2026 conditions clear") == "2026-01-13"

    def test_date_colon_no_space(self):
        assert parse_survey_date("DATE:1/13/2026") == "2026-01-13"

    def test_month_name_format(self):
        assert parse_survey_date("Report for January 13, 2026") == "2026-01-13"

    def test_bare_slash_date_fallback(self):
        assert parse_survey_date("Week of 1/13/2026") == "2026-01-13"

    def test_no_date_returns_none(self):
        assert parse_survey_date("No date information here") is None


class TestParseCountValue:
    @pytest.mark.parametrize(
        "text,expected",
        [
            ("1,234", 1234),
            ("500", 500),
            ("0", 0),
            ("", None),
            ("   ", None),
            ("Present", None),
            ("N/A", None),
        ],
    )
    def test_parse_count_value(self, text, expected):
        assert parse_count_value(text) == expected


class TestExtractObservers:
    def test_extracts_name_before_weather_keyword(self):
        text = "OBSERVER(S): Jane Smith, John Doe TEMP: 45F WIND: 10mph"
        assert extract_observers(text) == "Jane Smith, John Doe"

    def test_no_observer_returns_none(self):
        assert extract_observers("No observer info here") is None


class TestExtractTableCounts:
    def _response(self, html: str):
        return parsel.Selector(text=html)

    def test_accumulates_same_species_across_multiple_tables(self):
        # Regression: extract_table_counts previously overwrote rather than
        # accumulated counts when the same species name appeared in more
        # than one table on a page (e.g. separate "DUCK NUMBERS" /
        # "GOOSE NUMBERS" tables both containing a "Mallard" row).
        html = """
        <html><body>
        <table>
            <tr><td>Species</td><td>Count</td></tr>
            <tr><td>Mallard</td><td>100</td></tr>
        </table>
        <table>
            <tr><td>Species</td><td>Count</td></tr>
            <tr><td>Mallard</td><td>50</td></tr>
        </table>
        </body></html>
        """
        counts = extract_table_counts(self._response(html))
        assert counts["Mallard"] == 150

    def test_skips_header_and_total_rows(self):
        html = """
        <html><body>
        <table>
            <tr><td>Species</td><td>Count</td></tr>
            <tr><td>Mallard</td><td>100</td></tr>
            <tr><td>Grand Total</td><td>100</td></tr>
        </table>
        </body></html>
        """
        counts = extract_table_counts(self._response(html))
        assert counts == {"Mallard": 100}

    def test_skips_zero_and_unparseable_counts(self):
        html = """
        <html><body>
        <table>
            <tr><td>Mallard</td><td>0</td></tr>
            <tr><td>Pintail</td><td>Present</td></tr>
            <tr><td>Gadwall</td><td>25</td></tr>
        </table>
        </body></html>
        """
        counts = extract_table_counts(self._response(html))
        assert counts == {"Gadwall": 25}


class TestExtractCountsFromText:
    def test_colon_separated(self):
        counts = extract_counts_from_text("Mallard: 100 Pintail: 50")
        assert counts == {"Mallard": 100, "Pintail": 50}

    def test_space_separated(self):
        counts = extract_counts_from_text("Mallard 100 Gadwall 25")
        assert counts == {"Mallard": 100, "Gadwall": 25}

    def test_skips_known_non_species_words(self):
        counts = extract_counts_from_text("Total: 500 Mallard: 100")
        assert "Total" not in counts
        assert counts["Mallard"] == 100


class TestCurrentWaterfowlSeason:
    def test_october_starts_season_this_year(self):
        start, end = current_waterfowl_season_bounds(datetime(2026, 10, 15))
        assert start == datetime(2026, 10, 1)
        assert end == datetime(2027, 4, 30)

    def test_december_still_in_season_started_this_year(self):
        start, end = current_waterfowl_season_bounds(datetime(2026, 12, 31))
        assert start == datetime(2026, 10, 1)
        assert end == datetime(2027, 4, 30)

    def test_january_in_season_started_last_year(self):
        start, end = current_waterfowl_season_bounds(datetime(2027, 1, 1))
        assert start == datetime(2026, 10, 1)
        assert end == datetime(2027, 4, 30)

    def test_july_in_season_started_last_october(self):
        # Mid-summer, off-season: still resolves to the most recently
        # completed season (started previous October).
        start, end = current_waterfowl_season_bounds(datetime(2026, 7, 20))
        assert start == datetime(2025, 10, 1)
        assert end == datetime(2026, 4, 30)

    def test_label_format(self):
        assert current_waterfowl_season_label(datetime(2026, 7, 20)) == "2025-2026"
        assert current_waterfowl_season_label(datetime(2026, 10, 15)) == "2026-2027"
