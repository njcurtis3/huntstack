"""Tests for the Hagerman NWR census parser (Friends of Hagerman checklists via eBird)."""

from huntstack_scrapers.parsers.hagerman_census import (
    EBIRD_WATERFOWL,
    census_results,
    checklist_ids,
    parse_checklist,
)
from huntstack_scrapers.species_mapping import resolve_species_slug


def _checklist(sub_id, date, obs, loc="L815117", complete=True, comments="Observers: Jack Chiles, Wayne Meyer"):
    return {
        "subId": sub_id,
        "locId": loc,
        "obsDt": f"{date} 07:53",
        "allObsReported": complete,
        "comments": comments,
        "numSpecies": len(obs),
        "obs": [{"speciesCode": code, "howManyStr": n} for code, n in obs],
    }


def test_checklist_ids_in_page_order_once_each():
    html = """
      <a href="https://ebird.org/checklist/S405925015?continue">eBird</a>
      <a href="https://ebird.org/checklist/S404084521">eBird</a>
      <a href="https://ebird.org/checklist/S405925015?continue">again</a>
      <a href="https://ebird.org/hotspot/L815117">hotspot</a>
    """
    assert checklist_ids(html) == ["S405925015", "S404084521"]


def test_parse_checklist_keeps_waterfowl_with_numbers():
    c = _checklist("S1", "2026-10-27", [
        ("cangoo", "255"), ("cacgoo1", "5"), ("gnwtea", "87"), ("mallar3", "19"),
        ("norpin", "X"),          # present, no number: left out
        ("blkvul", "47"),         # not waterfowl
        ("wooduc", "9"),
    ])
    p = parse_checklist(c)
    assert p["date"] == "2026-10-27"
    assert p["counts"] == {"canada-goose": 260, "green-winged-teal": 87, "mallard": 19, "wood-duck": 9}
    assert p["complete"] is True
    assert p["observers"] == "Jack Chiles, Wayne Meyer"


def test_parse_checklist_skips_other_locations():
    assert parse_checklist(_checklist("S2", "2026-10-27", [("mallar3", "4")], loc="L999")) is None


def test_census_results_zero_for_species_gone_since_last_week():
    parsed = [
        parse_checklist(_checklist("S11", "2026-10-27", [("mallar3", "19")])),
        parse_checklist(_checklist("S10", "2026-10-20", [("mallar3", "12"), ("norpin", "25")])),
    ]
    results = census_results(parsed)
    assert [r.survey_date for r, _ in results] == ["2026-10-20", "2026-10-27"]
    latest, url = results[-1]
    assert latest.species_counts == {"mallard": 19, "pintail": 0}
    assert url == "https://ebird.org/checklist/S11"
    assert "volunteer" in latest.notes and "S11" in latest.notes


def test_census_results_no_zeros_after_incomplete_checklist():
    parsed = [
        parse_checklist(_checklist("S10", "2026-10-20", [("norpin", "25")])),
        parse_checklist(_checklist("S11", "2026-10-27", [("mallar3", "19")], complete=False)),
    ]
    latest, _ = census_results(parsed)[-1]
    assert latest.species_counts == {"mallard": 19}


def test_census_results_adds_split_team_checklists():
    parsed = [
        parse_checklist(_checklist("S20", "2026-11-03", [("mallar3", "10")])),
        parse_checklist(_checklist("S21", "2026-11-03", [("mallar3", "5"), ("gadwal", "3")])),
    ]
    (only, _), = census_results(parsed)
    assert only.species_counts == {"mallard": 15, "gadwall": 3}


def test_census_results_skips_weeks_with_no_waterfowl():
    parsed = [parse_checklist(_checklist("S30", "2026-07-07", [("blkvul", "3")]))]
    assert census_results(parsed) == []


def test_every_slug_is_tracked():
    for slug in set(EBIRD_WATERFOWL.values()):
        assert resolve_species_slug(slug) == slug, slug
