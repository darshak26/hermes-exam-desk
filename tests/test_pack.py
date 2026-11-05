import sys, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from cbt_exam.pack import validate_pack, sanitize_pack, summarize, SCHEMA

def base_pack():
    return {
        "schema": SCHEMA, "exam_id": "gat-b-demo", "title": "Demo", "year": 2026,
        "body": "Demo Board", "language": "en", "source_url": "https://example.com/paper",
        "provenance": "DEMO — synthetic questions, not real PYQs",
        "pattern": {"duration_minutes": 6, "sections": [
            {"id": "A", "title": "Section A", "question_count": 3, "attempt_limit": None,
             "marks_correct": 1, "marks_wrong": -0.5, "marks_unanswered": 0},
            {"id": "B", "title": "Section B", "question_count": 3, "attempt_limit": 2,
             "marks_correct": 3, "marks_wrong": -1, "marks_unanswered": 0}]},
        "questions": [
            {"id": "A-01", "section": "A", "type": "mcq", "topic": "Physics",
             "text": "2+2?", "options": ["3", "4", "5", "6"], "answer": 1,
             "explanation": "arithmetic", "source_url": "https://example.com/paper"},
            {"id": "A-02", "section": "A", "type": "mcq", "topic": "Chemistry",
             "text": "H?", "options": ["1", "2", "3", "4"], "answer": 0,
             "explanation": "atomic number", "source_url": "https://example.com/paper"},
            {"id": "A-03", "section": "A", "type": "mcq", "topic": "Biology",
             "text": "DNA?", "options": ["double", "single", "triple", "quad"], "answer": 0,
             "explanation": "", "source_url": "https://example.com/paper"},
            {"id": "B-01", "section": "B", "type": "mcq", "topic": "Molecular biology",
             "text": "Central dogma?", "options": ["DNA→RNA→protein", "RNA→DNA", "protein→RNA", "none"],
             "answer": 0, "explanation": "classic", "source_url": "https://example.com/paper"},
            {"id": "B-02", "section": "B", "type": "msq", "topic": "Techniques",
             "text": "Which separate by size?",
             "options": ["SDS-PAGE", "PCR", "gel filtration", "centrifugation"],
             "answer": [0, 2], "explanation": "both are size-based",
             "source_url": "https://example.com/paper"},
            {"id": "B-03", "section": "B", "type": "nat", "topic": "Biochem",
             "text": "pH of 0.01 M HCl?", "answer": "2", "tolerance": 0.05,
             "explanation": "-log(0.01)", "source_url": "https://example.com/paper"}]}

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

if __name__ == "__main__":
    unittest.main()
