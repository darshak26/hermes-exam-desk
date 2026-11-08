"""Regression tests for defects found in the 0.2.0 audit.

Each test names the failure it pins down, so a future change that reintroduces
one fails loudly instead of quietly costing a student marks.
"""
import json
import os
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("EXAM_DESK_DATA_DIR", tempfile.mkdtemp(prefix="cbt-reg-"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "dashboard"))

import plugin_api                                    # noqa: E402
from fastapi import FastAPI                          # noqa: E402
from fastapi.testclient import TestClient            # noqa: E402

from exam_desk import grading, pack as pack_mod, store  # noqa: E402
from tests.helpers import base_pack                   # noqa: E402

app = FastAPI()
app.include_router(plugin_api.router)
client = TestClient(app, raise_server_exceptions=False)
DATA = Path(os.environ["EXAM_DESK_DATA_DIR"])


def write_pack(pack, name=None):
    d = DATA / "packs"
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{name or pack['exam_id']}.json"
    path.write_text(json.dumps(pack))
    return path


def big_pack(count=160):
    """A realistic size: one section, `count` mcq questions."""
    p = base_pack()
    p["exam_id"] = "big-demo"
    p["pattern"]["duration_minutes"] = 180
    p["pattern"]["sections"] = [{"id": "A", "title": "Section A", "question_count": count,
                                 "attempt_limit": None, "marks_correct": 1,
                                 "marks_wrong": -0.5, "marks_unanswered": 0}]
    p["questions"] = [{"id": f"A-{i:03d}", "section": "A", "type": "mcq", "topic": f"Topic {i}",
                       "text": f"Question number {i} about something biological?",
                       "options": ["alpha", "beta", "gamma", "delta"], "answer": i % 4,
                       "source_url": "https://example.com/paper"} for i in range(1, count + 1)]
    return p


