"""AGFC aerial survey report parser: the opening paragraph's wording across 2023-2026 reports."""

import pytest

from huntstack_scrapers.parsers.agfc_pdf import parse_agfc_text, parse_report_date
from huntstack_scrapers.species_mapping import resolve_species_slug

JAN_2026 = """Arkansas Game and Fish Commission Aerial Waterfowl Survey Report January 19-23, 2026
Biologists conducting transect-based surveys in the Delta estimated 337,479 mallards and 694,286
total ducks (Table 1), while duck population estimates in the Arkansas River Valley totaled 25,542
ducks, including 12,075 mallards (Table 2). Staff performing cruise surveys in southwest Arkansas
reported an estimated 19,365 ducks, with 8,030 of those being mallards (Table 2). Arctic goose
population estimates totaled 1,478,989 light (lesser snow and Ross’s) geese and 246,472 greater
white-fronted geese in the Delta.
The Delta mallard population estimate was 121,205 mallards below the 2025 late-January estimate
and 343,221 mallards below the 2010-2025 late-January long-term average."""

# Older order ("total ducks, N of which were mallards"), and light geese in two regions
DEC_2023 = """Arkansas Game and Fish Commission Aerial Waterfowl Survey Report
December 4-11, 2023
Biologists conducting transect-based surveys in the Delta estimated 449,860 total ducks, 79,365 of
which were mallards (Table 1) and 17,878 ducks in the Arkansas River Valley, including 9,920
mallards. Biologists performing cruise surveys in southwest Arkansas reported an estimated 35,857
ducks with 4,517 mallards (Table 2). Arctic goose population estimates totaled 622,532 light (lesser
snow and Ross's) geese and 188,402 greater white-fronted geese in the Delta. Biologists noted 4,500
light geese and 1,000 greater white-fronted geese in southwest Arkansas.
The Delta mallard population estimate was roughly 250,000 ducks below the long-term average."""

# No Arkansas River Valley flight
DEC_2025 = """Arkansas Game and Fish Commission Aerial Waterfowl Survey Report
December 10; December 15-23, 2025
conducted the first aerial survey of the 2025-26 survey season in the Mississippi Alluvial Valley
(Delta) and southwest Arkansas. Biologists conducted transect-based surveys from December 15-23 in
the Delta and estimated 498,164 mallards and 1,458,354 total ducks (Table 1). Staff performed a
cruise survey on December 10 in southwest Arkansas and estimated 7,960 ducks with 3,710 of those
being mallards (Table 2). Arctic goose population estimates totaled 2,992,914 light (lesser snow and
Ross's) geese and 285,292 greater white-fronted geese in the Delta.
The Delta mallard population estimate was 344,741 mallards above the December 2024 estimate."""


def test_sums_regions_and_stores_other_ducks_not_a_total():
    r = parse_agfc_text(JAN_2026)
    assert r.survey_date == "2026-01-23"
    assert r.species_counts == {
        "mallard": 337_479 + 12_075 + 8_030,
        "other-ducks": (694_286 + 25_542 + 19_365) - (337_479 + 12_075 + 8_030),
        "snow-goose": 1_478_989,         # light geese, counted once
        "white-fronted-goose": 246_472,
    }
    assert "ross-goose" not in r.species_counts
    assert "Delta 337,479 mallards of 694,286 total ducks" in r.notes


def test_never_reads_a_comparison_as_a_count():
    # "343,221 mallards below ... average" was once stored as the mallard count
    counts = parse_agfc_text(JAN_2026).species_counts
    assert 343_221 not in counts.values() and 121_205 not in counts.values()


def test_older_wording_and_southwest_geese():
    r = parse_agfc_text(DEC_2023)
    assert r.survey_date == "2023-12-11"
    assert r.species_counts["mallard"] == 79_365 + 9_920 + 4_517
    assert r.species_counts["other-ducks"] == (449_860 + 17_878 + 35_857) - (79_365 + 9_920 + 4_517)
    assert r.species_counts["snow-goose"] == 622_532 + 4_500
    assert r.species_counts["white-fronted-goose"] == 188_402 + 1_000


def test_missing_region_is_noted_not_guessed():
    r = parse_agfc_text(DEC_2025)
    assert r.survey_date == "2025-12-23"
    assert r.species_counts["mallard"] == 498_164 + 3_710
    assert "Arkansas River Valley not surveyed" in r.notes


@pytest.mark.parametrize("header,expected", [
    ("January 5-13, 2026", "2026-01-13"),
    ("January 19-20, January 25-February 1, 2024", "2024-02-01"),
    ("December 10; December 15-23, 2025", "2025-12-23"),
    ("December 4-11, 2023", "2023-12-11"),
])
def test_report_date_is_the_last_survey_day(header, expected):
    assert parse_report_date(header) == expected


def test_unrecognised_wording_returns_none():
    text = "Arkansas Game and Fish Commission Aerial Waterfowl Survey Report January 5-13, 2026\nDucks were everywhere."
    assert parse_agfc_text(text) is None


def test_more_mallards_than_ducks_is_rejected():
    bad = JAN_2026.replace("694,286\ntotal ducks", "94,286\ntotal ducks")
    assert parse_agfc_text(bad) is None


def test_other_ducks_slug_resolves():
    assert resolve_species_slug("other-ducks") == "other-ducks"
