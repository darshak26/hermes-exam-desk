import json, os, shutil, sys, tempfile, time, types, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
os.environ["CBT_EXAM_DATA_DIR"] = tempfile.mkdtemp(prefix="cbt-test-")
sys.path.insert(0, str(ROOT))          # for cbt_exam.* and tests.*
sys.path.insert(0, str(ROOT / "dashboard"))
import plugin_api                       # noqa: E402  (loads cbt_exam via its own importlib dance)
from fastapi import FastAPI
from fastapi.testclient import TestClient
app = FastAPI(); app.include_router(plugin_api.router)
client = TestClient(app)

from tests.helpers import base_pack     # noqa: E402
DATA = Path(os.environ["CBT_EXAM_DATA_DIR"])

def seed_pack():
    (DATA / "packs").mkdir(parents=True, exist_ok=True)
    (DATA / "packs" / "gat-b-demo.json").write_text(json.dumps(base_pack()))

def make_attempt():
    r = client.post("/attempts", json={"exam_id": "gat-b-demo", "mode": "exam"})
    assert r.status_code == 200, r.text
    return r.json()["attempt"]["id"]

def expire(aid):
    f = DATA / "attempts" / f"{aid}.json"
    a = json.loads(f.read_text())
    a["started_at"] = time.time() - 1000     # duration is 360s → well past expiry
    f.write_text(json.dumps(a))

class ApiTests(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.get("CBT_EXAM_DATA_DIR")
        os.environ["CBT_EXAM_DATA_DIR"] = str(DATA)   # other test modules also set this env at import
        shutil.rmtree(DATA, ignore_errors=True)
        seed_pack()
    def tearDown(self):
        if self._old is not None:
            os.environ["CBT_EXAM_DATA_DIR"] = self._old
    def test_health(self):
        r = client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"ok": True, "llm": False})

    def test_packs_list_and_sanitized_get(self):
        packs = client.get("/packs").json()["packs"]
        self.assertEqual(len(packs), 1)
        self.assertEqual(packs[0]["sections"][1]["attempt_limit"], 2)
        pack = client.get("/packs/gat-b-demo").json()
        for q in pack["questions"]:
            self.assertNotIn("answer", q)
            self.assertNotIn("explanation", q)

    def test_invalid_pack_is_422_not_500(self):
        bad = base_pack(); bad["questions"] = []
        (DATA / "packs" / "badpack.json").write_text(json.dumps(bad))
        listing = client.get("/packs").json()["packs"]
        self.assertTrue(any(p.get("exam_id") == "badpack" and "invalid" in p for p in listing))
        self.assertEqual(client.get("/packs/badpack").status_code, 422)
        r = client.post("/attempts", json={"exam_id": "badpack", "mode": "exam"})
        self.assertEqual(r.status_code, 422)

    def test_create_attempt_validation(self):
        r = client.post("/attempts", json={"exam_id": "gat-b-demo", "mode": "bogus"})
        self.assertEqual(r.status_code, 422)
        r = client.post("/attempts", json={"exam_id": "nope", "mode": "exam"})
        self.assertEqual(r.status_code, 404)
        r = client.post("/attempts", json={"exam_id": "gat-b-demo", "mode": "exam"})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("attempt", body)
        self.assertGreater(body["remaining_seconds"], 0)
        for q in body["pack"]["questions"]:
            self.assertNotIn("answer", q)

    def test_patch_answer_and_404s(self):
        aid = make_attempt()
        r = client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
        self.assertEqual(r.status_code, 200)
        got = client.get(f"/attempts/{aid}").json()
        self.assertEqual(got["attempt"]["answers"], {"A-01": 1})
        r = client.patch(f"/attempts/{aid}", json={"answers": {"ZZZ": 1}})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(client.get("/attempts/nope").status_code, 404)

    def test_answer_shape_validation(self):
        aid = make_attempt()
        self.assertEqual(client.patch(f"/attempts/{aid}", json={"answers": {"A-01": "1"}}).status_code, 422)
        self.assertEqual(client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 99}}).status_code, 422)
        self.assertEqual(client.patch(f"/attempts/{aid}", json={"answers": {"B-02": [0, 0]}}).status_code, 422)
        self.assertEqual(client.patch(f"/attempts/{aid}", json={"answers": {"B-03": [1]}}).status_code, 422)
        # legal shapes pass
        self.assertEqual(client.patch(f"/attempts/{aid}", json={"answers": {"B-02": [0, 2], "B-03": "2.5"}}).status_code, 200)

    def test_clear_semantics(self):
        aid = make_attempt()
        r = client.patch(f"/attempts/{aid}", json={"answers": {"A-01": None}})
        self.assertEqual(r.json()["attempt"]["answer_seq"], [])   # never answered: no slot consumed
        client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
        r = client.patch(f"/attempts/{aid}", json={"answers": {"A-01": None}})
        a = r.json()["attempt"]
        self.assertEqual(a["answer_seq"], ["A-01"])                 # answered once: slot kept
        self.assertEqual(a["answers"], {})

    def test_expire_returns_result_view(self):
        aid = make_attempt()
        client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
        expire(aid)
        r = client.patch(f"/attempts/{aid}", json={"answers": {"A-02": 1}})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["attempt"]["status"], "submitted")
        self.assertEqual(r.json()["remaining_seconds"], 0)
        # further patches keep returning the result view
        r2 = client.patch(f"/attempts/{aid}", json={"answers": {"A-03": 1}})
        self.assertEqual(r2.json()["attempt"]["status"], "submitted")
        self.assertEqual(r2.json()["attempt"]["result"]["score"], 1)

    def test_submit_idempotent_and_history_summary(self):
        aid = make_attempt()
        r = client.post(f"/attempts/{aid}/submit")
        self.assertEqual(r.json()["attempt"]["status"], "submitted")
        r2 = client.post(f"/attempts/{aid}/submit")
        self.assertEqual(r2.json()["attempt"]["result"], r.json()["attempt"]["result"])
        rows = client.get("/attempts").json()["attempts"]
        row = next(x for x in rows if x["id"] == aid)
        self.assertIn("score", row); self.assertIn("totals", row)
        self.assertIn("has_evaluation", row)
        self.assertNotIn("questions", row)   # no per-question payload in history

    def test_full_run_scores_2_5(self):
        aid = make_attempt()
        client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1, "A-02": 2, "B-01": 0, "B-02": [0], "B-03": "2"}})
        r = client.post(f"/attempts/{aid}/submit")
        res = r.json()["attempt"]["result"]
        self.assertEqual(res["score"], 2.5)
        self.assertEqual((res["totals"]["correct"], res["totals"]["wrong"],
                          res["totals"]["skipped"], res["totals"]["not_counted"]), (2, 2, 1, 1))
        # result view carries the full pack (answers included)
        self.assertIn("answer", r.json()["pack"]["questions"][0])

