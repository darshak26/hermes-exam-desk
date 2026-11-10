import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from exam_desk.grading import grade_attempt, is_correct
from tests.helpers import base_pack

PACK = base_pack()
Q = {q["id"]: q for q in PACK["questions"]}

def attempt(answers, seq, marked=()):
    return {"answers": dict(answers), "answer_seq": list(seq), "marked": list(marked)}

def row(result, qid):
    return next(r for r in result["questions"] if r["id"] == qid)

class GradingTests(unittest.TestCase):
    def test_mcq_marks_defaults(self):
        r = grade_attempt(PACK, attempt({"A-01": 1, "A-02": 2}, ["A-01", "A-02"]))
        a1, a2, a3 = row(r, "A-01"), row(r, "A-02"), row(r, "A-03")
        self.assertEqual((a1["verdict"], a1["awarded"]), ("correct", 1))
        self.assertEqual((a2["verdict"], a2["awarded"]), ("wrong", -0.5))
        self.assertEqual((a3["verdict"], a3["awarded"]), ("skipped", 0))

    def test_attempt_limit_third_answered_not_counted(self):
        # limit = 2 in section B; answer B-01, B-02, B-03 → B-03 not counted, 0 marks, but correctness still reported
        r = grade_attempt(PACK, attempt({"B-01": 0, "B-02": [0, 2], "B-03": "2"},
                                         ["B-01", "B-02", "B-03"]))
        b3 = row(r, "B-03")
        self.assertEqual(b3["verdict"], "not_counted")
        self.assertEqual(b3["awarded"], 0)
        self.assertTrue(b3["correct"])

    def test_attempt_limit_follows_answer_order(self):
        # answering in order B-02, B-03, B-01 makes B-01 (the 3rd saved) the not-counted one
        r = grade_attempt(PACK, attempt({"B-02": [0, 2], "B-03": "2", "B-01": 0},
                                         ["B-02", "B-03", "B-01"]))
        self.assertEqual(row(r, "B-01")["verdict"], "not_counted")
        self.assertEqual(row(r, "B-02")["verdict"], "correct")
        self.assertEqual(row(r, "B-03")["verdict"], "correct")

    def test_per_question_mark_override(self):
        p = base_pack()
        p["questions"][3]["marks_correct"] = 4   # B-01
        r = grade_attempt(p, attempt({"B-01": 0}, ["B-01"]))
        self.assertEqual(row(r, "B-01")["awarded"], 4)

    def test_msq_exact_match_and_partial_is_wrong(self):
        r = grade_attempt(PACK, attempt({"B-02": [0, 2]}, ["B-02"]))
        self.assertEqual(row(r, "B-02")["verdict"], "correct")
        r2 = grade_attempt(PACK, attempt({"B-02": [0]}, ["B-02"]))
        self.assertEqual(row(r2, "B-02")["verdict"], "wrong")
        self.assertEqual(row(r2, "B-02")["awarded"], -1)
        self.assertTrue(is_correct(Q["B-02"], [2, 0]))   # set match, order-free
        self.assertFalse(is_correct(Q["B-02"], 0))       # non-list is wrong

    def test_nat_float_tolerance_and_string_fallback(self):
        self.assertTrue(is_correct(Q["B-03"], "2.0"))
        self.assertTrue(is_correct(Q["B-03"], "2.04"))   # within tolerance 0.05
        self.assertFalse(is_correct(Q["B-03"], "2.2"))
        self.assertFalse(is_correct(Q["B-03"], 2.5))
        r = grade_attempt(PACK, attempt({"B-03": "2.2"}, ["B-03"]))
        self.assertEqual(row(r, "B-03")["verdict"], "wrong")

    def test_answered_and_marked_counts_as_answered(self):
        r = grade_attempt(PACK, attempt({"A-01": 1}, ["A-01"], marked=["A-01"]))
        a1 = row(r, "A-01")
        self.assertEqual(a1["verdict"], "correct")
        self.assertTrue(a1["marked"])
        # marked WITHOUT answering is not evaluated (official NTA rule)
        r2 = grade_attempt(PACK, attempt({}, [], marked=["A-02"]))
        self.assertEqual(row(r2, "A-02")["verdict"], "skipped")
        self.assertTrue(row(r2, "A-02")["marked"])

    def test_cleared_answer_still_consumed_slot(self):
        # B-01 answered-then-cleared (absent from answers, present in answer_seq) uses a slot:
        # with limit 2 and sequence [B-01, B-02, B-03], B-03 is pushed out of the counted set.
        r = grade_attempt(PACK, attempt({"B-02": [0, 2], "B-03": "2"},
                                         ["B-01", "B-02", "B-03"]))
        self.assertEqual(row(r, "B-01")["verdict"], "skipped")
        self.assertEqual(row(r, "B-03")["verdict"], "not_counted")

    def test_unknown_qid_in_answer_seq_is_ignored(self):
        # pack edited mid-exam must not crash grading
        r = grade_attempt(PACK, attempt({"A-01": 1}, ["A-01", "GONE-1"]))
        self.assertEqual(row(r, "A-01")["verdict"], "correct")

    def test_total_can_be_negative(self):
        r = grade_attempt(PACK, attempt({"A-01": 2, "A-02": 2, "A-03": 2},
                                         ["A-01", "A-02", "A-03"]))
        self.assertEqual(r["score"], -1.5)

    def test_ground_truth_demo_script_scores_2_5(self):
        # A-01 correct(+1), A-02 wrong(−0.5), A-03 skip, B-01 correct(+3), B-02 wrong(−1), B-03 correct-but-not-counted → 2.5
        r = grade_attempt(PACK, attempt(
            {"A-01": 1, "A-02": 2, "B-01": 0, "B-02": [0], "B-03": "2"},
            ["A-01", "A-02", "B-01", "B-02", "B-03"]))
        self.assertEqual(r["score"], 2.5)
        self.assertEqual((r["totals"]["correct"], r["totals"]["wrong"],
                          r["totals"]["skipped"], r["totals"]["not_counted"]), (2, 2, 1, 1))
        self.assertEqual(r["sections"]["A"]["score"], 0.5)
        self.assertEqual(r["sections"]["B"]["score"], 2.0)

if __name__ == "__main__":
    unittest.main()
