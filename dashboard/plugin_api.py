"""HTTP namespace for the exam-desk desktop panel → mounted at /api/plugins/exam-desk/*.

Shapes: every response is ``{attempt, pack, remaining_seconds}``. The `pack` in
that envelope is the *sanitised* one (no answers, no explanations, no
tolerances) until the attempt is submitted — the only exception is a submitted
attempt, which is allowed to reveal the key.

Concurrency: handlers that mutate an attempt run inside `store.attempt_lock`, so
two tabs (or a tab racing the server-side auto-submit) cannot lose an answer.
"""
import importlib.util
import json
import os
import re
import sys
import threading
import time
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

VERSION = "0.11.0"
ASSET_MAX_BYTES = 20 * 1024 * 1024      # a figure, not a video
ALLOWED_ASSET_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

_pkg = Path(__file__).resolve().parents[1] / "exam_desk"
_name = "_exam_desk_http"
if _name not in sys.modules:
    _spec = importlib.util.spec_from_file_location(_name, _pkg / "__init__.py",
                                                   submodule_search_locations=[str(_pkg)])
    _mod = importlib.util.module_from_spec(_spec)
    sys.modules[_name] = _mod
    _spec.loader.exec_module(_mod)
pack_mod = importlib.import_module(_name + ".pack")
store_mod = importlib.import_module(_name + ".store")
prompt_mod = importlib.import_module(_name + ".prompts")
timeline_mod = importlib.import_module(_name + ".timeline")
prompt_mod_topics = importlib.import_module(_name + ".topics")
drill_mod = importlib.import_module(_name + ".drill")
vocab_mod = importlib.import_module(_name + ".vocab")
llm_mod = importlib.import_module(_name + ".llm")

router = APIRouter()
BRIDGE = "exam_desk_ctx_bridge"         # set by the plugin's register(ctx)
MODES = vocab_mod.MODE_VALUES            # ('assisted', 'mock') — the stored spelling
MODE_ALIASES = vocab_mod.MODE_ALIASES    # legacy 'exam' → 'mock', read-only
HISTORY_LIMIT = 50


def _legacy(obj):
    """Echo the 0.9.0 spelling of a row for a panel that has not updated yet.

    `exam_id` was the paper slug; `family` was the exam. The backend speaks the
    current names only — this one function is the whole compatibility surface, and
    deleting it is the entire migration once both machines run a new panel.
    """
    if not isinstance(obj, dict):
        return obj
    out = dict(obj)
    out["exam_id"] = out.get("paper_id")
    out["family"] = out.get("exam")
    return out


def _paper_ref(paper_id=None, exam_id=None):
    """The paper a request names — current `paper_id`, or the legacy `exam_id`."""
    ref = paper_id or exam_id
    if not ref:
        raise HTTPException(422, "paper_id is required")
    return ref


def _exam_ref(exam=None, family=None):
    """The exam a request narrows to — current `exam`, or the legacy `family`."""
    return exam or family


def _llm():
    """The gateway's LLM bridge, or None when the agent half isn't loaded."""
    ctx = getattr(sys.modules.get(BRIDGE), "ctx", None)
    return getattr(ctx, "llm", None)


def mode_of(attempt):
    """An attempt's normalised mode — a pre-rename attempt stored 'exam'."""
    m = vocab_mod.normalize_mode(attempt.get("mode"))
    return m if m in MODES else None


def history_rows(rows, attempt):
    """The HISTORY feed for this attempt: same exam, same mode, submitted, no drills, ≤3.

    Mode-cleaned on purpose. The mock's progress line must not read a sitting
    where the tutor answered half the questions, and an assisted run must not
    inherit the pressure (or numbers) of a clean sitting.
    """
    mine = mode_of(attempt)
    ex = attempt.get("exam") or pack_mod.exam_of(attempt.get("paper_id"))
    return [p for p in rows
            if (p.get("exam") or pack_mod.exam_of(p.get("paper_id"))) == ex
            and p.get("id") != attempt.get("id")
            and mode_of(p) == mine
            and p.get("status") == "submitted"
            and (p.get("kind") or pack_mod.derived_kind(p.get("paper_id"))) != "drill"][:3]


class AnswerPatch(BaseModel):
    """Sparse update. Absent fields mean "leave alone"; `marked: []` means "clear"."""
    answers: dict = Field(default_factory=dict)
    marked: list | None = None
    visited: list | None = None
    current: str | None = None


