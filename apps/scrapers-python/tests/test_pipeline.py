"""Tests for the data pipeline's decisions (huntstack_scrapers.pipeline). No DB or network."""

from datetime import date, datetime

import pytest

from huntstack_scrapers.pipeline.jobs import (
    SEASON_MONTHS,
    Job,
    Outcome,
    expected_cf_mws_year,
    freshness,
    is_due,
    judge_refuge_run,
    season_year,
    slugify,
)
from huntstack_scrapers.pipeline.registry import build_jobs
from huntstack_scrapers.species_mapping import is_unknown_species_name


def _weekly() -> Job:
    return Job(name="counts:x", title="x", kind="auto", every_days=7, active_months=SEASON_MONTHS,
               stale_after_days=21, run=lambda ctx: Outcome("success"))


NOV_2 = datetime(2026, 11, 2, 6, 0)  # a Monday, 06:00


class TestIsDue:
    def test_never_run_is_due(self):
        assert is_due(_weekly(), NOV_2, None) == (True, "never run")

    def test_a_week_later_is_due_even_if_last_run_ended_a_bit_later(self):
        assert is_due(_weekly(), NOV_2, datetime(2026, 10, 26, 6, 5))[0]

    def test_not_due_mid_week(self):
        due, why = is_due(_weekly(), NOV_2, datetime(2026, 10, 30, 6, 0))
        assert not due and why == "next 2026-11-06"

    def test_off_season_is_never_due(self):
        assert is_due(_weekly(), datetime(2026, 7, 1), None) == (False, "off-season")

    def test_manual_jobs_are_never_due(self):
        job = Job(name="seasons", title="s", kind="manual")
        assert is_due(job, NOV_2, None) == (False, "manual")


class TestFreshness:
    def test_ok_stale_and_missing(self):
        job = _weekly()
        assert freshness(job, date(2026, 11, 2), date(2026, 10, 20)) == "ok"
        assert freshness(job, date(2026, 11, 2), date(2026, 10, 1)) == "stale"
        assert freshness(job, date(2026, 11, 2), None) == "stale"

    def test_not_judged_off_season(self):
        assert freshness(_weekly(), date(2026, 7, 1), date(2025, 1, 1)) == "-"


class TestJudgeRefuseRun:
    STATS = {"items": 2, "rows": 30, "error": None, "store_errors": 0,
             "unknown_names": set(), "missing_slugs": set(), "no_location": False}

    def test_clean_run(self):
        out = judge_refuge_run(dict(self.STATS), date(2026, 11, 2), active=True)
        assert out.status == "success" and out.rows == 30

    def test_scrape_error_fails(self):
        out = judge_refuge_run({**self.STATS, "error": "HTTPError: 404"}, date(2026, 11, 2), active=True)
        assert out.status == "failed" and "404" in out.message

    def test_missing_location_and_store_errors_fail(self):
        assert judge_refuge_run({**self.STATS, "no_location": True}, date(2026, 11, 2), True).status == "failed"
        assert judge_refuge_run({**self.STATS, "store_errors": 1}, date(2026, 11, 2), True).status == "failed"

    def test_nothing_parsed_warns_only_in_season(self):
        empty = {**self.STATS, "items": 0, "rows": 0}
        assert judge_refuge_run(empty, date(2026, 11, 2), active=True).status == "warning"
        assert judge_refuge_run(empty, date(2026, 7, 1), active=False).status == "success"

    def test_unmapped_species_warn(self):
        out = judge_refuge_run({**self.STATS, "unknown_names": {"Lesser Scaup"}}, date(2026, 11, 2), True)
        assert out.status == "warning" and "Lesser Scaup" in out.message

    def test_source_that_never_ran_fails(self):
        assert judge_refuge_run(None, date(2026, 11, 2), True).status == "failed"


def test_unknown_species_names_are_waterfowl_only():
    assert is_unknown_species_name("Some New Teal Spelling")
    assert not is_unknown_species_name("Great Blue Heron")      # never tracked: not flagged
    assert not is_unknown_species_name("Mallard")               # tracked
    assert not is_unknown_species_name("Tundra Swan")           # explicitly untracked
    assert not is_unknown_species_name("")


def test_report_and_season_years():
    assert expected_cf_mws_year(date(2026, 10, 27)) == 2024   # Jan 2024 survey, posted Feb 2025
    assert expected_cf_mws_year(date(2026, 2, 1)) == 2023
    assert season_year(date(2026, 10, 27)) == 2026
    assert season_year(date(2027, 1, 15)) == 2026


def test_slugify():
    assert slugify("Washita National Wildlife Refuge") == "washita-nwr"
    assert slugify("Arkansas - AGFC Aerial Survey") == "arkansas-agfc-aerial-survey"


class TestRegistry:
    def test_one_counts_job_per_source_and_unique_names(self):
        from huntstack_scrapers.sources import WATERFOWL_SOURCES

        jobs = build_jobs()
        names = [j.name for j in jobs]
        assert len(names) == len(set(names))
        assert sum(n.startswith("counts:") for n in names) == len(WATERFOWL_SOURCES)

    def test_extraction_and_seasons_are_never_automatic(self):
        # extract_regulations deletes and replaces a state's seasons and licenses
        jobs = {j.name: j for j in build_jobs()}
        for name in ("extract-regulations", "seasons", "cf-mws"):
            assert jobs[name].kind == "manual" and jobs[name].run is None
            assert not is_due(jobs[name], NOV_2, None)[0]

    def test_every_auto_job_can_run_and_has_a_schedule(self):
        for job in build_jobs():
            if job.kind == "auto":
                assert job.run is not None and job.every_days, job.name
