"""HTTP namespace for the cbt-exam desktop panel → mounted at /api/plugins/cbt-exam/*."""
import importlib.util, sys
from pathlib import Path
from fastapi import APIRouter

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

router = APIRouter()
BRIDGE = "cbt_exam_ctx_bridge"

def _llm():
    m = sys.modules.get(BRIDGE)
    ctx = getattr(m, "ctx", None)
    return getattr(ctx, "llm", None)

@router.get("/health")
def health():
    return {"ok": True, "llm": _llm() is not None}
