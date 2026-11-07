import json, os, shutil, sys, tempfile, time, types, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
os.environ["EXAM_DESK_DATA_DIR"] = tempfile.mkdtemp(prefix="cbt-test-")
sys.path.insert(0, str(ROOT))          # for exam_desk.* and tests.*
sys.path.insert(0, str(ROOT / "dashboard"))
import plugin_api                       # noqa: E402  (loads exam_desk via its own importlib dance)
from fastapi import FastAPI
from fastapi.testclient import TestClient
app = FastAPI(); app.include_router(plugin_api.router)
client = TestClient(app)

from tests.helpers import base_pack     # noqa: E402
DATA = Path(os.environ["EXAM_DESK_DATA_DIR"])

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
        self._old = os.environ.get("EXAM_DESK_DATA_DIR")
        os.environ["EXAM_DESK_DATA_DIR"] = str(DATA)   # other test modules also set this env at import
        shutil.rmtree(DATA, ignore_errors=True)
        seed_pack()
    def tearDown(self):
        if self._old is not None:
            os.environ["EXAM_DESK_DATA_DIR"] = self._old
    def test_health(self):
        r = client.get("/health")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual((body["ok"], body["llm"]), (True, False))
        self.assertTrue(body["version"])

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
        self._prev = sys.modules.get("exam_desk_ctx_bridge")
        m = types.ModuleType("exam_desk_ctx_bridge")
        m.ctx = types.SimpleNamespace(llm=FAKE_LLM)
        sys.modules["exam_desk_ctx_bridge"] = m
        self._old = os.environ.get("EXAM_DESK_DATA_DIR")
        os.environ["EXAM_DESK_DATA_DIR"] = str(DATA)
        shutil.rmtree(DATA, ignore_errors=True)
        seed_pack()
    def tearDown(self):
        sys.modules.pop("exam_desk_ctx_bridge", None)
        if self._prev is not None:
            sys.modules["exam_desk_ctx_bridge"] = self._prev
        if self._old is not None:
            os.environ["EXAM_DESK_DATA_DIR"] = self._old

    def _attempt(self, mode="assisted", exam_id="gat-b-demo"):
        r = client.post("/attempts", json={"exam_id": exam_id, "mode": mode})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["attempt"]["id"]

    def _answer(self, aid):
        """One saved answer — evaluate refuses a sheet nobody wrote on."""
        r = client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
        self.assertEqual(r.status_code, 200, r.text)
        return aid

    def test_evaluate_requires_submit(self):
        aid = self._attempt()
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 409)

    def test_evaluate_refuses_blank_attempt(self):
        """A blank sheet has no evidence: 37 'likely…' notes were invented from one."""
        before = len(FAKE_LLM.calls)
        aid = self._attempt()
        client.post(f"/attempts/{aid}/submit")
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 409)
        self.assertIn("no recorded answers", r.json()["detail"])
        self.assertEqual(len(FAKE_LLM.calls), before, "a blank attempt must not cost a model call")

    def test_evaluate_refuses_random_key(self):
        pack = base_pack()
        pack["exam_id"], pack["key_status"] = "gat-b-nokey", "random"
        (DATA / "packs" / "gat-b-nokey.json").write_text(json.dumps(pack))
        aid = self._answer(self._attempt(exam_id="gat-b-nokey"))
        client.post(f"/attempts/{aid}/submit")
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 409)
        self.assertIn("key_status 'random'", r.json()["detail"])

    def test_evaluate_after_submit(self):
        aid = self._answer(self._attempt())
        client.post(f"/attempts/{aid}/submit")
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["data"]["overall_comment"], "ok")
        got = client.get(f"/attempts/{aid}").json()
        self.assertEqual(got["attempt"]["evaluation"]["data"]["overall_comment"], "ok")
        self.assertNotIn("evaluation_error", got["attempt"], "a success clears the stored failure")

    def test_evaluate_unparseable_502(self):
        FAKE_LLM.return_parsed_none = True
        try:
            aid = self._answer(self._attempt())
            client.post(f"/attempts/{aid}/submit")
            r = client.post(f"/attempts/{aid}/evaluate")
            self.assertEqual(r.status_code, 502)
            got = client.get(f"/attempts/{aid}").json()["attempt"]
            self.assertIn("evaluation_error", got, "a failed analysis must be auditable after reload")
            self.assertIn("evaluation failed", got["evaluation_error"]["message"])
        finally:
            FAKE_LLM.return_parsed_none = False

    def test_evaluate_without_bridge_503(self):
        sys.modules.pop("exam_desk_ctx_bridge", None)
        aid = self._answer(self._attempt())
        client.post(f"/attempts/{aid}/submit")
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 503)

    def test_patch_records_behaviour_and_envelope_carries_stats(self):
        aid = self._attempt()
        r = client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}, "current": "A-02"})
        self.assertEqual(r.status_code, 200)
        log = []
        from exam_desk import store as st
        for ln in st.read_events(aid):
            log.append(ln["type"])                        # save + open, once
        self.assertEqual(log.count("save"), 1)
        self.assertEqual(log.count("open"), 1)
        # a change of mind is its own save with prev
        client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 2}})
        from exam_desk import store as st2
        save_events = [e for e in st2.read_events(aid) if e["type"] == "save"]
        self.assertTrue(any(e["prev"] == 1 and e["value"] == 2 and e["qid"] == "A-01"
                            for e in save_events), f"expected a mind-change save, saw {save_events}")
        client.patch(f"/attempts/{aid}", json={"marked": ["A-01"]})
        events = st.read_events(aid)
        self.assertTrue(any(e["type"] == "mark" and e["on"] for e in events))

        client.patch(f"/attempts/{aid}", json={"answers": {"A-02": 3}})
        client.post(f"/attempts/{aid}/submit")
        got = client.get(f"/attempts/{aid}").json()
        self.assertIn("stats", got)
        self.assertGreater(got["stats"]["totals"]["events"], 0)
        self.assertEqual(got["stats"]["totals"]["changed"], 1)
        self.assertIn("A-01", got["stats"]["per_question"])

    def test_delete_removes_the_stream_too(self):
        aid = self._answer(self._attempt())
        from exam_desk import store as st
        client.patch(f"/attempts/{aid}", json={"current": "A-02"})
        r = client.post(f"/attempts/{aid}/submit")
        self.assertTrue(r.json()["attempt"]["status"] == "submitted")
        client.delete(f"/attempts/{aid}")
        self.assertFalse(st.event_log_path(aid).exists())

    def test_evaluate_context_carries_process_and_history(self):
        baseline = self._answer(self._attempt())
        client.post(f"/attempts/{baseline}/submit")            # history row (no events)
        aid = self._answer(self._attempt())
        client.patch(f"/attempts/{aid}", json={"current": "A-02"})   # an open event
        import time; time.sleep(0.3)                           # real dwell between the open and its save
        client.patch(f"/attempts/{aid}", json={"answers": {"A-02": 3}})
        client.post(f"/attempts/{aid}/submit")
        before = len(FAKE_LLM.calls)
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 200)
        kw = FAKE_LLM.calls[before]
        text = kw["input"][0]["text"]
        self.assertIn("PROCESS:", text, "the behaviour block rides the prompt")
        self.assertIn("Time on question:", text, "the dwell summary rides the prompt")
        self.assertIn("HISTORY:", text, "the earlier attempt rides the prompt")
        self.assertIn("spent≈", text, "per-question behaviour is named")

    def test_refused_schema_is_not_re_asked_every_call(self):
        """A provider refusing json_schema refuses it every time: try it once, then
        start from the shape that worked, so no evaluation pays a wasted 400."""
        class RefusingLlm(FakeLlm):
            def complete_structured(self, **kw):
                self.calls.append(kw)
                if "json_schema" in kw:
                    raise RuntimeError('400 "json_schema not yet supported"')
                return FakeResult(parsed={"overall_comment": "ok",
                                          "sections": [{"section_id": "A", "comment": "c"}],
                                          "weak_topics": [{"topic": "t", "evidence": "e", "priority": "high"}],
                                          "wrong_answer_notes": [], "study_plan": []})

        prev_shape = plugin_api._SHAPE_OK["name"]
        plugin_api._SHAPE_OK["name"] = None
        llm = RefusingLlm()
        sys.modules["exam_desk_ctx_bridge"].ctx.llm = llm
        try:
            first = self._answer(self._attempt())
            client.post(f"/attempts/{first}/submit")
            self.assertEqual(client.post(f"/attempts/{first}/evaluate").status_code, 200)
            self.assertIn("json_schema", llm.calls[0], "the richest shape must be tried first")
            self.assertIn("json_mode", llm.calls[1], "then json_object")

            second = self._answer(self._attempt())
            client.post(f"/attempts/{second}/submit")
            self.assertEqual(client.post(f"/attempts/{second}/evaluate").status_code, 200)
            self.assertNotIn("json_schema", llm.calls[2],
                             "a shape this provider just refused must not be re-asked")
            self.assertIn("json_mode", llm.calls[2])
        finally:
            plugin_api._SHAPE_OK["name"] = prev_shape
            sys.modules["exam_desk_ctx_bridge"].ctx.llm = FAKE_LLM

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