class Base(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.get("EXAM_DESK_DATA_DIR")
        os.environ["EXAM_DESK_DATA_DIR"] = str(DATA)
        for p in DATA.rglob("*"):
            if p.is_file():
                p.unlink()
        pack_mod.clear_cache()
        write_pack(base_pack())

    def tearDown(self):
        if self._old is not None:
            os.environ["EXAM_DESK_DATA_DIR"] = self._old

    def start(self, mode="exam", exam="gat-b-demo"):
        r = client.post("/attempts", json={"exam_id": exam, "mode": mode})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["attempt"]["id"]

    def expire(self, aid):
        f = DATA / "attempts" / f"{aid}.json"
        a = json.loads(f.read_text())
        a["started_at"] = time.time() - 10_000
        f.write_text(json.dumps(a))


class PackIntegrity(Base):
    """A pack that parses must never be able to break grading."""

    def test_non_numeric_tolerance_is_rejected_at_validation(self):
        p = base_pack()
        p["questions"][5]["tolerance"] = "about 0.1"          # NAT question
        errs = pack_mod.validate_pack(p)
        self.assertTrue(any("tolerance" in e for e in errs), errs)

    def test_non_numeric_tolerance_cannot_brick_an_attempt(self):
        """0.2.0: submit 500'd and the attempt stayed in_progress forever."""
        p = base_pack()
        p["questions"][5]["tolerance"] = "about 0.1"
        path = write_pack(p, name="tol-bad")
        pack_mod.clear_cache()
        # even if such a pack reaches the store (hand-edited after validation),
        # grading must not raise
        a = store.new_attempt(p, "exam")
        a["answers"] = {"B-03": "2.0"}
        a["answer_seq"] = ["B-03"]
        store.submit_attempt(a, p)
        self.assertEqual(store.get_attempt(a["id"])["status"], "submitted")
        self.assertEqual(grading.is_correct(p["questions"][5], "2.0"), True)
        self.assertFalse(path.read_text() == "")

    def test_positive_marks_wrong_is_rejected(self):
        """0.2.0: `marks_wrong: 0.5` silently awarded marks for wrong answers."""
        p = base_pack()
        p["pattern"]["sections"][0]["marks_wrong"] = 0.5
        self.assertTrue(any("marks_wrong" in e for e in pack_mod.validate_pack(p)))
        p = base_pack()
        p["questions"][0]["marks_wrong"] = 1
        self.assertTrue(any("marks_wrong" in e for e in pack_mod.validate_pack(p)))

    def test_marks_unanswered_and_difficulty_are_enforced(self):
        p = base_pack()
        p["pattern"]["sections"][0]["marks_unanswered"] = -0.25
        self.assertTrue(any("marks_unanswered" in e for e in pack_mod.validate_pack(p)))
        p = base_pack()
        p["questions"][0]["difficulty"] = "banana"
        self.assertTrue(any("difficulty" in e for e in pack_mod.validate_pack(p)))

    def test_tolerance_only_on_nat_and_must_be_non_negative(self):
        p = base_pack()
        p["questions"][0]["tolerance"] = 0.5                 # mcq
        self.assertTrue(any("only valid on nat" in e for e in pack_mod.validate_pack(p)))
        p = base_pack()
        p["questions"][5]["tolerance"] = -1
        self.assertTrue(any("tolerance" in e for e in pack_mod.validate_pack(p)))

    def test_tolerance_is_hidden_before_submit(self):
        view = pack_mod.sanitize_pack(base_pack())
        self.assertNotIn("tolerance", view["questions"][5])

    def test_lint_flags_ocr_debris_and_placeholder_topics(self):
        p = base_pack()
        p["questions"][0]["topic"] = "Demo Section A"        # placeholder: starts with title
        p["questions"][1]["options"] = ["1", "2", "3", "4"]  # too short to be real options
        p["questions"][2]["options"] = ["same", "same", "x", "y"]
        warns = " | ".join(pack_mod.lint_pack(p))
        self.assertIn("placeholder", warns)
        self.assertIn("OCR debris", warns)
        self.assertIn("duplicate option", warns)
        self.assertEqual(pack_mod.validate_pack(p), [])      # warnings are not errors


class ProvenanceRule(Base):
    """The rule is "you can say where this came from", not "there is a URL"."""

    def test_a_self_written_question_needs_a_note_not_a_url(self):
        p = base_pack()
        p.pop("source_url", None)
        for q in p["questions"]:
            q.pop("source_url", None)
            q["provenance"] = "written by the teacher, 2026"
        self.assertEqual(pack_mod.validate_pack(p), [])

    def test_a_question_with_neither_is_still_refused(self):
        p = base_pack()
        p["questions"][0].pop("source_url", None)
        errs = pack_mod.validate_pack(p)
        self.assertTrue(any("source_url or a provenance note" in e for e in errs), errs)

    def test_bundled_demo_pack_is_valid_and_lint_clean(self):
        demo = json.loads((Path(__file__).resolve().parents[1] / "packs" / "demo-basics.json").read_text())
        self.assertEqual(pack_mod.validate_pack(demo), [])
        self.assertEqual(pack_mod.lint_pack(demo), [])


class SeedPacks(Base):
    """A fresh install must not open on an empty panel."""

    def test_seed_copies_the_demo_once_and_never_overwrites(self):
        import importlib.util
        root = Path(__file__).resolve().parents[1]
        spec = importlib.util.spec_from_file_location("cbt_init_under_test", root / "__init__.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        with tempfile.TemporaryDirectory() as tmp:
            old = os.environ.get("EXAM_DESK_DATA_DIR")
            os.environ["EXAM_DESK_DATA_DIR"] = tmp
            try:
                mod._seed_packs()
                target = Path(tmp) / "packs" / "demo-basics.json"
                self.assertTrue(target.exists())
                target.write_text('{"mine": true}')
                mod._seed_packs()                      # second start
                self.assertEqual(target.read_text(), '{"mine": true}')
            finally:
                if old is None:
                    os.environ.pop("EXAM_DESK_DATA_DIR", None)
                else:
                    os.environ["EXAM_DESK_DATA_DIR"] = old


class AnswerSemantics(Base):
    def test_whitespace_nat_answer_is_a_clear_not_a_wrong_answer(self):
        """0.2.0: " " counted as answered and scored -1."""
        aid = self.start()
        body = client.patch(f"/attempts/{aid}", json={"answers": {"B-03": " "}}).json()
        self.assertEqual(body["attempt"]["answers"], {})
        result = client.post(f"/attempts/{aid}/submit").json()["attempt"]["result"]
        row = next(r for r in result["questions"] if r["id"] == "B-03")
        self.assertEqual((row["verdict"], row["awarded"]), ("skipped", 0))

    def test_zero_is_a_real_answer(self):
        aid = self.start()
        client.patch(f"/attempts/{aid}", json={"answers": {"A-02": 0}})
        a = client.get(f"/attempts/{aid}").json()["attempt"]
        self.assertEqual(a["answers"]["A-02"], 0)

    def test_marked_can_be_cleared(self):
        """0.2.0: PATCH {"marked": []} was ignored, so marking was one-way."""
        aid = self.start()
        client.patch(f"/attempts/{aid}", json={"marked": ["A-01"]})
        body = client.patch(f"/attempts/{aid}", json={"marked": []}).json()
        self.assertEqual(body["attempt"]["marked"], [])

    def test_marked_absent_leaves_marks_alone(self):
        aid = self.start()
        client.patch(f"/attempts/{aid}", json={"marked": ["A-01"]})
        body = client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}}).json()
        self.assertEqual(body["attempt"]["marked"], ["A-01"])

    def test_answer_error_is_shared_with_the_validator(self):
        q = base_pack()["questions"][0]
        self.assertEqual(pack_mod.answer_error(q, 99), "answer must be an option index")
        self.assertIsNone(pack_mod.answer_error(q, None))


