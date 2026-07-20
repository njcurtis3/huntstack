"""Tests for StateRegulationsScraper's domain-allowlist logic."""

import pytest

from huntstack_scrapers.scrapers.state_regulations import StateRegulationsScraper


@pytest.fixture(scope="module")
def scraper():
    # __init__ only constructs a scrapling Fetcher() (no network/DB I/O) —
    # _open_db() is a separate call, never invoked here.
    return StateRegulationsScraper(dry_run=True)


class TestStripWww:
    def test_strips_literal_www_prefix(self, scraper):
        assert scraper._strip_www("www.example.com") == "example.com"

    def test_leaves_non_www_host_unchanged(self, scraper):
        # Regression: the old implementation used host.lstrip("www."),
        # which strips any leading characters in the set {'w', '.'} rather
        # than the literal "www." prefix — so a real subdomain like
        # "wildlife.dgf.nm.gov" had its leading "w" incorrectly stripped
        # down to "ildlife.dgf.nm.gov".
        assert scraper._strip_www("wildlife.dgf.nm.gov") == "wildlife.dgf.nm.gov"

    def test_leaves_host_with_no_www_unchanged(self, scraper):
        assert scraper._strip_www("dgf.nm.gov") == "dgf.nm.gov"

    def test_only_strips_leading_occurrence(self, scraper):
        assert scraper._strip_www("www.www.example.com") == "www.example.com"


class TestIsAllowedDomain:
    def test_exact_match(self, scraper):
        assert scraper._is_allowed_domain(
            "https://dgf.nm.gov/hunting", ["dgf.nm.gov"]
        )

    def test_www_prefixed_url_matches_bare_allowed_domain(self, scraper):
        assert scraper._is_allowed_domain(
            "https://www.dgf.nm.gov/hunting", ["dgf.nm.gov"]
        )

    def test_subdomain_matches(self, scraper):
        assert scraper._is_allowed_domain(
            "https://wildlife.dgf.nm.gov/regs", ["dgf.nm.gov"]
        )

    def test_unrelated_domain_rejected(self, scraper):
        assert not scraper._is_allowed_domain(
            "https://example.com/hunting", ["dgf.nm.gov"]
        )

    def test_lookalike_domain_not_treated_as_subdomain(self, scraper):
        # "notdgf.nm.gov" must not match "dgf.nm.gov" just because it ends
        # with the same characters — only a true "." boundary counts.
        assert not scraper._is_allowed_domain(
            "https://notdgf.nm.gov/hunting", ["dgf.nm.gov"]
        )
