"""HTTP namespace for the cbt-exam desktop panel → mounted at /api/plugins/cbt-exam/*."""
import importlib.util, sys, time
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

_pkg = Path(__file__).resolve().parents[1] / "cbt_exam"
_name = "_cbt_exam_http"
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
BRIDGE = "cbt_exam_ctx_bridge"

def _llm():
    m = sys.modules.get(BRIDGE)
    ctx = getattr(m, "ctx", None)
    return getattr(ctx, "llm", None)

class AnswerPatch(BaseModel):
    answers: dict = Field(default_factory=dict)
    marked: list = Field(default_factory=list)
    visited: list = Field(default_factory=list)

class StartBody(BaseModel):
    exam_id: str
    mode: str

@router.get("/health")
def health():
    return {"ok": True, "llm": _llm() is not None}

@router.get("/packs")
def get_packs():
    out = []
    for p in store_mod.list_packs():
        out.append(pack_mod.summarize(p) if "invalid" not in p else p)
    return {"packs": out}

@router.get("/packs/{exam_id}")
def get_pack(exam_id: str):
    try:
        return pack_mod.sanitize_pack(store_mod.get_pack(exam_id))
    except KeyError:
        raise HTTPException(404, f"no pack {exam_id!r}")
    except ValueError as e:
        raise HTTPException(422, f"pack {exam_id!r} is invalid: {e}")

@router.post("/attempts")
def create_attempt(body: StartBody):
    if body.mode not in ("assisted", "exam"):
        raise HTTPException(422, "mode must be 'assisted' or 'exam'")
    try:
        pack = store_mod.get_pack(body.exam_id)
    except KeyError:
        raise HTTPException(404, "unknown exam_id")
    except ValueError as e:
        raise HTTPException(422, f"pack {body.exam_id!r} is invalid: {e}")
    return _live_view(store_mod.new_attempt(pack, body.mode), pack)

@router.get("/attempts")
def list_attempts():
    rows = []
    for a in store_mod.list_attempts():
        r = a.get("result") or {}
        rows.append({"id": a["id"], "exam_id": a["exam_id"], "mode": a["mode"],
                     "status": a["status"], "started_at": a["started_at"],
                     "submitted_at": a.get("submitted_at"),
                     "score": r.get("score"), "totals": r.get("totals"),
                     "assists": len(a.get("assist_log", [])),
                     "has_evaluation": bool(a.get("evaluation"))})
    return {"attempts": rows}

@router.get("/attempts/{aid}")
def get_attempt(aid: str):
    a, pack = _load(aid, touch=True)
    return _live_view(a, pack)

class AskBody(BaseModel):
    question_id: str
    text: str = Field(min_length=1, max_length=2000)
    current: object = None   # the UI's live (possibly unsaved) selection; falls back to the saved answer

@router.patch("/attempts/{aid}")
def patch_attempt(aid: str, patch: AnswerPatch):
    a, pack = _load(aid, touch=True)
    if a["status"] != "in_progress":
        return _live_view(a, pack)
    qmap = {q["id"]: q for q in pack["questions"]}
    for qid, val in patch.answers.items():
        q = qmap.get(qid)
        if q is None:
            raise HTTPException(422, f"unknown question {qid!r}")
        err = _answer_error(q, val)
        if err:
            raise HTTPException(422, err)
        if val is None or val == "" or val == []:
            a["answers"].pop(qid, None)      # Clear Response: remove the key entirely
        else:
            if qid not in a["answer_seq"]:   # only the FIRST real save consumes an attempt-limit slot
                a["answer_seq"].append(qid)
            a["answers"][qid] = val
    if patch.marked:
        a["marked"] = [q for q in patch.marked if q in qmap]
    if patch.visited:
        seen = set(a["visited"])
        seen.update(q for q in patch.visited if q in qmap)
        a["visited"] = sorted(seen)
    if store_mod.remaining_seconds(a) <= 0:
        store_mod.submit_attempt(a, pack)
    else:
        store_mod.save_attempt(a)
    return _live_view(a, pack)

