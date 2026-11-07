"""Scoring for an attempt. Pure functions — grading never does I/O or knows the clock.

Two invariants:

* it never raises on a question it can't parse (a malformed answer key must not
  be able to strand a submitted attempt), and
* "answered" means the same thing here as in the HTTP layer — it comes from
  `pack.is_answered`, so a whitespace NAT entry is skipped, not penalised.
"""
from .pack import is_answered


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _tolerance(q):
    """Declared tolerance, or 0.0. Never raises: an unusable value means exact match."""
    tol = _num(q.get("tolerance"))
    return tol if tol is not None and tol >= 0 else 0.0


def is_correct(q, given):
    t = q.get("type")
    if t == "mcq":
        return given == q.get("answer")
    if t == "msq":
        key = q.get("answer")
        return (isinstance(given, list) and isinstance(key, list)
                and {str(x) for x in given} == {str(x) for x in key})
    if t == "nat":
        a, g = _num(q.get("answer")), _num(given)
        if a is None or g is None:
            # Non-numeric keys exist (GATE "2 to 3" range answers): fall back to
            # an exact string match rather than crashing the whole grading run.
            return str(given).strip() == str(q.get("answer")).strip()
        return abs(g - a) <= _tolerance(q) + 1e-9
    return False


def marks_for(q, section):
    """Per-question override wins; otherwise the section default."""
    return (q.get("marks_correct", section["marks_correct"]),
            q.get("marks_wrong", section["marks_wrong"]))


def grade_attempt(pack, attempt):
    """attempt needs: answers {qid: value}, answer_seq [qid in first-save order], marked [qid]."""
    sections = {s["id"]: s for s in pack["pattern"]["sections"]}
    qmap = {q["id"]: q for q in pack["questions"]}

    # attempt_limit counts a candidate's first N saved answers per section; a cleared
    # answer keeps its slot (it stays in answer_seq and grades as skipped).
    per_section_seq = {}
    for qid in attempt.get("answer_seq", []):
        q = qmap.get(qid)
        if q is None:
            continue                       # pack edited mid-exam: never crash on a stale id
        per_section_seq.setdefault(q["section"], []).append(qid)
    counted = set()
    for sec_id, ids in per_section_seq.items():
        limit = sections[sec_id].get("attempt_limit")
        counted.update(ids if limit is None else ids[:limit])

    marked = set(attempt.get("marked", []))
    answers = attempt.get("answers", {})
    totals: dict[str, float] = {"score": 0.0, "correct": 0, "wrong": 0, "skipped": 0, "not_counted": 0}
    sec_stats: dict[str, dict[str, float]] = {sid: dict(totals) for sid in sections}
    detail = []

    for q in pack["questions"]:
        sec = sections[q["section"]]
        given = answers.get(q["id"])
        answered = is_answered(given)
        ok = answered and is_correct(q, given)
        c, w = marks_for(q, sec)
        row = {"id": q["id"], "section": q["section"], "type": q["type"], "topic": q.get("topic"),
               "answered": answered, "marked": q["id"] in marked, "correct": bool(ok),
               "counted": q["id"] in counted, "awarded": 0.0, "marks": [c, w]}
        if answered and q["id"] not in counted:
            verdict, awarded = "not_counted", 0.0
        elif answered and ok:
            verdict, awarded = "correct", c
        elif answered:
            verdict, awarded = "wrong", w
        else:
            verdict, awarded = "skipped", 0.0
        row["verdict"] = verdict
        row["awarded"] = awarded
        totals[verdict] += 1
        sec_stats[q["section"]][verdict] += 1
        totals["score"] += awarded
        sec_stats[q["section"]]["score"] += awarded
        detail.append(row)

    totals["score"] = round(totals["score"], 2)
    for st in sec_stats.values():
        st["score"] = round(st["score"], 2)
    return {"score": totals["score"], "totals": totals, "sections": sec_stats, "questions": detail}
