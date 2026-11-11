"""The agent-facing surface: a toolset, the pre_llm_call context injection,
the /examdesk slash command and the evening-digest blueprint.

Design contract, straight from the plugin docs:

* Tools and hooks are registered by `register(ctx)` in the gateway process and
  MUST mirror `provides_tools` / `provides_hooks` in the manifest — the catalog
  validator compares the two lists.
* Handlers return JSON strings the model can read, never raise on bad input
  (`{"error": ...}` instead), and only touch the plugin's own data root.
* The hook callback accepts `**kwargs` (forward compatibility — Hermes inspects
  the signature and passes what is declared).
* The `pre_llm_call` injection is context, not a script: it names the state and
  hands the work to the toolset, so the tutor works the same with or without it.

Everything here is read-only except `exam_desk_doubt`, which appends one
event to a sitting's behaviour stream — the same write the assist skill
script performs, deliberately the plugin's only agent-initiated write.
"""
import json
import os
import re
import time
from pathlib import Path

from . import grading, vocab
from . import pack as pack_mod
from . import store as store_mod
from . import timeline as timeline_mod
from . import topics as topics_mod

TOOLSET = "exam-desk"
HOOK_NAME = "pre_llm_call"
COMMAND_NAME = "examdesk"
BLUEPRINT_KEY = "examdesk-evening-digest"

_ID = store_mod._ID          # the same slug rule store.py applies to ids on disk
_QID = re.compile(r"^[A-Za-z0-9_-]+$")


def _out(payload):
    return json.dumps(payload, ensure_ascii=False)


# --------------------------------------------------------------------------- #
# tools
# --------------------------------------------------------------------------- #
def _current_live_file():
    d = store_mod.live_dir()
    try:
        files = sorted(d.glob("*.md"), key=os.path.getmtime)
    except OSError:
        return None
    return files[-1] if files else None


def tool_live_context(args=None, **kwargs):
    """The mirror the assist tutor reads — replacing the terminal dance."""
    del args
    path = _current_live_file()
    if path is None:
        return _out({"live": False, "reason": "no live exam-desk sitting — a mirror exists only while an assisted sitting runs"})
    aid = path.stem
    try:
        a = store_mod.get_attempt(aid)
    except (KeyError, ValueError):
        return _out({"live": False, "reason": "the mirrored sitting's record is unreadable"})
    if a.get("status") != "in_progress":
        return _out({"live": False, "reason": "the sitting behind the mirror has ended (the mirror is pruned on submit)", "attempt_id": aid,
                     "status": a.get("status")})
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return _out({"live": False, "reason": "the mirror is mid-rewrite — try again"})
    return _out({"live": True, "attempt_id": aid, "paper_id": a.get("paper_id"), "exam": a.get("exam"),
                 "mode": vocab.mode_label(a.get("mode")),
                 "remaining_seconds": max(0, int(store_mod.remaining_seconds(a))),
                 "context": text})


def _attempt_rows(a, pack):
    """The per-question review rows — the tool's twin of load_attempt.py's printout."""
    rows_out = []
    result = a.get("result") or {}
    verdict_rows = {r["id"]: r for r in (result.get("questions") or [])}
    try:
        tl = timeline_mod.build(a, pack)
    except (OSError, ValueError):
        tl = {}
    for q in pack.get("questions") or []:
        row = verdict_rows.get(q["id"], {})
        verdict = row.get("verdict", "—")
        given = (a.get("answers") or {}).get(q["id"], None)
        if isinstance(given, list):
            given = [chr(65 + i) if isinstance(i, int) and q.get("options") else i for i in sorted(given)] or "skipped"
        elif given is None or given == "":
            given = "skipped"
        elif isinstance(given, int) and q.get("options"):
            given = chr(65 + given)
        entry = {"id": q["id"], "section": q["section"], "type": q["type"], "topic": q.get("topic"),
                 "verdict": verdict, "awarded": row.get("awarded"),
                 "marks": [row.get("marks", q.get("marks"))],
                 "text": q["text"]}
        if q.get("options"):
            entry["options"] = [f"{chr(65+i)}) {o}" for i, o in enumerate(q["options"])]
        if verdict != "correct":
            entry["student"] = given
            entry["key"] = q.get("answer")
            if q.get("explanation"):
                entry["explanation"] = q["explanation"]
        pq = (tl.get("per_question") or {}).get(q["id"]) or {}
        if tl.get("totals", {}).get("events") and (pq.get("spent") or pq.get("opens")):
            entry["behaviour"] = [b for b in (
                f"on screen {round(pq['spent'])}s" if pq.get("spent") else None,
                f"{pq['opens']} visit(s)" if pq.get("opens") else None,
                "answer changed before the final save" if pq.get("changes") else None,
                f"asked the tutor {pq['doubts']}x" if pq.get("doubts") else None) if b]
        rows_out.append(entry)
    return rows_out


