"""Tests for huntstack_scrapers.sources — the WATERFOWL_SOURCES registry."""

import importlib
import sys

import pytest
import requests



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


def test_agfc_is_added_by_hand_never_fetched():
    # agfc.com's index sits behind a Cloudflare bot check; nothing may fetch it
    import huntstack_scrapers.sources as sources

    agfc = next(s for s in sources.WATERFOWL_SOURCES if s["name"].startswith("Arkansas"))
    assert agfc["source_type"] == "manual_pdf"
    assert agfc["report_hosts"] == ("drive.google.com",)
    assert agfc["alias"] == "agfc"


def test_ldwf_and_tpwd_sources_hold_unresolved_callables():
    import huntstack_scrapers.sources as sources

    ldwf = next(s for s in sources.WATERFOWL_SOURCES if "LDWF" in s["name"])
    tpwd = next(s for s in sources.WATERFOWL_SOURCES if "TPWD" in s["name"])

    assert callable(ldwf["pdf_urls_fn"])
    assert callable(tpwd["excel_urls_fn"])


def test_tpwd_high_plains_source_only_reads_the_estimates_workbook(monkeypatch):
    import huntstack_scrapers.sources as sources

    hp = next(s for s in sources.WATERFOWL_SOURCES if s["name"] == "Texas High Plains - TPWD Midwinter Survey")
    monkeypatch.setattr(sources, "fetch_tpwd_excel_urls", lambda: [
        "https://tpwd.texas.gov/x/tx-mws-yearly-summary.xls",
        "https://tpwd.texas.gov/x/mw_estimates_97-18.xls",
    ])
    assert hp["excel_urls_fn"]() == ["https://tpwd.texas.gov/x/mw_estimates_97-18.xls"]
    # region mode never falls back to the statewide parse
    assert hp["excel_parser"](b"not an excel file", "tx-mws-yearly-summary.xls") == []
