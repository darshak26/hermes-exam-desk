#!/usr/bin/env python3
"""Append a mid-exam tutor doubt event to an attempt's behaviour stream.

stdlib only. Called by the assist skill when the student asks about a
question on screen. Appends an event to `attempts/<aid>.log.jsonl` without
modifying the attempt record itself.
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

_ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_QID = re.compile(r"^[A-Za-z0-9_-]+$")

DATA = os.environ.get("EXAM_DESK_DATA_DIR") or os.path.expanduser(
    "~/.hermes/plugin-data/exam-desk")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Log a tutor doubt event for an attempt.")
    ap.add_argument("pos_attempt_id", nargs="?", help="Attempt ID (positional)")
    ap.add_argument("pos_qid", nargs="?", help="Question ID (positional)")
    ap.add_argument("pos_note", nargs="?", help="Note describing doubt (positional)")
    ap.add_argument("--attempt-id", dest="opt_attempt_id", help="Attempt ID")
    ap.add_argument("--qid", dest="opt_qid", help="Question ID")
    ap.add_argument("--note", dest="opt_note", help="Note describing doubt")
    ap.add_argument("--data-dir", default=DATA, help="plugin data root (for tests)")
    args = ap.parse_args(argv)

    aid = args.opt_attempt_id or args.pos_attempt_id
    qid = args.opt_qid or args.pos_qid
    note = args.opt_note or args.pos_note

    if not aid or not _ID.match(str(aid)):
        print(f"FAIL invalid attempt id {aid!r}", file=sys.stderr)
        return 1
    if not qid or not _QID.match(str(qid)):
        print(f"FAIL invalid question id {qid!r}", file=sys.stderr)
        return 1
    if note is None:
        note = ""

    path = Path(args.data_dir) / "attempts" / f"{aid}.log.jsonl"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        entry = {
            "t": time.time(),
            "type": "doubt",
            "qid": qid,
            "note": str(note),
        }
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, separators=(",", ":")) + "\n")
    except OSError as e:
        print(f"FAIL could not write doubt event: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
