"""
Centralized species name -> slug mapping for all ingestion pipelines.

Used by: extract_regulations.py, ingest_mwi.py, refuge_counts spider.
"""

import re

# Core slug mapping — covers regulation text, common names, abbreviations
SPECIES_ALIASES: dict[str, str] = {
    # Ducks
    "duck": "mallard",
    "ducks": "mallard",
    "mallard": "mallard",
    "mallards": "mallard",
    "teal": "green-winged-teal",
    "green-winged teal": "green-winged-teal",
    "blue-winged teal": "blue-winged-teal",
    "pintail": "pintail",
    "northern pintail": "pintail",
    "wood duck": "wood-duck",
    "gadwall": "gadwall",
    "wigeon": "american-wigeon",
    "american wigeon": "american-wigeon",
    "baldpate": "american-wigeon",
    "shoveler": "northern-shoveler",
    "northern shoveler": "northern-shoveler",
    "spoonbill": "northern-shoveler",
    "canvasback": "canvasback",
    "redhead": "redhead",
    "scaup": "scaup",
    "bluebill": "scaup",
    "bluebills": "scaup",
    "ring-necked duck": "ring-necked-duck",
    "ringneck": "ring-necked-duck",
    "ringbill": "ring-necked-duck",
    "bufflehead": "bufflehead",
    "butterball": "bufflehead",
    "ruddy duck": "ruddy-duck",
    "mottled duck": "mottled-duck",
    # Geese
    "snow goose": "snow-goose",
    "snow geese": "snow-goose",
    "light goose": "snow-goose",
    "light geese": "snow-goose",
    "blue goose": "snow-goose",
    "ross goose": "ross-goose",
    "ross's goose": "ross-goose",
    "canada goose": "canada-goose",
    "canada geese": "canada-goose",
    "dark goose": "canada-goose",
    "dark geese": "canada-goose",
    "white-fronted goose": "white-fronted-goose",
    "greater white-fronted goose": "white-fronted-goose",
    "specklebelly": "white-fronted-goose",
    "speck": "white-fronted-goose",
}

# MWI CSV column headers -> species slug
# From USFWS Mid-Winter Waterfowl Survey CSVs (CF.csv, MF.csv, etc.)
MWI_COLUMN_MAPPING: dict[str, str | None] = {
    "Mallard": "mallard",
    "Canada Goose (not speciated)": "canada-goose",
    "Light Geese (not differentiated by color phase)": "snow-goose",
    "Greater White-fronted Goose": "white-fronted-goose",
    "Green-winged Teal": "green-winged-teal",
    "Blue-winged and Cinnamon Teal (not speciated)": "blue-winged-teal",
    "Northern Pintail": "pintail",
    "Wood Duck": "wood-duck",
    # Now tracked
    "American Wigeon": "american-wigeon",
    "Bufflehead": "bufflehead",
    "Canvasback": "canvasback",
    "Gadwall": "gadwall",
    "Mottled Duck": "mottled-duck",
    "Northern Shoveler": "northern-shoveler",
    "Redhead": "redhead",
    "Ring-necked Duck": "ring-necked-duck",
    "Ruddy Duck": "ruddy-duck",
    "Scaup (not speciated)": "scaup",
    # Not tracked — skip
    "American Black Duck": None,
    "American Coot": None,
    "Brant": None,
    "Eider (not speciated)": None,
    "Emperor Goose": None,
    "Goldeneye (not speciated)": None,
    "Harlequin Duck": None,
    "Long-tailed Duck": None,
    "Merganser (not speciated)": None,
    "Mexican-like Duck": None,
    "Sandhill Crane": None,
    "Scoters": None,
    "Swan (not differentiated)": None,
    "Unidentified Ducks": None,
    "Whistling Duck": None,
    "Miscellaneous Ducks": None,
}

