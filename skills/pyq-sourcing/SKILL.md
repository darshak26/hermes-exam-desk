---
name: pyq-sourcing
description: Source PYQ papers and exam patterns into cbt-exam packs.
version: 0.1.0
author: Swapnil Dilip Padmane, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [cbt, exams, pyq, sourcing]
    related_skills: []
---
# pyq-sourcing Skill

Turn an exam + year into a validated `cbt-pack/1` JSON installed in the cbt-exam plugin's data directory, so the user can take it as a CBT practice attempt. Exam-agnostic: the SAME procedure works for GAT-B, GATE, JAM, JEE, CUET — every pattern number comes from the official source, never from habit.

## When to Use

- User asks to source previous-year questions / an exam pattern for ANY CBT exam into the CBT plugin ("add GAT-B 2023 papers to CBT", "get me GATE BT 2024 questions").
- User asks "what's the exam pattern for <exam>" in the context of the CBT plugin.

Don't use for: writing study notes, explaining concepts, or non-CBT (pen-and-paper) exams.

## Prerequisites

- The `cbt-exam` plugin exists as a package on this machine (`~/.hermes/plugins/cbt-exam/`).
- The packs directory — compute it, never hardcode it (profile/symlink safe):
  `terminal(command="{venv-python} -c \"from plugins.plugin_storage import plugin_data_dir; print(plugin_data_dir('cbt-exam') / 'packs')\"", timeout=60)` where `{venv-python}` is the gateway venv python (`~/.hermes/hermes-agent/.venv/bin/python`). The printed path is the install target; `CBT_EXAM_DATA_DIR` env var may override it — check with `terminal(command="echo $CBT_EXAM_DATA_DIR")` first.
- The validator at `skills/pyq-sourcing/scripts/validate_pack.py` inside the plugin package.

## How to Run

All fetches go through `web_search` / `web_extract` (which handles PDFs); all file writes through `write_file`; all validation through `terminal(command="python3 <validator> <pack.json>", timeout=60)`.

## Procedure

1. **Verify the pattern from the official source only.** Use `web_search` to find the conducting body's own information bulletin for the year (`references/sources.md` lists starting points — portals rotate yearly, so always locate the current year's official page). Use `web_extract` on the official bulletin PDF and record: mode (CBT), duration, sections with question counts, attempt limits (e.g. "attempt 60 of 100"), marks correct/wrong per section (and per-question marks if mixed, e.g. GATE 1- and 2-mark questions), negative marking, and whether unanswered scores 0. **Completion criterion:** every pattern number traces to an official URL you actually fetched — coaching sites are cross-checks only, never primary. If you cannot find the official bulletin, STOP and ask the user.

2. **Find the paper.** Prefer: official question paper PDF + official answer key from the conducting body. Acceptable fallback: official paper + reputable coaching key; or memory-based reconstructions — the latter MUST be labeled `"memory-based reconstruction by <source>; unverified"` in the pack's `provenance` and never silently mixed with official keys. **Completion criterion:** paper file downloaded (or extracted inline) and the key source identified.

3. **Extract the questions.** `read_file` on the PDF (auto-extracts text). Scanned/image PDFs → load the `sarvam-vision-extract` skill for OCR; inline figures → `vision_analyze` on rendered pages. Transcribe faithfully: question text, all options, question type (`mcq` single-select / `msq` multi-select / `nat` numerical), topic tag (a REAL topic name — it drives AI evaluation), marked marks if the exam mixes them. **Completion criterion:** every question has text, options, type, topic, and `source_url`.

4. **Build the pack JSON** per `references/pack-schema.md`: `exam_id` = lowercase slug (`gat-b-2024`, `gate-bt-2023`), pattern per step 1, `source_url` + `provenance` at pack level (and `provenance` per-question overrides apply). **Completion criterion:** file written to a scratch path (NOT the packs dir yet).

5. **Validate:** `terminal(command="python3 <plugin>/skills/pyq-sourcing/scripts/validate_pack.py <scratch pack>", timeout=60)`. Must print `PASS: <id> — N questions, S sections, D min` (exit 0). Fix and re-run until PASS — section `question_count` MUST equal the actual per-section question count; answer indices are **0-based**. **Completion criterion:** exit 0.

6. **Install:** copy the validated pack into the packs directory from Prerequisites as `<exam_id>.json`. Verify with `web_extract` or the CBT plugin's home page (ask the user to look, or check via the plugin's own tests) that the pack appears in the list. **Completion criterion:** the pack shows up in `GET /api/plugins/cbt-exam/packs` (desktop home page).

7. **Report provenance to the user**, concisely: which year/exam, official vs memory-based, answer-key source, number of questions per section, and any gaps (missing questions → say how many and why).

## Pitfalls

- Never invent questions, options, or answer keys. A fabricated question in a practice exam is worse than a missing one.
- Answer indices are **0-based**. An index past the last option is the most common silent pack bug — the validator refuses it, so never skip step 5.
- `question_count` per section must equal the actual count; the validator refuses a mismatch. If the real paper's structure can't be expressed (e.g. a true/false subpart), model it as its own section or type — do not force it.
- Never hardcode numbers across exams (GAT-B's "attempt 60 of 100" is not GATE's rule). Every pattern number comes from step 1 of THIS run.
- Memory-based papers carry wrong keys sometimes. Say so in the report; the pack's `provenance` already says it for the user.

## Verification

- Validator prints PASS on the installed file path.
- The pack appears on the CBT plugin's home page (or via `GET /api/plugins/cbt-exam/packs`).
- A 1-question smoke attempt starts and submits against it (the plugin's own flow; if in doubt, say so — don't fake it).
