from huntstack_scrapers.parsers.base import ParseResult
from huntstack_scrapers.parsers.ldwf_pdf import fix_ldwf_survey_date

BASE = "https://www.wlf.louisiana.gov/assets/Resources/Publications/Waterfowl/Aerial-Surveys/"


def _r(date):
    return ParseResult(survey_date=date, species_counts={"Gadwall": 1})


def test_typo_year_takes_file_name_year():
    # waterjan2026.pdf is dated "Jan. 23, 2025" on its face
    assert fix_ldwf_survey_date(_r("2025-01-23"), BASE + "waterjan2026.pdf").survey_date == "2026-01-23"


def test_matching_date_unchanged():
    assert fix_ldwf_survey_date(_r("2026-11-12"), BASE + "waternov2026.pdf").survey_date == "2026-11-12"
    assert fix_ldwf_survey_date(_r("2025-01-17"), BASE + "waterJan2025.pdf").survey_date == "2025-01-17"


def test_long_month_names_and_old_file_names():
    assert fix_ldwf_survey_date(_r("2025-09-17"), BASE + "waterseptember2026.pdf").survey_date == "2026-09-17"
    url = BASE + "Louisiana_Aerial_Waterfowl_Survey_January_2024_Little-River.pdf"
    assert fix_ldwf_survey_date(_r("2024-01-10"), url).survey_date == "2024-01-10"


def test_other_mismatch_left_alone():
    # Different month: not a year typo, so nothing is guessed
    assert fix_ldwf_survey_date(_r("2025-12-19"), BASE + "waterjan2026.pdf").survey_date == "2025-12-19"
    assert fix_ldwf_survey_date(_r("2025-12-19"), BASE + "notes.pdf").survey_date == "2025-12-19"


def test_word_starting_with_month_is_not_a_month():
    assert fix_ldwf_survey_date(_r("2025-12-19"), BASE + "summary-2024.pdf").survey_date == "2025-12-19"
