"""Deleting a paper, and deleting a whole exam.

The rule under test: a paper owns its sittings, so removing the paper removes them —
but never a sitting that is still running, because that would drop the question the
exam shell is showing.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ["EXAM_DESK_DATA_DIR"] = tempfile.mkdtemp(prefix="cbt-del-")
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "dashboard"))
import plugin_api  # noqa: E402
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI(); app.include_router(plugin_api.router)
client = TestClient(app)

from tests.helpers import base_pack  # noqa: E402

DATA = Path(os.environ["EXAM_DESK_DATA_DIR"])


def write_pack(paper_id, title=None, exam=None):
    p = base_pack()
    p["paper_id"] = paper_id
    p["title"] = title or paper_id
    if exam:
        p["exam"] = exam
    (DATA / "packs").mkdir(parents=True, exist_ok=True)
    (DATA / "packs" / f"{paper_id}.json").write_text(json.dumps(p))


def make_attempt(paper_id, status="in_progress"):
    r = client.post("/attempts", json={"paper_id": paper_id, "mode": "exam"})
    assert r.status_code == 200, r.text
    aid = r.json()["attempt"]["id"]
    if status != "in_progress":
        f = DATA / "attempts" / f"{aid}.json"
        a = json.loads(f.read_text())
        a["status"] = status
        f.write_text(json.dumps(a))
    return aid


class DeleteTests(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.get("EXAM_DESK_DATA_DIR")
        os.environ["EXAM_DESK_DATA_DIR"] = str(DATA)
        shutil.rmtree(DATA, ignore_errors=True)
        (DATA / "packs").mkdir(parents=True, exist_ok=True)
        (DATA / "attempts").mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        if self._old is not None:
            os.environ["EXAM_DESK_DATA_DIR"] = self._old

    def test_paper_goes_with_its_sittings_and_assets(self):
        write_pack("gat-b-demo")
        assets = DATA / "packs" / "gat-b-demo.assets"
        assets.mkdir()
        (assets / "fig1.png").write_bytes(b"\x89PNG\r\n\x1a\n")
        make_attempt("gat-b-demo", "submitted")
        make_attempt("gat-b-demo", "abandoned")

        r = client.delete("/packs/gat-b-demo")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json(), {"deleted": "gat-b-demo", "attempts": 2})
        self.assertFalse((DATA / "packs" / "gat-b-demo.json").exists())
        self.assertFalse(assets.exists())
        self.assertEqual(list((DATA / "attempts").glob("*.json")), [])
        self.assertEqual(client.get("/packs").json()["packs"], [])

    def test_paper_leaves_other_papers_alone(self):
        write_pack("gat-b-demo")
        write_pack("gat-b-2026")
        keep = make_attempt("gat-b-2026", "submitted")

        r = client.delete("/packs/gat-b-demo")
        self.assertEqual(r.status_code, 200, r.text)
        names = [p["paper_id"] for p in client.get("/packs").json()["packs"]]
        self.assertEqual(names, ["gat-b-2026"])
        self.assertTrue((DATA / "attempts" / f"{keep}.json").exists())

    def test_unknown_paper_is_404(self):
        self.assertEqual(client.delete("/packs/nope").status_code, 404)

    def test_running_sitting_blocks_the_delete(self):
        write_pack("gat-b-demo")
        make_attempt("gat-b-demo")                      # in_progress
        r = client.delete("/packs/gat-b-demo")
        self.assertEqual(r.status_code, 409)
        self.assertIn("still running", r.json()["detail"])
        self.assertTrue((DATA / "packs" / "gat-b-demo.json").exists())

    def test_exam_takes_every_paper_of_that_exam(self):
        write_pack("gat-b-2026", exam="gat-b")
        write_pack("gat-b-2026-practice", exam="gat-b")  # same exam, declared by the pack
        write_pack("csir-net-2026", exam="csir-net")     # a different exam
        make_attempt("gat-b-2026", "submitted")
        make_attempt("gat-b-2026-practice", "submitted")
        other = make_attempt("csir-net-2026", "submitted")

        r = client.delete("/exams/gat-b")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json(), {"deleted": "gat-b", "papers": 2, "attempts": 2})
        names = [p["paper_id"] for p in client.get("/packs").json()["packs"]]
        self.assertEqual(names, ["csir-net-2026"])
        self.assertTrue((DATA / "attempts" / f"{other}.json").exists())

    def test_unknown_exam_is_404(self):
        write_pack("gat-b-2026")
        self.assertEqual(client.delete("/exams/nope").status_code, 404)

    def test_running_sitting_blocks_the_exam_delete(self):
        write_pack("gat-b-2026", exam="gat-b")
        write_pack("gat-b-2026-practice", exam="gat-b")
        make_attempt("gat-b-2026-practice")             # one live sitting under the exam
        r = client.delete("/exams/gat-b")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(len(client.get("/packs").json()["packs"]), 2)


if __name__ == "__main__":
    unittest.main()
