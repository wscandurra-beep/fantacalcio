import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from import_workbooks import apply_scraped_age_enrichment, normalize_player_name
from scrape_missing_ages import (
    age_from_dob,
    discover_fbref_team_urls,
    match_candidate,
    normalize_team,
    parse_fbref_squad,
    parse_transfermarkt_profile,
    parse_transfermarkt_search,
    select_transfermarkt_candidate,
    valid_age,
)


class AgeScraperTests(unittest.TestCase):
    def test_normalization_accents_apostrophes_hyphens_spacing(self):
        self.assertEqual(normalize_player_name("  Éderson-Silva  "), "ederson silva")
        self.assertEqual(normalize_player_name("D'Amico"), "d amico")

    def test_team_aliases(self):
        self.assertEqual(normalize_team("Como 1907"), "como")
        self.assertEqual(normalize_team("Internazionale"), "inter")

    def test_fbref_discovery_and_squad_parse(self):
        league = '<a href="/en/squads/922493f3/Atalanta-Stats">Atalanta</a>'
        self.assertEqual(discover_fbref_team_urls(league)["atalanta"], "https://fbref.com/en/squads/922493f3/Atalanta-Stats")
        squad = '''<!--<table><tr><th data-stat="player"><a>Éderson Silva</a></th><td data-stat="age">26-123</td></tr></table>--><table><tr><th data-stat="player">Éderson Silva</th><td data-stat="age">26</td></tr></table>'''
        self.assertEqual(parse_fbref_squad(squad), [{"name": "Éderson Silva", "age": 26}])

    def test_exact_and_abbreviated_matching_is_conservative(self):
        player = {"name": "Martinez Jo.", "team": "Inter"}
        candidate, how = match_candidate(player, [{"name": "Josep Martinez", "age": 28}], implicit_team=True)
        self.assertEqual(candidate["age"], 28)
        self.assertEqual(how, "abbreviated_name_team")
        candidate, how = match_candidate(player, [{"name": "Josep Martinez"}, {"name": "Jonathan Martinez"}], implicit_team=True)
        self.assertIsNone(candidate)
        self.assertEqual(how, "ambiguous")

    def test_transfermarkt_search_requires_team_and_profile_parses_dob(self):
        html = '''<table><tr><td><a href="/marc-oliver-kempf/profil/spieler/160938">Marc Oliver Kempf</a></td><td>Como 1907</td></tr></table>'''
        candidates = parse_transfermarkt_search(html)
        chosen, how = select_transfermarkt_candidate({"name": "Kempf", "team": "Como"}, candidates)
        self.assertIsNotNone(chosen)
        self.assertEqual(how, "abbreviated_name_team")
        age, dob = parse_transfermarkt_profile('<div>Date of birth/Age: 28/01/1995 (31)</div>')
        self.assertEqual(age, 31)
        self.assertEqual(dob, "1995-01-28")

    def test_age_validation_and_dob_calculation(self):
        self.assertTrue(valid_age(31))
        self.assertFalse(valid_age(14))
        self.assertEqual(age_from_dob("28/01/1995", date(2026, 8, 30)), 31)

    def test_scraped_enrichment_never_overwrites_existing_age(self):
        players = [
            {"id": "1", "name": "Kempf", "team": "Como", "age": None},
            {"id": "2", "name": "Existing", "team": "Roma", "age": 29, "ageSource": "existing"},
        ]
        rows = [
            {"id": "1", "name": "Kempf", "age": 31, "source": "transfermarkt", "sourceUrl": "x", "matchedBy": "normalized_name_team", "dateOfBirth": "1995-01-28"},
            {"id": "2", "name": "Existing", "age": 40, "source": "fbref"},
            {"id": "1", "name": "Wrong Name", "age": 35, "source": "fbref"},
        ]
        counts = apply_scraped_age_enrichment(players, rows)
        self.assertEqual(players[0]["age"], 31)
        self.assertEqual(players[0]["ageSource"], "transfermarkt")
        self.assertEqual(players[1]["age"], 29)
        self.assertEqual(players[1]["ageSource"], "existing")
        self.assertEqual(counts["transfermarkt"], 1)
        self.assertGreaterEqual(counts["ignored"], 2)


if __name__ == "__main__":
    unittest.main()