def tool_attempt(args, **kwargs):
    """One sitting's record, read-only — the review skill's load_attempt in tool form.

    A submitted attempt reveals the key (export reveals the same); anything
    still running answers with the key-free view the exam shell itself sees."""
    args = args or {}
    aid = str(args.get("attempt_id") or "")
    if not _ID.match(aid):
        return _out({"error": "attempt_id is not a plain slug"})
    try:
        a = store_mod.get_attempt(aid)
    except KeyError:
        return _out({"error": f"no such attempt: {aid}"})
    except ValueError as e:
        return _out({"error": f"attempt file is unreadable: {e}"})
    out = {"attempt_id": aid, "status": a.get("status"), "mode": vocab.mode_label(a.get("mode")),
           "paper_id": a.get("paper_id"), "paper_title": a.get("paper_title"), "exam": a.get("exam"),
           "started_at": a.get("started_at"), "submitted_at": a.get("submitted_at")}
    if a.get("mode") == "assisted":
        out["assisted_session_id"] = a.get("assisted_session_id")
    pack = None
    try:
        pack = store_mod.get_pack(a["paper_id"])
    except (KeyError, FileNotFoundError):
        out["paper"] = "the paper vanished; the attempt is orphaned"
    except ValueError as e:
        out["paper"] = f"the paper is invalid: {e}"
    if pack:
        out["paper"] = pack.get("title", pack.get("paper_id"))
        out["provenance"] = pack.get("provenance")
        ks = pack.get("key_status")
        out["key_status"] = "official" if not ks else ks
    if a.get("status") != "submitted" or not a.get("result"):
        # still running or discarded: the key stays behind the panel's own guard
        out["result"] = None
        out["note"] = "not a graded sitting — verdicts and the key are withheld until submission"
        return _out(out)
    r = a["result"]
    out["score"] = r.get("score")
    out["totals"] = r.get("totals")
    tl = {}
    try:
        tl = timeline_mod.build(a, pack)
    except (OSError, ValueError):
        tl = {}
    out["questions"] = _attempt_rows(a, pack)
    try:
        t = tl.get("totals", {})
        if t.get("events"):
            out["behaviour"] = {"events": t.get("events"), "mind_changes": t.get("changed"),
                                "doubts": t.get("doubts"),
                                "median_spent": round(t["median_spent"]) if t.get("median_spent") is not None else None,
                                "dwell_by_section": {sid: timeline_mod.fmt_sec(sec.get("dwell") or 0)
                                                     for sid, sec in (tl.get("sections") or {}).items() if sec.get("dwell")}}
    except (OSError, ValueError, KeyError):
        pass
    return _out(out)


