"""Question-pack validation, sanitisation and summary. Pure functions, stdlib only."""
import json, re
from pathlib import Path

SCHEMA = "cbt-pack/1"
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
QTYPES = ("mcq", "msq", "nat")
HIDDEN_KEYS = ("answer", "explanation")

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
    for s in sections:
        sid = s.get("id")
        for k in ("id", "title"):
            if not s.get(k):
                errs.append(f"section missing {k}")
        for k in ("marks_correct", "marks_wrong"):
            if not isinstance(s.get(k), (int, float)) or isinstance(s.get(k), bool):
                errs.append(f"section {sid!r} needs numeric {k}")
        al = s.get("attempt_limit")
        if al is not None and (not isinstance(al, int) or isinstance(al, bool) or al <= 0):
            errs.append(f"section {sid!r} attempt_limit must be null or positive int")
        if not isinstance(s.get("question_count"), int) or s.get("question_count") <= 0:
            errs.append(f"section {sid!r} needs positive question_count")
    qs = pack.get("questions")
    if not isinstance(qs, list) or not qs:
        errs.append("questions must be a non-empty list")
        qs = []
    sec_ids = {s.get("id") for s in sections}
    seen, per_sec = set(), {}
    for i, q in enumerate(qs, 1):
        tag = f"question #{i} ({q.get('id', '?')})"
        qid = q.get("id")
        if not qid:
            errs.append(f"{tag}: missing id")
        elif qid in seen:
            errs.append(f"{tag}: duplicate id")
        else:
            seen.add(qid)
        if q.get("section") not in sec_ids:
            errs.append(f"{tag}: unknown section {q.get('section')!r}")
        else:
            per_sec[q["section"]] = per_sec.get(q["section"], 0) + 1
        if q.get("type") not in QTYPES:
            errs.append(f"{tag}: type must be one of {QTYPES}")
        if not str(q.get("text", "")).strip():
            errs.append(f"{tag}: empty text")
        if not q.get("source_url"):
            errs.append(f"{tag}: source_url is required (provenance rule)")
        t = q.get("type"); opts = q.get("options") or []; a = q.get("answer")
        if t == "mcq":
            if len(opts) < 2:
                errs.append(f"{tag}: mcq needs >= 2 options")
            if not isinstance(a, int) or isinstance(a, bool) or not (0 <= a < len(opts)):
                errs.append(f"{tag}: mcq answer must be an option index")
        elif t == "msq":
            if len(opts) < 2:
                errs.append(f"{tag}: msq needs >= 2 options")
            if (not isinstance(a, list) or not a or len(set(map(str, a))) != len(a)
                    or any(not isinstance(x, int) or isinstance(x, bool) or not (0 <= x < len(opts)) for x in a)):
                errs.append(f"{tag}: msq answer must be a non-empty list of distinct option indices")
        elif t == "nat":
            if isinstance(a, bool) or not isinstance(a, (int, float, str)) or a == "":
                errs.append(f"{tag}: nat answer must be a number or numeric string")
        for k in ("marks_correct", "marks_wrong"):
            if k in q and (isinstance(q[k], bool) or not isinstance(q[k], (int, float))):
                errs.append(f"{tag}: {k} override must be numeric")
    for s in sections:
        if per_sec.get(s.get("id"), 0) != s.get("question_count"):
            errs.append(f"section {s.get('id')!r}: question_count {s.get('question_count')} "
                        f"!= actual {per_sec.get(s.get('id'), 0)}")
    if not str(pack.get("provenance", "")).strip():
        errs.append("pack-level provenance string is required")
    if not pack.get("source_url"):
        errs.append("pack-level source_url is required")
    return errs

def load_pack_file(path):
    pack = json.loads(Path(path).read_text(encoding="utf-8"))
    errs = validate_pack(pack)
    if errs:
        raise ValueError("invalid pack: " + "; ".join(errs[:10]))
    return pack

def sanitize_pack(pack):
    """Questions without answers/explanations — the only view an in-progress attempt gets."""
    return {**pack, "questions": [{k: v for k, v in q.items() if k not in HIDDEN_KEYS}
                                  for q in pack["questions"]]}

def summarize(pack):
    return {"exam_id": pack["exam_id"], "title": pack.get("title", pack["exam_id"]),
            "year": pack.get("year"), "body": pack.get("body"),
            "duration_minutes": pack["pattern"]["duration_minutes"],
            "question_count": len(pack["questions"]),
            "sections": [{"id": s["id"], "title": s["title"],
                          "question_count": s["question_count"],
                          "attempt_limit": s.get("attempt_limit")} for s in pack["pattern"]["sections"]],
            "provenance": pack.get("provenance"), "source_url": pack.get("source_url")}
