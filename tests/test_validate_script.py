import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "pyq-sourcing" / "scripts" / "validate_pack.py"
FIXTURE = ROOT / "tests" / "fixtures" / "gat-b-demo.json"

def run(path):
    return subprocess.run([sys.executable, str(SCRIPT), str(path)],
                          capture_output=True, text=True, timeout=60)

class ValidateScriptTests(unittest.TestCase):
    def test_fixture_passes(self):
        r = run(FIXTURE)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertTrue(r.stdout.startswith("PASS: gat-b-demo — 6 questions"), r.stdout)

    def test_corrupted_pack_fails(self):
        pack = json.loads(FIXTURE.read_text())
        pack["questions"][0]["answer"] = 99
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write(json.dumps(pack))
            path = f.name
        r = run(path)
        self.assertEqual(r.returncode, 1)
        self.assertIn("ERROR:", r.stdout)
        self.assertIn("FAIL:", r.stdout)

LOAD = ROOT / "skills" / "attempt-review" / "scripts" / "load_attempt.py"

def write_data_root(root):
    (root / "packs").mkdir(parents=True, exist_ok=True)
    (root / "attempts").mkdir(parents=True, exist_ok=True)
    pack = json.loads(FIXTURE.read_text())
    (root / "packs" / "gat-b-demo.json").write_text(json.dumps(pack))
    return pack

def submitted_attempt(aid, mode="assisted"):
    return {"id": aid, "paper_id": "gat-b-demo", "mode": mode, "status": "submitted",
            "submitted_at": 1700000000, "started_at": 1700000000,
            "duration_seconds": 900, "answers": {"A-01": 1}, "answer_seq": ["A-01"],
            "marked": [], "visited": [], "current": None,
            "result": {"score": 1, "totals": {"correct": 1, "wrong": 0, "skipped": 5, "not_counted": 0},
                       "sections": {}, "questions": [{"id": "A-01", "verdict": "correct", "awarded": 1, "marks": [1, -0.25]}]},
            "evaluation": None,
            "assisted_session_id": "sess-42",
            "review_session_ids": ["rev-1", "rev-2"]}

class LoadAttemptScriptTests(unittest.TestCase):
    """load_attempt.py — the record is where the review skill starts reading."""
    def test_assisted_attempt_prints_the_chats(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); write_data_root(root)
            att = submitted_attempt("a-test-1")
            (root / "attempts" / "a-test-1.json").write_text(json.dumps(att))
            r = subprocess.run([sys.executable, str(LOAD), "a-test-1", "--data-dir", str(root)],
                               capture_output=True, text=True, timeout=60)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("ASSISTED CHAT", r.stdout)
            self.assertIn("sess-42", r.stdout)
            self.assertIn("REVIEW CHATS DISCUSSING THIS ATTEMPT: 2", r.stdout)

    def test_unlinked_assisted_attempt_says_so(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); write_data_root(root)
            att = submitted_attempt("a-test-2")
            att["assisted_session_id"] = None
            (root / "attempts" / "a-test-2.json").write_text(json.dumps(att))
            r = subprocess.run([sys.executable, str(LOAD), "a-test-2", "--data-dir", str(root)],
                               capture_output=True, text=True, timeout=60)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("ASSISTED CHAT: none linked", r.stdout)

if __name__ == "__main__":
    unittest.main()
