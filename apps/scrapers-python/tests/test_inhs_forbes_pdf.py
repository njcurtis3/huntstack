from huntstack_scrapers.parsers.inhs_forbes_pdf import (
    CODE_TO_SPECIES,
    extract_box_ids,
    parse_forbes_text,
)

# Header and total rows as pdfplumber extracts them from the 10/21/2026 Illinois River PDF
ILLINOIS_TEXT = """ILLINOIS NATURAL HISTORY SURVEY WATERFOWL AERIAL INVENTORY DATA
UPPER ILLINOIS RIVER VALLEY Date: 10/21/2026 Observer: Joshua Osborn BAEA
TOTAL
LOCATION %WET %ICE MALL ABDU NOPI BWTE GWTE AMWI GADW NSHO LESC RNDU CANV REDH RUDU COGO BUFF COMEHOME CAGO GWFG LSGO AWPE AMCO AD IMM DCCO SWN
Hennepin/Hopper 100 0 425 0 1,250 0 70 60 750 75 0 40 0 0 210 0 0 0 0 2,880 420 0 0 15 24,600 0 1 20 105
TOTAL UPPER 1,030 0 8,310 55 2,275 130 855 175 0 120 0 0 15,130 0 0 0 0 28,080 1,080 0 0 1,340 25,475 5 2 280 105
TOTAL LOWER 3,845 5 35,955 1,640 15,820 830 1,905 4,235 0 0 0 0 6,215 0 0 0 10 70,460 2,675 0 0 1,760 10,820 9 14 1,580 245
TOTAL ILLINOIS 4,875 5 44,265 1,695 18,095 960 2,760 4,410 0 120 0 0 21,345 0 0 0 10 98,540 3,755 0 0 3,100 36,295 14 16 1,860 350
10-Year Average
30,300 47 46,279 1,691 47,559 2,952 31,111 15,916 493 4,996 819 123 13,425 0 0 0 8 195,731 3,920 1,302 2 2,017 77,074 10 14 476 372
"""


def test_reads_river_wide_totals_not_section_totals():
    river, result = parse_forbes_text(ILLINOIS_TEXT)

    assert river == "ILLINOIS"
    assert result.survey_date == "2026-10-21"
    assert result.observers == "Joshua Osborn"
    assert result.survey_type == "aerial_weekly"
    # TOTAL ILLINOIS, not TOTAL UPPER (1,030) or the 10-year average (30,300)
    assert result.species_counts["Mallard"] == 4875
    assert result.species_counts["Northern Pintail"] == 44265
    assert result.species_counts["Ruddy Duck"] == 21345
    assert result.species_counts["Canada Goose"] == 3755
    assert "98,540 total ducks" in result.notes


def test_zero_counts_and_untracked_species_are_left_out():
    _, result = parse_forbes_text(ILLINOIS_TEXT)

    assert "Canvasback" not in result.species_counts  # 0 this flight
    assert set(result.species_counts) <= set(CODE_TO_SPECIES.values())


def test_mississippi_pdf_is_recognised():
    text = ILLINOIS_TEXT.replace("TOTAL ILLINOIS", "TOTAL MISSISSIPPI")
    river, _ = parse_forbes_text(text)
    assert river == "MISSISSIPPI"


def test_refuses_a_total_row_whose_duck_columns_do_not_add_up():
    # A missing duck column shifts every species onto its neighbour's count
    short = ILLINOIS_TEXT.replace("TOTAL ILLINOIS 4,875 5 ", "TOTAL ILLINOIS 4,875 ")
    assert parse_forbes_text(short) is None


def test_older_files_with_run_together_columns_keep_ducks_but_drop_geese():
    # Early-2025 layout: title case, and the eagle/cormorant columns print as one number
    older = ILLINOIS_TEXT.replace(
        "TOTAL ILLINOIS 4,875 5 44,265 1,695 18,095 960 2,760 4,410 0 120 0 0 21,345 0 0 0 10 98,540 3,755 0 0 3,100 36,295 14 16 1,860 350",
        "Total Illinois 4,875 5 44,265 1,695 18,095 960 2,760 4,410 0 120 0 0 21,345 0 0 0 10 98,540 3,755 0 0 3,100 36,295 14161860 350",
    )
    river, result = parse_forbes_text(older)

    assert river == "ILLINOIS"
    assert result.species_counts["Mallard"] == 4875
    assert "Canada Goose" not in result.species_counts


def test_no_total_row_or_no_date_returns_none():
    assert parse_forbes_text("ILLINOIS NATURAL HISTORY SURVEY\nWeathered out") is None
    assert parse_forbes_text(ILLINOIS_TEXT.replace("Date: 10/21/2026", "")) is None


def test_box_ids_are_extracted_once_in_page_order():
    html = (
        '<a href="https://uofi.box.com/s/aaa111">10/21/26</a>'
        '<a href="https://uofi.box.com/s/bbb222">10/21/26</a>'
        '<a href="https://uofi.box.com/s/aaa111">again</a>'
    )
    assert extract_box_ids(html) == ["aaa111", "bbb222"]