def tool_log_doubt(args, **kwargs):
    args = args or {}
    aid = str(args.get("attempt_id") or "")
    qid = str(args.get("question_id") or "")
    note = str(args.get("note") or "")
    if not _ID.match(aid):
        return _out({"error": "attempt_id is not a plain slug"})
    if not _QID.match(qid):
        return _out({"error": "question_id is not a plain id"})
    try:
        a = store_mod.get_attempt(aid)
        if a.get("status") != "in_progress":
            return _out({"error": f"attempt {aid} is {a.get('status')} — doubts are logged for live sittings only"})
        path = store_mod.event_log_path(aid)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"t": time.time(), "type": "doubt", "qid": qid, "note": note[:300]},
                                separators=(",", ":")) + "\n")
    except (KeyError, ValueError, OSError) as e:
        return _out({"error": f"could not log the doubt: {e}"})
    return _out({"logged": True, "attempt_id": aid, "question_id": qid})


def tool_topics(args, **kwargs):
    args = args or {}
    ex = str(args.get("exam") or "") or None
    limit = max(1, min(int(args.get("limit") or 20), 100))
    try:
        return _out({"topics": topics_mod.summarize(exam=ex, limit=limit)})
    except (OSError, ValueError) as e:
        return _out({"error": f"the topics ledger is unreadable: {e}"})


def tool_papers(args=None, **kwargs):
    del args
    rows = []
    for p in store_mod.list_packs():
        if "invalid" in p:
            rows.append({"paper_id": p.get("paper_id"), "invalid": p.get("invalid")})
            continue
        ks = p.get("key_status")
        rows.append({"paper_id": p["paper_id"], "title": p.get("title"), "exam": p.get("exam") or pack_mod.exam_of(p["paper_id"]),
                     "kind": p.get("kind", "pyq"), "year": p.get("year"),
                     "questions": len(p.get("questions") or []),
                     "key_status": "official" if not ks else ks})
    return _out({"papers": rows})


TOOLSET_SPEC = (
    ("exam_desk_live", tool_live_context, {
        "name": "exam_desk_live",
        "description": ("Read the live mirror: the question currently on the student's screen during an "
                        "ASSISTED sitting, with the attempt id and the remaining time. Answers "
                        "{\"live\": false} when nothing is running — finished sittings are "
                        "exam_desk_attempt's job."),
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
    }),
    ("exam_desk_attempt", tool_attempt, {
        "name": "exam_desk_attempt",
        "description": ("Read ONE sitting's record: status, mode, score and verdicts, and — once submitted — "
                        "every question with text, the student's choice, the keyed answer and the "
                        "explanation. Read-only; the panel owns all state changes."),
        "parameters": {"type": "object", "properties": {
            "attempt_id": {"type": "string", "description": "The sitting's id, e.g. a-1a2b3c4d5"},
        }, "required": ["attempt_id"], "additionalProperties": False},
    }),
    ("exam_desk_doubt", tool_log_doubt, {
        "name": "exam_desk_doubt",
        "description": ("On a LIVE assisted sitting, append one tutor-doubt event to its behaviour stream — "
                        "what the student asked about the question on screen. The plugin's ONLY "
                        "agent-initiated write; it never touches answers or the attempt."),
        "parameters": {"type": "object", "properties": {
            "attempt_id": {"type": "string", "description": "The live sitting's id (from exam_desk_live)"},
            "question_id": {"type": "string", "description": "The question the doubt was about, e.g. B-03"},
            "note": {"type": "string", "description": "One short phrase — what was asked"},
        }, "required": ["attempt_id", "question_id"], "additionalProperties": False},
    }),
    ("exam_desk_topics", tool_topics, {
        "name": "exam_desk_topics",
        "description": ("The topics ledger: what the post-exam evaluations keep flagging, newest first, with "
                        "the sitting ids that backed each row. Use it to answer 'what should I study'."),
        "parameters": {"type": "object", "properties": {
            "exam": {"type": "string", "description": "Optional exam slug to narrow the ledger (e.g. gat-b)"},
            "limit": {"type": "integer", "description": "How many rows (default 20)"},
        }, "additionalProperties": False},
    }),
    ("exam_desk_papers", tool_papers, {
        "name": "exam_desk_papers",
        "description": ("List the panel's papers: id, title, exam, kind, year, question count and the key's "
                        "declared trust. Use it for 'what papers do I have' or to plan a sitting."),
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
    }),
)

