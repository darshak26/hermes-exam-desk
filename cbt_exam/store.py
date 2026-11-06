"""Packs (read-through, cached) + attempts (atomic, locked writes) under the data root.

Storage is deliberately boring: one JSON file per pack, one per attempt. What is
not boring is the failure handling:

* writes are `<name>.<pid>.<rand>.tmp` → fsync → `os.replace`, so a crash can
  never leave a half-written attempt and two writers can never share a temp file;
* one in-process lock per attempt serialises read-modify-write, because FastAPI
  serves sync endpoints from a thread pool and lost updates are silent;
* a corrupt attempt file is reported, never fatal — one bad file must not take
  the whole history list down.
"""
import json
import os
import re
import threading
import time
import uuid
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path

from . import grading, pack as pack_mod

ENV_DATA_DIR = "CBT_EXAM_DATA_DIR"
_ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")


# --------------------------------------------------------------------------- #
# paths
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=8)
def _root_for(override):
    if override:
        return Path(override)
    from plugins.plugin_storage import plugin_data_dir
    return plugin_data_dir("cbt-exam")


def data_root():
    """Data root, resolved once per override value (tests flip the env var)."""
    return _root_for(os.environ.get(ENV_DATA_DIR))


def packs_dir():
    return data_root() / "packs"


def attempts_dir():
    return data_root() / "attempts"


def live_dir():
    return data_root() / "live"


def _file_in(directory, ident, kind):
    """`<directory>/<ident>.json`, refusing anything that is not a plain id.

    HTTP routing already blocks `../` in a single path segment; this is the same
    guarantee for every other caller (and for future ones).
    """
    if not _ID.match(str(ident or "")):
        raise KeyError(f"{kind} id {ident!r} is not a plain id")
    return directory / f"{ident}.json"


# --------------------------------------------------------------------------- #
# packs
# --------------------------------------------------------------------------- #
def list_packs():
    """Every pack, with invalid ones marked instead of raising."""
    out = []
    d = packs_dir()
    if not d.exists():
        return out
    for p in sorted(d.glob("*.json")):
        try:
            out.append(pack_mod.load_pack_file(p))
        except (ValueError, KeyError) as e:
            out.append({"exam_id": p.stem, "invalid": str(e)})
    return out


def get_pack(exam_id):
    return pack_mod.load_pack_file(_file_in(packs_dir(), exam_id, "pack"))


def get_pack_view(exam_id):
    """The answer-free copy — what an in-progress attempt is allowed to see."""
    return pack_mod.load_pack_view(_file_in(packs_dir(), exam_id, "pack"))


