"""LDWF Table 1 read by position: each layout LDWF has used since 2019, from the real PDFs' text."""

from huntstack_scrapers.parsers.ldwf_pdf import ldwf_report_date, read_ldwf_table

# Jan 2019: numbers on the label's line, totals split over three lines
INLINE = """Reported by: L. Reynolds
January 17, 2019
SPECIES SOUTHWEST SOUTHEAST CATAHOULA TOTALS
LAKE
MALLARD 70,000 3,000 ** 73,000
MOTTLED 14,000 38,000 52,000
GADWALL 337,000 273,000 ** 610,000
WIGEON 5,000 3,000 8,000
GW TEAL 330,000 55,000 385,000
BW TEAL 52,000 37,000 89,000
SHOVELER 172,000 3,000 175,000
PINTAIL 51,000 33,000 84,000
TOTAL
1,031,000 445,000 ** 1,476,000
DABBLERS
SCAUP 71,000 133,000 204,000
RINGNECKED 180,000 129,000 ** 309,000
CANVASBACK 11,000 45,000 4,000 60,000
TOTAL
262,000 307,000 4,000 573,000
DIVERS
TOTAL DUCKS 1,293,000 752,000 4,000 2,049,000
COOTS 170,000 648,000 818,000
COMMENTS:"""

# Nov 2024: numbers on the line above the label; rows with no numbers at all
ABOVE = """Jan. 23, 2025
SPECIES SOUTHWEST SOUTHEAST Little River TOTALS
Basin
* * *
MALLARD
10,000 5,000 15,000
MOTTLED
68,000 7,000 12,000 87,000
GADWALL
3,000 * 3,000
WIGEON
26,000 * * 26,000
GW TEAL
146,000 60,000 23,000 229,000
BW TEAL
10,000 9,000 19,000
SHOVELER
21,000 34,000 74,000 129,000
PINTAIL
284,000 106,000 118,000 508,000
TOTAL
DABBLERS
SCAUP
1,000 1,000 2,000
RINGNECKED
CANVASBACK
1,000 1,000 2,000
TOTAL
DIVERS
284,000 107,000 119,000 510,000
TOTAL DUCKS
103,000 32,000 6,000 141,000
COOTS"""

# Jan 2022: a row split over two lines, the total on the line above
SPLIT = """SPECIES SOUTHWEST SOUTHEAST CATAHOULA TOTALS
LAKE
1,000 ** 23,000
MALLARD 22,000
13,000 23,000
MOTTLED 10,000
90,000 ** 341,000
GADWALL 251,000
** **
WIGEON **
68,000 268,000
GW TEAL 200,000
72,000 232,000
BW TEAL 160,000
6,000 ** 139,000
SHOVELER 133,000
30,000 ** 97,000
PINTAIL 67,000
TOTAL
843,000 280,000 ** 1,123,000
DABBLERS
SCAUP 122,000 311,000 8,000 441,000
294,000 ** 333,000
RINGNECKED 39,000
93,000 34,000 30,000 157,000
CANVASBACK
TOTAL
254,000 639,000 38,000 931,000
DIVERS
TOTAL DUCKS 1,097,000 919,000 38,000 2,054,000
COOTS"""

# Sept 2024: the survey wasn't completed (Hurricane Francine)
EMPTY = """SPECIES SOUTHWEST SOUTHEAST LRB TOTALS
MALLARD
MOTTLED
GADWALL
WIGEON
GW TEAL
BW TEAL
SHOVELER
PINTAIL
TOTAL
DABBLERS
SCAUP
RINGNECKED
CANVASBACK
TOTAL
DIVERS
TOTAL DUCKS
COOTS
COMMENTS:"""


def test_inline_layout():
    species, total = read_ldwf_table(INLINE)
    assert total == 2_049_000
    assert species["Mottled Duck"] == 52_000 and species["Canvasback"] == 60_000
    assert sum(species.values()) == total


def test_numbers_above_layout():
    species, total = read_ldwf_table(ABOVE)
    assert total == 510_000
    assert species["Northern Pintail"] == 129_000  # not 508,000, the TOTAL DABBLERS row
    assert species["Ring-necked Duck"] == 2_000
    assert "Mallard" not in species and "Scaup" not in species and "Canvasback" not in species


def test_split_rows():
    species, total = read_ldwf_table(SPLIT)
    assert total == 2_054_000
    assert species["Mallard"] == 23_000 and species["Ring-necked Duck"] == 333_000
    assert "American Wigeon" not in species


def test_empty_table():
    assert read_ldwf_table(EMPTY) == ({}, 0)


def test_misread_is_refused():
    assert read_ldwf_table(INLINE.replace("MOTTLED 14,000 38,000 52,000", "MOTTLED 14,000 38,000 62,000")) is None
    assert read_ldwf_table("no table here") is None


def test_report_date():
    assert ldwf_report_date(INLINE) == "2019-01-17"
    assert ldwf_report_date(ABOVE) == "2025-01-23"
    assert ldwf_report_date(SPLIT) is None
