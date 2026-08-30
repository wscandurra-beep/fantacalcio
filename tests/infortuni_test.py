import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / "scripts"))
from infortuni import apply_snapshot, compare_snapshots, match_injuries, normalize_name
from scrape_infortuni import parse_page, refresh, validate_page


PAGE = """<!doctype html><html><head><title>Infortunati | Fantacalcio</title></head><body>
<div class="injury-player" data-player-id="5792"><span class="player-name">Éderson</span>
<span class="player-team">Atalanta</span><p class="injury-detail">Lesione muscolare</p>
<span class="expected-return">metà settembre</span><a href="/serie-a/giocatori/ederson/5792">Scheda</a></div>
<div data-injury-player=""><span data-field="name">Mario Rossi</span><span data-field="team">Roma</span>
<span data-field="injury">Trauma distorsivo</span></div></body></html>"""


class InjuryTests(unittest.TestCase):
    def test_parser_fields_id_and_missing_return(self):
        rows = parse_page(PAGE)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["id"], "5792")
        self.assertEqual(rows[0]["injury"], "Lesione muscolare")
        self.assertEqual(rows[0]["expectedReturn"], "metà settembre")
        self.assertIsNone(rows[1]["expectedReturn"])

    def test_normalization(self):
        self.assertEqual(normalize_name("  D’Éderson--Jr.  "), "d ederson jr")

    def test_matching_priorities_and_quality(self):
        players = [{"id":"5792","name":"Altro","team":"Atalanta"}, {"id":"2","name":"Mario Rossi","team":"Roma"},
                   {"id":"3","name":"Unico","team":"Milan"}, {"id":"4","name":"Doppio","team":"A"}, {"id":"5","name":"Doppio","team":"B"}]
        rows = [{"id":"5792","name":"Ignorato","team":"X"}, {"name":"Mário-Rossi","team":"ROMA"}, {"name":"Unico","team":""},
                {"name":"Doppio","team":""}, {"name":"Nessuno","team":"Como"}]
        quality = match_injuries(rows, players)
        self.assertEqual([r.get("matchMethod") for r in rows[:3]], ["ID", "NAME_TEAM", "NAME"])
        self.assertEqual(rows[3]["matchStatus"], "AMBIGUOUS")
        self.assertEqual(rows[4]["matchStatus"], "UNMATCHED")
        self.assertEqual((quality["matched"], len(quality["ambiguous"]), len(quality["unmatched"])), (3,1,1))

    def test_all_change_types(self):
        old = [{"id":"1","name":"A","injury":"x","expectedReturn":"a"}, {"id":"2","name":"B","injury":"x"},
               {"id":"3","name":"C","injury":"x","expectedReturn":"a"}, {"id":"4","name":"D","injury":"x"}]
        new = [{"id":"1","name":"A","injury":"x","expectedReturn":"a"}, {"id":"2","name":"B","injury":"y"},
               {"id":"3","name":"C","injury":"x","expectedReturn":"b"}, {"id":"5","name":"E","injury":"x"}]
        result = compare_snapshots(old,new,"now")
        self.assertEqual({c["type"] for c in result["changes"]}, {"UNCHANGED","INJURY_UPDATED","RETURN_UPDATED","NEW_INJURY","RECOVERED"})
        self.assertEqual((result["newInjuries"],result["recovered"],result["injuryUpdated"],result["returnUpdated"]),(1,1,1,1))

    def test_complete_snapshot_resets_old_status(self):
        players=[{"id":"1","status":"vecchio infortunio"},{"id":"2","status":"altro"}]
        rows=[{"matchedPlayerId":"2","matchStatus":"MATCHED","injury":"Contusione","expectedReturn":None}]
        apply_snapshot(players,rows)
        self.assertEqual(players[0]["status"],"OK")
        self.assertEqual(players[1]["status"],"Contusione")

    def test_anomalous_page_preserves_every_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); (root/"data").mkdir()
            original={"sentinel":True}
            for name in ("players.json","infortuni.json","infortuni_update.json"):
                (root/"data"/name).write_text(json.dumps(original))
            with self.assertRaises(ValueError): refresh("<html><title>Fantacalcio</title></html>",root,"now")
            for name in ("players.json","infortuni.json","infortuni_update.json"):
                self.assertEqual(json.loads((root/"data"/name).read_text()),original)

    def test_refresh_updates_players_and_persists_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); (root/"data").mkdir()
            players=[{"id":"5792","name":"Ederson","team":"Atalanta","status":"old"},{"id":"9","name":"Sano","team":"Roma","status":"old"}]
            (root/"data/players.json").write_text(json.dumps(players)); (root/"data/infortuni.json").write_text('{"injuries":[]}')
            snapshot,summary=refresh(PAGE,root,"2026-08-30T10:00:00+00:00")
            saved_players=json.loads((root/"data/players.json").read_text())
            self.assertIn("Lesione muscolare",saved_players[0]["status"]); self.assertEqual(saved_players[1]["status"],"OK")
            self.assertEqual(json.loads((root/"data/infortuni_update.json").read_text())["newInjuries"],2)
            self.assertEqual(summary["missingExpectedReturn"],1)

    def test_validation_rejects_empty_and_antibot(self):
        for raw in ("", "<html>Fantacalcio captcha verify you are human</html>"):
            with self.assertRaises(ValueError): validate_page(raw,[])


if __name__ == "__main__": unittest.main()
