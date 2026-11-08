"""Drill papers, the topics ledger, the mode vocabulary, and the filtered feed."""
import json, os, shutil, sys, tempfile, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("EXAM_DESK_DATA_DIR", tempfile.mkdtemp(prefix="cbt-test-"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "dashboard"))

from exam_desk import drill, topics, pack as pack_mod, vocab   # noqa: E402
from tests.helpers import base_pack                             # noqa: E402
DATA = Path(os.environ["EXAM_DESK_DATA_DIR"])


def seeded_pack(pack=None, name="gat-b-demo"):
    d = DATA / "packs"
    d.mkdir(parents=True, exist_ok=True)
    p = dict(pack or base_pack())
    p["exam_id"] = name
    f = d / f"{name}.json"
    f.write_text(json.dumps(p))
    pack_mod.clear_cache()
    return p


def submitted_attempt(source_pack, aid="a-test-01", answers=None, client=None):
    """A grader-shaped attempt dict, in-memory (what build_drill_pack eats)."""
    from exam_desk import grading
    from exam_desk.store import new_attempt, submit_attempt
    a = new_attempt(source_pack, "mock" if client else "exam") if not client else None
    if client:
        r = client.post("/attempts", json={"exam_id": source_pack["exam_id"], "mode": "mock"})
        r.raise_for_status()
        a = r.json()["attempt"]
        client.patch(f"/attempts/{a['id']}", json={"answers": answers or {}})
        r2 = client.post(f"/attempts/{a['id']}/submit")
        r2.raise_for_status()
        return r2.json()["attempt"], r2.json()["pack"]
    if answers:
        a["answers"] = dict(answers)
        a["answer_seq"] = list(answers)
    submit_attempt(a, source_pack)
    return a, source_pack


class VocabTests(unittest.TestCase):
    def test_mock_label(self):
        self.assertEqual((vocab.mode_label("exam"), vocab.mode_label("assisted"),
                          vocab.mode_label("mock"), vocab.mode_label(None)), ("mock", "assisted", "", ""))


class HistoryFeedTests(unittest.TestCase):
    def test_priors_filter_mode(self):
        import plugin_api
        rows = [                                        # newest first, as list_attempts feeds
            {"id": "a8", "exam_id": "gat-b-demo", "mode": "exam", "status": "submitted"},
            {"id": "a7", "exam_id": "gat-b-demo", "mode": "exam", "status": "submitted"},
            {"id": "a6", "exam_id": "gat-b-demo", "mode": "exam", "status": "submitted"},
            {"id": "a5", "exam_id": "gat-b-demo", "mode": "exam", "status": "submitted"},
            {"id": "a4", "exam_id": "other", "mode": "exam", "status": "submitted"},
            {"id": "a3", "exam_id": "gat-b-demo", "mode": "exam", "status": "in_progress"},
            {"id": "a2", "exam_id": "gat-b-demo", "mode": "assisted", "status": "submitted"},
            {"id": "a1", "exam_id": "gat-b-demo", "mode": "exam", "status": "submitted"},
        ]
        mine = {"id": "me", "exam_id": "gat-b-demo", "mode": "exam", "status": "submitted"}
        got = [p["id"] for p in plugin_api.history_rows(rows, mine)]
        self.assertEqual(got, ["a8", "a7", "a6"])   # newest three, mocks only
        assisted = dict(mine, mode="assisted")
        self.assertEqual([p["id"] for p in plugin_api.history_rows(rows, assisted)], ["a2"])
        self.assertEqual([p["id"] for p in plugin_api.history_rows(rows, dict(mine, mode="mock"))],
                         ["a8", "a7", "a6"])   # the alias normalises to the same feed