class StartBody(BaseModel):
    # `paper_id` is the current name; `exam_id` was the 0.9.0 name for the same
    # thing and is accepted so an un-updated panel can still start a sitting.
    paper_id: Optional[str] = None
    exam_id: Optional[str] = None
    mode: str
    # The chat session the user is sitting in (the app's active session) — recorded
    # for assisted sittings so the review can find the tutor's answers later.
    # Never shown as a name; the user never needs to type it.
    assisted_session_id: Optional[str] = None


# --------------------------------------------------------------------------- #
# packs
# --------------------------------------------------------------------------- #
@router.get("/health")
def health():
    return {"ok": True, "llm": _llm() is not None, "version": VERSION}


@router.get("/packs")
def get_packs():
    out = []
    for p in store_mod.list_packs():
        if "invalid" in p:
            out.append(_legacy(p))
            continue
        try:
            assets = store_mod.paper_assets_dir(p["paper_id"])
        except KeyError:
            assets = None
        out.append(_legacy(pack_mod.summarize(p, assets)))
    return {"packs": out}


def _live_sittings(paper_id=None, exam=None):
    """Ids of sittings still running. Deleting a paper under a live attempt would
    drop the question it is showing, so the caller is told to finish or discard it."""
    out = []
    for a, err in store_mod.iter_attempts(paper_id=paper_id, exam=exam):
        if a is not None and a.get("status") == "in_progress":
            out.append(a["id"])
    return out


@router.delete("/packs/{paper_id}")
def delete_pack(paper_id: str):
    """Remove a paper, its assets and its sittings.

    The sittings go with it: they answer questions that no longer exist, and a result
    page for a deleted paper is a dead link. What goes is reported back so the caller
    can say how much was removed.
    """
    try:
        store_mod.get_pack(paper_id)
    except (KeyError, FileNotFoundError, ValueError):
        raise HTTPException(404, "no such paper")
    live = _live_sittings(paper_id=paper_id)
    if live:
        raise HTTPException(409, "that paper has a sitting still running — finish or discard it first")
    removed = store_mod.prune_attempts(statuses=("submitted", "abandoned"), paper_id=paper_id)
    store_mod.remove_pack(paper_id)
    return {"deleted": paper_id, "attempts": len(removed)}


@router.delete("/exams/{exam}")
def delete_exam(exam: str):
    """Remove every paper of one exam, and every sitting on them."""
    packs = [p for p in store_mod.list_packs() if not p.get("invalid")]
    ids = [p["paper_id"] for p in packs if (p.get("exam") or pack_mod.exam_of(p["paper_id"])) == exam]
    if not ids:
        raise HTTPException(404, "no such exam")
    live = _live_sittings(exam=exam)
    if live:
        raise HTTPException(409, "that exam has a sitting still running — finish or discard it first")
    removed = store_mod.prune_attempts(statuses=("submitted", "abandoned"), exam=exam)
    for pid in ids:
        try:
            store_mod.remove_pack(pid)
        except KeyError:
            continue
    return {"deleted": exam, "papers": len(ids), "attempts": len(removed)}


@router.get("/packs/{paper_id}/assets/{name:path}")
def get_pack_asset(paper_id: str, name: str):
    """Static bytes for a question figure (`packs/<paper_id>.assets/<name>`).

    The browser loads these with a plain <img src>, so the path is checked twice:
    the paper_id must be a plain slug and the resolved file must still sit inside
    the asset directory after symlinks and `..` are collapsed.
    """
    try:
        base = store_mod.paper_assets_dir(paper_id).resolve()
    except KeyError:
        raise HTTPException(404, "no such pack")
    try:
        target = (base / name).resolve()
    except (OSError, ValueError):
        raise HTTPException(400, "bad asset path")
    if base != target and base not in target.parents:
        raise HTTPException(400, "asset path leaves the pack directory")
    if target.suffix.lower() not in ALLOWED_ASSET_EXTS:
        raise HTTPException(404, "unsupported asset type")
    if not target.is_file():
        raise HTTPException(404, "no such asset")
    if target.stat().st_size > ASSET_MAX_BYTES:
        raise HTTPException(413, "asset is too large to serve")
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
    }
    return FileResponse(target, headers=headers)


