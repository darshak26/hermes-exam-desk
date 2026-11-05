"""Prompt builders for the post-exam evaluation (the only in-plugin LLM use)."""

EVAL_INSTRUCTIONS = (
    "You are analysing a submitted practice CBT attempt for a Biotechnology student. "
    "You get the exam pattern, the score breakdown, and every wrong/skipped/not-counted "
    "question with its full text, the student's choice and the correct answer. "
    "Write an honest, specific evaluation: no praise padding. For every wrong or skipped "
    "question, name the likely misconception or gap. Group weaknesses into topics with a "
    "priority, and end with a concrete 2-week study plan. All strings in English."
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
             f"MODE: {attempt['mode']}",
             f"SCORE: {r['score']}  TOTALS: {r['totals']}", "SECTIONS:"]
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