def _answer_error(q, val):
    """None when val is a legal answer for this question's type; else an error string.
    Clearing (None/''/[]) is always legal — it removes the saved answer but the
    question keeps its answer_seq slot if it ever had one (grading: skipped, slot consumed)."""
    if val is None or val == "" or val == []:
        return None
    t = q["type"]
    opts = q.get("options", [])
    if t == "mcq":
        if not isinstance(val, int) or isinstance(val, bool) or not (0 <= val < len(opts)):
            return f"{q['id']}: mcq answer must be an option index"
    elif t == "msq":
        if (not isinstance(val, list) or not val or len(set(map(str, val))) != len(val)
                or any(not isinstance(x, int) or isinstance(x, bool) or not (0 <= x < len(opts)) for x in val)):
            return f"{q['id']}: msq answer must be a non-empty list of distinct option indices"
    elif t == "nat":
        if isinstance(val, bool) or not isinstance(val, (int, float, str)) or val == "":
            return f"{q['id']}: nat answer must be a number or numeric string"
    return None

@router.post("/attempts/{aid}/submit")
def submit(aid: str):
    a, pack = _load(aid, touch=True)
    if a["status"] == "in_progress":
        store_mod.submit_attempt(a, pack)
    return _result_view(a, pack)

@router.post("/attempts/{aid}/ask")
def ask(aid: str, body: AskBody):
    a, pack = _load(aid, touch=True)
    if a["mode"] != "assisted":
        raise HTTPException(403, "ask is only available in assisted mode")
    if a["status"] != "in_progress":
        raise HTTPException(409, "attempt is not in progress")
    llm = _llm()
    if llm is None:
        raise HTTPException(503, "AI unavailable: enable the cbt-exam plugin (agent half) and restart the gateway")
    q = next((x for x in pack["questions"] if x["id"] == body.question_id), None)
    if q is None:
        raise HTTPException(404, "unknown question_id")
    cur = body.current if body.current is not None else a["answers"].get(q["id"])
    messages = prompt_mod.ask_messages(q, cur, body.text, pack, history=a["assist_log"])
    try:
        r = llm.complete(messages=messages, max_tokens=600, timeout=90, purpose="cbt-exam.ask")
    except Exception as e:
        raise HTTPException(502, f"LLM call failed: {e}")
    a["assist_log"].append({"question_id": q["id"], "asked": body.text,
                            "reply": r.text, "model": r.model, "at": time.time()})
    store_mod.save_attempt(a)
    return {"reply": r.text, "model": r.model, "assists": len(a["assist_log"])}

@router.post("/attempts/{aid}/evaluate")
def evaluate(aid: str):
    a, pack = _load(aid, touch=True)
    if a["status"] != "submitted" or not a.get("result"):
        raise HTTPException(409, "submit the attempt before evaluating")
    llm = _llm()
    if llm is None:
        raise HTTPException(503, "AI unavailable: enable the cbt-exam plugin (agent half) and restart the gateway")
    blob = prompt_mod.evaluation_input(pack, a)
    try:
        r = llm.complete_structured(instructions=prompt_mod.EVAL_INSTRUCTIONS,
                                    input=[{"type": "text", "text": blob}],
                                    json_schema=prompt_mod.EVAL_SCHEMA, schema_name="cbt.evaluation",
                                    temperature=0.2, max_tokens=2000, timeout=180, purpose="cbt-exam.evaluate")
    except Exception as e:
        raise HTTPException(502, f"LLM call failed: {e}")
    data = prompt_mod.validate_evaluation(r.parsed)
    if data is None:
        raise HTTPException(502, "model returned unparseable evaluation")
    a["evaluation"] = {"data": data, "model": r.model, "provider": r.provider, "generated_at": time.time()}
    store_mod.save_attempt(a)
    return a["evaluation"]

def _load(aid, touch=False):
    try:
        a = store_mod.get_attempt(aid)
    except KeyError:
        raise HTTPException(404, "no such attempt")
    try:
        pack = store_mod.get_pack(a["exam_id"])
    except KeyError:
        raise HTTPException(500, "pack vanished; attempt orphaned")
    except ValueError as e:
        raise HTTPException(422, f"pack {a['exam_id']!r} is invalid: {e}")
    if touch and a["status"] == "in_progress" and store_mod.remaining_seconds(a) <= 0:
        store_mod.submit_attempt(a, pack)
    return a, pack

def _live_view(a, pack):
    if a["status"] == "in_progress":
        return {"attempt": a, "pack": pack_mod.sanitize_pack(pack),
                "remaining_seconds": max(0.0, store_mod.remaining_seconds(a))}
    return _result_view(a, pack)

def _result_view(a, pack):
    return {"attempt": a, "pack": pack, "remaining_seconds": 0.0}