# --------------------------------------------------------------------------- #
# attempts
# --------------------------------------------------------------------------- #
def _atomic_write(path, data, durable=False):
    """Write `data` so a reader (or a crash) can only ever see the old file or the new one.

    `durable=True` also fsyncs before the rename. Measured here: 0.31 ms without,
    1.12 ms with (this VPS's fsync is slow). Routine answer saves skip it — the
    rename is already atomic, so a crash can only cost the last answer, never
    corrupt the file. Milestones (create, submit, abandon, evaluation) pay for it,
    because those are the writes you must not lose.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(data, indent=1))
            if durable:
                fh.flush()
                os.fsync(fh.fileno())
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


def _read_attempt(path):
    a = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(a, dict) or not a.get("id") or not a.get("status"):
        raise ValueError("not an attempt record")
    return a


_LOCKS = {}
_LOCKS_GUARD = threading.Lock()


@contextmanager
def attempt_lock(aid):
    """Serialise read-modify-write on one attempt.

    Re-entrant on purpose: a handler that holds the lock can call `_load`, which
    may itself need to grade an expired attempt. One small lock per attempt id,
    kept for the process lifetime (attempts are counted in dozens, not millions).
    """
    with _LOCKS_GUARD:
        lock = _LOCKS.setdefault(aid, threading.RLock())
    with lock:
        yield


def new_attempt(pack, mode):
    now = time.time()
    a = {"id": f"a-{uuid.uuid4().hex[:10]}", "exam_id": pack["exam_id"], "mode": mode,
         "status": "in_progress", "started_at": now,
         "duration_seconds": pack["pattern"]["duration_minutes"] * 60,
         "answers": {}, "answer_seq": [], "marked": [], "visited": [], "current": None,
         "result": None, "evaluation": None,
         "submitted_at": None, "updated_at": now}
    _atomic_write(_file_in(attempts_dir(), a["id"], "attempt"), a, durable=True)
    return a


def get_attempt(aid):
    try:
        return _read_attempt(_file_in(attempts_dir(), aid, "attempt"))
    except FileNotFoundError:
        raise KeyError(aid)


def save_attempt(a, durable=False):
    a["updated_at"] = time.time()
    _atomic_write(_file_in(attempts_dir(), a["id"], "attempt"), a, durable=durable)
    return a


def remaining_seconds(a, now=None):
    now = time.time() if now is None else now
    return a["duration_seconds"] - (now - a["started_at"])


def is_expired(a, now=None):
    return a.get("status") == "in_progress" and remaining_seconds(a, now) <= 0


def iter_attempts(limit=None):
    """Yield ``(attempt, None)`` for readable files, ``(None, {'id','error'})`` for corrupt ones.

    Newest first by file mtime, so `limit` only reads the newest files instead of
    parsing every attempt ever taken.
    """
    d = attempts_dir()
    if not d.exists():
        return
    def _mtime(p):
        try:
            return p.stat().st_mtime
        except OSError:
            return 0.0
    paths = sorted(d.glob("*.json"), key=_mtime, reverse=True)
    if limit:
        paths = paths[:limit]
    for p in paths:
        try:
            yield _read_attempt(p), None
        except (OSError, ValueError) as e:
            yield None, {"id": p.stem, "error": str(e)}


def list_attempts(limit=None):
    """Readable attempts only — a corrupt file never breaks the list."""
    return [a for a, err in iter_attempts(limit) if a is not None]


def submit_attempt(a, pack, now=None):
    """Grade and persist. Idempotent: a submitted attempt is returned untouched."""
    if a.get("status") == "submitted":
        return a
    a["result"] = grading.grade_attempt(pack, a)
    a["status"] = "submitted"
    a["submitted_at"] = time.time() if now is None else now
    a["current"] = None
    return save_attempt(a, durable=True)


def abandon_attempt(a, now=None):
    """Discard a live attempt without grading it. History keeps the row."""
    if a.get("status") != "in_progress":
        return a
    a["status"] = "abandoned"
    a["submitted_at"] = time.time() if now is None else now
    a["current"] = None
    save_attempt(a, durable=True)
    clear_live_context(a)
    return a


# --------------------------------------------------------------------------- #
# live exam context (what the exam-assist skill reads)
# --------------------------------------------------------------------------- #
def delete_attempt(aid):
    """Remove a finished attempt and its live context. Refuses a live one.

    Returns True when a file was removed. History is the user's to prune: an
    attempt list that only ever grows is unusable after a week of practice.
    """
    a = get_attempt(aid)                      # KeyError when it does not exist
    if a.get("status") == "in_progress":
        raise ValueError("cannot delete an attempt that is still running")
    path = _file_in(attempts_dir(), aid, "attempt")
    try:
        path.unlink()
    except FileNotFoundError:
        return False
    clear_live_context(a)
    return True


def prune_attempts(statuses=("abandoned",), exam_id=None):
    """Delete finished attempts in bulk. Returns the ids removed.

    `statuses` is intersected with the deletable set — a live attempt is never
    touched, whatever the caller asks for.
    """
    wanted = {s for s in statuses if s != "in_progress"}
    removed = []
    for a, err in iter_attempts():
        if err is not None or a is None:
            continue
        if a.get("status") not in wanted:
            continue
        if exam_id and a.get("exam_id") != exam_id:
            continue
        try:
            if delete_attempt(a["id"]):
                removed.append(a["id"])
        except (KeyError, ValueError):
            continue
    return removed


def current_question_id(a, pack):
    """The question on screen: explicit `current`, else the last visited, else the first."""
    qs = pack.get("questions") or []
    ids = {q["id"] for q in qs}
    if a.get("current") in ids:
        return a["current"]
    for qid in reversed(a.get("visited") or []):
        if qid in ids:
            return qid
    return qs[0]["id"] if qs else None


def live_file(aid):
    return live_dir() / f"{aid}.md"


def write_live_context(a, pack, qid=None):
    """Mirror the question on screen so the exam-assist skill can answer doubts about it.

    Best-effort: returns None instead of breaking the exam flow.
    """
    try:
        if a.get("status") != "in_progress":
            return None
        qid = qid or current_question_id(a, pack)
        q = next((x for x in pack.get("questions") or [] if x["id"] == qid), None)
        if q is None:
            return None
        sec = next((s for s in pack["pattern"]["sections"] if s["id"] == q["section"]), {})
        c, w = grading.marks_for(q, sec)
        answers = a.get("answers") or {}
        saved = answers.get(q["id"])
        lines = [
            "# CBT exam — live question context",
            f"attempt: {a['id']}   exam: {a.get('exam_id')}   mode: {a.get('mode')}",
            f"remaining: {max(0, int(remaining_seconds(a)))}s",
            "",
            f"QUESTION {q['id']} ({q['section']}, {q['type'].upper()}, topic: {q.get('topic', 'n/a')})",
            f"marks: +{c} / {w}",
            q["text"],
            "",
        ]
        for i, o in enumerate(q.get("options") or []):
            lines.append(f"{chr(65 + i)}) {o}")
        lines.append("")
        lines.append("student's SAVED answer: " + repr(saved) if saved is not None
                     else "student has not saved an answer to this question yet")
        lines.append("")
        lines.append("Note: the saved selection above is what was last SAVED — what is on screen now may differ.")
        d = live_dir()
        d.mkdir(parents=True, exist_ok=True)
        path = live_file(a["id"])
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        _prune_live(keep=a["id"])
        return path
    except OSError:
        return None


def _prune_live(keep):
    """Delete live files whose attempt is no longer running, so a stale file can't
    be mistaken for the current question. Cheap: only runs when >1 file exists."""
    d = live_dir()
    try:
        files = [p for p in d.glob("*.md") if p.stem != keep]
    except OSError:
        return
    for p in files:
        try:
            if get_attempt(p.stem).get("status") != "in_progress":
                p.unlink()
        except (KeyError, OSError, ValueError):
            try:
                p.unlink()                     # orphaned file: the attempt is gone
            except OSError:
                pass


def clear_live_context(a):
    try:
        live_file(a["id"]).unlink()
    except FileNotFoundError:
        pass
    except OSError:
        pass                                    # a leftover file must never 500 a submit