class DeleteTests(unittest.TestCase):
    """History has to be prunable, or a week of practice buries the start screen."""

    def setUp(self):
        self._old = os.environ.get("EXAM_DESK_DATA_DIR")
        os.environ["EXAM_DESK_DATA_DIR"] = str(DATA)
        shutil.rmtree(DATA, ignore_errors=True)
        seed_pack()

    def tearDown(self):
        if self._old is not None:
            os.environ["EXAM_DESK_DATA_DIR"] = self._old

    def finished(self):
        aid = make_attempt()
        client.post(f"/attempts/{aid}/submit")
        return aid

    def test_delete_removes_a_finished_attempt(self):
        aid = self.finished()
        self.assertTrue((DATA / "attempts" / f"{aid}.json").exists())
        r = client.delete(f"/attempts/{aid}")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse((DATA / "attempts" / f"{aid}.json").exists())
        listed = [a["id"] for a in client.get("/attempts").json()["attempts"]]
        self.assertNotIn(aid, listed)

    def test_delete_refuses_a_live_attempt(self):
        aid = make_attempt()
        r = client.delete(f"/attempts/{aid}")
        self.assertEqual(r.status_code, 409)
        self.assertTrue((DATA / "attempts" / f"{aid}.json").exists())

    def test_delete_unknown_attempt_is_404(self):
        self.assertEqual(client.delete("/attempts/a-doesnotexist").status_code, 404)

    def test_abandon_works_after_the_paper_is_deleted(self):
        """Deleting a paper strands its live attempts: they can never be graded or
        resumed, so the escape hatch has to work without the pack in hand."""
        aid = make_attempt()
        packs = DATA / "packs"
        for f in packs.glob("*.json"):
            f.unlink()
        r = client.post(f"/attempts/{aid}/abandon")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["attempt"]["status"], "abandoned")
        self.assertIsNone(body["pack"])
        self.assertEqual(client.delete(f"/attempts/{aid}").status_code, 200)

    def test_prune_keeps_submitted_and_live(self):
        done = self.finished()
        live = make_attempt()
        dropped = make_attempt()
        client.post(f"/attempts/{dropped}/abandon")

        r = client.post("/attempts/prune", json={})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["deleted"], 1)
        listed = {a["id"] for a in client.get("/attempts").json()["attempts"]}
        self.assertIn(done, listed)
        self.assertIn(live, listed)
        self.assertNotIn(dropped, listed)

    def test_prune_only_touches_the_named_exam(self):
        dropped = make_attempt()
        client.post(f"/attempts/{dropped}/abandon")
        r = client.post("/attempts/prune", json={"exam_id": "some-other-exam"})
        self.assertEqual(r.json()["deleted"], 0)
        self.assertIn(dropped, {a["id"] for a in client.get("/attempts").json()["attempts"]})