TOOL_NAMES = tuple(spec[0] for spec in TOOLSET_SPEC)


def toolset():
    """(name, handler, schema) in manifest order."""
    return [(name, handler, schema) for name, handler, schema in TOOLSET_SPEC]


# --------------------------------------------------------------------------- #
# pre_llm_call: automatic context for the tutor chat
# --------------------------------------------------------------------------- #
def _live_by_session(session_id):
    if not session_id:
        return None
    for a, err in store_mod.iter_attempts(limit=None):
        if a is None or err:
            continue
        if (a.get("status") == "in_progress" and vocab.normalize_mode(a.get("mode")) == "assisted"
                and a.get("assisted_session_id") == session_id):
            return a
    return None


def _question_block(a):
    pack = None
    try:
        pack = store_mod.get_pack(a["paper_id"])
    except (KeyError, FileNotFoundError, ValueError):
        return None
    try:
        qid = a.get("current") or store_mod.current_question_id(a, pack)
    except Exception:
        return None
    q = next((x for x in pack.get("questions") or [] if x["id"] == qid), None)
    if q is None:
        return None
    sec = next((s for s in pack["pattern"]["sections"] if s["id"] == q["section"]), {})
    c, w = grading.marks_for(q, sec)
    saved = (a.get("answers") or {}).get(qid)
    lines = [f"question {q['id']} · {q['type']} · topic {q.get('topic', 'n/a')} · +{c} / {w} marks", q["text"]]
    for i, o in enumerate(q.get("options") or []):
        lines.append(f"{chr(65 + i)}) {o}")
    if saved is None:
        lines.append("saved answer: none yet")
    else:
        def fmt(x):
            if isinstance(x, list):
                return ", ".join(chr(65 + i) if isinstance(i, int) else str(i) for i in sorted(x)) or "—"
            return f"{chr(65 + x)}" if isinstance(x, int) and q.get("options") else str(x)
        lines.append(f"student's SAVED answer: {fmt(saved)} (what is on screen may be newer — answers count only once saved)")
    return "\n".join(lines)


