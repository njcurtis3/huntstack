from huntstack_scrapers.parsers.inhs_forbes_pdf import (
    CODE_TO_SPECIES,
    INHS_SITES,
    SiteCount,
    extract_box_ids,
    parse_forbes_sites,
    parse_forbes_text,
    site_results,
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


# Site rows from the 10/28/2026 Mississippi River PDF (a few of each section)
MISSISSIPPI_SITES_TEXT = """ILLINOIS NATURAL HISTORY SURVEY WATERFOWL AERIAL INVENTORY DATA
UPPER MISSISSIPPI RIVER VALLEY Date: 10/28/2026 Observer: Joshua Osborn BAEA
LOCATION %WET%ICE MALL ABDU NOPI BWTE GWTE AMWI GADW NSHO LESC RNDU CANV REDH RUDU COGO BUFF COMEHOME CAGO GWFG LSGO AWPE AMCO AD IMM DCCO SWN
Louisa Refuge 80 0 1,020 0 1,100 0 230 50 415 185 0 205 0 0 0 0 0 0 0 3,205 540 70 0 0 1,910 0 2 115 0
TOTAL UPPER 1,700 0 4,850 0 6,745 90 1,225 890 205 2,035 0 0 16,650 0 0 0 0 34,390 1,280 70 0 245 4,990 4 10 760 0
LOWER MISSISSIPPI RIVER VALLEY
Swan Lake 90 0 2,100 0 15,500 400 19,000 300 2,660 3,000 0 500 0 0 400 0 0 0 0 43,860 215 0 0 505 4,300 1 2 0 0
Cannon Refuge 60 0 3,400 0 12,500 0 7,500 1,000 4,000 900 0 390 0 0 0 0 0 0 0 29,690 0 0 0 0 6,130 0 2 0 0
Mystery Slough 90 0 5 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5 0 0 0 0 0 0 0 0 0
TOTAL MISSISSIPPI 17,885 0 81,250 1,055 77,850 2,485 22,215 10,660 205 4,830 0 0 17,050 0 0 0 0 235,485 2,705 70 0 1,225 23,455 13 26 760 55
"""


def test_reads_each_survey_site():
    sites, problems = parse_forbes_sites(MISSISSIPPI_SITES_TEXT)

    by_name = {s.site.name: s for s in sites}
    cannon = by_name["Clarence Cannon National Wildlife Refuge"]
    assert cannon.survey_date == "2026-10-28"
    assert cannon.counts["Mallard"] == 3400
    assert cannon.counts["Northern Pintail"] == 12500
    assert cannon.counts["Green-winged Teal"] == 7500
    assert cannon.counts["Canada Goose"] == 0
    assert cannon.total_ducks == 29690 and cannon.checksum_ok
    assert by_name["Louisa Division, Port Louisa NWR - Mississippi River (INHS)"].site.state == "IA"
    # Section totals are not sites; an unknown label is reported, not stored
    assert len(sites) == 3
    assert problems == ["INHS 2026-10-28: unknown site 'Mystery Slough' (MISSISSIPPI LOWER #1)"]


def test_repeated_site_names_are_told_apart_by_order():
    text = """UPPER ILLINOIS RIVER VALLEY Date: 10/28/2026 Observer: Joshua Osborn BAEA
Goose Lake 70 0 0 0 200 0 410 0 0 0 0 0 0 0 0 0 0 0 0 610 0 0 0 940 1,480 2 5 0 0
Goose Lake 90 0 1,000 0 4,150 0 6,000 0 300 300 0 0 0 0 1,250 0 0 0 0 13,000 205 0 0 375 0 2 0 0 0
LOWER ILLINOIS RIVER VALLEY
Goose Lake 90 0 125 0 0 0 15 0 25 35 0 0 0 0 0 0 0 0 0 200 0 0 0 205 0 0 0 195 0
"""
    sites, problems = parse_forbes_sites(text)
    assert problems == []
    assert [(s.site.name, s.total_ducks) for s in sites] == [
        ("Goose Lake (Putnam Co.) - Illinois River (INHS)", 610),
        ("Goose Lake (Marshall Co.) - Illinois River (INHS)", 13000),
        ("Goose Lake (Fulton Co.) - Illinois River (INHS)", 200),
    ]


def test_misadded_row_is_kept_and_flagged():
    # 08/27/2025: INHS printed 1,135 total ducks; the species columns add up to 1,005
    text = """LOWER ILLINOIS RIVER VALLEY Date: 08/27/2025 Observer: Joshua Osborn BAEA
Emiquon/Spoon Btm 50 0 110 0 0 835 30 0 0 30 0 0 0 0 0 0 0 0 0 1,135 110 0 0 210 0 1 0 220 20
"""
    sites, _ = parse_forbes_sites(text)
    assert sites[0].counts["Blue-winged Teal"] == 835 and not sites[0].checksum_ok
    [(result, _)] = site_results(sites)
    assert "add up differently" in result.notes


def test_other_layouts_give_no_sites():
    # The Feb-Apr 2025 long list has no UPPER/LOWER sections
    assert parse_forbes_sites(ILLINOIS_TEXT.replace("UPPER ILLINOIS RIVER VALLEY", "ILLINOIS RIVER")) == ([], [])


def test_site_results_keep_seen_species_and_zero_the_ones_that_left():
    sites, _ = parse_forbes_sites(MISSISSIPPI_SITES_TEXT)
    cannon = next(s for s in sites if "Cannon" in s.site.name)
    later = SiteCount(cannon.site, "2026-11-04", {**{k: 0 for k in cannon.counts}, "Mallard": 9000}, 9000, True)

    results = site_results([later, cannon])  # any order in, oldest first out
    first, second = (r for r, _ in results)
    assert first.survey_date == "2026-10-28"
    assert "Canada Goose" not in first.species_counts  # never seen there: no zero row
    assert second.species_counts["Mallard"] == 9000
    assert second.species_counts["Northern Pintail"] == 0  # seen last flight, gone now
    assert "Canada Goose" not in second.species_counts
    assert all(name == cannon.site.name for _, name in results)


def test_every_site_has_a_point_in_the_flyway():
    assert len(INHS_SITES) == 43
    assert len({s.name for s in INHS_SITES.values()}) == 43
    for site in INHS_SITES.values():
        assert 38.5 < site.lat < 41.5 and -91.7 < site.lng < -89.0, site
        assert site.state in {"IL", "MO", "IA"}
