import sys, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tests.helpers import base_pack
from cbt_exam.grading import grade_attempt
from cbt_exam.prompts import (ASK_SYSTEM, ask_messages, evaluation_input,
                              validate_evaluation)

PACK = base_pack()
Q = {q["id"]: q for q in PACK["questions"]}

def make_attempt(answers, seq, marked=(), assists=()):
    a = {"answers": dict(answers), "answer_seq": list(seq), "marked": list(marked),
         "mode": "assisted" if assists else "exam", "assist_log": list(assists)}
    a["result"] = grade_attempt(PACK, a)
    return a

class PromptTests(unittest.TestCase):
    def test_ask_messages_no_history(self):
        msgs = ask_messages(Q["A-01"], 1, "why not 3?", PACK)
        self.assertEqual(len(msgs), 2)
        self.assertEqual(msgs[0], {"role": "system", "content": ASK_SYSTEM})
        self.assertIn("currently selected: 1", msgs[1]["content"])
        self.assertIn("why not 3?", msgs[1]["content"])
        self.assertIn(Q["A-01"]["text"], msgs[1]["content"])

    def test_ask_messages_no_selection(self):
        msgs = ask_messages(Q["A-01"], None, "help", PACK)
        self.assertIn("no answer selected yet", msgs[1]["content"])

    def test_ask_messages_history_replayed_capped_at_6(self):
        hist = [{"asked": f"q{i}", "reply": f"r{i}"} for i in range(8)]
        msgs = ask_messages(Q["A-01"], None, "next doubt", PACK, history=hist)
        self.assertEqual(len(msgs), 1 + 2 * 6 + 1)   # system + last 6 pairs + final
        self.assertEqual(msgs[1]["content"], "q2")    # oldest 2 pairs dropped
        self.assertEqual(msgs[-2]["role"], "assistant")
        self.assertEqual(msgs[-1]["role"], "user")

    def test_ask_messages_reattaches_current_question(self):
        hist = [{"asked": "about another question", "reply": "older answer"}]
        msgs = ask_messages(Q["B-03"], None, "follow-up", PACK, history=hist)
        self.assertIn(Q["B-03"]["text"], msgs[-1]["content"])
        self.assertIn("B-03", msgs[-1]["content"])

    def test_evaluation_input(self):
        a = make_attempt({"A-01": 1, "A-02": 2}, ["A-01", "A-02"],
                         assists=[{"question_id": "A-02", "asked": "why not 4?", "reply": "hint", "model": "m", "at": 0}])
        blob = evaluation_input(PACK, a)
        self.assertIn("  A-01 | mcq | Physics | verdict=correct | awarded=1 | marks=[1, -0.5]", blob)
        self.assertIn("ASSISTED DOUBTS", blob)
        self.assertIn("A-02 (Chemistry): why not 4?", blob)
        self.assertIn("H?", blob)          # wrong question's text present
        self.assertNotIn("2+2?", blob)     # correct question's text absent
        a2 = make_attempt({"B-01": 0, "B-02": [0, 2], "B-03": "2"}, ["B-01", "B-02", "B-03"])
        blob2 = evaluation_input(PACK, a2)
        self.assertIn("pH of 0.01 M HCl?", blob2)   # not-counted gets full text (strategy feedback)
        self.assertIn("verdict=not_counted", blob2)

    def test_validate_evaluation(self):
        self.assertIsNone(validate_evaluation(None))
        self.assertIsNone(validate_evaluation({}))
        good = {"overall_comment": "fine", "sections": [{"section_id": "A", "comment": "ok"}],
                "weak_topics": [{"topic": "t", "evidence": "e", "priority": "high"}],
                "wrong_answer_notes": [{"question_id": "A-02", "note": "n"}],
                "study_plan": ["revise x"]}
        out = validate_evaluation(good)
        self.assertEqual(out["overall_comment"], "fine")
        self.assertEqual(out["sections"], [{"section_id": "A", "comment": "ok"}])
        self.assertEqual(out["weak_topics"][0]["priority"], "high")
        # malformed entries are dropped, not crashed
        bad = {"overall_comment": "x", "sections": ["nope"],
               "weak_topics": [{"topic": "t", "evidence": "e", "priority": "urgent"}],
               "wrong_answer_notes": [{"question_id": "A"}],
               "study_plan": [1, "ok"]}
        out2 = validate_evaluation(bad)
        self.assertEqual(out2["sections"], [])
        self.assertEqual(out2["weak_topics"], [])
        self.assertEqual(out2["wrong_answer_notes"], [])
        self.assertEqual(out2["study_plan"], ["ok"])

if __name__ == "__main__":
    unittest.main()
