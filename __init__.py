"""exam-desk — exam-agnostic CBT practice plugin (backend + desktop panel + sourcing skill).

The agent half is deliberately thin: it bundles the two skills and publishes the
plugin `ctx` under a canonical `sys.modules` name, because `dashboard/plugin_api.py`
is imported as a *separate* module instance by the HTTP mount while running in this
same process.
"""
import os
import shutil
import sys
import types
from pathlib import Path

VERSION = "0.8.0"
BRIDGE = "exam_desk_ctx_bridge"


def register(ctx):
    # 1) bundle every skills/<name>/SKILL.md as exam-desk:<name>. A missing or empty
    #    skills/ dir must not take plugin registration down with it.
    skills_dir = Path(__file__).parent / "skills"
    if skills_dir.is_dir():
        for child in sorted(skills_dir.iterdir()):
            skill_md = child / "SKILL.md"
            if child.is_dir() and skill_md.exists():
                ctx.register_skill(child.name, skill_md)

    # 2) A first-run paper. Without one the panel opens on an empty list and the only
    #    way forward is the agent sourcing a real paper — a bad first five minutes for
    #    someone who just installed this. Never overwrites: an existing file of the
    #    same name is the user's.
    _seed_packs()

    # 3) LLM bridge — the HTTP module looks this up lazily (see plugin_api._llm).
    module = sys.modules.get(BRIDGE)
    if module is None:
        module = types.ModuleType(BRIDGE)
        sys.modules[BRIDGE] = module
    setattr(module, "ctx", ctx)     # plain ModuleType: attribute set via setattr on purpose


def _seed_packs() -> None:
    """Copy `packs/*.json` from the package into the plugin's data dir, once each."""
    seed = Path(__file__).parent / "packs"
    if not seed.is_dir():
        return
    try:
        override = os.environ.get("EXAM_DESK_DATA_DIR")
        if override:
            root = Path(override)
        else:
            from plugins.plugin_storage import plugin_data_dir
            root = Path(plugin_data_dir("exam-desk"))
        target = root / "packs"
        target.mkdir(parents=True, exist_ok=True)
        for src in sorted(seed.glob("*.json")):
            dst = target / src.name
            if not dst.exists():
                shutil.copyfile(src, dst)
    except Exception:
        # seeding is a convenience; it must never take registration down with it
        pass
