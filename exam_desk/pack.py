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
import hashlib
import json
import math
import re
from pathlib import Path, PurePosixPath

from .vocab import KIND_VALUES

SCHEMA = "cbt-pack/1"
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
QID = re.compile(r"^[A-Za-z0-9_-]+$")
QTYPES = ("mcq", "msq", "nat")
DIFFICULTIES = ("easy", "medium", "hard")
KINDS = KIND_VALUES
# How much the pack's `answer` fields can be trusted. Absent means "official"
# (every hand-written pack, and the bundled demo), so this is opt-out only.
# `self-authored` marks an AI-drafted paper: the model that wrote the questions
# also wrote the key, so nothing of it is an exam fact.
KEY_STATUSES = ("official", "unverified", "self-authored", "random")
# Never serialised to the client while an attempt is in progress.
HIDDEN_KEYS = ("answer", "explanation", "tolerance")

YR = re.compile(r"-(?:19|20)\d{2}$")
_SUPERSEDED = re.compile(r"-superseded-[0-9a-f]+$")
_DRILL = re.compile(r"-drill(?:-\d+)?$")
_SHIFT_AFTER_YEAR = re.compile(r"(?<=-(?:19|20)\d{2})-(?:shift|set|slot)\d+$")


def exam_of(paper_id):
    """The exam slug for a paper slug — year, shift/set/slot, drill and superseded
    suffixes stripped from the right."""
    slug = str(paper_id or "")
    while True:
        m = _SUPERSEDED.search(slug)
        if m:
            slug = slug[:m.start()]
            continue
        m = _DRILL.search(slug)
        if m:
            slug = slug[:m.start()]
            continue
        m = _SHIFT_AFTER_YEAR.search(slug)
        if m:
            slug = slug[:m.start()]
            continue
        m = YR.search(slug)
        if m:
            slug = slug[:m.start()]
            continue
        break
    return slug


def pack_exam(pack):
    """The pack's exam: the stated `exam` when present, else exam_of(paper_id).

    The stated field wins. Slug parsing is a legacy fallback for packs written
    before `exam` existed — no other code is allowed to read a slug for meaning.
    """
    if isinstance(pack, dict):
        ex = pack.get("exam")
        if ex:
            return ex
        return exam_of(pack.get("paper_id"))
    return exam_of(pack)


def derived_kind(paper_id):
    """The kind a slug declares — drill, pyq, practice — or None when it declares none.

    Read by `summarize` for packs that state no `kind`, and by the validator to
    check that a stated kind agrees with the paper's own slug.
    """
    slug = str(paper_id or "")
    if "-drill" in slug:
        return "drill"
    if re.search(r"-(?:19|20)\d{2}(?:-|$)", slug):
        return "pyq"
    if re.search(r"(?:^|-)practice(?:-|$)", slug):
        return "practice"
    return None


def pack_hash(pack):
    """12 hex chars of sha256 over the pack's canonical JSON."""
    raw = json.dumps(pack, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]

# Lint: option text that is a layout/OCR artifact rather than an answer.
# Brevity is not evidence — a numeric MCQ legitimately answers "0", "−1", "√3"
# or "π/y" — so the test reads the shape of the string, never its length.
_DEBRIS_PUNCT = set(".,;:|_~^%$#@!?\\")
_SEPARATOR_RUN = re.compile(r"[.,;:][\s.,;:]*[.,;:]")
_SYMBOL_RUN = re.compile(r"([^\w\s])\1{3,}")


def looks_like_ocr_debris(text):
    """True when an option string is an extraction artifact, not an answer.

    Sourced PDFs leak rule lines, leader dots and column colons into the option
    text. Those show up as characters with nothing to say, so flag when

      * nothing alphanumeric survives ("| |", "...", "?"),
      * two separators sit next to each other (". . :", ".,"), or
      * noise punctuation is more than half of what is visible.

    A one-character answer ("0", "2", "−y") passes every one of those tests, and
    must: IIT JAM asks for them. Length is never the signal.
    """
    s = str(text).strip()
    if not s:
        return True
    if not any(ch.isalnum() for ch in s):
        return True
    if _SEPARATOR_RUN.search(s) or _SYMBOL_RUN.search(s):
        return True
    visible = [ch for ch in s if not ch.isspace()]
    junk = sum(1 for ch in visible if ch in _DEBRIS_PUNCT)
    return junk * 2 > len(visible)


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
            return math.isfinite(float(val))
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
MEDIA_TYPES = ("image", "table", "text")


