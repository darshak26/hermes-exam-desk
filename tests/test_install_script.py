import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "pyq" / "scripts" / "install_pack.py"
FIXTURE = ROOT / "tests" / "fixtures" / "gat-b-demo.json"

sys.path.insert(0, str(ROOT))
from exam_desk import pack as pack_mod
from exam_desk import store


def run_install(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *args],
                          capture_output=True, text=True, timeout=60)


class InstallPackScriptTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="cbt-install-test-")
        self.data_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_file_stem_must_match_paper_id(self):
        pack = json.loads(FIXTURE.read_text(encoding="utf-8"))
        pack_file = self.data_dir / "wrong-stem.json"
        pack_file.write_text(json.dumps(pack), encoding="utf-8")
        r = run_install(str(pack_file), "--data-dir", str(self.data_dir))
        self.assertEqual(r.returncode, 1)
        self.assertIn("FAIL", r.stdout)

    def test_invalid_pack_fails(self):
        pack = json.loads(FIXTURE.read_text(encoding="utf-8"))
        pack["questions"] = []
        pack_file = self.data_dir / f"{pack['paper_id']}.json"
        pack_file.write_text(json.dumps(pack), encoding="utf-8")
        r = run_install(str(pack_file), "--data-dir", str(self.data_dir))
        self.assertEqual(r.returncode, 1)
        self.assertIn("FAIL", r.stdout)

    def test_plain_install_and_guard_refusal_and_replace(self):
        pack1 = json.loads(FIXTURE.read_text(encoding="utf-8"))
        paper_id = pack1["paper_id"]
        hash1 = pack_mod.pack_hash(pack1)

        src1 = self.data_dir / f"{paper_id}.json"
        src1.write_text(json.dumps(pack1), encoding="utf-8")

        # 1. Plain install
        r1 = run_install(str(src1), "--data-dir", str(self.data_dir))
        self.assertEqual(r1.returncode, 0, r1.stdout + r1.stderr)
        self.assertIn(f"PASS installed {paper_id}", r1.stdout)
        dest = self.data_dir / "packs" / f"{paper_id}.json"
        self.assertTrue(dest.is_file())

        # 2. Refused without --replace
        pack2 = dict(pack1)
        pack2["title"] = "Updated Title"
        src2 = self.data_dir / "scratch" / f"{paper_id}.json"
        src2.parent.mkdir(parents=True, exist_ok=True)
        src2.write_text(json.dumps(pack2), encoding="utf-8")

        r2 = run_install(str(src2), "--data-dir", str(self.data_dir))
        self.assertEqual(r2.returncode, 2, r2.stdout + r2.stderr)
        self.assertIn(f"REFUSED {paper_id} — a paper with that id already exists", r2.stdout)
        self.assertIn("Re-run with --replace to retire it", r2.stdout)

        # 3. Allowed with --replace
        r3 = run_install(str(src2), "--replace", "--data-dir", str(self.data_dir))
        self.assertEqual(r3.returncode, 0, r3.stdout + r3.stderr)
        self.assertIn(f"PASS replaced {paper_id}; previous kept as superseded/{paper_id}.{hash1}.json", r3.stdout)

        # Verify superseded file exists
        superseded = self.data_dir / "packs" / "superseded" / f"{paper_id}.{hash1}.json"
        self.assertTrue(superseded.is_file())

        # Verify current file has the updated title
        current_data = json.loads(dest.read_text(encoding="utf-8"))
        self.assertEqual(current_data["title"], "Updated Title")

        # Verify list_packs does not list superseded packs
        old_env = store.os.environ.get(store.ENV_DATA_DIR)
        store.os.environ[store.ENV_DATA_DIR] = str(self.data_dir)
        try:
            packs = store.list_packs()
            self.assertEqual(len(packs), 1)
            self.assertEqual(packs[0]["paper_id"], paper_id)
        finally:
            if old_env is not None:
                store.os.environ[store.ENV_DATA_DIR] = old_env
            else:
                store.os.environ.pop(store.ENV_DATA_DIR, None)

    def test_installer_note_and_pass_fields(self):
        # 1. Pack without `exam` installs with a derived exam and prints NOTE
        pack_no_fam = json.loads(FIXTURE.read_text(encoding="utf-8"))
        pack_no_fam["paper_id"] = "gat-b-legacy"
        pack_no_fam.pop("exam", None)
        pack_file = self.data_dir / "gat-b-legacy.json"
        pack_file.write_text(json.dumps(pack_no_fam), encoding="utf-8")
        r = run_install(str(pack_file), "--data-dir", str(self.data_dir))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("NOTE no exam field; derived 'gat-b-legacy' from paper_id — state it in the pack to pin it.", r.stdout)
        self.assertIn("PASS installed gat-b-legacy (exam gat-b-legacy)", r.stdout)

        # 2. Pack with exam, kind, scope echoes them on PASS line, no NOTE
        pack_fields = json.loads(FIXTURE.read_text(encoding="utf-8"))
        pack_fields["paper_id"] = "gat-b-practice-bioinfo"
        pack_fields["exam"] = "gat-b"
        pack_fields["kind"] = "practice"
        pack_fields["scope"] = "Photosynthesis"
        pack_fields_file = self.data_dir / "gat-b-practice-bioinfo.json"
        pack_fields_file.write_text(json.dumps(pack_fields), encoding="utf-8")
        r2 = run_install(str(pack_fields_file), "--data-dir", str(self.data_dir))
        self.assertEqual(r2.returncode, 0, r2.stdout + r2.stderr)
        self.assertNotIn("NOTE no exam field", r2.stdout)
        self.assertIn("PASS installed gat-b-practice-bioinfo (exam gat-b, practice, scope Photosynthesis)", r2.stdout)


if __name__ == "__main__":
    unittest.main()