def on_pre_llm_call(session_id, **kwargs):
    """Inject the sitting's state into turns of the session the tutor sits in.

    Fires in every chat of the profile; the session match (the attempt records
    the tutor chat's session id) is what keeps it out of every other
    conversation. Best-effort in the hook contract: any surprise answers None
    and the turn proceeds without the context."""
    del kwargs
    try:
        a = _live_by_session(session_id)
        if a is None:
            return None
        if store_mod.remaining_seconds(a) <= 0:
            return None
        block = _question_block(a)
        if block is None:
            return None
        return (
            f"[EXAM DESK — assisted sitting live: {a.get('paper_title') or a.get('paper_id')} "
            f"(attempt {a.get('id')}, exam {a.get('exam')}); {max(0, int(store_mod.remaining_seconds(a)) // 60)} min left]\n"
            f"{block}\n"
            "The answer key is not in this context: hint first (name the concept, walk back from the wrong option) "
            "and give the full answer only when the student asks for it. Log the doubt once per answered doubt with "
            "the exam_desk_doubt tool. If the student changes what is on screen, the tools show the fresh mirror."
        )
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# /examdesk — the desk from any chat (CLI, Telegram, desktop)
# --------------------------------------------------------------------------- #
def examdesk_status():
    packs = tool_papers()
    rows = json.loads(packs).get("papers", [])
    lines = []
    if rows:
        groups = {}
        for r in rows:
            label = f"{r['title'] or r['paper_id']}" + (f" ({r['year']})" if r.get("year") and str(r['year']) not in str(r['paper_id']) else "")
            groups.setdefault(r.get("exam") or "?", []).append(f"{label} · {r.get('kind', 'pyq')} · {r['questions']} q"
                                                              + ("" if r.get("key_status") in (None, "official") else f" · key {r['key_status']}"))
        lines.append("papers:")
        for ex, items in sorted(groups.items()):
            lines.append(f"  {ex}: " + "; ".join(items))
    else:
        lines.append("papers: none yet — ask for a previous-year paper and it files itself here.")
    live = _current_live_file()
    if live:
        try:
            a = store_mod.get_attempt(live.stem)
            mins = max(0, int(store_mod.remaining_seconds(a)) // 60)
            lines.append(f"running: a {vocab.mode_label(a.get('mode'))} sitting on {a.get('paper_id')} "
                         f"(attempt {a.get('id')}, ~{mins} min left)")
        except (KeyError, ValueError, OSError):
            lines.append("running: a mirrored sitting whose record is unreadable")
    else:
        lines.append("running: nothing live")
    history = []
    for a, err in store_mod.iter_attempts(limit=5):
        if a is None or err:
            continue
        if a.get("status") != "submitted":
            continue
        r = (a.get("result") or {})
        history.append(f"{a.get('paper_id')} {r.get('totals', {}).get('correct', 0)} correct / "
                       f"{r.get('totals', {}).get('wrong', 0)} wrong / {r.get('totals', {}).get('skipped', 0)} skipped")
    if history:
        lines.append("latest sittings: " + "; ".join(history))
    try:
        ts = topics_mod.summarize(limit=3)
        if ts:
            lines.append("keeps flagging: " + "; ".join(f"{t['topic']} (×{t.get('hits', 1)})" for t in ts))
    except (OSError, ValueError):
        pass
    lines.append("ask for a review of any 'attempt id', a question doubt in an assisted sitting, or a new paper.")
    return "\n".join(lines)


def on_command_examdesk(raw_args, *, session_id="", platform="", source=None, **kwargs):
    del raw_args, platform, source
    try:
        return examdesk_status()
    except Exception as e:
        return f"exam-desk status failed: {e} (the plugin half may be disabled)"


# --------------------------------------------------------------------------- #
# the registration wire — called from the plugin's register(ctx)
# --------------------------------------------------------------------------- #
BLUEPRINT_SESSIONS = (
    {"name": "minute", "type": "int", "label": "Minute", "default": 30},
    {"name": "hour", "type": "int", "label": "Hour (24h)", "default": 20},
)


def register_agent(ctx):
    """Register the toolset, the hook, the /command and the blueprint.

    Ordered to match the manifest: provides_tools mirrors TOOLSET_SPEC exactly.
    A failure here must not take the skills and the evaluation bridge with it —
    the caller wraps this in a try/except by design."""
    for name, handler, schema in toolset():
        ctx.register_tool(name=name, toolset=TOOLSET, schema=schema, handler=handler)
    ctx.register_hook(HOOK_NAME, on_pre_llm_call)
    ctx.register_command(COMMAND_NAME, handler=on_command_examdesk,
                         description="Exam Desk status: papers, running sittings, weakest topics")
    ctx.register_automation_blueprint(
        BLUEPRINT_KEY,
        title="Exam Desk evening digest",
        description="Every evening, summarise the desk: papers, sittings since yesterday, what keeps being flagged, and the one topic to drill tomorrow.",
        schedule_template="{minute} {hour} * * *",
        category="study",
        prompt_template=(
            "Produce an exam-desk evening digest from the plugin's own records using the exam-desk tools: "
            "list the papers (exam_desk_papers), look through submitted attempts of the last 24h "
            "(exam_desk_attempt for each new id), read the topics ledger (exam_desk_topics) and end with "
            "the ONE topic worth drilling next and why. If nothing was sat in the last 24h say so plainly "
            "instead of summarising stale data. Keep it under 120 words."
        ),
        slots=BLUEPRINT_SESSIONS,
        deliver_default="origin",
        skills=(),
        tags=("exam-desk", "study"),
    )


def describe_surface():
    """Load-time diagnostic: what is wired and against which manifest names."""
    return {"tools": list(TOOL_NAMES), "hooks": [HOOK_NAME, ], "command": COMMAND_NAME, "blueprint": BLUEPRINT_KEY,
            "data_dir": str(Path(store_mod.data_root()))}