def _media_error(tag, block, where):
    """One media block → an error string, or None when it is usable.

    Images are addressed two ways: an http(s) URL the browser fetches, or a path
    relative to `packs/<paper_id>.assets/`. A relative path may not climb out of
    that directory — the asset route relies on this too.
    """
    if not isinstance(block, dict):
        return f"{tag}: {where} entries must be objects"
    kind = block.get("type")
    if kind not in MEDIA_TYPES:
        return f"{tag}: {where} type must be one of {MEDIA_TYPES}"
    if kind == "image":
        src = block.get("src")
        if not isinstance(src, str) or not src.strip():
            return f"{tag}: {where} image needs src"
        if "://" in src:
            if not re.match(r"^https?://", src):
                return f"{tag}: {where} image src must be http(s) or a path relative to <exam>.assets/"
        elif src.startswith("/") or ".." in PurePosixPath(src).parts or "\\" in src:
            return f"{tag}: {where} image src must stay inside <exam>.assets/ ({src!r})"
        if block.get("caption") is not None and not isinstance(block.get("caption"), str):
            return f"{tag}: {where} image caption must be a string"
        if block.get("alt") is not None and not isinstance(block.get("alt"), str):
            return f"{tag}: {where} image alt must be a string"
        return None
    if kind == "table":
        head, rows = block.get("head"), block.get("rows")
        if head is not None and (not isinstance(head, list) or not all(isinstance(h, str) for h in head)):
            return f"{tag}: {where} table head must be a list of strings"
        if not isinstance(rows, list) or not rows:
            return f"{tag}: {where} table needs a non-empty rows list"
        width = len(head) if isinstance(head, list) else None
        for ri, row in enumerate(rows, 1):
            if not isinstance(row, list):
                return f"{tag}: {where} table row {ri} must be a list"
            if width is not None and len(row) != width:
                return f"{tag}: {where} table row {ri} has {len(row)} cells, head has {width}"
        if width is None:
            widths = {len(r) for r in rows if isinstance(r, list)}
            if len(widths) > 1:
                return f"{tag}: {where} table rows have uneven cell counts {sorted(widths)}"
        return None
    if not str(block.get("text") or "").strip():
        return f"{tag}: {where} text block needs text"
    return None


def validate_pack(pack):
    """Return a list of human-readable errors; empty list = valid."""
    errs = []
    if not isinstance(pack, dict):
        return ["pack must be a JSON object"]
    if pack.get("schema") != SCHEMA:
        errs.append(f"schema must be '{SCHEMA}'")
    if not SLUG.match(str(pack.get("paper_id", ""))):
        errs.append("paper_id must be a lowercase slug like 'gat-b-2024'")
    if pack.get("set") is not None:
        if not isinstance(pack["set"], str) or not SLUG.match(pack["set"]):
            errs.append("set must be a lowercase slug")

    slug_str = str(pack.get("paper_id", ""))

    if "kind" in pack:
        if pack["kind"] not in KINDS:
            errs.append(f"kind must be one of {KINDS}")
        else:
            # A stated kind must be the kind the slug declares. Without this, a
            # practice paper named after a year reads as a PYQ on the home card
            # and a PYQ named "-practice" reads as practice: the slug is the only
            # thing the panel groups by, so the two spellings have to agree.
            declared = derived_kind(slug_str)
            if declared and declared != pack["kind"]:
                errs.append(f"kind '{pack['kind']}' disagrees with paper_id '{slug_str}' "
                            f"(the slug declares '{declared}') — fix the slug or the kind")

    if "exam" in pack:
        if not isinstance(pack["exam"], str) or not SLUG.match(pack["exam"]):
            errs.append("exam must be a lowercase slug")
        else:
            # The exam must own the paper: the slug is the exam itself or the exam
            # plus a suffix. This is the check the slug parser cannot do for
            # generated papers (their ids keep a kind token, so exam_of sees them
            # unchanged) and it catches a wrong exam on every pack shape.
            if not (slug_str == pack["exam"] or slug_str.startswith(pack["exam"] + "-")):
                errs.append(f"paper_id '{slug_str}' does not sit under exam '{pack['exam']}' "
                            "— fix the exam (or the paper_id)")

    if pack.get("kind") == "pyq" and pack.get("year") is None:
        errs.append("kind 'pyq' requires year")

    if "scope" in pack:
        if not isinstance(pack["scope"], str) or not pack["scope"].strip():
            errs.append("scope must be a non-empty string")

    ym = re.search(r"-((?:19|20)\d{2})(?:-|$)", slug_str)
    if ym:
        slug_year = ym.group(1)
        if pack.get("year") is None:
            errs.append(f"paper_id carries year '{slug_year}' but pack has no year")
        elif str(pack["year"]) != slug_year:
            errs.append(f"pack year '{pack['year']}' does not match paper_id year '{slug_year}'")

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
        elif not isinstance(qid, str) or not QID.match(qid):
            errs.append(f"{tag}: invalid id (must match letters, digits, _, -)")
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
        # Traceability, not a URL field: a paper someone wrote themselves has no link
        # to cite, so an explicit provenance note satisfies the same rule.
        if not (q.get("source_url") or q.get("provenance")):
            errs.append(f"{tag}: needs source_url or a provenance note")
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

        media = q.get("media")
        if media is not None:
            if not isinstance(media, list) or not media:
                errs.append(f"{tag}: media must be a non-empty list of blocks")
            else:
                for mi, block in enumerate(media, 1):
                    why = _media_error(tag, block, f"media #{mi}")
                    if why:
                        errs.append(why)

        omedia = q.get("option_media")
        if omedia is not None:
            if not isinstance(omedia, list):
                errs.append(f"{tag}: option_media must be a list parallel to options")
            elif isinstance(opts, list) and len(omedia) != len(opts):
                errs.append(f"{tag}: option_media has {len(omedia)} entries for {len(opts)} options")
            else:
                for oi, blocks in enumerate(omedia):
                    if blocks is None:
                        continue                       # no figure for this option
                    if not isinstance(blocks, list):
                        errs.append(f"{tag}: option_media[{oi}] must be a list of blocks or null")
                        continue
                    for mi, block in enumerate(blocks, 1):
                        why = _media_error(tag, block, f"option_media[{oi}] #{mi}")
                        if why:
                            errs.append(why)

    for s in sections:
        if not isinstance(s, dict):
            continue
        actual = per_sec.get(s.get("id"), 0)
        if actual != s.get("question_count"):
            errs.append(f"section {s.get('id')!r}: question_count {s.get('question_count')} != actual {actual}")
    if pack.get("key_status") is not None and pack["key_status"] not in KEY_STATUSES:
        errs.append(f"key_status must be one of {KEY_STATUSES} (leave it out when the key is official)")
    if not str(pack.get("provenance", "")).strip():
        errs.append("pack-level provenance string is required")
    if not (pack.get("source_url") or pack.get("provenance")):
        errs.append("pack-level source_url or provenance is required")
    return errs


