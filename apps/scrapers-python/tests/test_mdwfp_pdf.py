from datetime import date

from huntstack_scrapers.parsers.mdwfp_pdf import merge_reports, parse_mdwfp_text

# Trimmed from MDWFP's November 2026 report (pages 1-3 as pdfplumber reads them)
NOV_2026 = """MDWFP Aerial Waterfowl Survey Report
November 17 - 20, 2026
Prepared by:
Table 1. Waterfowl abundance estimates in the Mississippi Delta during the November survey
periods, 2007-2026.
Mallards Dabblers Divers Total Ducks
2007-08 25,872 34,241 27,992 88,106
2008-09 30,748 96,245 105,089 232,081
2012-13 No survey No survey No survey No survey
2023-24 16,446 39,438 30,152 86,035
2024-25 5,741 75,902 5,369 87,011
2025-26 22,231 224,513 59,166 305,910
2026-27 548 19,569 1,843 21,864
Average 33,696 128,210 71,338 233,238
Table 2. Comparison of November 2026 aerial waterfowl survey estimates to the long-term
average (LTA) for November survey estimates.
Species Group November 2026 November LTA % Change from LTA
Mallards 548 33,696 -98%
Other Dabblers 19,569 128,210 -85%
Diving Ducks 1,843 71,338 -97%
Total Ducks 21,864 233,238 -91%
"""

# Trimmed from the December 2025 report: calendar-year labels
DEC_2025 = """MDWFP Aerial Waterfowl Survey Report
December 15 - 19, 2025
Table 1. Waterfowl abundance estimates in the Mississippi Delta during the December survey
periods, 2007-2025.
Mallards Dabblers Divers Total Ducks
2007 50,368 75,604 41,738 167,710
2008 223,976 389,939 70,750 684,665
2023 29,753 108,173 21,809 159,735
2024 49,533 210,620 41,975 302,128
2025 92,947 223,389 73,847 390,183
Average 113,358 256,942 112,409 482,708
Table 2. Comparison of December 2025 aerial waterfowl survey estimates to the long-term
Species Group December 2025 December LTA % Change from LTA
Mallards 92,947 113,358 -18%
Total Ducks 390,183 482,708 -19%
"""

JAN_2026 = """MDWFP Aerial Waterfowl Survey Report
January 5 - 20, 2026
Table 1. Waterfowl abundance estimates in the Mississippi Delta during the early January
survey periods, 2008-2026.
Mallards Dabblers Divers Total Ducks
2008 204,322 248,542 74,342 527,205
2009 191,236 278,601 66,691 536,529
2024 20,869 82,800 51,401 155,070
2025 91,865 380,573 87,833 560,204
2026 140,042 414,947 48,175 603,165
Average 209,984 358,284 90,333 656,868
Species Group Early Jan 2026 Early Jan LTA % Change from LTA
Mallards 140,042 209,984 -33%
Total Ducks 603,165 656,868 -8%
"""


def test_november_report():
    this, history = parse_mdwfp_text(NOV_2026)
    assert (this.month, this.year, this.mallards, this.total, this.flown) == (11, 2026, 548, 21864, date(2026, 11, 20))
    # "No survey" years are skipped; season labels give the November's year
    assert [h.year for h in history] == [2007, 2008, 2023, 2024, 2025]


def test_december_and_january_labels():
    dec, dec_hist = parse_mdwfp_text(DEC_2025)
    assert (dec.month, dec.year, dec.flown) == (12, 2025, date(2025, 12, 19))
    assert dec_hist[0].year == 2007
    jan, jan_hist = parse_mdwfp_text(JAN_2026)
    assert (jan.month, jan.part, jan.year, jan.flown) == (1, "early", 2026, date(2026, 1, 20))
    assert [h.year for h in jan_hist] == [2008, 2009, 2024, 2025]


def test_table_2_must_agree():
    assert parse_mdwfp_text(NOV_2026.replace("Total Ducks 21,864", "Total Ducks 21,865")) is None


def test_flight_dates_across_months():
    text = NOV_2026.replace("November 17 - 20, 2026", "November 30 - December 3, 2026")
    assert parse_mdwfp_text(text)[0].flown == date(2026, 12, 3)


def test_merge_prefers_real_dates_and_splits_other_ducks():
    out = merge_reports([(parse_mdwfp_text(NOV_2026), "nov26"), (parse_mdwfp_text(JAN_2026), "jan26")])
    by_date = {r.survey_date: r for r, _ in out}
    assert by_date["2026-11-20"].species_counts == {"mallard": 548, "other ducks": 21316}
    assert by_date["2026-11-20"].verified_total == 21864
    # Table 1 years with no report of their own: mid-month (Nov 15), early January on the 10th
    assert "2025-11-15" in by_date and "2025-01-10" in by_date
    assert "dates" in by_date["2025-11-15"].notes
    # Each survey once
    assert len(by_date) == len(out)
