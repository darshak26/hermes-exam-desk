"""HTTP namespace for the exam-desk desktop panel → mounted at /api/plugins/exam-desk/*.

Shapes: every response is ``{attempt, pack, remaining_seconds}``. The `pack` in
that envelope is the *sanitised* one (no answers, no explanations, no
tolerances) until the attempt is submitted — the only exception is a submitted
attempt, which is allowed to reveal the key.

Concurrency: handlers that mutate an attempt run inside `store.attempt_lock`, so
two tabs (or a tab racing the server-side auto-submit) cannot lose an answer.
"""
import importlib.util
import sys
import threading
import time
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

VERSION = "0.9.0"
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

router = APIRouter()
BRIDGE = "exam_desk_ctx_bridge"         # set by the plugin's register(ctx)
MODES = ("assisted", "exam")            # stored values; the panel displays vocab.MODE_LABELS
# The panel says mock (the word the sitting deserves); older builds still send exam.
MODE_ALIASES = {"mock": "exam"}
HISTORY_LIMIT = 50


def _llm():
    """The gateway's LLM bridge, or None when the agent half isn't loaded."""
    ctx = getattr(sys.modules.get(BRIDGE), "ctx", None)
    return getattr(ctx, "llm", None)


def mode_of(attempt):
    """An attempt's normalised mode — an old attempt may predate the alias."""
    m = attempt.get("mode")
    return MODE_ALIASES.get(m, m if m in MODES else None)


def history_rows(rows, attempt):
    """The HISTORY feed for this attempt: same paper, same mode, submitted, ≤3.

    Mode-cleaned on purpose. The mock's progress line must not read a sitting
    where the tutor answered half the questions, and an assisted run must not
    inherit the pressure (or numbers) of a clean sitting.
    """
    mine = mode_of(attempt)
    return [p for p in rows
            if p.get("exam_id") == attempt["exam_id"] and p.get("id") != attempt.get("id")
            and p.get("mode") == mine and p.get("status") == "submitted"][:3]


class AnswerPatch(BaseModel):
    """Sparse update. Absent fields mean "leave alone"; `marked: []` means "clear"."""
    answers: dict = Field(default_factory=dict)
    marked: list | None = None
    visited: list | None = None
    current: str | None = None


class StartBody(BaseModel):
    exam_id: str
    mode: str


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
            out.append(p)
            continue
        try:
            assets = store_mod.pack_assets_dir(p["exam_id"])
        except KeyError:
            assets = None
        out.append(pack_mod.summarize(p, assets))
    return {"packs": out}


@router.get("/packs/{exam_id}/assets/{name:path}")
def get_pack_asset(exam_id: str, name: str):
    """Static bytes for a question figure (`packs/<exam_id>.assets/<name>`).

    The browser loads these with a plain <img src>, so the path is checked twice:
    the exam_id must be a plain slug and the resolved file must still sit inside
    the asset directory after symlinks and `..` are collapsed.
    """
    try:
        base = store_mod.pack_assets_dir(exam_id).resolve()
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


@router.get("/packs/{exam_id}")
def get_pack(exam_id: str):
    try:
        return pack_mod.sanitize_pack(store_mod.get_pack(exam_id))
    except KeyError:
        raise HTTPException(404, f"no pack {exam_id!r}")
    except ValueError as e:
        raise HTTPException(422, f"pack {exam_id!r} is invalid: {e}")


# --------------------------------------------------------------------------- #
# attempts
# --------------------------------------------------------------------------- #
@router.post("/attempts")
def create_attempt(body: StartBody):
    mode = MODE_ALIASES.get(body.mode, body.mode)   # 'mock' is the panel's word for 'exam'
    if mode not in MODES:
        raise HTTPException(422, "mode must be one of assisted/mock/exam")
    try:
        pack = store_mod.get_pack(body.exam_id)
    except KeyError:
        raise HTTPException(404, "unknown exam_id")
    except ValueError as e:
        raise HTTPException(422, f"pack {body.exam_id!r} is invalid: {e}")
    a = store_mod.new_attempt(pack, mode)
    if body.mode == "assisted":
        store_mod.write_live_context(a, pack)
    return _view(a, pack)


@router.get("/attempts")
def list_attempts(limit: int = HISTORY_LIMIT, exam_id: str | None = None):
    """History, newest first. Expired attempts are graded on the way out so the
    panel never offers "Resume" on an attempt whose clock has already run out.

    ``exam_id`` narrows the list to one paper. It filters before the cap: an exam
    whose last attempt is older than the newest ``limit`` attempts of other papers
    must still answer with its own history, so a filtered call reads until it has
    ``limit`` matches instead of truncating the newest files first.
    """
    cap = max(1, min(limit, 500))
    rows, unreadable = [], []
    for a, err in store_mod.iter_attempts(None if exam_id else cap):
        if err is not None:
            unreadable.append(err)
            continue
        if store_mod.is_expired(a):
            a = _reap(a)
        if exam_id is not None and a["exam_id"] != exam_id:
            continue
        r = a.get("result") or {}
        rows.append({"id": a["id"], "exam_id": a["exam_id"], "mode": a["mode"],
                     "status": a["status"], "started_at": a["started_at"],
                     "submitted_at": a.get("submitted_at"),
                     "score": r.get("score"), "totals": r.get("totals"),
                     "has_evaluation": bool(a.get("evaluation"))})
        if exam_id is not None and len(rows) >= cap:
            break
    return {"attempts": rows, "unreadable": unreadable}


