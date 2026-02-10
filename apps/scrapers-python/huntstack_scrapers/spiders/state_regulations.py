"""
Spiders for scraping state wildlife agency regulation pages.
Handles PDF downloads, page extraction, and structured regulation parsing.

V1 Priority States (Waterfowl Focus):
  - Texas (TX) - Central Flyway
  - Arkansas (AR) - Mississippi Flyway
  - New Mexico (NM) - Central Flyway
  - Louisiana (LA) - Mississippi Flyway
  - Kansas (KS) - Central Flyway
  - Oklahoma (OK) - Central Flyway
"""

import scrapy
from scrapy.http import Response
from typing import Generator, Any
from datetime import datetime


class StateRegulationsSpider(scrapy.Spider):
    """
    Base spider for state wildlife agency websites.
    Subclasses define start_urls and parsing logic per state.
    """

    name = "state_regulations"
    state_code = "XX"
    state_name = "Unknown"

    custom_settings = {
        "DOWNLOAD_DELAY": 2,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
    }

    def parse(self, response: Response) -> Generator[Any, None, None]:
        """Default: extract page content and find PDF links."""
        self.logger.info(f"Parsing: {response.url}")

        # Yield page content
        yield {
            "type": "page",
            "url": response.url,
            "title": response.css("h1::text").get()
            or response.css("title::text").get(),
            "content": " ".join(response.css("body *::text").getall()),
            "state_code": self.state_code,
            "scraped_at": datetime.utcnow().isoformat(),
        }

        # Find all PDF links
        pdf_links = response.css('a[href$=".pdf"]')
        for link in pdf_links:
            href = link.css("::attr(href)").get()
            title = link.css("::text").get() or "PDF Document"
            if href:
                yield scrapy.Request(
                    response.urljoin(href),
                    callback=self.parse_pdf,
                    meta={
                        "source_page": response.url,
                        "link_title": title.strip(),
                    },
                )

    def parse_pdf(self, response: Response) -> Generator[dict, None, None]:
        """Handle PDF downloads - content is raw bytes for pipeline processing."""
        self.logger.info(f"Downloaded PDF: {response.url}")
        yield {
            "type": "pdf",
            "url": response.url,
            "source_page": response.meta.get("source_page"),
            "link_title": response.meta.get("link_title", "PDF Document"),
            "content": response.body,
            "state_code": self.state_code,
            "scraped_at": datetime.utcnow().isoformat(),
        }


# ============================================
# TEXAS
# ============================================


class TexasRegulationsSpider(StateRegulationsSpider):
    """
    Spider for Texas Parks and Wildlife Department (TPWD).
    Focuses on migratory bird / waterfowl regulations from the Outdoor Annual.
    """

    name = "texas_regulations"
    state_code = "TX"
    state_name = "Texas"

    start_urls = [
        # Outdoor Annual - migratory game bird regulations (restructured 2025)
        "https://tpwd.texas.gov/regulations/outdoor-annual/hunting/migratory-game-bird-regulations",
        # Species-specific waterfowl pages
        "https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/duck",
        "https://tpwd.texas.gov/regulations/outdoor-annual/regs/animals/goose",
        # Stamps, permits, and certification
        "https://tpwd.texas.gov/regulations/outdoor-annual/hunting/migratory-game-bird-regulations/stamps-permits-and-certification",
        # Licenses
        "https://tpwd.texas.gov/regulations/outdoor-annual/licenses",
    ]

    def parse(self, response: Response) -> Generator[Any, None, None]:
        """Parse TPWD Outdoor Annual pages."""
        self.logger.info(f"Parsing TPWD: {response.url}")

        # Extract main page content
        title = response.css("h1::text").get() or response.css("title::text").get()
        content_area = response.css("div.field-item, div.content, article, main")

        content_text = ""
        if content_area:
            content_text = " ".join(content_area.css("*::text").getall())
        else:
            content_text = " ".join(response.css("body *::text").getall())

        yield {
            "type": "page",
            "url": response.url,
            "title": title,
            "content": content_text.strip(),
            "state_code": self.state_code,
            "scraped_at": datetime.utcnow().isoformat(),
        }

        # Follow internal regulation links
        regulation_links = response.css(
            'a[href*="migratory-game-birds"]::attr(href), '
            'a[href*="waterfowl"]::attr(href), '
            'a[href*="licenses"]::attr(href)'
        ).getall()

        seen = set()
        for href in regulation_links:
            full_url = response.urljoin(href)
            if full_url not in seen and "tpwd.texas.gov" in full_url:
                seen.add(full_url)
                yield scrapy.Request(full_url, callback=self.parse_regulation_page)

        # Follow PDF links
        for item in self._extract_pdfs(response):
            yield item

    def parse_regulation_page(self, response: Response) -> Generator[Any, None, None]:
        """Parse individual regulation sub-pages."""
        self.logger.info(f"Parsing regulation page: {response.url}")

        title = response.css("h1::text").get() or response.css("h2::text").get() or ""
        content_area = response.css("div.field-item, div.content, article, main")
        content_text = " ".join(content_area.css("*::text").getall()) if content_area else ""

        if content_text.strip():
            yield {
                "type": "regulation",
                "url": response.url,
                "title": title.strip(),
                "content": content_text.strip(),
                "state_code": self.state_code,
                "scraped_at": datetime.utcnow().isoformat(),
            }

        # Extract any PDFs on this page too
        for item in self._extract_pdfs(response):
            yield item

    def _extract_pdfs(self, response: Response) -> Generator[dict, None, None]:
        """Extract PDF links from a response."""
        pdf_links = response.css('a[href$=".pdf"]')
        for link in pdf_links:
            href = link.css("::attr(href)").get()
            title = link.css("::text").get() or "PDF Document"
            if href:
                yield scrapy.Request(
                    response.urljoin(href),
                    callback=self.parse_pdf,
                    meta={
                        "source_page": response.url,
                        "link_title": title.strip(),
                    },
                )


