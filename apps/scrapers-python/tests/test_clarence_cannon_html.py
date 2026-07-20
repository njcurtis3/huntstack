"""Tests for huntstack_scrapers.parsers.clarence_cannon_html."""

import parsel

from huntstack_scrapers.parsers.clarence_cannon_html import parse_clarence_cannon_html


def _response(html: str):
    return parsel.Selector(text=html)


class TestParseClarenceCannonHtml:
    def test_no_table_returns_empty_list(self):
        html = "<html><body><p>no table here</p></body></html>"
        assert parse_clarence_cannon_html(_response(html)) == []

    def test_single_section_basic_parse(self):
        html = """
        <html><body>
        <table class="table-striped"><tbody>
            <tr><td>SPECIES & CODE</td><td>10/3/22</td><td>10/11/22</td></tr>
            <tr><td>Mallard (MALL)</td><td>100</td><td>150</td></tr>
            <tr><td>Total Ducks</td><td>100</td><td>150</td></tr>
        </tbody></table>
        </body></html>
        """
        results = parse_clarence_cannon_html(_response(html))
        by_date = {r.survey_date: r.species_counts for r in results}
        assert by_date == {
            "2022-10-03": {"Mallard": 100},
            "2022-10-11": {"Mallard": 150},
        }

    def test_second_section_reparses_its_own_date_columns(self):
        # Regression: the parser previously reused the first section's
        # date_columns for the second section instead of re-reading its own
        # header row. Here the two sections have header rows with a
        # different number of date columns and different dates, so if the
        # bug were present the second section's counts would either be
        # dropped or mapped to the wrong dates.
        html = """
        <html><body>
        <table class="table-striped"><tbody>
            <tr><td>SPECIES & CODE</td><td>10/3/22</td><td>10/11/22</td></tr>
            <tr><td>Mallard (MALL)</td><td>100</td><td>150</td></tr>
            <tr><td>Total Ducks</td><td>100</td><td>150</td></tr>

            <tr><td>SPECIES & CODE</td><td>11/1/22</td></tr>
            <tr><td>American Coot</td><td>40</td></tr>
        </tbody></table>
        </body></html>
        """
        results = parse_clarence_cannon_html(_response(html))
        by_date = {r.survey_date: r.species_counts for r in results}

        assert by_date["2022-10-03"] == {"Mallard": 100}
        assert by_date["2022-10-11"] == {"Mallard": 150}
        # Second section's own header date, correctly mapped — not silently
        # dropped and not misattributed to one of the first section's dates.
        assert by_date["2022-11-01"] == {"American Coot": 40}

    def test_skips_blank_and_summary_rows(self):
        html = """
        <html><body>
        <table class="table-striped"><tbody>
            <tr><td>SPECIES & CODE</td><td>10/3/22</td></tr>
            <tr><td></td><td></td></tr>
            <tr><td>Total Waterfowl</td><td>999</td></tr>
            <tr><td>Gadwall</td><td>20</td></tr>
        </tbody></table>
        </body></html>
        """
        results = parse_clarence_cannon_html(_response(html))
        assert len(results) == 1
        assert results[0].species_counts == {"Gadwall": 20}

    def test_zero_counts_are_skipped(self):
        html = """
        <html><body>
        <table class="table-striped"><tbody>
            <tr><td>SPECIES & CODE</td><td>10/3/22</td></tr>
            <tr><td>Redhead</td><td>0</td></tr>
        </tbody></table>
        </body></html>
        """
        results = parse_clarence_cannon_html(_response(html))
        assert results == []
