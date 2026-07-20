"""Tests for huntstack_scrapers.sources — the WATERFOWL_SOURCES registry."""

import importlib
import sys

import pytest
import requests

from huntstack_scrapers.parsers.base import current_waterfowl_season_label


def test_importing_sources_makes_no_network_calls(monkeypatch):
    # Regression: sources.py previously called fetch_ldwf_pdf_urls() /
    # fetch_tpwd_excel_urls() at module import time, so merely importing it
    # triggered live outbound HTTP requests. Both are now stored as
    # unresolved callables (pdf_urls_fn / excel_urls_fn) and only invoked
    # lazily at actual scrape time.
    def _boom(*args, **kwargs):
        raise AssertionError("network call made at import time")

    monkeypatch.setattr(requests, "get", _boom)
    monkeypatch.setattr(requests, "post", _boom)
    monkeypatch.setattr(requests, "head", _boom)

    sys.modules.pop("huntstack_scrapers.sources", None)
    module = importlib.import_module("huntstack_scrapers.sources")

    assert len(module.WATERFOWL_SOURCES) > 0


def test_agfc_season_filter_is_computed_not_hardcoded():
    import huntstack_scrapers.sources as sources

    agfc = next(
        s for s in sources.WATERFOWL_SOURCES if s["name"].startswith("Arkansas")
    )
    assert agfc["season_filter"] == current_waterfowl_season_label()


def test_ldwf_and_tpwd_sources_hold_unresolved_callables():
    import huntstack_scrapers.sources as sources

    ldwf = next(s for s in sources.WATERFOWL_SOURCES if "LDWF" in s["name"])
    tpwd = next(s for s in sources.WATERFOWL_SOURCES if "TPWD" in s["name"])

    assert callable(ldwf["pdf_urls_fn"])
    assert callable(tpwd["excel_urls_fn"])
