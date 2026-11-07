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
import time
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

VERSION = "0.7.0"
ASSET_MAX_BYTES = 20 * 1024 * 1024      # a figure, not a video

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

router = APIRouter()
BRIDGE = "exam_desk_ctx_bridge"         # set by the plugin's register(ctx)
MODES = ("assisted", "exam")
HISTORY_LIMIT = 50


def _llm():
    """The gateway's LLM bridge, or None when the agent half isn't loaded."""
    ctx = getattr(sys.modules.get(BRIDGE), "ctx", None)
    return getattr(ctx, "llm", None)


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
    if not target.is_file():
        raise HTTPException(404, "no such asset")
    if target.stat().st_size > ASSET_MAX_BYTES:
        raise HTTPException(413, "asset is too large to serve")
    return FileResponse(target)


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
    if body.mode not in MODES:
        raise HTTPException(422, f"mode must be one of {MODES}")
    try:
        pack = store_mod.get_pack(body.exam_id)
    except KeyError:
        raise HTTPException(404, "unknown exam_id")
    except ValueError as e:
        raise HTTPException(422, f"pack {body.exam_id!r} is invalid: {e}")
    a = store_mod.new_attempt(pack, body.mode)
    if body.mode == "assisted":
        store_mod.write_live_context(a, pack)
    return _view(a, pack)


@router.get("/attempts")
def list_attempts(limit: int = HISTORY_LIMIT):
    """History, newest first. Expired attempts are graded on the way out so the
    panel never offers "Resume" on an attempt whose clock has already run out."""
    rows, unreadable = [], []
    for a, err in store_mod.iter_attempts(max(1, min(limit, 500))):
        if err is not None:
            unreadable.append(err)
            continue
        if store_mod.is_expired(a):
            a = _reap(a)
        r = a.get("result") or {}
        rows.append({"id": a["id"], "exam_id": a["exam_id"], "mode": a["mode"],
                     "status": a["status"], "started_at": a["started_at"],
                     "submitted_at": a.get("submitted_at"),
                     "score": r.get("score"), "totals": r.get("totals"),
                     "has_evaluation": bool(a.get("evaluation"))})
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

        for qid, val in patch.answers.items():
            q = qmap.get(qid)
            if q is None:
                raise HTTPException(422, f"unknown question {qid!r}")
            why = pack_mod.answer_error(q, val)
            if why:
                raise HTTPException(422, f"{qid}: {why}")
            if pack_mod.is_clear(val):
                a["answers"].pop(qid, None)            # Clear Response
            else:
                if qid not in a["answer_seq"]:         # only the first real save uses a slot
                    a["answer_seq"].append(qid)
                a["answers"][qid] = val

        if patch.marked is not None:
            a["marked"] = [q for q in dict.fromkeys(patch.marked) if q in qmap]
        arrived = [q for q in dict.fromkeys(patch.visited or []) if q in qmap]
        for qid in arrived:
            if qid not in a["visited"]:
                a["visited"].append(qid)               # insertion order = recency
        target = patch.current if patch.current in qmap else (arrived[-1] if arrived else None)
        if target:
            a["current"] = target                      # what the live context describes

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


# Richest constraint first: a real json_schema, then json_object, then plain text.
# `_SHAPE_OK` remembers which one this process last got a usable answer from, because a
# provider that refuses json_schema refuses it on EVERY call — re-asking costs a wasted
# 400 round trip per evaluation. The remembered shape goes first; the rest stay behind
# it, so a provider change (or a model that suddenly accepts a schema) degrades and
# recovers on its own without a restart.
_SHAPE_ORDER = ("json_schema", "json_mode", "text")
_SHAPE_OK = {"name": None}


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
    llm = _llm()
    if llm is None:
        raise HTTPException(503, "AI unavailable: the exam-desk agent half is not loaded — "
                                 "enable the plugin in plugins.enabled and restart the gateway")
    blob = prompt_mod.evaluation_input(pack, a)
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
    if data is None:
        raise HTTPException(502, f"evaluation failed: {last_err}")
    a["evaluation"] = {"data": data, "model": model, "provider": provider,
                       "generated_at": time.time()}
    store_mod.save_attempt(a, durable=True)
    return a["evaluation"]


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
    if a["status"] == "submitted":
        return {"attempt": a, "pack": pack, "remaining_seconds": 0.0}
    # in_progress and abandoned both hide the key; only a submitted attempt reveals it
    return {"attempt": a, "pack": store_mod.get_pack_view(a["exam_id"]),
            "remaining_seconds": max(0.0, store_mod.remaining_seconds(a))}
