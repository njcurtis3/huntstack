from huntstack_scrapers.ingest_cf_mws import STATE_COLUMNS, parse_state_table

# Column centres roughly as pdfplumber reports them on the 2024 report pages
X = {c: 170 + i * 43 for i, c in enumerate(STATE_COLUMNS)}
X["TOTAL"] = 623


def word(text, x, top):
    return {"text": text, "x0": x - 8, "x1": x + 8, "top": top}


def page(rows, year=2024):
    words = [word(w, 300 + i * 60, 40) for i, w in enumerate(
        f"JANUARY {year} MID-WINTER WATERFOWL SURVEY - CENTRAL FLYWAY".split())]
    words.append(word("SPECIES", 100, 84))
    words += [word(c, x, 84) for c, x in X.items()]
    for n, (label, cells) in enumerate(rows):
        top = 100 + n * 12
        words += [word(part, 40 + i * 30, top) for i, part in enumerate(label.split())]
        words += [word(f"{v:,}", X[c], top) for c, v in cells.items()]
    return words


def test_values_are_placed_by_column_even_when_cells_are_blank():
    # Older tables print nothing instead of 0: KS is the only non-zero state left of TX here
    year, by_state = parse_state_table(page([
        ("Gadwall", {"KS": 2509, "TX": 842979, "TOTAL": 845488}),
    ], year=2015))

    assert year == 2015
    assert by_state["KS"]["gadwall"] == 2509
    assert by_state["TX"]["gadwall"] == 842979
    assert "gadwall" not in by_state["OK"]


def test_rows_whose_states_do_not_add_up_to_the_total_are_dropped():
    _, by_state = parse_state_table(page([
        ("Mallard", {"KS": 100, "TX": 200, "TOTAL": 999}),
        ("Pintail", {"KS": 10, "TX": 20, "TOTAL": 30}),
    ]))

    assert "mallard" not in by_state["TX"]
    assert by_state["TX"]["pintail"] == 20


def test_totals_and_untracked_rows_are_ignored():
    _, by_state = parse_state_table(page([
        ("Total Ducks", {"TX": 500, "TOTAL": 500}),
        ("Mergansers", {"TX": 40, "TOTAL": 40}),
        ("Snow/Blue Goose", {"KS": 5, "TX": 7, "TOTAL": 12}),
    ]))

    assert by_state["TX"] == {"snow-goose": 7}


def test_pages_without_a_survey_title_are_skipped():
    words = [word("Coordinators", 100, 40), word("SPECIES", 100, 84)]
    assert parse_state_table(words) is None