class LiveContext(Base):
    """The exam-assist tutor reads this file; describing the wrong question is the
    worst failure mode in the plugin because it is invisible."""

    def live_headline(self, aid):
        text = (DATA / "live" / f"{aid}.md").read_text()
        return [ln for ln in text.splitlines() if ln.startswith("QUESTION")][0]

    def test_live_context_follows_the_question_on_screen(self):
        aid = self.start(mode="assisted")
        for qid in ("A-03", "A-01", "A-02"):
            client.patch(f"/attempts/{aid}", json={"visited": [qid], "current": qid})
            self.assertIn(f"QUESTION {qid}", self.live_headline(aid))

    def test_visited_keeps_recency_not_alphabetical_order(self):
        aid = self.start(mode="assisted")
        for qid in ("A-03", "A-01", "A-02"):
            client.patch(f"/attempts/{aid}", json={"visited": [qid]})
        a = client.get(f"/attempts/{aid}").json()["attempt"]
        self.assertEqual(a["visited"], ["A-03", "A-01", "A-02"])
        self.assertEqual(a["current"], "A-02")

    def test_stale_live_file_is_pruned(self):
        old = self.start(mode="assisted")
        client.post(f"/attempts/{old}/submit")
        new = self.start(mode="assisted")
        self.assertEqual([p.name for p in (DATA / "live").glob("*.md")], [f"{new}.md"])

    def test_submitted_attempt_leaves_no_live_file(self):
        aid = self.start(mode="assisted")
        self.assertTrue((DATA / "live" / f"{aid}.md").exists())
        client.post(f"/attempts/{aid}/submit")
        self.assertFalse((DATA / "live" / f"{aid}.md").exists())


