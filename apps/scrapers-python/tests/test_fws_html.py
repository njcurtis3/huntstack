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

    def test_parses_salt_plains_sections(self):
        # Salt Plains since Nov 2026: date in the sub-title, <h3> sections, one <p> per row
        pad = "&nbsp;" * 30
        html = f"""
        <html><body><article>
        <div class="field--name-field-sub-title">11/4/26</div>
        <div class="field--name-body">
          <h3>OBSERVERS: Hensley, Robell</h3><h3>TEMP: 43 F</h3>
          <h3><span>DUCKS</span></h3>
          <p><span>Gadwall{pad} 18&nbsp;</span></p>
          <p><span>Teal, Green-Winged{pad}62</span></p>
          <p><span>Merganser, Hooded{pad}12</span></p>
          <p><span>Unidentified{pad}4,360</span></p>
          <p><span>TOTAL DUCKS{pad}4,452</span></p>
          <h3>GEESE</h3>
          <p>Canada, Large{pad}1,043</p>
          <p>Canada, Small{pad}7</p>
          <p>Greater White-Fronted{pad}1,240</p>
          <h3>CRANES</h3>
          <p>Sandhill Crane{pad}2,980</p>
          <h3>TERNS AND GULLS</h3>
          <p>Gull, Franklin{pad}3,500</p>
        </div>
        </article></body></html>
        """
        result = parse_fws_story_page(_response(html))
        assert result is not None
        assert result.survey_date == "2026-11-04"
        assert result.species_counts == {
            "Gadwall": 18, "Green-Winged Teal": 62, "Hooded Merganser": 12,
            "Canada Goose": 1050, "Greater White-Fronted": 1240,
        }
