"""Timeline: the event stream derives dwell, mind-changes and doubts — read-only."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("EXAM_DESK_DATA_DIR", tempfile.mkdtemp(prefix="cbt-tl-"))
sys.path.insert(0, str(ROOT))

from exam_desk import store, timeline  # noqa: E402
from tests.helpers import base_pack  # noqa: E402


def pack():
    return base_pack()


def events(*rows):
    return [{"t": 1000 + i * 10, **r} for i, r in enumerate(rows)]


class TimelineTests(unittest.TestCase):
    def test_dwell_sums_windows_and_revisits(self):
        # A: on screen 1000→1010 = 10s. Revisited on screen 1020→1030 (B's save) = 10s.
        # B: on screen 1010→1020 = 10s. Windows close on the switching event's time.
        stream = events({"type": "open", "qid": "A-01"}, {"type": "open", "qid": "A-02"},
                        {"type": "open", "qid": "A-01"}, {"type": "save", "qid": "A-02", "value": 1})
        v = timeline.build({"id": "x"}, pack(), stream)
        self.assertEqual(v["per_question"]["A-01"]["spent"], 20.0)     # both windows
        self.assertEqual(v["per_question"]["A-01"]["opens"], 2)        # revisited once
        self.assertEqual(v["per_question"]["A-02"]["spent"], 10.0)
        self.assertEqual(v["totals"]["covered"], 2)

    def test_save_inside_window_stays_its_time(self):
        # The save binds to the question on screen; the window ends only when
        # attention moves (the next event about another question).
        stream = events({"type": "open", "qid": "A-01"},
                        {"type": "save", "qid": "A-01", "value": 1, "prev": None},
                        {"type": "save", "qid": "A-02", "value": 0, "prev": None})
        v = timeline.build({"id": "x"}, pack(), stream)
        self.assertEqual(v["per_question"]["A-01"]["spent"], 20.0)
        self.assertEqual(v["per_question"]["A-01"]["changes"], 0)

    def test_mind_change_counts_only_when_prev_differs(self):
        stream = events({"type": "open", "qid": "A-01"},
                        {"type": "save", "qid": "A-01", "value": 1, "prev": None},
                        {"type": "save", "qid": "A-01", "value": 1, "prev": 1},
                        {"type": "save", "qid": "A-01", "value": 2, "prev": 1})
        v = timeline.build({"id": "x"}, pack(), stream)
        self.assertEqual(v["per_question"]["A-01"]["saves"], 3)
        self.assertEqual(v["per_question"]["A-01"]["changes"], 1)
        self.assertEqual(v["totals"]["changed"], 1)

    def test_doubt_adds_doubts_and_stays_in_window(self):
        stream = events({"type": "open", "qid": "A-01"},
                        {"type": "doubt", "qid": "A-01", "note": "why B?"})
        v = timeline.build({"id": "x"}, pack(), stream)
        self.assertEqual(v["per_question"]["A-01"]["doubts"], 1)
        self.assertEqual(v["totals"]["doubts"], 1)

    def test_empty_and_pre_stream_attempts_degrade_honestly(self):
        v = timeline.build({"id": "x"}, pack(), [])
        self.assertEqual(v["totals"]["events"], 0)
        self.assertIsNone(v["totals"]["median_spent"])
        self.assertEqual(timeline.metric_lines(v), [])
        # stream absent on disk is treated the same way (missing file)
        v2 = timeline.build({"id": "never-created"}, pack())
        self.assertEqual(v2["totals"]["events"], 0)

    def test_foreign_and_torn_lines_are_ignored(self):
        path = store.event_log_path("a-tlforeign")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('{"t":1,"type":"open","qid":"A-01"}\n'
                        'not json at all\n'
                        '{"t":11,"type":"open","qid":"ZZ-99"}\n'
                        '{"t":21,"type":"save","qid":"A-02","value":1,"prev":null}\n')
        v = timeline.build({"id": "a-tlforeign"}, pack())
        self.assertEqual(v["totals"]["events"], 3)                    # torn line skipped
        self.assertEqual(v["per_question"]["A-01"]["opens"], 1)       # ZZ-99 not a question
        path.unlink()

    def test_metric_lines_word_the_stream(self):
        stream = events({"type": "open", "qid": "A-01"},
                        {"type": "save", "qid": "A-01", "value": 1, "prev": None},
                        {"type": "save", "qid": "A-01", "value": 2, "prev": 1},
                        {"type": "doubt", "qid": "A-01", "note": "n"})
        v = timeline.build({"id": "x"}, pack(), stream)
        labels = [l for l, _ in timeline.metric_lines(v)]
        for want in ("Mind changes", "Asked the tutor", "Time on question"):
            self.assertIn(want, labels)

    def test_marker_and_event_cap(self):
        text = "\n".join(json.dumps({"t": i, "type": "open", "qid": "A-01"}) for i in range(60))
        path = store.event_log_path("a-tlcap")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text + "\n")
        self.assertEqual(len(store.read_events("a-tlcap")), 60)
        self.assertEqual(path.suffix, ".jsonl")
        path.unlink()


if __name__ == "__main__":
    unittest.main()