class Reliability(Base):
    def test_corrupt_attempt_file_does_not_break_history(self):
        """0.2.0: one bad file 500'd the whole list (and the home page polls it)."""
        self.start()
        (DATA / "attempts" / "broken.json").write_text("{not json")
        r = client.get("/attempts")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(len(body["attempts"]), 1)
        self.assertEqual(body["unreadable"][0]["id"], "broken")

    def test_non_attempt_json_in_attempts_dir_is_reported_not_crashing(self):
        (DATA / "attempts" / "random.json").write_text('{"hello": "world"}')
        self.assertEqual(client.get("/attempts").status_code, 200)

    def test_expired_attempt_is_graded_on_the_history_read(self):
        """A dead attempt must not keep offering 'Resume'."""
        aid = self.start()
        self.expire(aid)
        row = client.get("/attempts").json()["attempts"][0]
        self.assertEqual(row["status"], "submitted")
        self.assertEqual(row["score"], 0)

    def test_abandon_discards_without_grading_or_revealing_the_key(self):
        aid = self.start(mode="assisted")
        client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
        body = client.post(f"/attempts/{aid}/abandon").json()
        self.assertEqual(body["attempt"]["status"], "abandoned")
        self.assertIsNone(body["attempt"]["result"])
        for q in body["pack"]["questions"]:
            self.assertNotIn("answer", q)                   # no free answer key
        self.assertFalse((DATA / "live" / f"{aid}.md").exists())

    def test_late_write_after_submit_is_ignored(self):
        aid = self.start()
        client.post(f"/attempts/{aid}/submit")
        body = client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}}).json()
        self.assertEqual(body["attempt"]["status"], "submitted")
        self.assertEqual(body["attempt"]["answers"], {})

    def test_concurrent_answer_saves_do_not_lose_updates(self):
        """Without the per-attempt lock, read-modify-write drops answers."""
        write_pack(big_pack(40))
        pack_mod.clear_cache()
        aid = self.start(exam="big-demo")
        qids = [f"A-{i:03d}" for i in range(1, 17)]
        with ThreadPoolExecutor(max_workers=16) as pool:
            codes = list(pool.map(
                lambda i: client.patch(f"/attempts/{aid}", json={"answers": {qids[i]: 1}}).status_code,
                range(len(qids))))
        self.assertEqual(set(codes), {200})
        saved = client.get(f"/attempts/{aid}").json()["attempt"]["answers"]
        self.assertEqual(sorted(saved), sorted(qids))

    def test_history_is_bounded_and_newest_first(self):
        ids = [self.start() for _ in range(4)]
        rows = client.get("/attempts?limit=2").json()["attempts"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["id"], ids[-1])

    def test_unknown_and_traversal_ids_are_404_not_500(self):
        for bad in ("nope", "..", "a/b"):
            self.assertEqual(client.get(f"/attempts/{bad}").status_code, 404)
            self.assertEqual(client.get(f"/packs/{bad}").status_code, 404)


class Efficiency(Base):
    def test_pack_is_parsed_and_validated_once_per_change(self):
        """The read-through cache is what keeps a PATCH off the 120 KB JSON path."""
        store.get_pack("gat-b-demo")
        first = store.get_pack("gat-b-demo")
        second = store.get_pack("gat-b-demo")
        self.assertIs(first, second)                        # same object: no re-parse

    def test_pack_edit_on_disk_is_picked_up(self):
        before = store.get_pack("gat-b-demo")["pattern"]["duration_minutes"]
        p = base_pack()
        p["pattern"]["duration_minutes"] = before + 5
        write_pack(p)
        self.assertEqual(store.get_pack("gat-b-demo")["pattern"]["duration_minutes"], before + 5)

    def test_sanitized_view_is_cached_with_the_pack(self):
        self.assertIs(store.get_pack_view("gat-b-demo"), store.get_pack_view("gat-b-demo"))

    def test_160_question_patch_stays_fast(self):
        write_pack(big_pack())
        pack_mod.clear_cache()
        aid = self.start(exam="big-demo")
        start = time.perf_counter()
        for i in range(1, 21):
            client.patch(f"/attempts/{aid}", json={"answers": {f"A-{i:03d}": 1}})
        per_request = (time.perf_counter() - start) / 20
        self.assertLess(per_request, 0.05, f"{per_request * 1000:.1f} ms per save")


