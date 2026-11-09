"""The 0.10.0 data migration: old names out, and no phantom "paper changed" notice.

0.9.0 called the paper `exam_id`, the exam `family` and the mock's mode `exam`. The
rename is one-way, and `scripts/migrate_names.py` is the tool that rewrites the
files. Two things about it are easy to get wrong and invisible until a result page
lies to a student: an attempt must keep pointing at its paper (its recorded hash
must be carried over), and a second run must be a no-op.
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "migrate_names.py"
sys.path.insert(0, str(ROOT))

from exam_desk import pack as pack_mod          # noqa: E402

LEGACY_PACK = {
    "schema": "cbt-pack/1", "exam_id": "gat-b-2023", "title": "GAT-B 2023", "year": 2023,
    "provenance": "official paper", "source_url": "https://example.com/paper",
    "pattern": {"duration_minutes": 180, "sections": [
        {"id": "A", "title": "Section A", "question_count": 1, "attempt_limit": None,
         "marks_correct": 1, "marks_wrong": -0.5, "marks_unanswered": 0}]},
    "questions": [{"id": "A-01", "section": "A", "type": "nat", "topic": "Arithmetic",
                   "text": "What is 2 + 2?", "answer": "4", "tolerance": 0.01,
                   "source_url": "https://example.com/paper"}],
}


def run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *args],
                          capture_output=True, text=True, timeout=60)


class MigrateNamesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="cbt-migrate-")
        self.root = Path(self.tmp.name)
        (self.root / "packs").mkdir()
        (self.root / "attempts").mkdir()
        self.pack_path = self.root / "packs" / "gat-b-2023.json"
        self.pack_path.write_text(json.dumps(LEGACY_PACK), encoding="utf-8")
        self.old_hash = pack_mod.pack_hash(LEGACY_PACK)
        self.attempt_path = self.root / "attempts" / "a-0000000001.json"
        self.attempt_path.write_text(json.dumps({
            "id": "a-0000000001", "exam_id": "gat-b-2023", "family": "gat-b",
            "pack_hash": self.old_hash, "pack_title": "GAT-B 2023",
            "mode": "exam", "status": "submitted", "started_at": 1.0,
            "duration_seconds": 10800, "answers": {"A-01": "4"},
            "answer_seq": ["A-01"], "marked": [], "visited": [], "current": None,
            "result": {"score": 1.0}, "evaluation": None,
            "submitted_at": 2.0, "updated_at": 2.0,
        }), encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def res(self, *extra):
        return run("--data-dir", str(self.root), *extra)

    def test_paper_states_paper_id_exam_and_kind(self):
        r = self.res()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        pack = json.loads(self.pack_path.read_text())
        self.assertEqual((pack["paper_id"], pack["exam"], pack["kind"]),
                         ("gat-b-2023", "gat-b", "pyq"))
        for gone in ("exam_id", "family"):
            self.assertNotIn(gone, pack)
        self.assertEqual(pack_mod.validate_pack(pack), [])

    def test_attempt_loses_the_old_keys_and_the_mode_spelling(self):
        self.assertEqual(self.res().returncode, 0)
        att = json.loads(self.attempt_path.read_text())
        self.assertEqual((att["paper_id"], att["exam"], att["mode"]),
                         ("gat-b-2023", "gat-b", "mock"))
        self.assertEqual(att["paper_title"], "GAT-B 2023")
        for gone in ("exam_id", "family", "pack_hash", "pack_title"):
            self.assertNotIn(gone, att)

    def test_hash_is_carried_over_so_the_result_page_stays_silent(self):
        """Rewriting the paper must not make its attempts read as `pack_changed`."""
        self.assertEqual(self.res().returncode, 0)
        migrated = json.loads(self.pack_path.read_text())
        att = json.loads(self.attempt_path.read_text())
        self.assertEqual(att["paper_hash"], pack_mod.pack_hash(migrated))

    def test_second_run_is_a_no_op(self):
        self.assertEqual(self.res().returncode, 0)
        pack_before = self.pack_path.read_text()
        att_before = self.attempt_path.read_text()
        r2 = self.res()
        self.assertEqual(r2.returncode, 0)
        self.assertIn("0 of 2 file(s) changed", r2.stdout)
        self.assertEqual(self.pack_path.read_text(), pack_before)
        self.assertEqual(self.attempt_path.read_text(), att_before)

    def test_old_packs_dir_repairs_a_hash_after_a_plain_rewrite(self):
        """If papers were already rewritten without hash carry-over, --old-packs fixes it."""
        plain = {"schema": "cbt-pack/1", "paper_id": "gat-b-2023", "exam": "gat-b",
                 "kind": "pyq", "title": "GAT-B 2023", "year": 2023,
                 "provenance": "official paper", "source_url": "https://example.com/paper",
                 "pattern": LEGACY_PACK["pattern"], "questions": LEGACY_PACK["questions"]}
        old_dir = self.root / "old"
        old_dir.mkdir()
        # the migration the earlier run produced, and the pre-rename copy beside it
        self.pack_path.write_text(json.dumps(plain), encoding="utf-8")
        (old_dir / "gat-b-2023.json").write_text(json.dumps(LEGACY_PACK), encoding="utf-8")

        r = run("--data-dir", str(self.root), "--old-packs", str(old_dir))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        att = json.loads(self.attempt_path.read_text())
        self.assertEqual(att["paper_hash"], pack_mod.pack_hash(plain))
        self.assertIn("1 attempt hash(es) re-pointed", r.stdout)


if __name__ == "__main__":
    unittest.main()
