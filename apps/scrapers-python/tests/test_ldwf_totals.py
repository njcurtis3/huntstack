from huntstack_scrapers.parsers.ldwf_pdf import duck_sum, ldwf_total_ducks


def test_total_ducks_is_last_number_on_the_row():
    text = "DIVERS\nTOTAL DUCKS 438,000 169,000 79,000 686,000\nCOOTS 84,000 75,000 ** 159,000"
    assert ldwf_total_ducks(text) == 686000


def test_total_ducks_with_footnote_mark():
    assert ldwf_total_ducks("TOTAL DUCKS 50,000* 37,000 2,000 89,000*\nCOOTS") == 89000


def test_total_ducks_missing_numbers_is_none():
    assert ldwf_total_ducks("DIVERS\nTOTAL DUCKS\n103,000 32,000 6,000 141,000") is None
    assert ldwf_total_ducks("no table here") is None


def test_duck_sum_leaves_out_coots_and_geese():
    counts = {
        "Blue-winged Teal": 259000, "Gadwall": 114000, "Northern Pintail": 94000,
        "Lesser Scaup": 80000, "Northern Shoveler": 59000, "Ring-necked Duck": 40000,
        "Mottled Duck": 26000, "Green-winged Teal": 13000, "Wigeon": 1000,
        "American Coot": 159000, "Snow Goose": 89000,
    }
    assert duck_sum(counts) == 686000