class Evaluation(Base):
    def test_evaluate_is_idempotent_and_force_re_runs(self):
        import types
        calls = []

        class Fake:
            def complete_structured(self, **kw):
                calls.append(kw)
                return types.SimpleNamespace(parsed={
                    "overall_comment": "ok", "sections": [{"section_id": "A", "comment": "c"}],
                    "weak_topics": [], "wrong_answer_notes": [], "study_plan": ["revise"]},
                    model="m", provider="p")
            async def acomplete_structured(self, **kw):
                return self.complete_structured(**kw)

        m = types.ModuleType("exam_desk_ctx_bridge")
        setattr(m, "ctx", types.SimpleNamespace(llm=Fake()))
        sys.modules["exam_desk_ctx_bridge"] = m
        try:
            aid = self.start()
            client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
            client.post(f"/attempts/{aid}/submit")
            self.assertEqual(client.post(f"/attempts/{aid}/evaluate").status_code, 200)
            self.assertEqual(client.post(f"/attempts/{aid}/evaluate").status_code, 200)
            self.assertEqual(len(calls), 1)                 # second call is free
            client.post(f"/attempts/{aid}/evaluate?force=true")
            self.assertEqual(len(calls), 2)
        finally:
            sys.modules.pop("exam_desk_ctx_bridge", None)

    def _fake_llm(self, behaviour):
        """Install a fake bridge for the duration of one test."""
        import types
        calls = []

        class Fake:
            def complete_structured(self, **kw):
                calls.append(kw)
                return behaviour(kw)
            async def acomplete_structured(self, **kw):
                return self.complete_structured(**kw)

        m = types.ModuleType("exam_desk_ctx_bridge")
        setattr(m, "ctx", types.SimpleNamespace(llm=Fake()))
        sys.modules["exam_desk_ctx_bridge"] = m
        self.addCleanup(lambda: sys.modules.pop("exam_desk_ctx_bridge", None))
        return calls

    GOOD = {"overall_comment": "ok", "sections": [{"section_id": "A", "comment": "c"}],
            "weak_topics": [], "wrong_answer_notes": [], "study_plan": ["revise"]}

    def test_evaluation_falls_back_when_provider_rejects_json_schema(self):
        """Atlas answers a json_schema request with 400 'not yet supported' — the
        evaluation must still arrive via json_object instead of failing."""
        import types

        def behaviour(kw):
            if kw.get("json_schema") is not None:
                raise RuntimeError("400 this feature is not yet supported by atlas")
            return types.SimpleNamespace(parsed=self.GOOD, text="", model="m", provider="p")

        calls = self._fake_llm(behaviour)
        aid = self.start()
        client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
        client.post(f"/attempts/{aid}/submit")
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(len(calls), 2)                  # schema attempt, then json_object
        self.assertIsNotNone(calls[1].get("json_mode"))
        self.assertEqual(r.json()["data"]["overall_comment"], "ok")

    def test_evaluation_parses_json_out_of_plain_text_as_the_last_resort(self):
        """Provider refuses every response_format: dig the JSON out of the reply."""
        import json as _json
        import types

        def behaviour(kw):
            if kw.get("json_schema") is not None or kw.get("json_mode"):
                raise RuntimeError("response_format unsupported")
            return types.SimpleNamespace(parsed=None, text="Sure:\n" + _json.dumps(self.GOOD) + "\nDone",
                                         model="m", provider="p")

        calls = self._fake_llm(behaviour)
        aid = self.start()
        client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
        client.post(f"/attempts/{aid}/submit")
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(len(calls), 3)
        self.assertEqual(r.json()["data"]["study_plan"], ["revise"])

    def test_evaluate_refuses_before_submit(self):
        aid = self.start()
        self.assertEqual(client.post(f"/attempts/{aid}/evaluate").status_code, 409)


