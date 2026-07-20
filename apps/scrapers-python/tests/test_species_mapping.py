"""Tests for huntstack_scrapers.species_mapping — species name -> slug resolution."""

import pytest

from huntstack_scrapers.species_mapping import resolve_species_slug


class TestCoreAliases:
    @pytest.mark.parametrize(
        "name,expected_slug",
        [
            ("duck", "mallard"),
            ("Mallards", "mallard"),
            ("teal", "green-winged-teal"),
            ("blue-winged teal", "blue-winged-teal"),
            ("snow geese", "snow-goose"),
            ("SPECKLEBELLY", "white-fronted-goose"),
            ("bluebill", "scaup"),
        ],
    )
    def test_alias_resolves_case_insensitively(self, name, expected_slug):
        assert resolve_species_slug(name) == expected_slug


class TestCinnamonTealRegression:
    def test_cinnamon_teal_is_untracked_not_green_winged(self):
        # Regression: species_mapping previously aliased "cinnamon teal" to
        # green-winged-teal, misattributing scraped counts to the wrong
        # species. Cinnamon teal has no tracked slug in this project — it
        # must resolve to None (skip), not silently fall through to a
        # different species.
        assert resolve_species_slug("Cinnamon Teal") is None
        assert resolve_species_slug("cinnamon teal") is None


class TestMwiColumnMapping:
    def test_tracked_column_resolves(self):
        assert resolve_species_slug("American Wigeon") == "american-wigeon"

    def test_combined_teal_column_maps_to_blue_winged(self):
        assert (
            resolve_species_slug("Blue-winged and Cinnamon Teal (not speciated)")
            == "blue-winged-teal"
        )

    def test_untracked_column_explicitly_none(self):
        assert resolve_species_slug("Sandhill Crane") is None
        assert resolve_species_slug("Brant") is None


class TestRefugeSurveyMapping:
    def test_comma_separated_naming_convention(self):
        assert resolve_species_slug("Teal, Green-Winged") == "green-winged-teal"

    def test_curly_apostrophe_variant(self):
        assert resolve_species_slug("Ross’s Goose") == "ross-goose"

    def test_aggregate_rows_are_none(self):
        assert resolve_species_slug("Total Ducks") is None
        assert resolve_species_slug("TOTAL GEESE") is None

    def test_untracked_loess_bluffs_species(self):
        assert resolve_species_slug("Trumpeter Swan") is None
        assert resolve_species_slug("Pied-billed Grebe") is None


class TestUnknownName:
    def test_completely_unrecognized_name_returns_none(self):
        assert resolve_species_slug("Purple Martin") is None

    def test_empty_string_returns_none(self):
        assert resolve_species_slug("") is None
