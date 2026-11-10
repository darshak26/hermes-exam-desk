#!/usr/bin/env python3
"""Print a finished exam-desk attempt for agent review.

stdlib only, any python (like validate_pack.py). Read-only by design: the agent
reviews the record, it never reaches state, so this takes only an id and prints.
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))   # plugin root → import exam_desk
from exam_desk import timeline as timeline_mod  # noqa: E402
from exam_desk.store import _ID, migrate_attempt  # noqa: E402

DATA = os.environ.get("EXAM_DESK_DATA_DIR") or os.path.expanduser(
    "~/.hermes/plugin-data/exam-desk")


def main(argv):
    ap = argparse.ArgumentParser(description="Show one finished exam-desk attempt for review.")
    ap.add_argument("attempt_id")
    ap.add_argument("--data-dir", default=DATA, help="plugin data root (for tests)")
    a = ap.parse_args(argv)

    if not _ID.match(str(a.attempt_id or "")):
        print(f"FAIL invalid attempt id {a.attempt_id!r}")
        return 1

    atts = Path(a.data_dir) / "attempts"
    f = atts / f"{a.attempt_id}.json"
    if not f.is_file():
        print(f"FAIL no attempt named {a.attempt_id} under {atts}")
        return 1
    att = migrate_attempt(json.loads(f.read_text(encoding="utf-8")))
    if att.get("status") != "submitted":
        print(f"FAIL attempt {a.attempt_id} has status {att.get('status')!r} — only "
              "submitted attempts are reviewable")
        return 1

    paper_id = att.get("paper_id")
    if not _ID.match(str(paper_id or "")):
        print(f"FAIL invalid paper id {paper_id!r}")
        return 1

    pack_path = Path(a.data_dir) / "packs" / f"{paper_id}.json"
    if not pack_path.is_file():
        print(f"FAIL the paper vanished; attempt {a.attempt_id} is orphaned")
        return 1
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    r = att.get("result")

    print(f"ATTEMPT {att['id']} | paper {paper_id} ({att.get('exam')}) — {pack.get('title', '')}")
    print(f"MODE {att.get('mode')} | submitted {att.get('submitted_at')}")
    if att.get('mode') == 'assisted':
        sid = att.get('assisted_session_id')
        if sid:
            print(f"ASSISTED CHAT: an assistant was in the room — its transcript is the Hermes "
                  f"session {sid}. For questions the student asked about, go read what you "
                  f"told them there (via session search on that id); it is evidence about the "
                  f"gap, but its answers are NOT independent evidence the student knew it.")
        else:
            print("ASSISTED CHAT: none linked (this attempt predates session linking, or the"
                  " sitting was started outside the panel).")
    review_ids = att.get('review_session_ids') or []
    if review_ids:
        print(f"REVIEW CHATS DISCUSSING THIS ATTEMPT: {len(review_ids)} (ids: {', '.join(review_ids)})")
    print(f"PAPER provenance: {pack.get('provenance')}")
    print(f"PAPER key_status: {pack.get('key_status', 'absent (official)')}")
    if r:
        print(f"SCORE {r['score']} | TOTALS {json.dumps(r['totals'])}")

    ev = (att.get("evaluation") or {}).get("data")
    if ev:
        print("STORED AI ANALYSIS (identical to what the result page shows):")
        print(json.dumps(ev, ensure_ascii=False, indent=1))
    else:
        print("STORED AI ANALYSIS: none — 'Analyse this attempt' on the result page creates one")

    tl = timeline_mod.build(att, pack)
    t = tl.get("totals", {})
    if t.get("events"):
        print("BEHAVIOUR (recorded live: opens/saves/marks by the panel, doubts by the tutor)")
        print(f"  events {t['events']} | mind changes {t['changed']} | doubts asked {t['doubts']}")
        if t.get("median_spent") is not None:
            print(f"  time on question: median {round(t['median_spent'])}s, "
                  f"longest {round(t.get('longest_spent') or 0)}s over the {t['covered']} touched")
        for sid, sec in (tl.get("sections") or {}).items():
            if sec.get("dwell"):
                print(f"  time in section {sid}: {timeline_mod.fmt_sec(sec['dwell'])} "
                      f"across {sec['questions']} questions")

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
        pq = (tl.get("per_question") or {}).get(q["id"]) or {}
        if t.get("events") and (pq.get("spent") or pq.get("opens")):
            bits = [f"on screen {round(pq['spent'])}s" if pq.get("spent") else None,
                    f"{pq['opens']} visit(s)" if pq.get("opens") else None,
                    "answer changed before the final save" if pq.get("changes") else None,
                    f"asked the tutor {pq['doubts']}x" if pq.get("doubts") else None]
            bits = [b for b in bits if b]
            if bits:
                print(f"    behaviour: {'; '.join(bits)}")
        if q.get("explanation"):
            print(f"    explanation: {q['explanation']}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
