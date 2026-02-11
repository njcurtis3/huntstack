"""
Centralized species name -> slug mapping for all ingestion pipelines.

Used by: extract_regulations.py, ingest_mwi.py, refuge_counts spider.
"""

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
    "cinnamon teal": "green-winged-teal",
    "pintail": "pintail",
    "northern pintail": "pintail",
    "wood duck": "wood-duck",
    "redhead": "mallard",
    "canvasback": "mallard",
    "scaup": "mallard",
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
    # Species not yet in our DB — skip for V1
    "American Black Duck": None,
    "American Coot": None,
    "American Wigeon": None,
    "Brant": None,
    "Bufflehead": None,
    "Canvasback": None,
    "Eider (not speciated)": None,
    "Emperor Goose": None,
    "Gadwall": None,
    "Goldeneye (not speciated)": None,
    "Harlequin Duck": None,
    "Long-tailed Duck": None,
    "Merganser (not speciated)": None,
    "Mexican-like Duck": None,
    "Mottled Duck": None,
    "Northern Shoveler": None,
    "Redhead": None,
    "Ring-necked Duck": None,
    "Ruddy Duck": None,
    "Sandhill Crane": None,
    "Scaup (not speciated)": None,
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
    "Northern Shoveler": None,
    "Merganser, Hooded": None,
    "Merganser, Common": None,
    "Ruddy Duck": None,
    "Bufflehead": None,
    # Geese
    "Snow/Ross's Goose": "snow-goose",
    "Snow/Ross's Geese": "snow-goose",
    "Snow/Blue/Ross Geese": "snow-goose",
    "Snow/Blue/Ross": "snow-goose",
    "Snow Goose": "snow-goose",
    "Ross's Goose": "ross-goose",
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
    # Aggregate rows — skip
    "Total Ducks": None,
    "Total Geese": None,
    "Total Waterfowl": None,
    "Grand Total": None,
    "TOTAL DUCKS": None,
    "TOTAL GEESE": None,
    "Unidentified": None,
    "Sandhill Crane": None,
}


def resolve_species_slug(name: str) -> str | None:
    """Resolve any species name variant to its canonical slug.

    Returns None if the name maps to a species we don't track in V1.
    """
    if not name:
        return None
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
