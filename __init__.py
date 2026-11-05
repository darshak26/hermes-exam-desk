"""cbt-exam — exam-agnostic CBT practice plugin (backend + desktop panel + sourcing skill).

The agent half is deliberately thin: it bundles the two skills and publishes the
plugin `ctx` under a canonical `sys.modules` name, because `dashboard/plugin_api.py`
is imported as a *separate* module instance by the HTTP mount while running in this
same process.
"""
import sys
import types
from pathlib import Path

VERSION = "0.4.0"
BRIDGE = "cbt_exam_ctx_bridge"


def register(ctx):
    # 1) bundle every skills/<name>/SKILL.md as cbt-exam:<name>. A missing or empty
    #    skills/ dir must not take plugin registration down with it.
    skills_dir = Path(__file__).parent / "skills"
    if skills_dir.is_dir():
        for child in sorted(skills_dir.iterdir()):
            skill_md = child / "SKILL.md"
            if child.is_dir() and skill_md.exists():
                ctx.register_skill(child.name, skill_md)

    # 2) LLM bridge — the HTTP module looks this up lazily (see plugin_api._llm).
    module = sys.modules.get(BRIDGE)
    if module is None:
        module = types.ModuleType(BRIDGE)
        sys.modules[BRIDGE] = module
    setattr(module, "ctx", ctx)     # plain ModuleType: attribute set via setattr on purpose
