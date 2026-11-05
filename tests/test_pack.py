import sys, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from cbt_exam.pack import validate_pack, sanitize_pack, summarize, SCHEMA
from tests.helpers import base_pack

class PackTests(unittest.TestCase):
    def test_valid_pack_passes(self):
        self.assertEqual(validate_pack(base_pack()), [])

    def test_rejects_bad_schema_slug_duration(self):
        p = base_pack(); p["schema"] = "wrong"
        self.assertIn("schema must be", " ".join(validate_pack(p)))
        p = base_pack(); p["exam_id"] = "Bad Slug!"
        self.assertTrue(any("exam_id" for e in validate_pack(p)))
        p = base_pack(); p["pattern"]["duration_minutes"] = 0
        self.assertTrue(any("duration_minutes" for e in validate_pack(p)))

    def test_rejects_wrong_section_count(self):
        p = base_pack(); p["pattern"]["sections"][0]["question_count"] = 99
        self.assertTrue(any("question_count" for e in validate_pack(p)))

    def test_rejects_bad_answers_and_missing_provenance(self):
        p = base_pack(); p["questions"][0]["answer"] = 9
        self.assertTrue(any("mcq answer" for e in validate_pack(p)))
        p = base_pack(); p["questions"][4]["answer"] = [0, 0]
        self.assertTrue(any("msq answer" for e in validate_pack(p)))
        p = base_pack(); p["questions"][2].pop("source_url")
        self.assertTrue(any("source_url" for e in validate_pack(p)))
        p = base_pack(); p.pop("provenance")
        self.assertTrue(any("provenance" for e in validate_pack(p)))

    def test_sanitize_strips_answers_and_explanations(self):
        s = sanitize_pack(base_pack())
        for q in s["questions"]:
            self.assertNotIn("answer", q); self.assertNotIn("explanation", q)
        self.assertEqual(s["pattern"], base_pack()["pattern"])

    def test_summarize_shape(self):
        sm = summarize(base_pack())
        self.assertEqual(sm["exam_id"], "gat-b-demo")
        self.assertEqual(sm["question_count"], 6)
        self.assertEqual(sm["sections"][1]["attempt_limit"], 2)
        # the panel's Marks column reads these — omitting them rendered "+undefined"
        self.assertEqual(sm["sections"][0]["marks_correct"], 1)
        self.assertEqual(sm["sections"][1]["marks_correct"], 3)
        self.assertEqual(sm["sections"][1]["marks_wrong"], -1)

if __name__ == "__main__":
    unittest.main()
