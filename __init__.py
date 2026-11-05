"""cbt-exam — exam-agnostic CBT practice plugin (backend + desktop panel + sourcing skill)."""
import sys, types
from pathlib import Path

_BRIDGE = "cbt_exam_ctx_bridge"

def register(ctx):
    # 1) bundle the sourcing skill as cbt-exam:pyq-sourcing
    for child in sorted((Path(__file__).parent / "skills").iterdir()):
        skill_md = child / "SKILL.md"
        if child.is_dir() and skill_md.exists():
            ctx.register_skill(child.name, skill_md)
    # 2) LLM bridge: dashboard/plugin_api.py is imported as a separate module
    #    instance by the HTTP mount, but runs in THIS process — share the ctx
    #    under a canonical sys.modules name it can look up lazily.
    if _BRIDGE not in sys.modules:
        sys.modules[_BRIDGE] = types.ModuleType(_BRIDGE)
    sys.modules[_BRIDGE].ctx = ctx
