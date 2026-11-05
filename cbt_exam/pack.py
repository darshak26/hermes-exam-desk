"""Question-pack validation, lint, sanitisation and summary.

Plain dicts in, plain dicts out, stdlib only.

Two design rules this module exists to enforce:

1. **One answer-shape rule.** `answer_error()` is used by the author-time
   validator *and* by the HTTP layer, so a pack can never pass validation and
   then be rejected mid-exam (or the reverse).
2. **Bad data is caught before it can break a grading run.** Anything the grader
   does arithmetic on (marks, tolerance) is validated here, because a pack that
   parses but blows up `grade_attempt` turns submit into a 500 that the attempt
   can never recover from.
"""
import json
import math
import re
from pathlib import Path

SCHEMA = "cbt-pack/1"
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
QTYPES = ("mcq", "msq", "nat")
DIFFICULTIES = ("easy", "medium", "hard")
# Never serialised to the client while an attempt is in progress.
HIDDEN_KEYS = ("answer", "explanation", "tolerance")

MIN_OPTION_ALNUM = 2      # lint: an option with fewer letters/digits is OCR debris


def is_clear(val):
    """True when `val` means "no answer": absent, null, empty list, blank string."""
    if val is None:
        return True
    if isinstance(val, str):
        return not val.strip()
    if isinstance(val, (int, float)):        # 0 and 0.0 are answers; checked before containers
        return False
    if isinstance(val, (list, tuple, dict, set)):
        return len(val) == 0
    return False


def is_answered(val):
    """An answer exists and carries information: 0 counts, ``""``/``" "`` do not."""
    return not is_clear(val)


def _is_number(val):
    return isinstance(val, (int, float)) and not isinstance(val, bool) and math.isfinite(val)


def _num_or_none(val):
    """float for any finite non-bool number, else None — narrows Optional cleanly."""
    return float(val) if _is_number(val) else None


def _is_numeric(val):
    if isinstance(val, bool):
        return False
    if isinstance(val, (int, float)):
        return math.isfinite(val)
    if isinstance(val, str):
        try:
            float(val)
            return True
        except ValueError:
            return False
    return False


def answer_error(q, val):
    """None when `val` is a legal student answer for question `q`, else a reason.

    Clearing is always legal: ``None`` / ``""`` / ``[]`` / whitespace removes a
    saved answer. The question keeps its answer_seq slot (the documented
    attempt-limit rule), it simply stops being answered.
    """
    if is_clear(val):
        return None
    t = q.get("type")
    opts = q.get("options") or []
    if t == "mcq":
        if not isinstance(val, int) or isinstance(val, bool) or not (0 <= val < len(opts)):
            return "answer must be an option index"
    elif t == "msq":
        if (not isinstance(val, list) or not val or len(set(map(str, val))) != len(val)
                or any(not isinstance(x, int) or isinstance(x, bool) or not (0 <= x < len(opts))
                       for x in val)):
            return "answer must be a non-empty list of distinct option indices"
    elif t == "nat":
        if not _is_numeric(val):
            return "answer must be a number or numeric string"
    else:
        return f"unknown question type {t!r}"
    return None


