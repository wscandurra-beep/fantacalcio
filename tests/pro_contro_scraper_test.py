import unittest
from scripts.scrape_pro_contro import make_report, match_rows, normalize_name

class ProControDiagnosticsTest(unittest.TestCase):
    def test_unicode_punctuation_normalization_is_conservative(self):
        self.assertEqual(normalize_name("D’Àngelo-Silva"), "d angelo silva")

    def test_stable_id_matches_before_name(self):
        rows=[{"id": "1", "name": "Variant", "team": "X", "pro": "p", "contro": "c"}]
        matched,unmatched,ambiguous=match_rows(rows,[{"id":"1","name":"Canonical","team":"Y"}])
        self.assertEqual((len(matched),len(unmatched),len(ambiguous)),(1,0,0))

    def test_report_exposes_all_required_counts(self):
        rows=[{"id":"1","name":"A","team":"T","pro":"p","contro":"c"}]
        report=make_report(rows,[{"id":"1","name":"A","team":"T"}],timestamp="now",run_id="1",processed=1,successful=1,failed=0,errors=[],status="success")
        self.assertEqual(report["coveragePct"],100)
        self.assertEqual(report["matched"],1)

if __name__ == '__main__': unittest.main()