class FakeResult:
    def __init__(self, text="", parsed=None, model="fake-model", provider="fake"):
        self.text, self.parsed, self.model, self.provider = text, parsed, model, provider

class FakeLlm:
    def __init__(self):
        self.calls = []
        self.return_parsed_none = False
    def complete_structured(self, **kw):
        self.calls.append(kw)
        if self.return_parsed_none:
            return FakeResult(parsed=None)
        return FakeResult(parsed={"overall_comment": "ok", "sections": [{"section_id": "A", "comment": "c"}],
                                 "weak_topics": [{"topic": "t", "evidence": "e", "priority": "high"}],
                                 "wrong_answer_notes": [{"question_id": "A-02", "note": "n"}],
                                 "study_plan": ["revise x"]})

FAKE_LLM = FakeLlm()

class LlmApiTests(unittest.TestCase):
    def setUp(self):
        self._prev = sys.modules.get("cbt_exam_ctx_bridge")
        m = types.ModuleType("cbt_exam_ctx_bridge")
        m.ctx = types.SimpleNamespace(llm=FAKE_LLM)
        sys.modules["cbt_exam_ctx_bridge"] = m
        self._old = os.environ.get("CBT_EXAM_DATA_DIR")
        os.environ["CBT_EXAM_DATA_DIR"] = str(DATA)
        shutil.rmtree(DATA, ignore_errors=True)
        seed_pack()
    def tearDown(self):
        sys.modules.pop("cbt_exam_ctx_bridge", None)
        if self._prev is not None:
            sys.modules["cbt_exam_ctx_bridge"] = self._prev
        if self._old is not None:
            os.environ["CBT_EXAM_DATA_DIR"] = self._old

    def _attempt(self, mode="assisted"):
        r = client.post("/attempts", json={"exam_id": "gat-b-demo", "mode": mode})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["attempt"]["id"]

    def test_evaluate_requires_submit(self):
        aid = self._attempt()
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 409)

    def test_evaluate_after_submit(self):
        aid = self._attempt()
        client.post(f"/attempts/{aid}/submit")
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["data"]["overall_comment"], "ok")
        got = client.get(f"/attempts/{aid}").json()
        self.assertEqual(got["attempt"]["evaluation"]["data"]["overall_comment"], "ok")

    def test_evaluate_unparseable_502(self):
        FAKE_LLM.return_parsed_none = True
        try:
            aid = self._attempt()
            client.post(f"/attempts/{aid}/submit")
            r = client.post(f"/attempts/{aid}/evaluate")
            self.assertEqual(r.status_code, 502)
        finally:
            FAKE_LLM.return_parsed_none = False

    def test_evaluate_without_bridge_503(self):
        sys.modules.pop("cbt_exam_ctx_bridge", None)
        aid = self._attempt()
        client.post(f"/attempts/{aid}/submit")
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 503)

    def test_live_context_lifecycle(self):
        aid = self._attempt("assisted")              # create writes the file (first question)
        live = DATA / "live" / f"{aid}.md"
        self.assertTrue(live.exists())
        self.assertIn("QUESTION A-01", live.read_text())
        client.patch(f"/attempts/{aid}", json={"visited": ["B-03"]})
        self.assertIn("QUESTION B-03", live.read_text())
        client.post(f"/attempts/{aid}/submit")
        self.assertFalse(live.exists())              # submit clears it

    def test_exam_mode_has_no_live_context(self):
        aid = self._attempt("exam")
        self.assertFalse((DATA / "live" / f"{aid}.md").exists())

if __name__ == "__main__":
    unittest.main()
