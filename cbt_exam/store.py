"""Packs (read-through files) + attempts (atomic writes) under the plugin data root."""
import json, os, time, uuid
from pathlib import Path
from .pack import load_pack_file
from . import grading

def data_root():
    override = os.environ.get("CBT_EXAM_DATA_DIR")
    if override:
        return Path(override)
    from plugins.plugin_storage import plugin_data_dir
    return plugin_data_dir("cbt-exam")

def packs_dir():
    return data_root() / "packs"

def attempts_dir():
    return data_root() / "attempts"

def list_packs():
    out = []
    d = packs_dir()
    if not d.exists():
        return out
    for p in sorted(d.glob("*.json")):
        try:
            out.append(load_pack_file(p))
        except ValueError as e:
            out.append({"exam_id": p.stem, "invalid": str(e)})
    return out

def get_pack(exam_id):
    f = packs_dir() / f"{exam_id}.json"
    if not f.exists():
        raise KeyError(exam_id)
    return load_pack_file(f)

def _atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
    tmp.replace(path)

def new_attempt(pack, mode):
    now = time.time()
    a = {"id": f"a-{uuid.uuid4().hex[:10]}", "exam_id": pack["exam_id"], "mode": mode,
         "status": "in_progress", "started_at": now,
         "duration_seconds": pack["pattern"]["duration_minutes"] * 60,
         "answers": {}, "answer_seq": [], "marked": [], "visited": [],
         "assist_log": [], "result": None, "evaluation": None,
         "submitted_at": None, "updated_at": now}
    _atomic_write(attempts_dir() / f"{a['id']}.json", a)
    return a

def get_attempt(aid):
    f = attempts_dir() / f"{aid}.json"
    if not f.exists():
        raise KeyError(aid)
    return json.loads(f.read_text(encoding="utf-8"))

def save_attempt(a):
    a["updated_at"] = time.time()
    _atomic_write(attempts_dir() / f"{a['id']}.json", a)
    return a

def remaining_seconds(a, now=None):
    now = time.time() if now is None else now
    return a["duration_seconds"] - (now - a["started_at"])

def list_attempts():
    d = attempts_dir()
    if not d.exists():
        return []
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(d.glob("*.json"))]

def submit_attempt(a, pack, now=None):
    a["status"] = "submitted"
    a["submitted_at"] = time.time() if now is None else now
    a["result"] = grading.grade_attempt(pack, a)
    return save_attempt(a)