# ============================================
# ARKANSAS
# ============================================


class ArkansasRegulationsSpider(StateRegulationsSpider):
    """
    Spider for Arkansas Game and Fish Commission (AGFC).
    Arkansas is critical for waterfowl (Stuttgart = "Duck Capital of the World").
    """

    name = "arkansas_regulations"
    state_code = "AR"
    state_name = "Arkansas"

    start_urls = [
        # Main regulations (AGFC dropped /en/ prefix)
        "https://www.agfc.com/regulations/",
        # Waterfowl hunting
        "https://www.agfc.com/hunting/waterfowl/",
        # Waterfowl dates, rules, and regulations
        "https://www.agfc.com/hunting/waterfowl/waterfowl-dates-rules-regulations/",
    ]

    def parse(self, response: Response) -> Generator[Any, None, None]:
        """Parse AGFC pages."""
        self.logger.info(f"Parsing AGFC: {response.url}")

        title = response.css("h1::text").get() or response.css("title::text").get()
        content_area = response.css("div.content-area, div.main-content, article, main")
        content_text = ""
        if content_area:
            content_text = " ".join(content_area.css("*::text").getall())
        else:
            content_text = " ".join(response.css("body *::text").getall())

        yield {
            "type": "page",
            "url": response.url,
            "title": title,
            "content": content_text.strip(),
            "state_code": self.state_code,
            "scraped_at": datetime.utcnow().isoformat(),
        }

        # Follow waterfowl and regulation links within AGFC
        relevant_links = response.css(
            'a[href*="waterfowl"]::attr(href), '
            'a[href*="migratory"]::attr(href), '
            'a[href*="regulations"]::attr(href), '
            'a[href*="hunting"]::attr(href)'
        ).getall()

        seen = set()
        for href in relevant_links:
            full_url = response.urljoin(href)
            if full_url not in seen and "agfc.com" in full_url:
                seen.add(full_url)
                yield scrapy.Request(full_url, callback=self.parse_regulation_page)

        # Follow PDF links
        pdf_links = response.css('a[href$=".pdf"]')
        for link in pdf_links:
            href = link.css("::attr(href)").get()
            title = link.css("::text").get() or "PDF Document"
            if href:
                yield scrapy.Request(
                    response.urljoin(href),
                    callback=self.parse_pdf,
                    meta={
                        "source_page": response.url,
                        "link_title": title.strip(),
                    },
                )

    def parse_regulation_page(self, response: Response) -> Generator[Any, None, None]:
        """Parse individual AGFC regulation pages."""
        self.logger.info(f"Parsing AGFC regulation: {response.url}")

        title = response.css("h1::text").get() or ""
        content_area = response.css("div.content-area, div.main-content, article")
        content_text = " ".join(content_area.css("*::text").getall()) if content_area else ""

        if content_text.strip():
            yield {
                "type": "regulation",
                "url": response.url,
                "title": title.strip(),
                "content": content_text.strip(),
                "state_code": self.state_code,
                "scraped_at": datetime.utcnow().isoformat(),
            }

        # Also grab PDFs
        pdf_links = response.css('a[href$=".pdf"]')
        for link in pdf_links:
            href = link.css("::attr(href)").get()
            link_title = link.css("::text").get() or "PDF Document"
            if href:
                yield scrapy.Request(
                    response.urljoin(href),
                    callback=self.parse_pdf,
                    meta={
                        "source_page": response.url,
                        "link_title": link_title.strip(),
                    },
                )


