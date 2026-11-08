"""The topics ledger — what the evaluations keep finding wrong, over time.

An `evaluation.weak_topics` row dies inside one attempt unless something keeps
it. This module is that something: after a successful evaluation the HTTP half
folds each flagged topic into `data_root()/topics.json`, keyed per paper. The
panel reads the summary back under the paper's card, and the review/reporting
layers can say "seen on 3 sittings, still appearing" instead of re-deriving the
pattern from raw attempt files.

Details that matter:

* the ledger is an index of *evidence*, not a judgment — nothing here invents
  a topic; every row carries the attempt ids that backed it;
* the display name is the first spelling the model used (the key is a casefold
  of it), so repeated "photosynthesis"-vs-"Photosynthesis" rows merge;
* writes are atomic under a process-local lock, in the same spirit as attempt
  files — a crashed ledger update costs at most the last evaluation, and a
  corrupt file degrades to an empty ledger rather than breaking evaluation.
"""
import json
import os
import threading
import time

SCHEMA = "cbt-topics/1"
PRIORITIES = ("high", "medium", "low")
# exam_id keys inside the same file the packs live beside.
NAME = "topics.json"
_LOCK = threading.Lock()


def path():
    from . import store as store_mod
    return store_mod.data_root() / NAME


def _fresh():
    return {"schema": SCHEMA, "exams": {}}


def _read():
    """The whole ledger, tolerating absence and corruption (fresh dict on both)."""
    try:
        data = json.loads(path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _fresh()
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        return _fresh()
    if not isinstance(data.get("exams"), dict):
        data["exams"] = {}
    return data


def _write(data):
    """Atomic rename, no fsync — the ledger is derived from history, not primary."""
    path().parent.mkdir(parents=True, exist_ok=True)
    tmp = path().with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path())


def _weakest(rows):
    order = {p: i for i, p in enumerate(PRIORITIES)}
    ranks = [order.get(r, len(PRIORITIES)) for r in rows]
    return PRIORITIES[min(ranks)] if ranks else "low"


def record(exam_id, attempt_id, weak_topics, now=None):
    """Fold one evaluation's `weak_topics` rows (list of dicts with topic /
    evidence / priority) into the ledger. Idempotent per topic+attempt."""
    if not isinstance(weak_topics, list) or not str(exam_id or "").strip():
        return 0
    folded, now_n = 0, float(now if now is not None else time.time())
    with _LOCK:
        data = _read()
        exams = data["exams"]
        book = exams.setdefault(str(exam_id), {})
        for row in weak_topics:
            if not isinstance(row, dict):
                continue
            topic = str(row.get("topic") or "").strip()
            if not topic:
                continue
            key = topic.casefold()
            entry = book.setdefault(key, {
                "topic": topic, "hits": 0, "attempts": [],
                "first_seen": now_n, "last_seen": 0.0,
            })
            if attempt_id not in entry["attempts"]:     # one evaluation, not N retries
                entry["attempts"].append(attempt_id)
                entry["hits"] += 1
                entry["first_seen"] = min(entry["first_seen"], now_n)
                entry["last_seen"] = max(entry["last_seen"], now_n)
                folded += 1
            entry["priority"] = _weakest([entry.get("priority", "low"),
                                          str(row.get("priority") or "low")])
            if isinstance(row.get("evidence"), str) and row["evidence"].strip():
                entry["evidence"] = row["evidence"].strip()
        _write(data)
    return folded


def summarize(exam_id=None, limit=6):
    """The panel-facing view: the most recent topics overall or for one paper.

    Rows come back newest-first with the paper id attached, so a caller sorting
    for one card does not need the raw file.
    """
    data = _read()
    rows = []
    for eid, book in data["exams"].items():
        if exam_id is not None and eid != exam_id:
            continue
        for entry in book.values():
            rows.append({
                "exam_id": eid, "topic": entry.get("topic", ""),
                "hits": entry.get("hits", 0), "last_seen": entry.get("last_seen", 0.0),
                "priority": entry.get("priority", "low"),
                "attempts": entry.get("attempts", []),
            })
    rows.sort(key=lambda r: (-r["last_seen"], r["topic"]))
    return rows[:max(0, limit)]


def forget(exam_id):
    """Drop one paper's rows — called when that paper's data is being removed."""
    if not str(exam_id or "").strip():
        return False
    with _LOCK:
        data = _read()
        book = data["exams"].pop(str(exam_id), None)
        if book is None:
            return False
        _write(data)
    return True
