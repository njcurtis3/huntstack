"""Tests for huntstack_scrapers.parsers.fws_html."""

import parsel

from huntstack_scrapers.parsers.fws_html import parse_fws_refuge_page, parse_fws_story_page


def _response(html: str):
    # parsel.Selector implements the same .css()/.getall()/::text/::attr()
    # API that Scrapling's response shim exposes at runtime (see
    # ParserResponse in parsers/base.py), so it's a faithful stand-in here.
    return parsel.Selector(text=html)


class TestParseFwsRefugePage:
    def test_parses_date_observers_and_species_tables(self):
        html = """
        <html><body>
        <p>DATE: 1/13/2026</p>
        <p>OBSERVER(S): Jane Smith TEMP: 45F</p>
        <table>
            <tr><td>Species</td><td>Count</td></tr>
            <tr><td>Mallard</td><td>1,200</td></tr>
            <tr><td>Pintail</td><td>300</td></tr>
        </table>
        </body></html>
        """
        result = parse_fws_refuge_page(_response(html))
        assert result is not None
        assert result.survey_date == "2026-01-13"
        assert result.observers == "Jane Smith"
        assert result.species_counts == {"Mallard": 1200, "Pintail": 300}

    def test_no_date_returns_none(self):
        html = "<html><body><table><tr><td>Mallard</td><td>100</td></tr></table></body></html>"
        assert parse_fws_refuge_page(_response(html)) is None

    def test_falls_back_to_text_extraction_when_no_table(self):
        html = """
        <html><body>
        <p>DATE: 1/13/2026</p>
        <p>Mallard: 100 Pintail: 50</p>
        </body></html>
        """
        result = parse_fws_refuge_page(_response(html))
        assert result is not None
        assert result.species_counts == {"Mallard": 100, "Pintail": 50}


class TestParseFwsStoryPage:
    def test_parses_article_wrapped_content(self):
        html = """
        <html><body>
        <article>
            <p>DATE: 2/1/2026</p>
            <table>
                <tr><td>Snow Goose</td><td>5,000</td></tr>
            </table>
        </article>
        </body></html>
        """
        result = parse_fws_story_page(_response(html))
        assert result is not None
        assert result.survey_date == "2026-02-01"
        assert result.species_counts == {"Snow Goose": 5000}