class MediaTests(unittest.TestCase):
    """Figures live beside the JSON and are served as bytes, never inlined."""

    def setUp(self):
        self._old = os.environ.get("EXAM_DESK_DATA_DIR")
        os.environ["EXAM_DESK_DATA_DIR"] = str(DATA)
        shutil.rmtree(DATA, ignore_errors=True)
        seed_pack()
        self.assets = DATA / "packs" / "gat-b-demo.assets"
        (self.assets / "figures").mkdir(parents=True, exist_ok=True)
        (self.assets / "figures" / "gel.png").write_bytes(b"\x89PNG\r\n\x1a\nFAKE")

    def tearDown(self):
        if self._old is not None:
            os.environ["EXAM_DESK_DATA_DIR"] = self._old

    def test_serves_a_figure(self):
        r = client.get("/packs/gat-b-demo/assets/figures/gel.png")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.content.startswith(b"\x89PNG"))

    def test_missing_figure_is_404(self):
        self.assertEqual(client.get("/packs/gat-b-demo/assets/figures/nope.png").status_code, 404)

    def test_path_traversal_is_refused(self):
        r = client.get("/packs/gat-b-demo/assets/../../gat-b-demo.json")
        self.assertIn(r.status_code, (400, 404))
        self.assertNotIn(b"schema", r.content)

    def test_pack_list_warns_about_a_missing_figure(self):
        pack = base_pack()
        pack["questions"][0]["media"] = [{"type": "image", "src": "figures/absent.png", "alt": "gel"}]
        (DATA / "packs" / "gat-b-demo.json").write_text(json.dumps(pack))
        warns = client.get("/packs").json()["packs"][0]["warnings"]
        self.assertTrue(any("missing" in w for w in warns), warns)
