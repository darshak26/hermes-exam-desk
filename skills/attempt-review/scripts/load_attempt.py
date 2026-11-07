#!/usr/bin/env python3
"""Print a finished exam-desk attempt for agent review.

stdlib only, any python (like validate_pack.py). Read-only by design: the agent
reviews the record, it never reaches state, so this takes only an id and prints.
"""
import json
import argparse
import os
import sys
from pathlib import Path

DATA = os.environ.get("EXAM_DESK_DATA_DIR") or os.path.expanduser(
    "~/.hermes/plugin-data/exam-desk")


def main(argv):
    ap = argparse.ArgumentParser(description="Show one finished exam-desk attempt for review.")
    ap.add_argument("attempt_id")
    ap.add_argument("--data-dir", default=DATA, help="plugin data root (for tests)")
    a = ap.parse_args(argv)

    atts = Path(a.data_dir) / "attempts"
    f = atts / f"{a.attempt_id}.json"
    if not f.is_file():
        print(f"FAIL no attempt named {a.attempt_id} under {atts}")
        return 1
    att = json.loads(f.read_text(encoding="utf-8"))
    if att.get("status") != "submitted":
        print(f"FAIL attempt {a.attempt_id} has status {att.get('status')!r} — only "
              "submitted attempts are reviewable")
        return 1

    pack_path = Path(a.data_dir) / "packs" / f"{att['exam_id']}.json"
    if not pack_path.is_file():
        print(f"FAIL the pack vanished; attempt {a.attempt_id} is orphaned")
        return 1
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    r = att.get("result")

    print(f"ATTEMPT {att['id']} | pack {att['exam_id']} — {pack.get('title', '')}")
    print(f"MODE {att.get('mode')} | submitted {att.get('submitted_at')}")
    print(f"PACK provenance: {pack.get('provenance')}")
    print(f"PACK key_status: {pack.get('key_status', 'absent (official)')}")
    if r:
        print(f"SCORE {r['score']} | TOTALS {json.dumps(r['totals'])}")

    ev = (att.get("evaluation") or {}).get("data")
    if ev:
        print("STORED AI ANALYSIS (identical to what the result page shows):")
        print(json.dumps(ev, ensure_ascii=False, indent=1))
    else:
        print("STORED AI ANALYSIS: none — 'Analyse this attempt' on the result page creates one")

    print("QUESTION REVIEW (text, options, student's answer, keyed answer, explanation)")
    rows = {row["id"]: row for row in (r or {}).get("questions", [])}
    for q in pack["questions"]:
        row = rows.get(q["id"], {})
        verdict = row.get("verdict", "—")
        given = (att.get("answers") or {}).get(q["id"])
        answer = q.get("answer")
        print(f"  {q['id']} [{q.get('type')}] - {verdict} | topic: {q.get('topic')}"
              f" | marks {row.get('marks')} awarded {row.get('awarded')}")
        print(f"    Q: {q['text']}")
        for i, o in enumerate(q.get("options") or []):
            letter = chr(65 + i)
            mark = ""
            if answer is not None and i in (answer if isinstance(answer, list) else [answer]):
                mark += "  <-- key"
            if given is not None and i in (given if isinstance(given, list) else [given]):
                mark += "  <-- student"
            print(f"      {letter}) {o}{mark}")
        if isinstance(answer, list):
            keystr = ",".join(chr(65 + i) for i in sorted(answer))
        else:
            keystr = f"{chr(65+answer)}" if isinstance(answer, int) and q.get("options") else answer
        if isinstance(given, list):
            student = ",".join(chr(65 + i) for i in sorted(given)) or "skipped"
        elif given in (None, "", []):
            student = "skipped"
        else:
            student = f"{chr(65+given)}" if isinstance(given, int) and q.get("options") else given
        print(f"    correct: {keystr} | student: {student}")
        if q.get("explanation"):
            print(f"    explanation: {q['explanation']}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
