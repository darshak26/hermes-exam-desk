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
os.environ.setdefault("CBT_EXAM_DATA_DIR", tempfile.mkdtemp(prefix="cbt-reg-"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "dashboard"))

import plugin_api                                    # noqa: E402
from fastapi import FastAPI                          # noqa: E402
from fastapi.testclient import TestClient            # noqa: E402

from cbt_exam import grading, pack as pack_mod, store  # noqa: E402
from tests.helpers import base_pack                   # noqa: E402

app = FastAPI()
app.include_router(plugin_api.router)
client = TestClient(app, raise_server_exceptions=False)
DATA = Path(os.environ["CBT_EXAM_DATA_DIR"])


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
        self._old = os.environ.get("CBT_EXAM_DATA_DIR")
        os.environ["CBT_EXAM_DATA_DIR"] = str(DATA)
        for p in DATA.rglob("*"):
            if p.is_file():
                p.unlink()
        pack_mod.clear_cache()
        write_pack(base_pack())

    def tearDown(self):
        if self._old is not None:
            os.environ["CBT_EXAM_DATA_DIR"] = self._old

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

        m = types.ModuleType("cbt_exam_ctx_bridge")
        setattr(m, "ctx", types.SimpleNamespace(llm=Fake()))
        sys.modules["cbt_exam_ctx_bridge"] = m
        try:
            aid = self.start()
            client.post(f"/attempts/{aid}/submit")
            self.assertEqual(client.post(f"/attempts/{aid}/evaluate").status_code, 200)
            self.assertEqual(client.post(f"/attempts/{aid}/evaluate").status_code, 200)
            self.assertEqual(len(calls), 1)                 # second call is free
            client.post(f"/attempts/{aid}/evaluate?force=true")
            self.assertEqual(len(calls), 2)
        finally:
            sys.modules.pop("cbt_exam_ctx_bridge", None)

    def _fake_llm(self, behaviour):
        """Install a fake bridge for the duration of one test."""
        import types
        calls = []

        class Fake:
            def complete_structured(self, **kw):
                calls.append(kw)
                return behaviour(kw)

        m = types.ModuleType("cbt_exam_ctx_bridge")
        setattr(m, "ctx", types.SimpleNamespace(llm=Fake()))
        sys.modules["cbt_exam_ctx_bridge"] = m
        self.addCleanup(lambda: sys.modules.pop("cbt_exam_ctx_bridge", None))
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
        client.post(f"/attempts/{aid}/submit")
        r = client.post(f"/attempts/{aid}/evaluate")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(len(calls), 3)
        self.assertEqual(r.json()["data"]["study_plan"], ["revise"])

    def test_evaluate_refuses_before_submit(self):
        aid = self.start()
        self.assertEqual(client.post(f"/attempts/{aid}/evaluate").status_code, 409)


if __name__ == "__main__":
    unittest.main()
