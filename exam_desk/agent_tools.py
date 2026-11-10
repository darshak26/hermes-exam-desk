"""Connect the agent-facing surface to a live plugin ctx.

Thin by design — everything real lives in `agent_surface.py`, which is import
testable. This module exists so the plugin's `__init__.py` can register the
toolset with ONE relative import in BOTH module identities the plugin runs
under: `hermes_plugins.exam_desk` (the gateway's loader) and
`_exam_desk_http` (the dashboard's path import of this same `__init__.py`,
where the register call never runs but the import must still resolve).
"""
from .agent_surface import BLUEPRINT_KEY, COMMAND_NAME, HOOK_NAME, TOOL_NAMES, register_agent  # noqa: F401 — public re-exports


def register_agent_surface(ctx):
    """manifest-ordered: tools, hook, command, blueprint."""
    register_agent(ctx)
    return describe(ctx)


def describe(ctx=None):
    """What got (or would get) registered — helpful in tests and in the doctor."""
    return {
        "tools": list(TOOL_NAMES),
        "hooks": [HOOK_NAME],
        "command": COMMAND_NAME,
        "blueprint": BLUEPRINT_KEY,
    }


def names():
    """The manifest mirror, computed from the same tuple the wire iterates."""
    return {"tools": list(TOOL_NAMES), "hooks": [HOOK_NAME]}
