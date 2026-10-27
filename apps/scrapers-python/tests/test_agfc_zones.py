"""AGFC survey-zone tables: reading rows by position, the checks, and period dates."""

from datetime import date

import pytest

from huntstack_scrapers.parsers import agfc_zones
from huntstack_scrapers.parsers.agfc_zones import (
    DELTA_ZONES, ARV_ZONES, ZoneRow, ZoneTables, nominal_date, parse_table_page, period_of, period_window,
    report_zone_rows, tokens,
)


def _row(top: float, values: list[str], label: str) -> list[dict]:
    """A table row: label at the left, numbers right-aligned in 30pt columns."""
    words = [{"text": label, "x0": 135, "x1": 160, "top": top}]
    for i, v in enumerate(values):
        if v == "":
            continue
        right = 220 + 30 * i
        width = 3 if v == "-" else 4 * len(v)
        x1 = right - 9 if v == "-" else right  # "-" is centred, numbers right-aligned
        words.append({"text": v, "x0": x1 - width, "x1": x1, "top": top})
    return words


def _period(top: float, label: str, mallards: list[str], ducks: list[str]) -> list[dict]:
    return (_row(top - 4, mallards, "Mallards") + [{"text": label, "x0": 105, "x1": 128, "top": top}]
            + _row(top + 4, ducks, "Ducks"))


def _fmt(values: list[int | None]) -> list[str]:
    return ["-" if v is None else f"{v:,}" for v in values]


def _delta(top, label, mallards, ducks):
    return _period(top, label, _fmt(mallards + [sum(v or 0 for v in mallards)]),
                   _fmt(ducks + [sum(v or 0 for v in ducks)]))


M = [10_489, 4_074, 54_054, 17_092, 63_639, 30_234, 56_535, 12_587, None, 74_095, 14_681]
D = [40_889, 7_956, 138_528, 90_052, 81_888, 54_407, 69_844, 28_866, None, 132_745, 49_111]
# Real pages hold up to 51 periods, so every zone column has numbers somewhere; a page with
# one period whose zone wasn't flown would have an empty column. Each test page gets this.
FULL = _delta(160, "Dec-25", [12_816, 5_661, 54_702, 131_936, 24_699, 127_545, 78_690, 15_242, 3_987, 6_517, 36_369],
              [58_482, 11_388, 159_138, 429_157, 106_953, 277_910, 235_765, 25_529, 3_987, 80_372, 69_673])


def test_reads_zone_rows_and_region_total():
    out = parse_table_page(FULL + _delta(200, "Jan-26", M, D), 1)
    assert out.problems == []
    out.rows = [r for r in out.rows if r.period == "Jan-26"]
    assert len(out.rows) == 10  # Little River Ditches wasn't flown ("-")
    meto = next(r for r in out.rows if r.zone == "Bayou Meto - Lower Arkansas")
    assert (meto.mallards, meto.total_ducks, meto.period, meto.region) == (54_054, 138_528, "Jan-26", "Delta")
    assert out.totals[("Delta", "Jan-26")] == (337_480, 694_286)


def test_rounding_off_by_a_few_birds_is_accepted():
    words = FULL + _period(200, "Jan-26", _fmt(M + [337_479]), _fmt(D + [694_286]))
    assert parse_table_page(words, 1).problems == []


def test_a_row_that_does_not_add_up_is_skipped_not_stored():
    words = FULL + _period(200, "Jan-26", _fmt(M + [400_000]), _fmt(D + [694_286]))
    out = parse_table_page(words, 1)
    assert all(r.period != "Jan-26" for r in out.rows) and "mallards zones add to" in out.problems[0]


def test_more_mallards_than_ducks_in_a_zone_is_skipped():
    m = list(M); m[0] = 50_000
    d = list(D)
    out = parse_table_page(FULL + _delta(200, "Jan-26", m, d), 1)
    assert all(not (r.zone == "Bayou Bartholomew - Bayou Boeuf" and r.period == "Jan-26") for r in out.rows)
    assert any("more mallards than ducks" in p for p in out.problems)


