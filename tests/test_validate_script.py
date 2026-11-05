import json, subprocess, sys, tempfile, unittest
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

if __name__ == "__main__":
    unittest.main()