def lint_pack(pack, assets_dir=None):
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
            if looks_like_ocr_debris(o):
                warns.append(f"{qid}: option {chr(65 + i)} looks like OCR debris ({str(o)[:24]!r})")
        if len(str(q.get("text", "")).strip()) < 15:
            warns.append(f"{qid}: question text is very short ({str(q.get('text'))[:30]!r})")
        omedia = q.get("option_media") or []
        with_figs = [b for b in omedia if isinstance(b, list) and b]
        opts_all = q.get("options") or []
        if with_figs and len(with_figs) != len(opts_all):
            warns.append(f"{qid}: only {len(with_figs)} of {len(opts_all)} options carry a figure — a question that compares figures needs them on every option, otherwise the odd one out draws the eye")
        for where, blocks in (("media", q.get("media") or []),
                              *((f"option_media[{oi}]", b) for oi, b in
                                enumerate(q.get("option_media") or []))):
            for block in (blocks if isinstance(blocks, list) else []):
                if not isinstance(block, dict) or block.get("type") != "image":
                    continue
                src = str(block.get("src") or "")
                if not str(block.get("alt") or "").strip():
                    warns.append(f"{qid}: {where} image has no alt text — say what it shows")
                if assets_dir is not None and "://" not in src and src:
                    try:
                        found = (Path(assets_dir) / src).is_file()
                    except OSError:
                        found = False
                    if not found:
                        warns.append(f"{qid}: {where} image {src!r} is missing from {Path(assets_dir).name}/")
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


def key_status(pack):
    """'official' | 'unverified' | 'random' — what the pack claims about its key.

    A random key still grades (it is data, not an error), but the scoreline is
    noise: the HTTP layer refuses to analyse an attempt graded against one.
    """
    ks = pack.get("key_status")
    return ks if ks in KEY_STATUSES else "official"


def summarize(pack, assets_dir=None):
    return {"paper_id": pack["paper_id"],
            "exam": pack_exam(pack),
            "kind": pack.get("kind") or derived_kind(pack.get("paper_id")),
            "scope": pack.get("scope"),
            "title": pack.get("title", pack["paper_id"]),
            "year": pack.get("year"), "body": pack.get("body"),
            "duration_minutes": pack["pattern"]["duration_minutes"],
            "question_count": len(pack["questions"]),
            "sections": [{"id": s["id"], "title": s["title"],
                          "question_count": s["question_count"],
                          "attempt_limit": s.get("attempt_limit"),
                          "marks_correct": s.get("marks_correct"),
                          "marks_wrong": s.get("marks_wrong")} for s in pack["pattern"]["sections"]],
            "provenance": pack.get("provenance"), "source_url": pack.get("source_url"),
            "key_status": key_status(pack),
            "warnings": lint_pack(pack, assets_dir)}