def test_total_only_periods_before_zone_estimates_are_ignored():
    blank = [""] * len(DELTA_ZONES)
    words = FULL + _period(200, "Nov-09", blank + ["124,065"], blank + ["794,405"]) + _delta(240, "Nov-11", M, D)
    out = parse_table_page(words, 1)
    assert out.problems == []
    assert {r.period for r in out.rows} == {"Dec-25", "Nov-11"}


ARV_M = [0, 0, 2_000, 100, 500, 4_000, 0, 5_000, 475]
ARV_D = [100, 0, 6_000, 300, 900, 9_000, 0, 9_000, 1_242]


def test_table_2_with_a_southwest_column():
    # Some reports add southwest Arkansas's total after the ARV total; it isn't a zone
    words = _period(200, "Jan-26", _fmt(ARV_M + [sum(ARV_M), 8_030]), _fmt(ARV_D + [sum(ARV_D), 19_365]))
    out = parse_table_page(words, 2)
    assert out.problems == []
    assert {r.zone for r in out.rows} == set(ARV_ZONES)
    assert out.totals[("Arkansas River Valley", "Jan-26")] == (sum(ARV_M), sum(ARV_D))


def test_zero_is_a_count_but_a_dash_means_not_flown():
    full = _period(160, "Dec-25", _fmt(ARV_M + [sum(ARV_M)]), _fmt(ARV_D + [sum(ARV_D)]))
    m = list(ARV_M); d = list(ARV_D)
    m[1] = None; d[1] = None  # Cadron not flown
    words = full + _period(200, "Jan-26", _fmt(m + [sum(v or 0 for v in m)]), _fmt(d + [sum(v or 0 for v in d)]))
    out = parse_table_page(words, 2)
    jan = {r.zone: r for r in out.rows if r.period == "Jan-26"}
    assert "Cadron" not in jan
    assert (jan["Petit Jean"].mallards, jan["Petit Jean"].total_ducks) == (0, 0)


def test_tokens_joins_touching_characters():
    chars = [{"text": c, "x0": 100 + 3 * i, "x1": 103 + 3 * i, "top": 50.0} for i, c in enumerate("30,438")]
    chars += [{"text": c, "x0": 140 + 3 * i, "x1": 143 + 3 * i, "top": 50.4} for i, c in enumerate("2,136")]
    assert [t["text"] for t in tokens(chars)] == ["30,438", "2,136"]


@pytest.mark.parametrize("d,period", [
    (date(2026, 1, 23), "Jan-26"), (date(2026, 1, 13), "MWS-26"), (date(2024, 2, 1), "Jan-24"),
    (date(2025, 12, 23), "Dec-25"), (date(2023, 11, 28), "Nov-23"), (date(2026, 3, 1), None),
])
def test_period_of_a_survey_date(d, period):
    assert period_of(d) == period


def test_period_windows_and_nominal_dates():
    assert period_window("Jan-24") == (date(2024, 1, 16), date(2024, 2, 10))
    assert period_window("Dec-11") == (date(2011, 12, 1), date(2011, 12, 31))
    assert nominal_date("MWS-12") == date(2012, 1, 8)
    for p in ("Nov-15", "Dec-15", "MWS-16", "Jan-16"):
        lo, hi = period_window(p)
        assert lo <= nominal_date(p) <= hi


def test_report_rows_must_match_the_report_text(monkeypatch):
    rows = [ZoneRow("Delta", "Cache", "Jan-26", 30_234, 54_407)]
    tables = ZoneTables(rows=rows, totals={("Delta", "Jan-26"): (337_479, 694_286)})
    monkeypatch.setattr(agfc_zones, "parse_zone_tables", lambda b: tables)

    ok, problems = report_zone_rows(b"", date(2026, 1, 23), {"Delta": (337_479, 694_286)})
    assert ok == rows and problems == []

    bad, problems = report_zone_rows(b"", date(2026, 1, 23), {"Delta": (337_479, 600_000)})
    assert bad == [] and "doesn't match the report text" in problems[0]
