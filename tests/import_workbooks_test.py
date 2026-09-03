import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("import_workbooks", Path(__file__).parents[1] / "scripts/import_workbooks.py")
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class NormalizePlayerNameTests(unittest.TestCase):
    def test_common_variants(self):
        pairs = [("Ché Adams", "CHE ADAMS"), ("D’Angelo", "d'angelo"),
                 ("Jean-Clair", "jean‐clair"), ("  Marco   Rossi ", "marco rossi"),
                 ("Guðmundsson", "Gudmundsson"), ("Højlund", "Hojlund"),
                 ("Yıldız", "Yildiz"), ("Østigård", "Ostigard"),
                 ("Łukasz", "Lukasz"), ("Đurić", "Duric")]
        for left, right in pairs:
            with self.subTest(left=left):
                self.assertEqual(IMPORTER.normalize_player_name(left), IMPORTER.normalize_player_name(right))


class AgeEnrichmentTests(unittest.TestCase):
    def player(self, identifier, name, team):
        return {"id": identifier, "name": name, "team": team, "age": None}

    def test_ambiguous_name_is_not_assigned(self):
        players = [self.player("1", "Alex Rossi", "Roma"), self.player("2", "Alex Rossi", "Milan")]
        quality = IMPORTER.enrich_player_ages(players, [{"Player": "Alex Rossi", "Age": "24-100", "Squad": "Inter"}])
        self.assertEqual([p["age"] for p in players], [None, None])
        self.assertEqual(quality["ambiguousCount"], 1)

    def test_team_disambiguates_duplicate_name(self):
        players = [self.player("1", "Alex Rossi", "Roma"), self.player("2", "Alex Rossi", "Milan")]
        quality = IMPORTER.enrich_player_ages(players, [{"Player": "ALEX ROSSI", "Age": "24-100", "Squad": "Milan"}])
        self.assertEqual([p["age"] for p in players], [None, 24])
        self.assertEqual(quality["ageMatched"], 1)

    def test_full_statistical_name_matches_auction_surname(self):
        players = [self.player("1", "Svilar", "Roma")]
        quality = IMPORTER.enrich_player_ages(
            players, [{"Player": "Mile Svilar", "Age": "26-001", "Squad": "Roma"}]
        )
        self.assertEqual(players[0]["age"], 26)
        self.assertEqual(quality["ageMatched"], 1)

    def test_abbreviated_given_name_disambiguates_surname(self):
        players = [self.player("1", "Martinez Jo.", "Inter")]
        rows = [
            {"Player": "Josep Martinez", "Age": "28-100", "Squad": "Inter"},
            {"Player": "Lautaro Martinez", "Age": "29-100", "Squad": "Inter"},
        ]
        quality = IMPORTER.enrich_player_ages(players, rows)
        self.assertEqual(players[0]["age"], 28)
        self.assertEqual(quality["ambiguousCount"], 0)

    def test_unmatched_player_is_reported(self):
        players = [self.player("1", "Mario Rossi", "Roma")]
        quality = IMPORTER.enrich_player_ages(players, [{"Player": "Luigi Bianchi", "Age": "21", "Squad": "Roma"}])
        self.assertIsNone(players[0]["age"])
        self.assertEqual(quality["unmatchedCount"], 1)

    def test_age_propagates_as_integer(self):
        players = [self.player("1", "Ché Adams", "Torino")]
        quality = IMPORTER.enrich_player_ages(players, [{"Player": "Che Adams", "Age": "30-048", "Squad": "Torino"}])
        self.assertEqual(players[0]["age"], 30)
        self.assertEqual(quality["ageMissing"], 0)


class PlayerAgeRecordsTests(unittest.TestCase):
    def write_csv(self, contents):
        directory = tempfile.TemporaryDirectory()
        path = Path(directory.name) / "ages.csv"
        path.write_text(contents, encoding="utf-8")
        self.addCleanup(directory.cleanup)
        return path

    def test_loads_unicode_three_column_source(self):
        rows, report = IMPORTER.player_age_records(self.write_csv(
            "Squadra,Nome,Età\nVenezia,Þórir Jóhann Helgason,25\n"
        ))
        self.assertEqual(rows, [{"Squad": "Venezia", "Player": "Þórir Jóhann Helgason", "Age": 25}])
        self.assertEqual(report, {"records": 1, "valid": 1, "duplicates": [], "invalid": []})

    def test_reports_duplicate_and_invalid_rows(self):
        rows, report = IMPORTER.player_age_records(self.write_csv(
            "Squadra,Nome,Età\nRoma,Paulo Dybala,32\nroma,PAULO DYBALA,33\nInter,Nicolò Barella,no\n"
        ))
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(report["duplicates"]), 1)
        self.assertEqual(len(report["invalid"]), 1)

    def test_rejects_unexpected_columns(self):
        with self.assertRaises(ValueError):
            IMPORTER.player_age_records(self.write_csv("Squadra,Nome,Età,Altro\nRoma,Dybala,32,x\n"))


class StatisticsEnrichmentTests(unittest.TestCase):
    def test_hierarchy_uses_team_and_does_not_accept_ambiguity(self):
        players = [
            {"id": "1", "name": "Scamacca", "team": "Atalanta"},
            {"id": "2", "name": "Scamacca", "team": "Roma"},
        ]
        report = IMPORTER.apply_hierarchies(players)
        self.assertEqual(players[0]["R"], 1)
        self.assertEqual(players[1]["R"], 0)
        self.assertEqual(report["R"]["matched"], 1)

    def test_source_matching_prefers_stable_id(self):
        players = [{"id": "42", "name": "Nome Nuovo", "team": "Roma"}]
        diagnostics = {}
        matched = IMPORTER.match_source(
            players, [{"Id": "42", "Nome": "Nome Vecchio", "Squadra": "Milan"}], "test", diagnostics
        )
        self.assertEqual(matched["42"]["Nome"], "Nome Vecchio")
        self.assertEqual(diagnostics["test"]["matched"], 1)


if __name__ == "__main__":
    unittest.main()
