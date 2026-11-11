"""The agent surface: toolset, pre_llm_call injection, /examdesk, blueprint.

Contract pins (from the plugin docs):
* registration mirrors the manifest's provides_tools/provides_hooks exactly;
* tools answer {"error": ...} instead of raising on bad input;
* the live-context tool speaks for assisted sittings only — a finished attempt
  answers live:false, and the review lane is exam_desk_attempt's job;
* the key is withheld until submission, exactly like the HTTP API keeps it;
* the injection fires only for the session the tutor chat is linked to.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ["EXAM_DESK_DATA_DIR"] = tempfile.mkdtemp(prefix="cbt-agent-test-")
sys.path.insert(0, str(ROOT))

import yaml  # noqa: E402

from exam_desk import agent_surface as surface  # noqa: E402
from exam_desk import store  # noqa: E402
from exam_desk import timeline as timeline_mod  # noqa: E402
from tests.helpers import base_pack  # noqa: E402

DATA = Path(os.environ["EXAM_DESK_DATA_DIR"])
MANIFEST = yaml.safe_load((ROOT / "plugin.yaml").read_text())


class FakeCtx:
    def __init__(self):
        self.tools = []
        self.hooks = []
        self.commands = []
        self.blueprints = []
        self.skills = []

    def register_tool(self, name=None, toolset=None, schema=None, handler=None, **kw):
        self.tools.append({"name": name, "toolset": toolset, "schema": schema, "handler": handler})

    def register_hook(self, name, fn, **kw):
        self.hooks.append((name, fn))

    def register_command(self, *args, **kw):
        self.commands.append((args, kw))

    def register_automation_blueprint(self, key, **kw):
        self.blueprints.append((key, kw))


def _seed_pack():
    (DATA / "packs").mkdir(parents=True, exist_ok=True)
    (DATA / "packs" / "gat-b-demo.json").write_text(json.dumps(base_pack()))


def _handler(name):
    for n, h, _schema in surface.toolset():
        if n == name:
            return h
    raise AssertionError(f"tool {name} not in the toolset")


def _out(tool, args=None):
    return json.loads(_handler(tool)(args))


class AgentSurfaceTests(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.get("EXAM_DESK_DATA_DIR")
        os.environ["EXAM_DESK_DATA_DIR"] = str(DATA)
        import shutil
        shutil.rmtree(DATA, ignore_errors=True)
        _seed_pack()

    def tearDown(self):
        if self._old is not None:
            os.environ["EXAM_DESK_DATA_DIR"] = self._old

    def _assisted(self, session_id="sess-1"):
        a = store.new_attempt(base_pack(), "assisted", assisted_session_id=session_id)
        store.write_live_context(a, store.get_pack(a["paper_id"]))
        return a

    # ---- registration mirrors the manifest ------------------------------- #
    def test_registration_mirrors_manifest(self):
        ctx = FakeCtx()
        surface.register_agent(ctx)
        self.assertEqual([t["name"] for t in ctx.tools], list(MANIFEST["provides_tools"]))
        self.assertEqual({ctx.hooks[0][0]}, {MANIFEST["provides_hooks"][0]})
        self.assertTrue(all(t["toolset"] == surface.TOOLSET for t in ctx.tools))
        self.assertEqual(ctx.commands[0][0][0], surface.COMMAND_NAME)
        self.assertEqual(ctx.blueprints[0][0], surface.BLUEPRINT_KEY)

    # ---- live context tool ----------------------------------------------- #
    def test_live_context_answers_no_sitting(self):
        out = _out("exam_desk_live")
        self.assertFalse(out["live"])
        self.assertIn("no live", out["reason"])

    def test_live_context_roundtrip(self):
        a = self._assisted()
        out = _out("exam_desk_live")
        self.assertTrue(out["live"])
        self.assertEqual(out["attempt_id"], a["id"])
        self.assertEqual(out["mode"], "assisted")
        self.assertIn("QUESTION A-01", out["context"])
        self.assertGreaterEqual(out["remaining_seconds"], 0)
        # submitting clears the mirror: the tool must answer live:false after
        a2 = store.get_attempt(a["id"])
        a2 = store.submit_attempt(a2, store.get_pack(a2["paper_id"]))
        out2 = _out("exam_desk_live")
        self.assertFalse(out2["live"])
        self.assertIn("ended", out2["reason"])

    # ---- attempt tool: the key follows the submission rule --------------- #
    def test_attempt_hides_key_while_live(self):
        a = self._assisted()
        out = _out("exam_desk_attempt", {"attempt_id": a["id"]})
        self.assertIsNone(out["result"])
        self.assertIn("withheld", out["note"])
        self.assertNotIn("questions", out)
        self.assertNotIn("key", json.dumps(out).lower() and out)   # no leaked fields

    def test_attempt_reveals_key_after_submit(self):
        a = store.new_attempt(base_pack(), "mock")
        aid = a["id"]
        with store.attempt_lock(aid):
            a = store.get_attempt(aid)
            a["answers"] = {"A-01": 1}
            a["answer_seq"] = ["A-01"]
            store.log_events(aid, [{"type": "open", "qid": "A-01"}])
        a = store.submit_attempt(a, store.get_pack("gat-b-demo"))
        out = _out("exam_desk_attempt", {"attempt_id": aid})
        self.assertEqual(out["status"], "submitted")
        self.assertEqual(out["score"], 1)
        rows = {row["id"]: row for row in out["questions"]}
        self.assertEqual(rows["A-01"]["verdict"], "correct")
        self.assertIn("key", rows["A-02"])                      # the wrong row carries the key
        # the behaviour block rides along once the sitting has any recorded event
        self.assertIn("behaviour", out)
        self.assertGreaterEqual(out["behaviour"]["events"], 1)

    def test_attempt_reports_option_a_answer_not_skipped(self):
        """A saved option A is index 0 — falsy, but an ANSWER, never a skip."""
        a = store.new_attempt(base_pack(), "mock")
        aid = a["id"]
        with store.attempt_lock(aid):
            a = store.get_attempt(aid)
            a["answers"] = {"A-01": 0}      # option A, and A-01's key is option B
            a["answer_seq"] = ["A-01"]
            store.log_events(aid, [{"type": "open", "qid": "A-01"}])
        a = store.submit_attempt(a, store.get_pack("gat-b-demo"))
        rows = {row["id"]: row for row in _out("exam_desk_attempt", {"attempt_id": aid})["questions"]}
        self.assertEqual(rows["A-01"]["verdict"], "wrong")
        self.assertEqual(rows["A-01"]["student"], "A")
        self.assertNotEqual(rows["A-02"]["student"] if "student" in rows["A-02"] else "skipped", "A")

    def test_attempt_unknown_and_bad_ids(self):
        self.assertIn("error", _out("exam_desk_attempt", {"attempt_id": "nope"}))
        self.assertIn("error", _out("exam_desk_attempt", {"attempt_id": "../escape"}))
        self.assertIn("error", _out("exam_desk_attempt", {}))

    # ---- doubt log: the one agent-initiated write ------------------------ #
    def test_log_doubt_roundtrip_and_guards(self):
        a = self._assisted()
        out = _out("exam_desk_doubt", {"attempt_id": a["id"], "question_id": "B-03", "note": "what does pH mean"})
        self.assertTrue(out["logged"])
        events = timeline_mod.read_stream(a["id"])
        self.assertEqual([e["type"] for e in events], ["doubt"])
        self.assertEqual(events[0]["qid"], "B-03")
        # a finished attempt refuses the write
        a2 = store.get_attempt(a["id"])
        a2 = store.submit_attempt(a2, store.get_pack(a2["paper_id"]))
        out2 = _out("exam_desk_doubt", {"attempt_id": a["id"], "question_id": "A-01", "note": "late"})
        self.assertIn("error", out2)
        self.assertIn("submitted", out2["error"])
        # invalid ids answer the error shape instead of raising
        self.assertIn("error", _out("exam_desk_doubt", {"attempt_id": "../x", "question_id": "A-01"}))
        self.assertIn("error", _out("exam_desk_doubt", {"attempt_id": a["id"], "question_id": "a b"}))

    # ---- topics + papers -------------------------------------------------- #
    def test_papers_lists_and_marks_key_status(self):
        out = _out("exam_desk_papers")
        self.assertEqual(len(out["papers"]), 1)
        row = out["papers"][0]
        self.assertEqual(row["paper_id"], "gat-b-demo")
        self.assertEqual(row["key_status"], "official")
        self.assertEqual(row["questions"], 6)

    def test_topics_empty_then_refuses_nothing(self):
        out = _out("exam_desk_topics")
        self.assertEqual(out["topics"], [])
        self.assertIn("error", _out("exam_desk_attempt", {}))     # sanity: the error shape stays the shape

    # ---- pre_llm_call: injection follows the tutor session --------------- #
    def test_injection_by_session(self):
        a = self._assisted("sess-tutor")
        text = surface.on_pre_llm_call("sess-tutor")
        self.assertIn("EXAM DESK", text)
        self.assertIn("question A-01", text)
        self.assertIn("answer key is not", text)                 # the no-coaching line rides along
        self.assertIsNone(surface.on_pre_llm_call("sess-other"), "another chat gets nothing")
        # expire the sitting → nothing to inject
        a2 = store.get_attempt(a["id"])
        a2["started_at"] = a2["started_at"] - 10_000
        (store.attempts_dir() / f"{a['id']}.json").write_text(json.dumps(store.migrate_attempt(a2)))
        self.assertIsNone(surface.on_pre_llm_call("sess-tutor"))

    def test_injection_silent_when_no_session(self):
        self.assertIsNone(surface.on_pre_llm_call(""), )

    # ---- /examdesk --------------------------------------------------------- #
    def test_command_reports_the_desk(self):
        text = surface.on_command_examdesk("")
        self.assertIn("gat-b-demo", text)
        self.assertIn("papers:", text)
        a = self._assisted()
        text2 = surface.on_command_examdesk("")
        self.assertIn("running:", text2)
        self.assertIn(a["id"], text2)


if __name__ == "__main__":
    unittest.main()