@router.get("/attempts/{aid}")
def get_attempt(aid: str):
    a, pack = _load(aid, touch=True)
    return _view(a, pack)


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
            pack_view = store_mod.get_pack_view(a["exam_id"])
        except (KeyError, ValueError):
            pack_view = None
        return {"attempt": a, "pack": pack_view, "remaining_seconds": 0.0}


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
    exam_id: Optional[str] = None
    statuses: List[str] = Field(default_factory=lambda: ["abandoned"])


@router.post("/attempts/prune")
def prune_attempts(body: PruneBody = PruneBody()):
    """Bulk-delete finished attempts (abandoned by default). Live ones are safe."""
    gone = store_mod.prune_attempts(statuses=body.statuses, exam_id=body.exam_id)
    return {"deleted": len(gone), "ids": gone}


# --------------------------------------------------------------------------- #
# drills (derived papers) + the topics ledger
# --------------------------------------------------------------------------- #
@router.post("/attempts/{aid}/drill")
def drill_attempt(aid: str):
    """Turn this submitted attempt's misses into a new pack, resumable like any paper.

    Returns the summary of the derived pack; the panel fetches the answer-free
    view and walks the normal instructions page — a drill is a paper, not a
    special view. Idempotence is deliberate: one click always files a *new*
    pack (`<exam_id>-drill(-2, -3…)`), so a second drill after more studying
    holds only the misses that remain.
    """
    a, pack = _load(aid, touch=False)
    if a["status"] != "submitted" or not a.get("result"):
        raise HTTPException(409, "submit the attempt before drilling its misses")
    try:
        drill_id, _ = drill_mod.install_drill(pack, a)
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"exam_id": drill_id, "summary": pack_mod.summarize(store_mod.get_pack(drill_id))}


@router.get("/topics")
def get_topics(exam_id: str | None = None, limit: int = 20):
    """The ledger view: what the AI evaluations keep flagging, newest first."""
    fam = pack_mod.family_of(exam_id) if exam_id is not None else None
    return {"topics": prompt_mod_topics.summarize(exam_id=fam, limit=max(1, min(limit, 100)))}


# Richest constraint first: a real json_schema, then json_object, then plain text.
# `_SHAPE_OK` remembers which one this process last got a usable answer from, because a
# provider that refuses json_schema refuses it on EVERY call — re-asking costs a wasted
# 400 round trip per evaluation. The remembered shape goes first; the rest stay behind
# it, so a provider change (or a model that suddenly accepts a schema) degrades and
# recovers on its own without a restart.
_SHAPE_ORDER = ("json_schema", "json_mode", "text")
_SHAPE_OK = {"name": None}
_EVAL_IN_FLIGHT = set()
_EVAL_LOCK = threading.Lock()


def _shape_attempts():
    """(shape name, complete_structured kwargs) in the order to try them."""
    attempts = [
        ("json_schema", {"json_schema": prompt_mod.EVAL_SCHEMA, "schema_name": "cbt.evaluation"}),
        ("json_mode", {"json_mode": True, "schema_name": "cbt.evaluation"}),
        ("text", {}),
    ]
    known = _SHAPE_OK["name"]
    if known:
        attempts.sort(key=lambda item: 0 if item[0] == known else 1)   # stable sort
    return attempts


@router.post("/attempts/{aid}/evaluate")
def evaluate(aid: str, force: bool = False):
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
        prior = history_rows(store_mod.list_attempts(30), a)
        blob = prompt_mod.evaluation_input(pack, a, prior=prior, timeline_view=tl)
        data, model, provider, last_err = None, "", "", None
        # Degrade through the structured shapes providers actually support: a schema,
        # then json_object, then plain text with the JSON dug out of the reply. Atlas /
        # opencode-go answers a json_schema request with 400 "not yet supported".
        for shape, extra in _shape_attempts():
            try:
                r = llm.complete_structured(instructions=prompt_mod.EVAL_INSTRUCTIONS,
                                            input=[{"type": "text", "text": blob}],
                                            temperature=0.2, max_tokens=2000, timeout=180,
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
                prompt_mod_topics.record(a["exam_id"], aid, data.get("weak_topics"), family=pack_mod.pack_family(pack))
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
        pack = store_mod.get_pack(a["exam_id"])
    except KeyError:
        raise HTTPException(500, "pack vanished; attempt orphaned")
    except ValueError as e:
        raise HTTPException(422, f"pack {a['exam_id']!r} is invalid: {e}")
    if touch and store_mod.is_expired(a):
        a = _reap(a, pack)
    return a, pack


def _reap(a, pack=None):
    """Grade an attempt whose clock ran out while nobody was looking."""
    if pack is None:
        try:
            pack = store_mod.get_pack(a["exam_id"])
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
    a_hash = a.get("pack_hash")
    if a_hash:
        try:
            curr_pack = pack
            if curr_pack is None:
                curr_pack = store_mod.get_pack(a["exam_id"])
            curr_hash = pack_mod.pack_hash(curr_pack)
            changed = bool(curr_hash != a_hash)
        except Exception:
            changed = False

    if a["status"] == "submitted":
        out = {"attempt": a, "pack": pack, "remaining_seconds": 0.0, "pack_changed": changed}
        # The timeline view rides the same envelope: the result page computes its
        # statistics from it, and an attempt written before the stream existed
        # simply gets an empty one (per_question entries stay all-zero/absent).
        try:
            out["stats"] = timeline_mod.build(a, pack)
        except (OSError, ValueError):
            pass
        return out
    # in_progress and abandoned both hide the key; only a submitted attempt reveals it
    return {"attempt": a, "pack": store_mod.get_pack_view(a["exam_id"]),
            "remaining_seconds": max(0.0, store_mod.remaining_seconds(a)),
            "pack_changed": changed}