# ============================================
# NEW MEXICO
# ============================================


class NewMexicoRegulationsSpider(StateRegulationsSpider):
    """
    Spider for New Mexico Department of Game and Fish.
    Key area: Clovis/Portales snow goose wintering grounds.
    """

    name = "newmexico_regulations"
    state_code = "NM"
    state_name = "New Mexico"

    start_urls = [
        # NM Game & Fish migrated to new domain
        "https://wildlife.dgf.nm.gov/",
        "https://wildlife.dgf.nm.gov/hunting/",
        "https://wildlife.dgf.nm.gov/home/publications/",
        "https://wildlife.dgf.nm.gov/hunting/applications-and-draw-information/",
        "https://wildlife.dgf.nm.gov/hunting/maps/",
        "https://wildlife.dgf.nm.gov/hunting/information-by-animal/migratory-bird/",
        "https://wildlife.dgf.nm.gov/hunting/harvest-reporting-information/",
    ]


# ============================================
# LOUISIANA
# ============================================


class LouisianaRegulationsSpider(StateRegulationsSpider):
    """
    Spider for Louisiana Department of Wildlife and Fisheries.
    Coastal marshes are premier wintering waterfowl habitat.
    """

    name = "louisiana_regulations"
    state_code = "LA"
    state_name = "Louisiana"

    start_urls = [
        # LDWF restructured URLs
        "https://www.wlf.louisiana.gov/page/seasons-and-regulations",
        "https://www.wlf.louisiana.gov/species",
        "https://www.wlf.louisiana.gov/page/wmas-refuges-and-conservation-areas",
        "https://www.wlf.louisiana.gov/page/hunting-licenses-permits-tags",
        "https://www.wlf.louisiana.gov/page/wmarefugeconservation-area-licenses-and-permits",
    ]


# ============================================
# KANSAS
# ============================================


class KansasRegulationsSpider(StateRegulationsSpider):
    """
    Spider for Kansas Department of Wildlife and Parks.
    Cheyenne Bottoms and Quivira NWR are key Central Flyway wetlands.
    """

    name = "kansas_regulations"
    state_code = "KS"
    state_name = "Kansas"

    start_urls = [
        # KS migrated from .com to .gov
        "https://ksoutdoors.gov/Hunting/Migratory-Birds",
        "https://ksoutdoors.gov/Hunting/Migratory-Birds/Ducks",
        "https://ksoutdoors.gov/Hunting/Migratory-Birds/Geese/REGULATIONS",
    ]


# ============================================
# OKLAHOMA
# ============================================


class OklahomaRegulationsSpider(StateRegulationsSpider):
    """
    Spider for Oklahoma Department of Wildlife Conservation.
    """

    name = "oklahoma_regulations"
    state_code = "OK"
    state_name = "Oklahoma"

    start_urls = [
        # OK restructured hunting URLs
        "https://www.wildlifedepartment.com/hunting/regs/migratory-game-bird-regulations",
        "https://www.wildlifedepartment.com/hunting/resources/waterfowl",
        "https://www.wildlifedepartment.com/hunting/seasons",
    ]


# ============================================
# COLORADO (existing, cleaned up)
# ============================================


class ColoradoRegulationsSpider(StateRegulationsSpider):
    """Spider for Colorado Parks and Wildlife."""

    name = "colorado_regulations"
    state_code = "CO"
    state_name = "Colorado"

    start_urls = [
        "https://cpw.state.co.us/learn/Pages/BigGameBrochure.aspx",
        "https://cpw.state.co.us/learn/Pages/SmallGameRegulations.aspx",
        "https://cpw.state.co.us/learn/Pages/Waterfowl.aspx",
    ]

    def parse(self, response: Response) -> Generator[Any, None, None]:
        """Parse CPW regulation pages."""
        self.logger.info(f"Parsing CPW: {response.url}")

        yield {
            "type": "page",
            "url": response.url,
            "title": response.css("h1::text").get()
            or response.css("title::text").get(),
            "content": " ".join(response.css("div.content-area *::text").getall()),
            "state_code": self.state_code,
            "scraped_at": datetime.utcnow().isoformat(),
        }

        # PDF links
        pdf_links = response.css('a[href$=".pdf"]')
        for link in pdf_links:
            href = link.css("::attr(href)").get()
            title = link.css("::text").get() or "PDF Document"
            if href:
                yield scrapy.Request(
                    response.urljoin(href),
                    callback=self.parse_pdf,
                    meta={
                        "source_page": response.url,
                        "link_title": title.strip(),
                    },
                )