@router.get("/packs/{paper_id}")
def get_pack(paper_id: str):
    try:
        return _legacy(pack_mod.sanitize_pack(store_mod.get_pack(paper_id)))
    except KeyError:
        raise HTTPException(404, f"no paper {paper_id!r}")
    except ValueError as e:
        raise HTTPException(422, f"paper {paper_id!r} is invalid: {e}")


# --------------------------------------------------------------------------- #
# attempts
# --------------------------------------------------------------------------- #
@router.post("/attempts")
def create_attempt(body: StartBody):
    mode = vocab_mod.normalize_mode(body.mode)
    if mode not in MODES:
        raise HTTPException(422, "mode must be one of assisted/mock")
    paper_id = _paper_ref(body.paper_id, body.exam_id)
    try:
        pack = store_mod.get_pack(paper_id)
    except KeyError:
        raise HTTPException(404, f"unknown paper_id {paper_id!r}")
    except ValueError as e:
        raise HTTPException(422, f"paper {paper_id!r} is invalid: {e}")
    a = store_mod.new_attempt(pack, mode,
                              assisted_session_id=body.assisted_session_id if mode == "assisted" else None)
    if mode == "assisted":
        store_mod.write_live_context(a, pack)
    return _view(a, pack)


class LinkSessionBody(BaseModel):
    session_id: str
    # 'review' (default): a "Discuss in chat" review session for a submitted attempt.
    # 'assisted': the tutor chat of an assisted sitting — recorded post-creation when
    # the panel had no active session at creation time and the chat only exists after
    # the priming turn creates it.
    kind: Optional[str] = None


@router.post("/attempts/{aid}/link-session")
def link_session(aid: str, body: LinkSessionBody):
    """Append a Hermes session id that belongs to this attempt. Idempotent."""
    with store_mod.attempt_lock(aid):
        try:
            a = store_mod.get_attempt(aid)
        except KeyError:
            raise HTTPException(404, "no such attempt")
        sid = str(body.session_id or "").strip()
        if not sid:
            raise HTTPException(422, "session_id required")
        if body.kind == "assisted":
            if a.get("assisted_session_id"):
                return {"attempt": a["id"], "assisted_session_id": a["assisted_session_id"]}
            a["assisted_session_id"] = sid
            store_mod.save_attempt(a)
            return {"attempt": a["id"], "assisted_session_id": sid}
        if a.get("status") != "submitted":
            raise HTTPException(409, "link a review session to a submitted attempt — a live sitting has no review yet")
        ids = list(a.get("review_session_ids") or [])
        if sid not in ids:
            ids.append(sid)
            a["review_session_ids"] = ids
            store_mod.save_attempt(a)
        return {"attempt": a["id"], "review_session_ids": ids}


@router.get("/attempts")
def list_attempts(limit: int = HISTORY_LIMIT, paper_id: str | None = None,
                  exam: str | None = None, exam_id: str | None = None,
                  family: str | None = None):
    """History, newest first. Expired attempts are graded on the way out so the
    panel never offers "Resume" on an attempt whose clock has already run out.

    ``paper_id`` narrows the list to one paper, ``exam`` to one exam. (`exam_id`
    and `family` are the 0.9.0 spellings of the same two filters.) They filter
    before the cap: an exam whose last attempt is older than the newest ``limit``
    attempts of other papers must still answer with its own history.
    """
    paper_id = _paper_ref(paper_id, exam_id) if (paper_id or exam_id) else None
    exam = _exam_ref(exam, family)
    if paper_id and exam and pack_mod.exam_of(paper_id) != exam:
        raise HTTPException(422, "exam does not match paper_id")
    cap = max(1, min(limit, 500))
    rows, unreadable = [], []
    pack_cache = {}
    narrowed = paper_id is not None or exam is not None
    for a, err in store_mod.iter_attempts(limit=None if narrowed else cap,
                                          paper_id=paper_id, exam=exam):
        if err is not None:
            unreadable.append(err)
            continue
        if store_mod.is_expired(a):
            a = _reap(a)
        eid = a["paper_id"]
        if eid not in pack_cache:
            try:
                pack_cache[eid] = store_mod.get_pack(eid)
            except Exception:
                pack_cache[eid] = None
        p = pack_cache[eid]
        paper_title = a.get("paper_title") or (p.get("title") if p else None) or eid
        year = p.get("year") if p else None
        if year is None:
            ym = re.search(r"-((?:19|20)\d{2})(?:-|$)", eid)
            if ym:
                year = int(ym.group(1))
        kind = (p.get("kind") if isinstance(p, dict) else None) or pack_mod.derived_kind(eid)

        r = a.get("result") or {}
        rows.append(_legacy({"id": a["id"], "paper_id": eid, "exam": a.get("exam"),
                             "paper_title": paper_title,
                             "year": year, "kind": kind,
                             "mode": mode_of(a),
                             "status": a["status"], "started_at": a["started_at"],
                             "submitted_at": a.get("submitted_at"),
                             "score": r.get("score"), "totals": r.get("totals"),
                             "has_evaluation": bool(a.get("evaluation"))}))
        if narrowed and len(rows) >= cap:
            break
    return {"attempts": rows, "unreadable": unreadable}


