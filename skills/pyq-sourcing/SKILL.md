---
name: pyq-sourcing
description: Source PYQ papers and exam patterns into exam-desk packs.
version: 0.1.0
author: Swapnil Padmane (darshak26)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [cbt, exams, pyq, sourcing]
    related_skills: []
---
# pyq-sourcing Skill

Turn an exam + year into a validated `cbt-pack/1` JSON installed in the exam-desk plugin's data directory, so the user can take it as a CBT practice attempt. Exam-agnostic: the SAME procedure works for GAT-B, GATE, JAM, JEE, CUET — every pattern number comes from the official source, never from habit.

## When to Use

- User asks to source previous-year questions / an exam pattern for ANY CBT exam into the CBT plugin ("add GAT-B 2023 papers to CBT", "get me GATE BT 2024 questions").
- User asks "what's the exam pattern for <exam>" in the context of the CBT plugin.

Don't use for: writing study notes, explaining concepts, or non-CBT (pen-and-paper) exams.

## The interview (how a run usually starts)

The CBT panel has one button for adding material — **Add a paper** — and its turn names
both this skill and `exam-desk:paper-gen`, with no exam or year: the conversation is the
form. You are the first route, because an official paper is the better material whenever
one exists. Open with ONE question, never a checklist:

1. **Which exam?** Take a name, an abbreviation, or a description ("the DBT one").
   If the answer is vague, offer the two or three most likely candidates — prefer
   exams already in the packs directory, since those have a known pattern to reuse.
2. **Which year?** If they don't know, fetch the conducting body's own paper listing
   and offer the years it actually publishes. Never propose a year you have not seen
   linked from the official site.
3. **Which source?** Only when both exist: "official paper + answer key, or official
   paper only?" One line, not a paragraph.

Never re-ask something the opening turn already contained — if it says "GAT-B 2024",
skip to question 3. Once you have exam, year and source preference, run the
procedure below without further questions unless step 1 or 2 says STOP.

## Fidelity gate before filing

`validate_pack.py` checks *shape*, not content: a pack can PASS with every option
reading `Option 3`, `11001 _ .`, or `-Irr`. Before filing, open three random
questions and read them as a student would. Any of these means stop and report
rather than file:

- options that are page numbers, question ids, or stray punctuation
- a stem ending mid-sentence, or one question's text inside another's
- math that cannot be parsed back into an expression
- more `WARN:` lines than questions you would actually answer

If the source PDF has no text layer (question bodies rendered as images), extraction
is OCR and math and figures degrade first — say so in the report, name the questions
affected, and let the user decide whether to keep the pack.

## Prerequisites

- The `exam-desk` plugin exists as a package on this machine (`~/.hermes/plugins/exam-desk/`).
- The packs directory — compute it, never hardcode it (profile/symlink safe):
  `terminal(command="{venv-python} -c \"from plugins.plugin_storage import plugin_data_dir; print(plugin_data_dir('exam-desk') / 'packs')\"", timeout=60)` where `{venv-python}` is the gateway venv python (`~/.hermes/hermes-agent/.venv/bin/python`). The printed path is the install target; `EXAM_DESK_DATA_DIR` env var may override it — check with `terminal(command="echo $EXAM_DESK_DATA_DIR")` first.
- The validator at `skills/pyq-sourcing/scripts/validate_pack.py` and installer at `skills/pyq-sourcing/scripts/install_pack.py` inside the plugin package.

## How to Run

All fetches go through `web_search` / `web_extract` (which handles PDFs); all file writes through `write_file`; all validation through `terminal(command="python3 <validator> <pack.json>", timeout=60)`.

## Procedure

1. **Verify the pattern from the official source only.** Use `web_search` to find the conducting body's own information bulletin for the year (`references/sources.md` lists starting points — portals rotate yearly, so always locate the current year's official page). Use `web_extract` on the official bulletin PDF and record: mode (CBT), duration, sections with question counts, attempt limits (e.g. "attempt 60 of 100"), marks correct/wrong per section (and per-question marks if mixed, e.g. GATE 1- and 2-mark questions), negative marking, and whether unanswered scores 0. **Completion criterion:** every pattern number traces to an official URL you actually fetched — coaching sites are cross-checks only, never primary. If you cannot find the official bulletin, STOP and ask the user.

2. **Find the paper.** Prefer: official question paper PDF + official answer key from the conducting body. Acceptable fallback: official paper + reputable coaching key; or memory-based reconstructions — the latter MUST be labeled `"memory-based reconstruction by <source>; unverified"` in the pack's `provenance` and never silently mixed with official keys. **Completion criterion:** paper file downloaded (or extracted inline) and the key source identified.

