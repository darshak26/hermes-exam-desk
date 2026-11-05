import json, os, shutil, sys, tempfile, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
os.environ["CBT_EXAM_DATA_DIR"] = tempfile.mkdtemp(prefix="cbt-store-test-")
sys.path.insert(0, str(ROOT))

from tests.helpers import base_pack
from cbt_exam import store

DATA = Path(os.environ["CBT_EXAM_DATA_DIR"])

def write_pack(pack, name=None):
    d = DATA / "packs"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{name or pack['exam_id']}.json").write_text(json.dumps(pack))

class StoreTests(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.get("CBT_EXAM_DATA_DIR")
        os.environ["CBT_EXAM_DATA_DIR"] = str(DATA)
        shutil.rmtree(DATA, ignore_errors=True)   # deterministic clean root per test
    def tearDown(self):
        if self._old is not None:
            os.environ["CBT_EXAM_DATA_DIR"] = self._old
    def test_list_packs_empty_then_one(self):
        self.assertEqual(store.list_packs(), [])
        write_pack(base_pack())
        packs = store.list_packs()
        self.assertEqual(len(packs), 1)
        self.assertEqual(packs[0]["exam_id"], "gat-b-demo")

    def test_invalid_pack_listed_not_raised(self):
        bad = base_pack(); bad["questions"] = []
        write_pack(bad, name="badpack")
        by_id = {p["exam_id"]: p for p in store.list_packs()}
        self.assertIn("badpack", by_id)
        self.assertIn("invalid", by_id["badpack"])

    def test_get_pack_missing_raises_keyerror(self):
        with self.assertRaises(KeyError):
            store.get_pack("nope")

    def test_attempt_roundtrip_ids_unique(self):
        pack = base_pack()
        a = store.new_attempt(pack, "exam")
        b = store.new_attempt(pack, "assisted")
        self.assertNotEqual(a["id"], b["id"])
        self.assertEqual(store.get_attempt(a["id"]), a)

    def test_save_attempt_atomic_and_persists(self):
        a = store.new_attempt(base_pack(), "exam")
        a["answers"]["A-01"] = 1
        store.save_attempt(a)
        self.assertEqual(list((DATA / "attempts").glob("*.tmp")), [])
        self.assertEqual(store.get_attempt(a["id"])["answers"], {"A-01": 1})

    def test_remaining_seconds_with_injected_now(self):
        a = store.new_attempt(base_pack(), "exam")   # duration 6 min = 360 s
        self.assertGreater(store.remaining_seconds(a, now=a["started_at"] + 100), 0)
        self.assertLessEqual(store.remaining_seconds(a, now=a["started_at"] + 400), 0)

    def test_submit_persists_result(self):
        pack = base_pack()
        a = store.new_attempt(pack, "exam")
        a["answers"] = {"A-01": 1}; a["answer_seq"] = ["A-01"]
        store.submit_attempt(a, pack)
        saved = store.get_attempt(a["id"])
        self.assertEqual(saved["status"], "submitted")
        self.assertIsNotNone(saved["submitted_at"])
        self.assertEqual(saved["result"]["score"], 1)

if __name__ == "__main__":
    unittest.main()
