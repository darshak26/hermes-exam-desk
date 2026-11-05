"""Scoring for an attempt. Pure functions — grading never does I/O or knows the clock."""

def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None

def is_correct(q, given):
    t = q["type"]
    if t == "mcq":
        return given == q["answer"]
    if t == "msq":
        return isinstance(given, list) and sorted(set(given)) == sorted(set(q["answer"]))
    if t == "nat":
        a, g = _num(q["answer"]), _num(given)
        if a is None or g is None:
            return str(given).strip() == str(q["answer"]).strip()
        tol = float(q.get("tolerance") or 0.0)
        return abs(g - a) <= tol + 1e-9
    raise ValueError(f"unknown question type {t!r}")

def marks_for(q, section):
    return (q.get("marks_correct", section["marks_correct"]),
            q.get("marks_wrong", section["marks_wrong"]))

def grade_attempt(pack, attempt):
    """attempt needs: answers {qid: value}, answer_seq [qid in first-save order], marked [qid]."""
    sections = {s["id"]: s for s in pack["pattern"]["sections"]}
    qmap = {q["id"]: q for q in pack["questions"]}
    per_section_seq = {}
    for qid in attempt.get("answer_seq", []):
        if qid not in qmap:
            continue  # pack edited mid-exam: never crash grading on a stale id
        sec = qmap[qid]["section"]
        per_section_seq.setdefault(sec, []).append(qid)
    counted = set()
    for sec_id, ids in per_section_seq.items():
        limit = sections[sec_id].get("attempt_limit")
        counted.update(ids if limit is None else ids[:limit])
    marked = set(attempt.get("marked", []))
    totals = {"score": 0.0, "correct": 0, "wrong": 0, "skipped": 0, "not_counted": 0}
    sec_stats = {s["id"]: dict(totals) for s in pack["pattern"]["sections"]}
    detail = []
    for q in pack["questions"]:
        sec = sections[q["section"]]
        given = attempt.get("answers", {}).get(q["id"])
        answered = given is not None and given != "" and given != []
        ok = answered and is_correct(q, given)
        c, w = marks_for(q, sec)
        row = {"id": q["id"], "section": q["section"], "type": q["type"], "topic": q.get("topic"),
               "answered": answered, "marked": q["id"] in marked, "correct": bool(ok),
               "counted": q["id"] in counted, "awarded": 0.0, "marks": [c, w]}
        if answered and q["id"] not in counted:
            row["verdict"] = "not_counted"
            key = "not_counted"
        elif answered and ok:
            row["verdict"] = "correct"; row["awarded"] = c; key = "correct"
        elif answered:
            row["verdict"] = "wrong"; row["awarded"] = w; key = "wrong"
        else:
            row["verdict"] = "skipped"; key = "skipped"
        totals[key] += 1; sec_stats[q["section"]][key] += 1
        totals["score"] += row["awarded"]; sec_stats[q["section"]]["score"] += row["awarded"]
        detail.append(row)
    totals["score"] = round(totals["score"], 2)
    for st in sec_stats.values():
        st["score"] = round(st["score"], 2)
    return {"score": totals["score"], "totals": totals, "sections": sec_stats, "questions": detail}