# Refuge weekly survey HTML names -> slug
REFUGE_SURVEY_MAPPING: dict[str, str | None] = {
    # Ducks
    "Mallard": "mallard",
    "Mallards": "mallard",
    "Green-winged Teal": "green-winged-teal",
    "Blue-winged Teal": "blue-winged-teal",
    "Northern Pintail": "pintail",
    "Pintail": "pintail",
    "Wood Duck": "wood-duck",
    # Salt Plains / comma-separated naming convention
    "Teal, Green-Winged": "green-winged-teal",
    "Teal, Blue-Winged": "blue-winged-teal",
    "Northern Shoveler": "northern-shoveler",
    "Merganser, Hooded": None,
    "Merganser, Common": None,
    "Ruddy Duck": "ruddy-duck",
    "Bufflehead": "bufflehead",
    # Geese
    "Snow/Ross's Goose": "snow-goose",
    "Snow/Ross's Geese": "snow-goose",
    "Snow/Blue/Ross Geese": "snow-goose",
    "Snow/Blue/Ross": "snow-goose",
    "Snow Goose": "snow-goose",
    "Ross's Goose": "ross-goose",
    "Ross\u2019s Goose": "ross-goose",  # curly apostrophe from PDFs
    "Canada Goose": "canada-goose",
    "Canada, Large": "canada-goose",
    "Canada, Small": "canada-goose",
    "Large Canada Geese": "canada-goose",
    "Small Canada Geese": "canada-goose",
    "Cackling Goose": "canada-goose",
    "White-fronted Goose": "white-fronted-goose",
    "Greater White-fronted Goose": "white-fronted-goose",
    "Greater White-Fronted": "white-fronted-goose",
    "Specklebelly Goose": "white-fronted-goose",
    # TPWD midwinter workbook abbreviations
    "G-W Teal": "green-winged-teal",
    "B-W/Cinn. Teal": "blue-winged-teal",
    "Snow/Blue/Ross' Goose": "snow-goose",
    "Goldeneye": None,
    "Black-bellied W.D.": None,
    "Fulvous W.D.": None,
    # Aggregate rows — skip
    "Total Ducks": None,
    "Total Geese": None,
    "Total Waterfowl": None,
    "Grand Total": None,
    "TOTAL DUCKS": None,
    "TOTAL GEESE": None,
    "Unidentified": None,
    "Sandhill Crane": None,
    # Loess Bluffs PDF species — now tracked
    "American Wigeon": "american-wigeon",
    "Gadwall": "gadwall",
    "Canvasback": "canvasback",
    "Redhead": "redhead",
    "Ring-necked Duck": "ring-necked-duck",
    "Scaup": "scaup",
    "Lesser Scaup": "scaup",    # Washita, Clarence Cannon (found by the pipeline's check)
    "Greater Scaup": "scaup",
    # Loess Bluffs PDF species — not tracked
    "Trumpeter Swan": None,
    "Tundra Swan": None,
    "American Black Duck": None,
    "Cinnamon Teal": None,
    "Common Goldeneye": None,
    "Hooded Merganser": None,
    "Common Merganser": None,
    "Red-breasted Merganser": None,
    "Pied-billed Grebe": None,
    "Horned Grebe": None,
    "Eared Grebe": None,
    "American Coot": None,
}


def resolve_species_slug(name: str) -> str | None:
    """Resolve any species name variant to its canonical slug.

    Returns None if the name maps to a species we don't track in V1.
    """
    if not name:
        return None
    # Parsers already hand the pipeline slugs; a slug must resolve to itself. Without
    # this, any slug that isn't also an alias ("green-winged-teal", "canada-goose")
    # was silently dropped at storage time.
    if name.strip() in _KNOWN_SLUGS:
        return name.strip()
    normalized = name.strip().lower()

    # Try core alias match (case-insensitive)
    slug = SPECIES_ALIASES.get(normalized)
    if slug:
        return slug

    # Try MWI column match (case-sensitive, exact)
    val = MWI_COLUMN_MAPPING.get(name.strip())
    if val is not None:
        return val
    if name.strip() in MWI_COLUMN_MAPPING:
        return None  # Explicitly mapped to None (skip)

    # Try refuge survey match (case-sensitive, exact)
    val = REFUGE_SURVEY_MAPPING.get(name.strip())
    if val is not None:
        return val
    if name.strip() in REFUGE_SURVEY_MAPPING:
        return None  # Explicitly mapped to None (skip)

    return None


_WATERFOWL_WORDS = re.compile(
    r"duck|teal|goose|geese|mallard|pintail|gadwall|wigeon|widgeon|shoveler|canvasback|redhead|"
    r"scaup|bufflehead|goldeneye|merganser|swan|brant|whistling|dabbler|diver",
    re.IGNORECASE,
)


def is_unknown_species_name(name: str) -> bool:
    """True when a parsed name looks like waterfowl but maps to nothing: not a tracked
    species and not a deliberately skipped one (totals, swans, mergansers...). These are the
    silent drops: a new spelling in a source ("G-W Teal", "Lesser Scaup") lands here until
    someone maps it, so the data pipeline reports it instead of letting it vanish.

    Other birds on refuge sheets (herons, eagles, hawks) are never tracked, so they're
    ignored rather than flagged.
    """
    if not name or not name.strip() or not _WATERFOWL_WORDS.search(name):
        return False
    if resolve_species_slug(name) is not None:
        return False
    stripped = name.strip()
    return not (
        stripped in MWI_COLUMN_MAPPING
        or stripped in REFUGE_SURVEY_MAPPING
        or stripped.lower() in SPECIES_ALIASES
    )


_KNOWN_SLUGS: frozenset[str] = frozenset(
    v for m in (SPECIES_ALIASES, MWI_COLUMN_MAPPING, REFUGE_SURVEY_MAPPING) for v in m.values() if v
)
