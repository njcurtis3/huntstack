"""
Spider for scraping state wildlife agency regulation pages.
Handles PDF downloads and large-scale crawls.
"""

import scrapy
from scrapy.http import Response
from typing import Generator, Any
import re
from datetime import datetime


class StateRegulationsSpider(scrapy.Spider):
    """
    Generic spider for state wildlife agency websites.
    Configure per-state by setting custom_settings.
    """
    
    name = "state_regulations"
    
    # Override these in subclasses or via command line
    state_code = "CO"
    state_name = "Colorado"
    
    # State agency URLs - override in subclasses
    start_urls = []
    
    custom_settings = {
        "DOWNLOAD_DELAY": 2,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
    }

    def parse(self, response: Response) -> Generator[Any, None, None]:
        """Default parse method - override in state-specific spiders."""
        self.logger.info(f"Parsing: {response.url}")
        
        # Find all PDF links
        pdf_links = response.css('a[href$=".pdf"]::attr(href)').getall()
        
        for pdf_url in pdf_links:
            full_url = response.urljoin(pdf_url)
            yield scrapy.Request(
                full_url,
                callback=self.parse_pdf,
                meta={"source_page": response.url}
            )
        
        # Follow pagination or other links as needed
        # Override in subclasses for specific navigation patterns

    def parse_pdf(self, response: Response) -> Generator[dict, None, None]:
        """Handle PDF downloads."""
        self.logger.info(f"Downloaded PDF: {response.url}")
        
        yield {
            "type": "pdf",
            "url": response.url,
            "source_page": response.meta.get("source_page"),
            "content": response.body,  # Raw PDF bytes
            "state_code": self.state_code,
            "scraped_at": datetime.utcnow().isoformat(),
        }


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
        self.logger.info(f"Parsing CPW page: {response.url}")
        
        # Extract page content
        page_content = {
            "type": "page",
            "url": response.url,
            "title": response.css("h1::text").get() or response.css("title::text").get(),
            "content": " ".join(response.css("div.content-area *::text").getall()),
            "state_code": self.state_code,
            "scraped_at": datetime.utcnow().isoformat(),
        }
        yield page_content
        
        # Find and follow PDF links
        pdf_links = response.css('a[href$=".pdf"]')
        
        for link in pdf_links:
            href = link.css("::attr(href)").get()
            title = link.css("::text").get() or "Unknown"
            
            if href:
                full_url = response.urljoin(href)
                yield scrapy.Request(
                    full_url,
                    callback=self.parse_pdf,
                    meta={
                        "source_page": response.url,
                        "link_title": title.strip(),
                    }
                )


class TexasRegulationsSpider(StateRegulationsSpider):
    """Spider for Texas Parks and Wildlife."""
    
    name = "texas_regulations"
    state_code = "TX"
    state_name = "Texas"
    
    start_urls = [
        "https://tpwd.texas.gov/regulations/outdoor-annual/",
    ]
    
    def parse(self, response: Response) -> Generator[Any, None, None]:
        """Parse TPWD regulation pages."""
        self.logger.info(f"Parsing TPWD page: {response.url}")
        
        # Texas has a different structure - Outdoor Annual
        # Follow category links
        category_links = response.css("nav.outdoor-annual-nav a::attr(href)").getall()
        
        for link in category_links:
            full_url = response.urljoin(link)
            yield scrapy.Request(full_url, callback=self.parse_category)
    
    def parse_category(self, response: Response) -> Generator[Any, None, None]:
        """Parse category pages within Outdoor Annual."""
        self.logger.info(f"Parsing category: {response.url}")
        
        # Extract regulation content
        content_sections = response.css("article.regulation-content")
        
        for section in content_sections:
            yield {
                "type": "regulation",
                "url": response.url,
                "title": section.css("h2::text").get(),
                "content": " ".join(section.css("*::text").getall()),
                "state_code": self.state_code,
                "scraped_at": datetime.utcnow().isoformat(),
            }


class ArkansasRegulationsSpider(StateRegulationsSpider):
    """Spider for Arkansas Game and Fish Commission."""
    
    name = "arkansas_regulations"
    state_code = "AR"
    state_name = "Arkansas"
    
    start_urls = [
        "https://www.agfc.com/en/hunting/regulations/",
    ]
    
    # Arkansas is particularly important for waterfowl
    # Override parse methods as needed