class Audit070Regressions(Base):
    """Regression tests for defects found in the 0.7.0 verified audit."""

    GOOD = {"overall_comment": "ok", "sections": [{"section_id": "A", "comment": "c"}],
            "weak_topics": [], "wrong_answer_notes": [], "study_plan": ["revise"]}

    def _fake_llm(self, behaviour):
        import types
        calls = []

        class Fake:
            def complete_structured(self, **kw):
                calls.append(kw)
                return behaviour(kw)
            async def acomplete_structured(self, **kw):
                return self.complete_structured(**kw)

        m = types.ModuleType("exam_desk_ctx_bridge")
        setattr(m, "ctx", types.SimpleNamespace(llm=Fake()))
        sys.modules["exam_desk_ctx_bridge"] = m
        self.addCleanup(lambda: sys.modules.pop("exam_desk_ctx_bridge", None))
        return calls

    def test_doubt_log_cli_rejects_injection_and_appends_stream(self):
        """0.7.0 finding 1: doubt-log shell injection in exam-assist skill."""
        import importlib.util
        script = ROOT / "skills" / "exam-assist" / "scripts" / "log_doubt.py"
        self.assertTrue(script.is_file())
        spec = importlib.util.spec_from_file_location("log_doubt_cli", script)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        # Invalid attempt id and qid must be rejected
        self.assertEqual(mod.main(["--attempt-id", "bad;id", "--qid", "A-01", "--note", "n", "--data-dir", str(DATA)]), 1)
        self.assertEqual(mod.main(["--attempt-id", "../traversal", "--qid", "A-01", "--note", "n", "--data-dir", str(DATA)]), 1)
        self.assertEqual(mod.main(["--attempt-id", "a-12345", "--qid", "bad;qid", "--note", "n", "--data-dir", str(DATA)]), 1)

        # Valid invocation appends correctly
        aid = "a-12345"
        note = 'hello "$(calc)" \' quote; rm'
        rc = mod.main(["--attempt-id", aid, "--qid", "A-01", "--note", note, "--data-dir", str(DATA)])
        self.assertEqual(rc, 0)

        log_path = DATA / "attempts" / f"{aid}.log.jsonl"
        self.assertTrue(log_path.is_file())
        lines = [json.loads(line) for line in log_path.read_text().splitlines() if line.strip()]
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["type"], "doubt")
        self.assertEqual(lines[0]["qid"], "A-01")
        self.assertEqual(lines[0]["note"], note)

        # SKILL.md must call log_doubt.py, not python -c one-liner
        skill_text = (ROOT / "skills" / "exam-assist" / "SKILL.md").read_text()
        self.assertIn("log_doubt.py", skill_text)
        self.assertNotIn("type': 'doubt', 'qid': '<QUESTION-ID>'", skill_text)

    def test_evaluate_in_flight_concurrent_call_returns_409(self):
        """0.7.0 finding 2: evaluation route has no lock / in-flight guard."""
        import threading
        import types

        started = threading.Event()
        proceed = threading.Event()

        def slow_llm(kw):
            started.set()
            proceed.wait(timeout=5)
            return types.SimpleNamespace(parsed=self.GOOD, text="", model="m", provider="p")

        self._fake_llm(slow_llm)
        aid = self.start()
        client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
        client.post(f"/attempts/{aid}/submit")

        results = []
        def run_eval():
            r = client.post(f"/attempts/{aid}/evaluate?force=true")
            results.append(r.status_code)

        t = threading.Thread(target=run_eval)
        t.start()

        self.assertTrue(started.wait(timeout=5))
        # Second call while in-flight must 409
        r2 = client.post(f"/attempts/{aid}/evaluate?force=true")
        self.assertEqual(r2.status_code, 409)
        self.assertIn("already running", r2.text)

        proceed.set()
        t.join(timeout=5)
        self.assertEqual(results, [200])

    def test_writes_are_not_blocked_by_in_flight_evaluation(self):
        """0.7.0 finding 2: the slow LLM loop must not hold the attempt lock."""
        import threading
        import types

        started, proceed = threading.Event(), threading.Event()

        def slow_llm(kw):
            started.set()
            proceed.wait(timeout=5)
            return types.SimpleNamespace(parsed=self.GOOD, text="", model="m", provider="p")

        self._fake_llm(slow_llm)
        aid = self.start()
        client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
        client.post(f"/attempts/{aid}/submit")

        out = {}
        t = threading.Thread(target=lambda: out.__setitem__(
            "eval", client.post(f"/attempts/{aid}/evaluate?force=true")))
        t.start()
        self.assertTrue(started.wait(timeout=5))

        # Another request on the same attempt must not queue behind the LLM call. A late
        # patch on a submitted attempt is a no-op by contract — the point here is that it
        # returns instead of hanging on the lock for up to three 180 s provider timeouts.
        done = threading.Event()

        def touch():
            out["patch"] = client.patch(f"/attempts/{aid}", json={"marked": ["A-01"]})
            done.set()

        threading.Thread(target=touch, daemon=True).start()
        self.assertTrue(done.wait(timeout=3), "request blocked behind an in-flight evaluation")
        self.assertEqual(out["patch"].status_code, 200)

        proceed.set()
        t.join(timeout=5)
        self.assertEqual(out["eval"].status_code, 200)

        # The evaluation landed and the pre-existing state is intact.
        a = json.loads((DATA / "attempts" / f"{aid}.json").read_text())
        self.assertIn("evaluation", a)
        self.assertEqual(a["answers"], {"A-01": 1})

    def test_log_events_is_plain_function_not_contextmanager(self):
        """0.7.0 finding 3: log_events is decorated @contextmanager but is not a generator."""
        import inspect
        self.assertFalse(inspect.isgeneratorfunction(store.log_events))
        self.assertFalse(hasattr(store.log_events, "__wrapped__"))
        # Calling it as a normal function returns None and doesn't raise
        ret = store.log_events("a-test", [{"type": "mark", "qid": "A-01"}])
        self.assertIsNone(ret)

    def test_event_log_cap_writes_marker_at_most_once(self):
        """0.7.0 finding 4: event-log cap appends a marker on every event forever."""
        aid = "a-cap-test"
        log_file = DATA / "attempts" / f"{aid}.log.jsonl"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        # Seed file with valid JSON lines to exceed EVENT_MAX_BYTES
        line = json.dumps({"type": "open", "qid": "A-01"}) + "\n"
        count = (store.EVENT_MAX_BYTES // len(line)) + 10
        log_file.write_text(line * count)

        # First call writes the truncated marker
        store.log_events(aid, [{"type": "open", "qid": "A-01"}])
        size_after_marker = log_file.stat().st_size
        self.assertGreater(size_after_marker, store.EVENT_MAX_BYTES)

        # Subsequent calls must not keep appending truncated markers
        for i in range(5):
            store.log_events(aid, [{"type": "open", "qid": f"A-0{i}"}])
        self.assertEqual(log_file.stat().st_size, size_after_marker)

        # Ensure the last line is the single truncated marker
        tail = log_file.read_bytes()[-200:].decode("utf-8", errors="ignore").strip().splitlines()
        self.assertEqual(json.loads(tail[-1])["type"], "truncated")

    def test_prune_attempts_holds_attempt_lock_during_delete(self):
        """0.7.0 finding 5: prune_attempts deletes without the attempt lock."""
        import unittest.mock
        aid = self.start()
        client.post(f"/attempts/{aid}/abandon")

        locked_aids = []
        orig_lock = store.attempt_lock

        def tracked_lock(target_aid):
            locked_aids.append(target_aid)
            return orig_lock(target_aid)

        with unittest.mock.patch.object(store, "attempt_lock", side_effect=tracked_lock):
            removed = store.prune_attempts(statuses=["abandoned"])

        self.assertIn(aid, removed)
        self.assertIn(aid, locked_aids)

    def test_load_attempt_cli_rejects_path_traversal_ids(self):
        """0.7.0 finding 6: load_attempt.py resolves user-supplied ids as paths."""
        import importlib.util
        script = ROOT / "skills" / "attempt-review" / "scripts" / "load_attempt.py"
        spec = importlib.util.spec_from_file_location("load_attempt_cli", script)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        # Traversal / non-plain attempt_id rejected before touching disk
        self.assertEqual(mod.main(["../../etc/passwd", "--data-dir", str(DATA)]), 1)
        self.assertEqual(mod.main(["bad_id!", "--data-dir", str(DATA)]), 1)
        self.assertEqual(mod.main(["A-01", "--data-dir", str(DATA)]), 1)

        # If attempt has invalid exam_id, also rejected before reading pack
        aid = self.start()
        client.patch(f"/attempts/{aid}", json={"answers": {"A-01": 1}})
        client.post(f"/attempts/{aid}/submit")
        f = DATA / "attempts" / f"{aid}.json"
        data = json.loads(f.read_text())
        data["exam_id"] = "../evil-pack"
        f.write_text(json.dumps(data))

        self.assertEqual(mod.main([aid, "--data-dir", str(DATA)]), 1)

    def test_pack_asset_whitelists_raster_images_and_sets_security_headers(self):
        """0.7.0 finding 7: pack asset route serves any file type."""
        assets_dir = DATA / "packs" / "gat-b-demo.assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        (assets_dir / "valid.png").write_bytes(b"\x89PNG\r\n\x1a\n")
        (assets_dir / "vector.svg").write_text("<svg></svg>")
        (assets_dir / "page.html").write_text("<html></html>")

        # Raster image succeeds with required security headers
        r = client.get("/packs/gat-b-demo/assets/valid.png")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(r.headers.get("content-security-policy"), "default-src 'none'")

        # Non-raster files return 404
        self.assertEqual(client.get("/packs/gat-b-demo/assets/vector.svg").status_code, 404)
        self.assertEqual(client.get("/packs/gat-b-demo/assets/page.html").status_code, 404)

    def test_msq_grading_handles_mixed_types_without_raising(self):
        """0.7.0 finding 8: MSQ grading raises on mixed types."""
        q = {"type": "msq", "answer": [0, 1]}
        # Strings and ints should compare without raising TypeError
        self.assertTrue(grading.is_correct(q, [0, "1"]))
        self.assertFalse(grading.is_correct(q, [1, "1"]))
        self.assertTrue(grading.is_correct(q, ["0", "1"]))
        self.assertTrue(grading.is_correct({"type": "msq", "answer": [0, "1"]}, [0, 1]))

    def test_is_numeric_rejects_nan_and_inf_strings(self):
        """0.7.0 finding 9: _is_numeric accepts 'nan' / 'inf' / '-inf' strings."""
        q = {"type": "nat", "answer": "2.0"}
        for bad in ("nan", "inf", "-inf", "+inf", "NaN", "Infinity", "-Infinity", float("nan"), float("inf")):
            self.assertIsNotNone(pack_mod.answer_error(q, bad), f"expected error for {bad!r}")
        for good in ("2.0", "0", "-5.5", 3, 3.14):
            self.assertIsNone(pack_mod.answer_error(q, good), f"expected no error for {good!r}")

    def test_pack_validation_enforces_strict_question_ids(self):
        """0.7.0 finding 10: question ids are not schema-validated."""
        p = base_pack()
        p["questions"][0]["id"] = "A 01"
        errs = pack_mod.validate_pack(p)
        self.assertTrue(any("invalid id" in e for e in errs), errs)

        p = base_pack()
        p["questions"][0]["id"] = "Q@1"
        errs = pack_mod.validate_pack(p)
        self.assertTrue(any("invalid id" in e for e in errs), errs)

        p = base_pack()
        p["questions"][0]["id"] = 123
        errs = pack_mod.validate_pack(p)
        self.assertTrue(any("invalid id" in e for e in errs), errs)

        # Valid identifier with letters, digits, _, -
        p = base_pack()
        p["questions"][0]["id"] = "sec_1-Q01"
        self.assertEqual(pack_mod.validate_pack(p), [])

    def test_readme_documents_isolation_constraint(self):
        """0.7.0 finding 11: LLM bridge under plugins.isolation: host constraint documented."""
        readme = (ROOT / "README.md").read_text()
        self.assertIn("plugins.isolation: in_process", readme)


if __name__ == "__main__":
    unittest.main()