# --------------------------------------------------------------------------- #
# author-time validation
# --------------------------------------------------------------------------- #
def validate_pack(pack):
    """Return a list of human-readable errors; empty list = valid."""
    errs = []
    if not isinstance(pack, dict):
        return ["pack must be a JSON object"]
    if pack.get("schema") != SCHEMA:
        errs.append(f"schema must be '{SCHEMA}'")
    if not SLUG.match(str(pack.get("exam_id", ""))):
        errs.append("exam_id must be a lowercase slug like 'gat-b-2024'")

    pat = pack.get("pattern") or {}
    dur = pat.get("duration_minutes")
    if not isinstance(dur, int) or isinstance(dur, bool) or dur <= 0:
        errs.append("pattern.duration_minutes must be a positive int")
    sections = pat.get("sections")
    if not isinstance(sections, list) or not sections:
        errs.append("pattern.sections must be a non-empty list")
        sections = []
    seen_sec = set()
    for s in sections:
        if not isinstance(s, dict):
            errs.append("pattern.sections entries must be objects")
            continue
        sid = s.get("id")
        for k in ("id", "title"):
            if not s.get(k):
                errs.append(f"section missing {k}")
        if sid in seen_sec:
            errs.append(f"section id {sid!r} is duplicated")
        seen_sec.add(sid)
        for k in ("marks_correct", "marks_wrong"):
            if not _is_number(s.get(k)):
                errs.append(f"section {sid!r} needs numeric {k}")
        mc, mw = _num_or_none(s.get("marks_correct")), _num_or_none(s.get("marks_wrong"))
        if mc is not None and mc < 0:
            errs.append(f"section {sid!r} marks_correct must be >= 0")
        if mw is not None and mw > 0:
            errs.append(f"section {sid!r} marks_wrong must be <= 0 (write -0.5, not 0.5)")
        if "marks_unanswered" in s and s["marks_unanswered"] not in (0, 0.0, None):
            errs.append(f"section {sid!r} marks_unanswered must be 0 — unanswered never scores here")
        al = s.get("attempt_limit")
        if al is not None and (not isinstance(al, int) or isinstance(al, bool) or al <= 0):
            errs.append(f"section {sid!r} attempt_limit must be null or positive int")
        if not isinstance(s.get("question_count"), int) or s.get("question_count") <= 0:
            errs.append(f"section {sid!r} needs positive question_count")

    qs = pack.get("questions")
    if not isinstance(qs, list) or not qs:
        errs.append("questions must be a non-empty list")
        qs = []
    seen, per_sec = set(), {}
    for i, q in enumerate(qs, 1):
        if not isinstance(q, dict):
            errs.append(f"question #{i}: must be a JSON object")
            continue
        tag = f"question #{i} ({q.get('id', '?')})"
        qid = q.get("id")
        if not qid:
            errs.append(f"{tag}: missing id")
        elif qid in seen:
            errs.append(f"{tag}: duplicate id")
        else:
            seen.add(qid)
        if q.get("section") not in seen_sec:
            errs.append(f"{tag}: unknown section {q.get('section')!r}")
        else:
            per_sec[q["section"]] = per_sec.get(q["section"], 0) + 1
        if q.get("type") not in QTYPES:
            errs.append(f"{tag}: type must be one of {QTYPES}")
        if not str(q.get("text", "")).strip():
            errs.append(f"{tag}: empty text")
        if not q.get("source_url"):
            errs.append(f"{tag}: source_url is required (provenance rule)")
        if "difficulty" in q and q["difficulty"] not in DIFFICULTIES:
            errs.append(f"{tag}: difficulty must be one of {DIFFICULTIES}")
        opts = q.get("options")
        if opts is not None and not isinstance(opts, list):
            errs.append(f"{tag}: options must be a list")
            opts = None
        if q.get("type") in ("mcq", "msq") and (opts is None or len(opts) < 2):
            errs.append(f"{tag}: {q.get('type')} needs >= 2 options")
        if q.get("type") == "nat" and opts:
            errs.append(f"{tag}: nat questions must not carry options")
        if "answer" not in q:
            errs.append(f"{tag}: answer is required")
        else:
            why = answer_error(q, q["answer"])
            if why:
                errs.append(f"{tag}: {why}")
        if q.get("tolerance") is not None:
            tol = _num_or_none(q["tolerance"])
            if q.get("type") != "nat":
                errs.append(f"{tag}: tolerance is only valid on nat questions")
            elif tol is None or tol < 0:
                errs.append(f"{tag}: tolerance must be a number >= 0")
        for k in ("marks_correct", "marks_wrong"):
            if k not in q:
                continue
            v = _num_or_none(q[k])
            if v is None:
                errs.append(f"{tag}: {k} override must be numeric")
            elif k == "marks_wrong" and v > 0:
                errs.append(f"{tag}: marks_wrong override must be <= 0 (write -1, not 1)")
            elif k == "marks_correct" and v < 0:
                errs.append(f"{tag}: marks_correct override must be >= 0")

    for s in sections:
        if not isinstance(s, dict):
            continue
        actual = per_sec.get(s.get("id"), 0)
        if actual != s.get("question_count"):
            errs.append(f"section {s.get('id')!r}: question_count {s.get('question_count')} != actual {actual}")
    if not str(pack.get("provenance", "")).strip():
        errs.append("pack-level provenance string is required")
    if not pack.get("source_url"):
        errs.append("pack-level source_url is required")
    return errs


