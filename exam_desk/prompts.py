"""Prompt builders for the post-exam evaluation (the only in-plugin LLM use)."""
import json

EVAL_INSTRUCTIONS = (
    "You are analysing a submitted practice CBT attempt for a Biotechnology student. "
    "You get the exam pattern, the score breakdown, and every wrong/skipped/not-counted "
    "question with its full text, the student's choice and the correct answer. "
    "Write an honest, specific evaluation: no praise padding. For every wrong or skipped "
    "question, name the likely misconception or gap. If a question was answered but not "
    "counted, that is a pacing/attempt-limit mistake — say what it cost and how to avoid "
    "it. Group weaknesses into topics with a priority, and end with a concrete 2-week "
    "study plan. "
    "Three rules. (1) Only a chosen option is evidence: for a skipped question say it was "
    "not attempted and what the item tests — never invent a misconception for a blank. "
    "If the attempt has no answers at all, say plainly that there is no diagnostic data "
    "and make no topic claims. (2) Solve each item yourself before judging it: when your "
    "answer differs from the pack's key, say so and label the item MIS-KEYED rather than "
    "coaching the student toward a wrong key. (3) The KEY line states how far the key can "
    "be trusted; when it is not official, name the items you could not verify. "
    "All strings in English."
)

EVAL_SCHEMA = {
    "type": "object",
    "properties": {
        "overall_comment": {"type": "string"},
        "sections": {"type": "array", "items": {"type": "object", "properties": {
            "section_id": {"type": "string"}, "comment": {"type": "string"}},
            "required": ["section_id", "comment"]}},
        "weak_topics": {"type": "array", "items": {"type": "object", "properties": {
            "topic": {"type": "string"}, "evidence": {"type": "string"},
            "priority": {"type": "string", "enum": ["high", "medium", "low"]}},
            "required": ["topic", "evidence", "priority"]}},
        "wrong_answer_notes": {"type": "array", "items": {"type": "object", "properties": {
            "question_id": {"type": "string"}, "note": {"type": "string"}},
            "required": ["question_id", "note"]}},
        "study_plan": {"type": "array", "items": {"type": "string"}}
    },
    "required": ["overall_comment", "sections", "weak_topics", "wrong_answer_notes", "study_plan"]
}

def evaluation_input(pack, attempt):
    r = attempt["result"]
    lines = [f"EXAM: {pack.get('title', pack['exam_id'])} ({pack.get('provenance', '')})",
             f"MODE: {attempt['mode']}"]
    ks = pack.get("key_status") or "official"
    lines.append("KEY: official exam key" if ks == "official" else
                 f"KEY: {ks} — not an official key; a mis-keyed item is a finding, not a student error")
    lines.append("PATTERN:")
    for s in pack["pattern"]["sections"]:
        limit = s.get("attempt_limit")
        lines.append(f"  {s['id']} {s.get('title', '')}: {s.get('question_count')} questions, "
                     f"attempt {'all' if not limit else f'first {limit}'}, "
                     f"+{s.get('marks_correct')}/{s.get('marks_wrong')}")
    lines += [f"SCORE: {r['score']}  TOTALS: {r['totals']}", "SECTIONS:"]
    for sid, st in r["sections"].items():
        lines.append(f"  {sid}: {st}")
    lines.append("QUESTIONS:")
    qmap = {q["id"]: q for q in pack["questions"]}
    for row in r["questions"]:
        head = (f"  {row['id']} | {row['type']} | {row.get('topic', '')} | "
                f"verdict={row['verdict']} | awarded={row['awarded']} | marks={row['marks']}")
        if row["verdict"] == "correct":
            lines.append(head)
        else:   # wrong / skipped / not_counted → full text: not-counted needs strategy feedback too
            q = qmap[row["id"]]
            given = attempt["answers"].get(row["id"], "—")
            opts = (" | ".join(f"{chr(65+i)}={o}" for i, o in enumerate(q.get("options", [])))
                    if q.get("options") else "")
            lines.append(head)
            lines.append(f"    text: {q['text']}")
            if opts:
                lines.append(f"    options: {opts}")
            lines.append(f"    student chose: {given}   correct: {q['answer']}")
    return "\n".join(lines)

def parse_json_block(text):
    """The first {...} block in a model reply, parsed. None when there isn't one.

    Last-resort path for providers that refuse `response_format` entirely: ask for
    JSON in the instructions and dig it out of the prose.
    """
    if not isinstance(text, str):
        return None
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except ValueError:
        return None


def validate_evaluation(parsed):
    """Defensive check — jsonschema is not installed in the gateway venv, so validate by hand."""
    if not isinstance(parsed, dict):
        return None
    if not isinstance(parsed.get("overall_comment"), str):
        return None
    def _items(key, req):
        out = []
        if isinstance(parsed.get(key), list):
            for it in parsed[key]:
                if isinstance(it, dict) and all(isinstance(it.get(k), str) and it.get(k) for k in req):
                    out.append({k: it[k] for k in req})
        return out
    sections = _items("sections", ("section_id", "comment"))
    notes = _items("wrong_answer_notes", ("question_id", "note"))
    weak = []
    if isinstance(parsed.get("weak_topics"), list):
        for it in parsed["weak_topics"]:
            if (isinstance(it, dict) and isinstance(it.get("topic"), str)
                    and isinstance(it.get("evidence"), str)
                    and it.get("priority") in ("high", "medium", "low")):
                weak.append({"topic": it["topic"], "evidence": it["evidence"], "priority": it["priority"]})
    plan = [s for s in parsed.get("study_plan", []) if isinstance(s, str) and s] \
        if isinstance(parsed.get("study_plan"), list) else []
    if not (sections or weak or notes or plan):
        return None
    return {"overall_comment": parsed["overall_comment"], "sections": sections,
            "weak_topics": weak, "wrong_answer_notes": notes, "study_plan": plan}