class DrillTests(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.get("EXAM_DESK_DATA_DIR")
        os.environ["EXAM_DESK_DATA_DIR"] = str(DATA)
        shutil.rmtree(DATA, ignore_errors=True)
        self.pack = seeded_pack()

    def tearDown(self):
        if self._old is not None:
            os.environ["EXAM_DESK_DATA_DIR"] = self._old

    def _attempt(self, answers, pack=None):
        from exam_desk.store import new_attempt, submit_attempt
        a = new_attempt(pack or self.pack, "exam")
        a["answers"] = dict(answers)
        a["answer_seq"] = list(answers)
        submit_attempt(a, pack or self.pack)
        return a

    def test_drill_holds_only_misses_with_source_key(self):
        a = self._attempt({"A-01": 1, "A-02": 3})       # correct, wrong; A-03 + all B skipped
        drill_id, p = drill.install_drill(self.pack, a)
        self.assertEqual((drill_id, p["exam_id"]), ("gat-b-demo-drill", drill_id))
        ids = [q["id"] for q in p["questions"]]
        self.assertEqual(ids, ["A-02", "A-03", "B-01", "B-02", "B-03"])  # wrong + skipped, paper order
        self.assertEqual([q["id"] for q in p["questions"] if "answer" not in q], [])
        self.assertEqual(p["questions"][0]["answer"], 0)                 # inherited, not re-filled
        self.assertEqual([s["attempt_limit"] for s in p["pattern"]["sections"]], [None, None])
        errs = pack_mod.validate_pack(p)
        self.assertEqual(errs, [])
        self.assertEqual(sorted(s["id"] for s in p["pattern"]["sections"]), ["A", "B"])
        self.assertGreaterEqual(p["pattern"]["duration_minutes"], 5)
        self.assertIn(a["id"], p["provenance"])

    def test_drill_ids_never_collide(self):
        a = self._attempt({"A-01": 1})
        first, p1 = drill.install_drill(self.pack, a)
        second, p2 = drill.install_drill(self.pack, a)
        self.assertEqual((first, second), ("gat-b-demo-drill", "gat-b-demo-drill-2"))
        self.assertTrue((DATA / "packs" / f"{first}.json").exists())
        self.assertTrue((DATA / "packs" / f"{second}.json").exists())

    def test_no_misses_is_an_error(self):
        # The base pack's section B counts only its first two answers, so a full
        # sheet there can never be miss-free — drop the limit for this test.
        pack = dict(self.pack)
        pack["pattern"] = json.loads(json.dumps(pack["pattern"]))
        pack["pattern"]["sections"][1]["attempt_limit"] = None
        a = self._attempt({"A-01": 1, "A-02": 0, "A-03": 0, "B-01": 0, "B-02": [0, 2], "B-03": "2"},
                          pack=pack)
        with self.assertRaises(ValueError) as ctx:
            drill.build_drill_pack(pack, a, "x")
        self.assertIn("nothing to drill", str(ctx.exception))

    def test_doubled_pack(self):
        """A drill of a drill stays a legal slug and files beside its parent."""
        a = self._attempt({"A-01": 1})
        drill_id_1, p1 = drill.install_drill(self.pack, a)
        a2 = self._attempt({"A-01": 1, "A-02": 0})
        drill_id_2, p2 = drill.install_drill(p1, a2)
        self.assertEqual(drill_id_2.startswith(drill_id_1 + "-drill"), True)
        for p in (p1, p2):
            self.assertEqual(pack_mod.validate_pack(p), [])


class TopicsTests(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.get("EXAM_DESK_DATA_DIR")
        os.environ["EXAM_DESK_DATA_DIR"] = str(DATA)
        shutil.rmtree(DATA, ignore_errors=True)

    def tearDown(self):
        if self._old is not None:
            os.environ["EXAM_DESK_DATA_DIR"] = self._old

    def test_record_merge_and_idempotence(self):
        weak = [{"topic": "Gel filtration", "evidence": "wrong on B-02", "priority": "high"},
                {"topic": "pH maths", "evidence": "wrong on B-03", "priority": "low"}]
        n = topics.record("gat-b-demo", "a-01", weak, now=100.0)
        self.assertEqual(n, 2)
        again = topics.record("gat-b-demo", "a-01", weak, now=200.0)
        self.assertEqual(again, 0)                      # same attempt folds once
        topics.record("gat-b-demo", "a-02", [{"topic": "gel filtration", "priority": "high"}],
                      now=300.0)
        rows = topics.summarize("gat-b-demo")
        self.assertEqual(len(rows), 2)
        top = rows[0]
        self.assertEqual(top["topic"], "Gel filtration")     # first spelling wins the display
        self.assertEqual(top["hits"], 2)
        self.assertEqual(top["attempts"], ["a-01", "a-02"])
        self.assertEqual(top["priority"], "high")
        self.assertEqual(top["last_seen"], 300.0)

    def test_suffixes_and_empty_input(self):
        self.assertEqual(topics.record("gat-b-demo", "a-01", [{"topic": "x", "priority": "high"}]), 1)
        # no-op shapes: nothing rises and nothing raised
        self.assertEqual(topics.record("gat-b-demo", "a-01", []), 0)
        self.assertEqual(topics.record("", "a", [{"topic": "x"}]), 0)
        self.assertEqual(topics.record("gat-b-demo", "a", ["junk"]), 0)
        self.assertEqual(topics.path().exists(), True)

    def test_forget_and_corrupt_file(self):
        topics.record("p1", "a", [{"topic": "T", "priority": "high"}])
        self.assertEqual(topics.forget("p1"), True)
        self.assertEqual(topics.summarize("p1"), [])
        topics.path().write_text("{not json")
        self.assertEqual(topics.summarize(), [])        # corrupt → fresh, not a crash

    def test_cross_paper_rows(self):
        topics.record("p1", "a", [{"topic": "A", "priority": "high"}], now=1)
        topics.record("p2", "b", [{"topic": "B", "priority": "low"}], now=2)
        self.assertEqual([r["exam_id"] for r in topics.summarize()], ["p2", "p1"])
        self.assertEqual(len(topics.summarize(exam_id="p1")), 1)