def lint_pack(pack):
    """Non-fatal warnings: the pack runs, but the questions look damaged.

    This is the OCR guard. Sourced papers arrive with junk options ("11001 . . :")
    and placeholder topics; both still grade, so they cannot be errors — but a
    human should see them before sitting the exam, not after a bad score.
    """
    warns = []
    title = str(pack.get("title") or "")
    for q in pack.get("questions") or []:
        qid = q.get("id", "?")
        topic = str(q.get("topic") or "")
        if topic and title and topic.startswith(title):
            warns.append(f"{qid}: topic {topic!r} looks like a placeholder — name the actual topic")
        opts = q.get("options") or []
        norm = [str(o).strip().lower() for o in opts]
        dupes = sorted({o for o in norm if norm.count(o) > 1})
        if dupes:
            warns.append(f"{qid}: duplicate option text {dupes!r}")
        for i, o in enumerate(opts):
            if sum(ch.isalnum() for ch in str(o)) < MIN_OPTION_ALNUM:
                warns.append(f"{qid}: option {chr(65 + i)} looks like OCR debris ({str(o)[:24]!r})")
        if len(str(q.get("text", "")).strip()) < 15:
            warns.append(f"{qid}: question text is very short ({str(q.get('text'))[:30]!r})")
    return warns


# --------------------------------------------------------------------------- #
# read-through cache
# --------------------------------------------------------------------------- #
_CACHE = {}          # path -> (stat_key, pack, sanitized_view)


def _stat_key(path):
    st = path.stat()
    return (st.st_mtime_ns, st.st_size)


def _cached(path):
    """(pack, sanitized_view) for `path`, revalidated against mtime+size.

    Every answer save used to re-read and re-validate the whole paper: a
    160-question pack is ~120 KB of JSON and validation walks all of it, on
    every PATCH. Keying on the file's stat means editing a pack on disk still
    takes effect on the next request. Both dicts are read-only to callers.
    """
    try:
        key = _stat_key(path)
    except OSError as e:
        raise KeyError(str(path)) from e
    hit = _CACHE.get(path)
    if hit and hit[0] == key:
        return hit[1], hit[2]
    try:
        pack = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as e:                     # includes JSONDecodeError
        raise ValueError(f"not valid JSON: {e}") from e
    errs = validate_pack(pack)
    if errs:
        raise ValueError("invalid pack: " + "; ".join(errs[:10]))
    entry = (key, pack, sanitize_pack(pack))
    _CACHE[path] = entry
    return entry[1], entry[2]


def load_pack_file(path):
    """Parsed + validated pack. KeyError if unreadable, ValueError if invalid."""
    return _cached(Path(path))[0]


def load_pack_view(path):
    """Answer-free copy of the pack — the only view an in-progress attempt gets."""
    return _cached(Path(path))[1]


def clear_cache():
    _CACHE.clear()


def sanitize_pack(pack):
    """Questions without answers/explanations/tolerances — the in-progress view."""
    return {**pack, "questions": [{k: v for k, v in q.items() if k not in HIDDEN_KEYS}
                                  for q in pack["questions"]]}


def summarize(pack):
    return {"exam_id": pack["exam_id"], "title": pack.get("title", pack["exam_id"]),
            "year": pack.get("year"), "body": pack.get("body"),
            "duration_minutes": pack["pattern"]["duration_minutes"],
            "question_count": len(pack["questions"]),
            "sections": [{"id": s["id"], "title": s["title"],
                          "question_count": s["question_count"],
                          "attempt_limit": s.get("attempt_limit"),
                          "marks_correct": s.get("marks_correct"),
                          "marks_wrong": s.get("marks_wrong")} for s in pack["pattern"]["sections"]],
            "provenance": pack.get("provenance"), "source_url": pack.get("source_url"),
            "warnings": lint_pack(pack)}