@router.get("/attempts/{aid}")
def get_attempt(aid: str):
    a, pack = _load(aid, touch=True)
    return _view(a, pack)


@router.get("/attempts/{aid}/export")
def export_attempt(aid: str):
    """The whole record as one downloadable JSON — the user's data, portable.

    attempt + pack (the real pack: a submitted attempt is allowed to reveal the
    key, and export is a post-submission operation by definition) + the
    behaviour view. `Content-Disposition` is best-effort: the panel downloads
    through an authenticated fetch, so a browser cannot honour the header —
    it is still correct for any token-authenticated client."""
    a, pack = _load(aid, touch=True)
    if a["status"] != "submitted" or not a.get("result"):
        raise HTTPException(409, "export a submitted attempt — abandon or submit this sitting first")
    payload = {
        "schema": "cbt-export/1",
        "exported_at": time.time(),
        "attempt": a,
        "pack": pack,
        **{"timeline": timeline_mod.build(a, pack)},
    }
    body = json.dumps(payload, ensure_ascii=False, indent=1)
    return Response(content=body, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="exam-desk-{aid}.json"'})


@router.patch("/attempts/{aid}")
def patch_attempt(aid: str, patch: AnswerPatch):
    with store_mod.attempt_lock(aid):
        a, pack = _load(aid, touch=True)
        if a["status"] != "in_progress":
            return _view(a, pack)                      # late write: never resurrect
        qmap = {q["id"]: q for q in pack["questions"]}

        # The behaviour stream: events are recorded for what the panel *did*, once per
        # interaction, irrespective of how the attempt ended. A failed/current-first
        # patch still records its open even when nothing was saved on it.
        stream = []                                           # built as we apply the patch

        for qid, val in patch.answers.items():                # saves: with the value replaced
            q = qmap.get(qid)
            if q is None:
                raise HTTPException(422, f"unknown question {qid!r}")
            why = pack_mod.answer_error(q, val)
            if why:
                raise HTTPException(422, f"{qid}: {why}")
            prev = a["answers"].get(qid)                      # what a cleared answer erases
            if pack_mod.is_clear(val):
                a["answers"].pop(qid, None)                   # Clear Response
            else:
                if qid not in a["answer_seq"]:                # only the first real save uses a slot
                    a["answer_seq"].append(qid)
                a["answers"][qid] = val
            stream.append({"type": "save", "qid": qid, "value": None if pack_mod.is_clear(val) else val,
                           "prev": prev})

        if patch.marked is not None:
            old_flagged = set(a["marked"])
            a["marked"] = [q for q in dict.fromkeys(patch.marked) if q in qmap]
            for qid in sorted(old_flagged ^ {q for q in a["marked"]}):
                stream.append({"type": "mark", "qid": qid, "on": qid in a["marked"]})
        arrived = [q for q in dict.fromkeys(patch.visited or []) if q in qmap]
        for qid in arrived:
            if qid not in a["visited"]:
                a["visited"].append(qid)               # insertion order = recency
        target = patch.current if patch.current in qmap else (arrived[-1] if arrived else None)
        if target and target != a.get("current"):
            a["current"] = target                      # what the live context describes
            stream.append({"type": "open", "qid": target})

        if stream:
            store_mod.log_events(aid, stream)

        if a["mode"] == "assisted":
            store_mod.write_live_context(a, pack, a.get("current"))
        if store_mod.remaining_seconds(a) <= 0:
            store_mod.submit_attempt(a, pack)
            store_mod.clear_live_context(a)
        else:
            store_mod.save_attempt(a)
        return _view(a, pack)


@router.post("/attempts/{aid}/submit")
def submit(aid: str):
    with store_mod.attempt_lock(aid):
        a, pack = _load(aid, touch=False)
        if a["status"] == "in_progress":
            a = store_mod.submit_attempt(a, pack)
            store_mod.clear_live_context(a)
        return _view(a, pack)


@router.post("/attempts/{aid}/abandon")
def abandon(aid: str):
    """Throw away a live attempt: no grading, no answer key, an escape hatch for a
    sitting you don't want to finish (the clock otherwise runs for hours).

    Deliberately does not go through _load(): abandoning must still work when the
    paper itself has been deleted, which is exactly when a stray live attempt is
    most likely to exist (its pack is gone, so it can never be graded or resumed)."""
    with store_mod.attempt_lock(aid):
        try:
            a = store_mod.get_attempt(aid)
        except KeyError:
            raise HTTPException(404, "no such attempt")
        except ValueError as e:
            raise HTTPException(500, f"attempt file is unreadable: {e}")
        if a["status"] == "in_progress":
            a = store_mod.abandon_attempt(a)
        try:
            pack_view = store_mod.get_pack_view(a["paper_id"])
        except (KeyError, ValueError):
            pack_view = None
        return {"attempt": _legacy(a), "pack": _legacy(pack_view), "remaining_seconds": 0.0}


@router.delete("/attempts/{aid}")
def delete_attempt(aid: str):
    """Remove one finished attempt. A live attempt must be abandoned first."""
    with store_mod.attempt_lock(aid):
        try:
            removed = store_mod.delete_attempt(aid)
        except KeyError:
            raise HTTPException(404, "no such attempt")
        except ValueError as e:
            raise HTTPException(409, str(e))
    return {"deleted": removed, "id": aid}


class PruneBody(BaseModel):
    paper_id: Optional[str] = None
    exam: Optional[str] = None
    exam_id: Optional[str] = None        # 0.9.0 name for paper_id
    family: Optional[str] = None         # 0.9.0 name for exam
    statuses: List[str] = Field(default_factory=lambda: ["abandoned"])


@router.post("/attempts/prune")
def prune_attempts(body: PruneBody = PruneBody()):
    """Bulk-delete finished attempts (abandoned by default). Live ones are safe."""
    paper_id = body.paper_id or body.exam_id
    exam = _exam_ref(body.exam, body.family)
    if paper_id and exam and pack_mod.exam_of(paper_id) != exam:
        raise HTTPException(422, "exam does not match paper_id")
    gone = store_mod.prune_attempts(statuses=body.statuses, paper_id=paper_id, exam=exam)
    return {"deleted": len(gone), "ids": gone}


@router.post("/attempts/backfill-names")
@router.post("/attempts/backfill-family")          # 0.9.0 path, same job
def backfill_names():
    """One-shot rewrite of attempt files to the current field names, keeping mtime.

    The reader migrates in memory anyway; this makes the files on disk honest so
    a grep over the data directory stops finding two names for one thing.
    """
    d = store_mod.attempts_dir()
    if not d.exists():
        return {"updated": 0}
    count = 0
    for p in d.glob("*.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or not data.get("id"):
                continue
            before = json.dumps(data, sort_keys=True)
            store_mod.migrate_attempt(data)
            if json.dumps(data, sort_keys=True) != before:
                st = p.stat()
                p.write_text(json.dumps(data, indent=1), encoding="utf-8")
                os.utime(p, (st.st_atime, st.st_mtime))
                count += 1
        except Exception:
            continue
    return {"updated": count}


# --------------------------------------------------------------------------- #
# drills (derived papers) + the topics ledger
# --------------------------------------------------------------------------- #
@router.post("/attempts/{aid}/drill")
def drill_attempt(aid: str):
    """Turn this submitted attempt's misses into a new pack, resumable like any paper.

    Returns the summary of the derived pack; the panel fetches the answer-free
    view and walks the normal instructions page — a drill is a paper, not a
    special view. Idempotence is deliberate: one click always files a *new*
    pack (`<paper_id>-drill(-2, -3…)`), so a second drill after more studying
    holds only the misses that remain.
    """
    a, pack = _load(aid, touch=False)
    if a["status"] != "submitted" or not a.get("result"):
        raise HTTPException(409, "submit the attempt before drilling its misses")
    try:
        drill_id, _ = drill_mod.install_drill(pack, a)
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"paper_id": drill_id, "exam_id": drill_id,      # exam_id: 0.9.0 spelling
            "summary": _legacy(pack_mod.summarize(store_mod.get_pack(drill_id)))}


@router.get("/topics")
def get_topics(paper_id: str | None = None, exam: str | None = None,
               exam_id: str | None = None, limit: int = 20):
    """The ledger view: what the AI evaluations keep flagging, newest first.

    Narrow by `exam` for an exam's whole ledger, or by `paper_id` for the exam
    that paper belongs to (the ledger is kept per exam, since a weakness does not
    stop at a paper boundary).
    """
    ref = paper_id or exam_id
    ex = _exam_ref(exam, None) or (pack_mod.exam_of(ref) if ref else None)
    return {"topics": prompt_mod_topics.summarize(exam=ex, limit=max(1, min(limit, 100)))}


# Richest shape first, then the fallbacks, come from exam_desk.llm.plan(). What
# stays here is the process's memory of which shape last worked: a provider that
# refuses json_schema refuses it on EVERY call — re-asking costs a wasted 400
# round trip per evaluation. The remembered shape goes first; the rest stay behind
# it, so a provider change (or a model that suddenly accepts a schema) degrades
# and recovers on its own without a restart.
_SHAPE_OK = {"name": None}
_EVAL_IN_FLIGHT = set()
_EVAL_LOCK = threading.Lock()


@router.post("/attempts/{aid}/evaluate")
async def evaluate(aid: str, force: bool = False):
    a, pack = _load(aid, touch=True)
    if a["status"] != "submitted" or not a.get("result"):
        raise HTTPException(409, "submit the attempt before evaluating")
    if a.get("evaluation") and not force:
        return a["evaluation"]                          # idempotent: no second LLM call
    # A blank sheet carries no evidence. Analysing it produced 37 invented
    # "likely unsure…" notes on a run that had answered nothing, so refuse instead.
    if not any(pack_mod.is_answered(v) for v in (a.get("answers") or {}).values()):
        raise HTTPException(409, "nothing to analyse: this attempt has no recorded answers")
    if pack_mod.key_status(pack) == "random":
        raise HTTPException(409, "this pack has no real answer key (key_status 'random'), so the "
                                 "scoreline is noise — grade it against an official key first")
    with _EVAL_LOCK:
        if aid in _EVAL_IN_FLIGHT:
            raise HTTPException(409, "evaluation already running")
        _EVAL_IN_FLIGHT.add(aid)
    try:
        llm = _llm()
        if llm is None:
            raise HTTPException(503, "AI unavailable: the exam-desk agent half is not loaded — "
                                     "enable the plugin in plugins.enabled and restart the gateway")
        # Context for this run: the behaviour view + the student's own last runs on
        # this paper in this mode. Assisted runs are excluded from a mock's history
        # (a tutor was beside the student — progress there is not progress alone)
        # and vice versa; that filter is the point of keeping the modes apart.
        tl = timeline_mod.build(a, pack)
        prior = history_rows(store_mod.list_attempts(30, exam=a.get("exam") or pack_mod.exam_of(a["paper_id"])), a)
        blob = prompt_mod.evaluation_input(pack, a, prior=prior, timeline_view=tl)
        data, model, provider, last_err = None, "", "", None
        # Degrade through the structured shapes providers actually support: a schema,
        # then json_object, then plain text with the JSON dug out of the reply. Atlas /
        # opencode-go answers a json_schema request with 400 "not yet supported".
        for shape, timeout, extra in llm_mod.plan(_SHAPE_OK["name"]):
            try:
                # await, not a thread call: the handler is async, so the wait runs on
                # the event loop and no threadpool worker is parked for up to 3x180 s
                # while evaluations on OTHER attempts are also in flight.
                r = await llm.acomplete_structured(
                    instructions=prompt_mod.EVAL_INSTRUCTIONS,
                    input=[{"type": "text", "text": blob}],
                    temperature=0.2, max_tokens=2000, timeout=timeout,
                    purpose="exam-desk.evaluate", **extra)
            except Exception as e:                          # provider refused this shape
                last_err = e
                continue
            parsed = r.parsed if isinstance(r.parsed, dict) else prompt_mod.parse_json_block(getattr(r, "text", ""))
            data = prompt_mod.validate_evaluation(parsed)
            if data is not None:
                model, provider = getattr(r, "model", ""), getattr(r, "provider", "")
                _SHAPE_OK["name"] = shape                     # start here next time
                break
            last_err = ValueError("model returned unparseable evaluation")
        # The LLM loop above is the slow part (three shapes × 180 s) and holds no lock on
        # purpose: a mark toggle on the result page must not queue behind it. Only this
        # write is serialised, and it merges onto a fresh read so a concurrent save made
        # during the run is not overwritten by the copy read before it.
        with store_mod.attempt_lock(aid):
            fresh = store_mod.get_attempt(aid)
            if data is None:
                # A failed analysis used to leave no trace on the attempt, so the panel's red
                # badge was the only record. Keep the reason where a reload can show it.
                fresh["evaluation_error"] = {"message": f"evaluation failed: {last_err}", "at": time.time()}
                store_mod.save_attempt(fresh, durable=True)
                raise HTTPException(502, f"evaluation failed: {last_err}")
            fresh["evaluation"] = {"data": data, "model": model, "provider": provider,
                                   "generated_at": time.time()}
            fresh.pop("evaluation_error", None)
            store_mod.save_attempt(fresh, durable=True)
            # The ledger is fed on success only, and must never break the evaluation
            # reply on its own failure — the panel call above returns before it.
            try:
                prompt_mod_topics.record(a["paper_id"], aid, data.get("weak_topics"),
                                         exam=pack_mod.pack_exam(pack))
            except Exception:
                pass
            return fresh["evaluation"]
    finally:
        with _EVAL_LOCK:
            _EVAL_IN_FLIGHT.discard(aid)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _load(aid, touch=False):
    """(attempt, pack) or an HTTP error. `touch=True` grades an expired attempt."""
    try:
        a = store_mod.get_attempt(aid)
    except KeyError:
        raise HTTPException(404, "no such attempt")
    except ValueError as e:
        raise HTTPException(500, f"attempt file is unreadable: {e}")
    try:
        pack = store_mod.get_pack(a["paper_id"])
    except KeyError:
        raise HTTPException(500, "paper vanished; attempt orphaned")
    except ValueError as e:
        raise HTTPException(422, f"paper {a['paper_id']!r} is invalid: {e}")
    if touch and store_mod.is_expired(a):
        a = _reap(a, pack)
    return a, pack


def _reap(a, pack=None):
    """Grade an attempt whose clock ran out while nobody was looking."""
    if pack is None:
        try:
            pack = store_mod.get_pack(a["paper_id"])
        except (KeyError, ValueError):
            return a
    with store_mod.attempt_lock(a["id"]):
        a = store_mod.get_attempt(a["id"])             # re-read under the lock
        if store_mod.is_expired(a):
            a = store_mod.submit_attempt(a, pack)
            store_mod.clear_live_context(a)
    return a


def _view(a, pack):
    """The one envelope shape the panel understands."""
    changed = False
    a_hash = a.get("paper_hash")
    if a_hash:
        try:
            curr_pack = pack
            if curr_pack is None:
                curr_pack = store_mod.get_pack(a["paper_id"])
            curr_hash = pack_mod.pack_hash(curr_pack)
            changed = bool(curr_hash != a_hash)
        except Exception:
            changed = False

    if a["status"] == "submitted":
        out = {"attempt": _legacy(a), "pack": _legacy(pack),
               "remaining_seconds": 0.0, "pack_changed": changed}
        # The timeline view rides the same envelope: the result page computes its
        # statistics from it, and an attempt written before the stream existed
        # simply gets an empty one (per_question entries stay all-zero/absent).
        try:
            out["stats"] = timeline_mod.build(a, pack)
        except (OSError, ValueError):
            pass
        return out
    # in_progress and abandoned both hide the key; only a submitted attempt reveals it
    return {"attempt": _legacy(a), "pack": _legacy(store_mod.get_pack_view(a["paper_id"])),
            "remaining_seconds": max(0.0, store_mod.remaining_seconds(a)),
            "pack_changed": changed}
