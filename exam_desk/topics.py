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

from . import pack as pack_mod

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
    """The whole ledger, tolerating absence and corruption (fresh dict on both).

    Migration on read: folds keys that are paper slugs into their family,
    merging counts, attempt lists and papers lists.
    """
    try:
        data = json.loads(path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _fresh()
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        return _fresh()
    raw_exams = data.get("exams")
    if not isinstance(raw_exams, dict):
        data["exams"] = {}
        return data

    migrated = {}
    for raw_eid, raw_book in raw_exams.items():
        if not isinstance(raw_book, dict):
            continue
        fam = pack_mod.family_of(raw_eid)
        fam_book = migrated.setdefault(fam, {})
        for tkey, entry in raw_book.items():
            if not isinstance(entry, dict):
                continue
            entry_papers = list(entry.get("papers") or [])
            if not entry_papers:
                entry_papers = [raw_eid]

            if tkey not in fam_book:
                fam_entry = dict(entry)
                fam_entry["papers"] = sorted(set(entry_papers))
                fam_entry["attempts"] = list(entry.get("attempts") or [])
                fam_entry["hits"] = len(fam_entry["attempts"]) if fam_entry["attempts"] else entry.get("hits", 0)
                fam_book[tkey] = fam_entry
            else:
                fam_entry = fam_book[tkey]
                seen_atts = set(fam_entry.get("attempts", []))
                for a in entry.get("attempts", []):
                    if a not in seen_atts:
                        fam_entry.setdefault("attempts", []).append(a)
                        seen_atts.add(a)
                fam_entry["hits"] = len(fam_entry.get("attempts", []))
                all_papers = set(fam_entry.get("papers", [])) | set(entry_papers)
                fam_entry["papers"] = sorted(all_papers)
                fam_entry["first_seen"] = min(fam_entry.get("first_seen", entry.get("first_seen", 0.0)),
                                              entry.get("first_seen", 0.0))
                fam_entry["last_seen"] = max(fam_entry.get("last_seen", 0.0),
                                             entry.get("last_seen", 0.0))
                fam_entry["priority"] = _weakest([fam_entry.get("priority", "low"),
                                                  entry.get("priority", "low")])
                if not fam_entry.get("evidence") and entry.get("evidence"):
                    fam_entry["evidence"] = entry["evidence"]

    data["exams"] = migrated
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
    eid = str(exam_id).strip()
    fam = pack_mod.family_of(eid)
    folded, now_n = 0, float(now if now is not None else time.time())
    with _LOCK:
        data = _read()
        exams = data["exams"]
        book = exams.setdefault(fam, {})
        for row in weak_topics:
            if not isinstance(row, dict):
                continue
            topic = str(row.get("topic") or "").strip()
            if not topic:
                continue
            key = topic.casefold()
            entry = book.setdefault(key, {
                "topic": topic, "hits": 0, "attempts": [], "papers": [],
                "first_seen": now_n, "last_seen": 0.0,
            })
            entry.setdefault("papers", [])
            if eid not in entry["papers"]:
                entry["papers"].append(eid)
                entry["papers"].sort()

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
    """The panel-facing view: the most recent topics overall or for one paper/family.

    Rows come back newest-first with the family id attached, so a caller sorting
    for one card does not need the raw file.
    """
    data = _read()
    fam_filter = pack_mod.family_of(exam_id) if exam_id is not None else None
    rows = []
    for fam, book in data["exams"].items():
        if fam_filter is not None and fam != fam_filter:
            continue
        for entry in book.values():
            rows.append({
                "exam_id": fam,
                "family": fam,
                "papers": sorted(set(entry.get("papers", []))),
                "topic": entry.get("topic", ""),
                "hits": entry.get("hits", 0),
                "last_seen": entry.get("last_seen", 0.0),
                "priority": entry.get("priority", "low"),
                "attempts": entry.get("attempts", []),
            })
    rows.sort(key=lambda r: (-r["last_seen"], r["topic"]))
    return rows[:max(0, limit)]


def forget(exam_id):
    """Drop one paper or family's rows — called when that paper's data is being removed."""
    if not str(exam_id or "").strip():
        return False
    eid = str(exam_id).strip()
    fam = pack_mod.family_of(eid)
    with _LOCK:
        data = _read()
        book = data["exams"].pop(eid, None)
        if book is None and fam != eid:
            book = data["exams"].pop(fam, None)
        if book is None:
            return False
        _write(data)
    return True