3. **Extract the questions.** `read_file` on the PDF (auto-extracts text). Scanned/image PDFs → OCR first: try `sarvam-vision-extract` skill (needs SARVAM_API_KEY + MCP configured); if unavailable, fall back to local `tesseract` (render pages with `pdftoppm -r 200`, run `tesseract page.png stdout`). Inline figures → `vision_analyze` on rendered pages. Transcribe faithfully: question text, all options, question type (`mcq` single-select / `msq` multi-select / `nat` numerical), topic tag (a REAL topic name — it drives AI evaluation), marked marks if the exam mixes them. **Completion criterion:** every question has text, options, type, topic, and `source_url`.

4. **Build the pack JSON** per `references/pack-schema.md`: set `kind: "pyq"`, `year` (integer year of the sitting, required for PYQs), `family` (exam slug, e.g. `gat-b`), `exam_id` = lowercase slug (`gat-b-2024`, `gate-bt-2023`), pattern per step 1, `source_url` + `provenance` at pack level (and `provenance` per-question overrides apply). When you could not obtain a real key — a test run, or placeholders to unblock UI work — set `"key_status": "random"`; a reconstructed key gets `"unverified"`. Leaving it out claims an official key. **Completion criterion:** file written to a scratch path (NOT the packs dir yet).

5. **Validate:** `terminal(command="python3 <plugin>/skills/pyq-sourcing/scripts/validate_pack.py <scratch pack>", timeout=60)`. Must print `PASS: <id> — N questions, S sections, D min` (exit 0). Fix and re-run until PASS — section `question_count` MUST equal the actual per-section question count; answer indices are **0-based**; `marks_wrong` is negative. Then read every `WARN:` line it prints (OCR debris, placeholder topics, duplicated options) and fix them too: they don't block grading, but a question whose options are transcription noise is unanswerable. **Completion criterion:** exit 0 and no `WARN:` lines you can fix.

6. **Install:** run `python3 <plugin>/skills/pyq-sourcing/scripts/install_pack.py <scratch pack>` (add `--replace` only when intentionally replacing an existing paper). Never write or copy directly into `packs/`. Verify with `web_extract` or the CBT plugin's home page (ask the user to look, or check via the plugin's own tests) that the pack appears in the list. **Completion criterion:** `install_pack.py` prints `PASS installed <slug>` (or `PASS replaced <slug>...`) and the pack shows up in `GET /api/plugins/exam-desk/packs` (desktop home page).

7. **Report provenance to the user**, concisely: which year/exam, official vs memory-based, answer-key source, number of questions per section, and any gaps (missing questions → say how many and why).

## Pitfalls

- **Answer key is mandatory for a valid pack.** The validator requires an `answer` on every question. If the user provides only the question paper, ask for the answer key (official NTA key, coaching key, or memory-based) before building — a transcription without answers cannot be validated or installed.
- Never invent questions, options, or answer keys. A fabricated question in a practice exam is worse than a missing one.
- NTA exams (GAT-B, CUET, etc.) do NOT publish a public master question paper — the paper is displayed per-candidate behind login at exams.nta.ac.in. Only GATE and JAM publish master papers publicly. For NTA exams you need either a candidate response sheet PDF or a coaching reconstruction.
- NTA's servers (nta.ac.in / exams.nta.ac.in) may be unreachable from this VPS — TLS reset or cert-authentication failures. If curl and both browsers fail, stop retrying and ask the user to provide the PDF (or point to a reachable mirror). Do not report 'I sourced the paper' when you could not actually fetch it."
- Answer indices are **0-based**. An index past the last option is the most common silent pack bug — the validator refuses it, so never skip step 5.
- `question_count` per section must equal the actual count; the validator refuses a mismatch. If the real paper's structure can't be expressed (e.g. a true/false subpart), model it as its own section or type — do not force it.
- Never hardcode numbers across exams (GAT-B's "attempt 60 of 100" is not GATE's rule). Every pattern number comes from step 1 of THIS run.
- Memory-based papers carry wrong keys sometimes. Say so in the report; the pack's `provenance` already says it for the user.
- **NTA exams (GAT-B, BET, CUET, etc.) do NOT publish a master question paper PDF** — the question paper is only shown per-candidate behind login on exams.nta.ac.in (response sheet + recorded responses). Unlike GATE/JAM, which publish master papers + keys publicly. So for these exams you cannot extract real questions from an official source; the only routes are (a) a coaching-site reconstruction (label `"memory-based reconstruction by <source>; unverified"`) or (b) a candidate's own response-sheet PDF. If the user expects verified questions, say up front that only (b) or a memory-based pack is possible, and get consent before building.
- The official bulletin may be hard to reach on the NTA portal (rotates, times out). A coaching site mirroring the official NTA PDF is acceptable for *reading* the bulletin content — but verify the PDF header/NTA branding and that pattern numbers match the conducting body; never take a coaching site's *reconstructed* pattern as authoritative. If no bulletin can be found at all, STOP and ask the user (do not proceed on a coaching summary).

## Verification

- Validator prints PASS on the installed file path.
- The pack appears on the CBT plugin's home page (or via `GET /api/plugins/exam-desk/packs`).
- A 1-question smoke attempt starts and submits against it (the plugin's own flow; if in doubt, say so — don't fake it).
