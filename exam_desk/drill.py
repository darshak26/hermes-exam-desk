"""Drill papers — a paper derived from the misses of one finished attempt.

The result page already separates wrong / skipped / not-counted from correct;
this module turns that separation into a `cbt-pack/1` file so the misses can be
re-sat inside the same panel, scored by the same grader. Design rules:

* one attempt → one paper. The drill holds the source's verdict rows where
  verdict != "correct"; nothing else moves in.
* the key is inherited, never invented. Answers, explanations and tolerances
  are byte-copies of the source pack's, and `key_status` follows the source —
  a key the source cannot prove is one the drill cannot prove either.
* the drill writes nothing back. It is a new pack file; the source attempt and
  its result stay untouched.
"""
import json
import math
import time
from copy import deepcopy

from . import pack as pack_mod

# A drill is practice, not a fresh examination: section attempt-limits exist to
# ration a question bank across 160 answers, and a drill has no bank — clearing
# every limit is the point.
_MIN_MINUTES = 5
_MINUTES_PER_DRILL_QUESTION = 1.5


def miss_rows(attempt):
    """(id, verdict) for every question the grader did not mark correct, in
    the source paper's order."""
    rows = (attempt.get("result") or {}).get("questions") or []
    return {r["id"]: r["verdict"] for r in rows
            if r.get("verdict") and r["verdict"] != "correct"}


def build_drill_pack(source, attempt, drill_id, clock=None):
    """A new pack dict from `source` (pack dict) and a finished `attempt`.

    Raises ValueError when the attempt has no misses — there is nothing to drill.
    """
    misses = miss_rows(attempt)
    if not misses:
        raise ValueError("nothing to drill: every question was correct")
    by_id = {q["id"]: q for q in source["questions"]}
    questions = []
    for q in source["questions"]:
        verdict = misses.get(q["id"])
        if verdict is None:
            continue
        dq = deepcopy(q)
        # The verdict matters to the student later: why a question is here.
        dq["provenance"] = (
            f"{str(q.get('provenance') or q.get('source_url') or 'source pack')} — "
            f"drilled after attempt {attempt.get('id', '?')} ({verdict})"
        )
        questions.append(dq)

    sections = deepcopy(source["pattern"]["sections"])
    for s in sections:
        s["question_count"] = sum(1 for q in questions if q["section"] == s["id"])
        s["attempt_limit"] = None
    sections = [s for s in sections if s["question_count"] > 0]

    n = len(questions)
    minutes = max(_MIN_MINUTES, math.ceil(n * _MINUTES_PER_DRILL_QUESTION))
    now_n = float(clock if clock is not None else time.time())
    key = source.get("key_status")
    return {
        "schema": pack_mod.SCHEMA,
        "exam_id": drill_id,
        "family": pack_mod.pack_family(source),
        "kind": "drill",
        "title": f"{source.get('title', source['exam_id'])} — drill ({n} misses)",
        "language": source.get("language"),
        "provenance": (
            f"Drill derived from attempt {attempt.get('id', '?')} of {source['exam_id']} "
            f"({n} misses: wrong, skipped and not-counted). The source paper's answers, "
            f"explanations and tolerances are kept unchanged; questions appear in the "
            f"source paper's order."
        ),
        "pattern": {"duration_minutes": minutes, "sections": sections},
        "questions": questions,
        **({"scope": source["scope"]} if source.get("scope") else {}),
        **({"year": source["year"]} if "year" in source else {}),
        **({"key_status": key} if key and key != "official" else {}),
        "derived": True,                       # a fact about the file, not a validator field
        "derived_from": {"exam_id": source["exam_id"], "attempt_id": attempt.get("id"),
                         "built_at": now_n},
    }


def _free_id(exam_id):
    """`<exam_id>-drill` (then `-2`, `-3`, …) as a slug that names no existing pack."""
    from . import store as store_mod
    base = store_mod.packs_dir()
    taken = {p.stem for p in base.glob("*.json")}
    cand, n = f"{exam_id}-drill", 1
    while cand in taken:
        n += 1
        cand = f"{exam_id}-drill-{n}"
    return cand


def install_drill(source, attempt):
    """Validate `build_drill_pack` output and file it; returns (drill_id, pack)."""
    drill_id = _free_id(str(source["exam_id"]))
    pack = build_drill_pack(source, attempt, drill_id)
    errs = pack_mod.validate_pack(pack)
    if errs:                                   # never install something the grader will 500 on
        raise ValueError("derived drill is invalid: " + "; ".join(errs[:5]))
    from . import store as store_mod
    out = store_mod.packs_dir() / f"{drill_id}.json"
    out.write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding="utf-8")
    pack_mod.clear_cache()
    try:
        pack_mod.load_pack_file(out)           # read it back through the real path
    except (ValueError, KeyError):
        out.unlink(missing_ok=True)
        raise
    return drill_id, pack
