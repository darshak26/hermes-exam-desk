---
name: pyq
description: Source past-year papers into exam-desk papers.
version: 0.1.0
author: Swapnil Padmane (darshak26)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [exam-desk, pyq, sourcing]
    related_skills: []
---
# pyq Skill

Turn an exam + year into a validated `cbt-pack/1` JSON installed in the exam-desk plugin's data directory, so the user can sit it as a practice paper. Exam-agnostic: the SAME procedure works for GAT-B, GATE, JAM, JEE, CUET — every pattern number comes from the official source, never from habit.

## When to Use

- User asks to source previous-year questions / an exam pattern for any exam into the exam-desk panel ("add GAT-B 2023 papers", "get me GATE BT 2024 questions").
- User asks "what's the exam pattern for <exam>" in the context of the exam-desk panel.

Don't use for: writing study notes, explaining concepts, or pen-and-paper exams.
While a sitting is still running, adding a NEW paper is fine — but never `--replace`,
overwrite or delete the paper that sitting is reading: the live exam shell reads the paper
during the attempt. File it after the sitting submits.

## The interview (how a run usually starts)

The exam-desk panel has two labels for adding material, one per level: **Add exam**
(the home top row and the empty state — a brand-new exam family) and **Add paper**
(on an exam's band — another paper for an exam the panel already holds). Either
turn names both this skill and `exam-desk:draft`, with no exam or year: the
conversation is the form. You are the first route, because an official paper is
the better material whenever one exists. Open with ONE question, never a checklist:

1. **Which exam?** Take a name, an abbreviation, or a description ("the DBT one").
   If the answer is vague, offer the two or three most likely candidates — prefer
   exams already in the papers directory, since those have a known pattern to reuse.
2. **Which year?** If they don't know, fetch the conducting body's own paper listing
   and offer the years it actually publishes. Never propose a year you have not seen
   linked from the official site.
3. **Which source?** Only when both exist: "official paper + answer key, or official
   paper only?" One line, not a paragraph.

Never re-ask something the opening turn already contained — if it says "GAT-B 2024",
skip to question 3. Once you have exam, year and source preference, run the
procedure below without further questions unless step 1 or 2 says STOP.

## Fidelity gate before filing

`validate_pack.py` checks *shape*, not content: a paper can PASS with every option
reading `Option 3`, `11001 _ .`, or `-Irr`. Before filing, open three random
questions and read them as a student would. Any of these means stop and report
rather than file:

- options that are page numbers, question ids, or stray punctuation
- a stem ending mid-sentence, or one question's text inside another's
- math that cannot be parsed back into an expression
- more `WARN:` lines than questions you would actually answer

If the source PDF has no text layer (question bodies rendered as images), extraction
is OCR and math and figures degrade first — say so in the report, name the questions
affected, and let the user decide whether to keep the paper.

## Prerequisites

- The `exam-desk` plugin exists as a package on this machine (`~/.hermes/plugins/exam-desk/`).
- The install target directory — resolve the interpreter from the machine, never hardcode it:
  first check `terminal(command="echo $EXAM_DESK_DATA_DIR")` (it may redirect the data root),
  then find the gateway plug-in data dir with
  `terminal(command="{venv-python} -c \"from plugins.plugin_storage import plugin_data_dir; print(plugin_data_dir('exam-desk') / 'packs')\"", timeout=60)`
  where `{venv-python}` is the interpreter the Hermes gateway itself runs under
  (on a standard Linux install `~/.hermes/hermes-agent/.venv/bin/python`; on other
  layouts, locate that install's venv). The `plugin_storage` import is the test:
  if a `python3` that is not the gateway's raises ImportError there, the interpreter
  is wrong — find the right one rather than falling back to a plain `python3`.
  The printed path is the install target.
- The validator at `skills/pyq/scripts/validate_pack.py` and installer at `skills/pyq/scripts/install_pack.py` inside the plugin package.

## How to Run

All fetches go through `web_search` / `web_extract` (which handles PDFs); all file writes through `write_file`; all validation through `terminal(command="python3 <validator> <paper.json>", timeout=60)`.

## Procedure

1. **Verify the pattern from the official source only.** Use `web_search` to find the conducting body's own information bulletin for the year (`references/sources.md` lists starting points — portals rotate yearly, so always locate the current year's official page). Use `web_extract` on the official bulletin PDF and record: mode (CBT), duration, sections with question counts, attempt limits (e.g. "attempt 60 of 100"), marks correct/wrong per section (and per-question marks if mixed, e.g. GATE 1- and 2-mark questions), negative marking, and whether unanswered scores 0. **Completion criterion:** every pattern number traces to an official URL you actually fetched — coaching sites are cross-checks only, never primary. If you cannot find the official bulletin, STOP and ask the user.

2. **Find the paper.** Prefer: official question paper PDF + official answer key from the conducting body. Acceptable fallback: official paper + reputable coaching key; or memory-based reconstructions — the latter MUST be labeled `"memory-based reconstruction by <source>; unverified"` in the paper's `provenance` and never silently mixed with official keys. **Completion criterion:** paper file downloaded (or extracted inline) and the key source identified.

3. **Extract the questions.** `read_file` on the PDF (auto-extracts text). Scanned/image PDFs → OCR first: try `sarvam-vision-extract` skill (needs SARVAM_API_KEY + MCP configured); if unavailable, fall back to local `tesseract` (render pages with `pdftoppm -r 200`, run `tesseract page.png stdout`). Inline figures → `vision_analyze` on rendered pages. Transcribe faithfully: question text, all options, question type (`mcq` single-select / `msq` multi-select / `nat` numerical), topic tag (a REAL topic name — it drives AI evaluation), marked marks if the exam mixes them. **Completion criterion:** every question has text, options, type, topic, and `source_url`.

4. **Build the paper JSON** per `references/pack-schema.md`: set `kind: "pyq"`, `year` (integer year of the sitting, required for PYQs), `exam` (exam slug, e.g. `gat-b`), `paper_id` = lowercase slug (`gat-b-2024`, `gate-bt-2023`), pattern per step 1, `source_url` + `provenance` at paper level (and `provenance` per-question overrides apply). When you could not obtain a real key — a test run, or placeholders to unblock UI work — set `"key_status": "random"`; a reconstructed key gets `"unverified"`. Leaving it out claims an official key. **Completion criterion:** file written to a scratch path (NOT the papers dir yet).

5. **Validate:** `terminal(command="python3 <plugin>/skills/pyq/scripts/validate_pack.py <scratch paper>", timeout=60)`. Must print `PASS: <id> — N questions, S sections, D min` (exit 0). Fix and re-run until PASS — section `question_count` MUST equal the actual per-section question count; answer indices are **0-based**; `marks_wrong` is negative. Then read every `WARN:` line it prints (OCR debris, placeholder topics, duplicated options) and fix them too: they don't block grading, but a question whose options are transcription noise is unanswerable. **Completion criterion:** exit 0 and no `WARN:` lines you can fix.

6. **Install:** run `python3 <plugin>/skills/pyq/scripts/install_pack.py <scratch paper>` (add `--replace` only when intentionally replacing an existing paper). Never write or copy directly into `packs/`. Verify from the machine itself: `install_pack.py`'s own `PASS installed <slug>` line IS the proof — it also lists the installed path; do **not** probe `GET /api/plugins/exam-desk/packs` to confirm the paper exists, that API answers `401` before routing to an unauthenticated caller and proves nothing either way. The panel shows the paper after a `Refresh` on the home card (the panel's query cache hides a new file until then) — ask the user to look, if you did not start from a panel turn. **Completion criterion:** `install_pack.py` prints `PASS installed <slug>` (or `PASS replaced <slug>...`), exit 0.

7. **Report provenance to the user**, concisely: which year/exam, official vs memory-based, answer-key source, number of questions per section, and any gaps (missing questions → say how many and why).

## Pitfalls

- **Answer key is mandatory for a valid paper.** The validator requires an `answer` on every question. If the user provides only the question paper, ask for the answer key (official NTA key, coaching key, or memory-based) before building — a transcription without answers cannot be validated or installed.
- Never invent questions, options, or answer keys. A fabricated question in a practice exam is worse than a missing one.
- NTA exams (GAT-B, CUET, etc.) do NOT publish a public master question paper — the paper is displayed per-candidate behind login at exams.nta.ac.in. Only GATE and JAM publish master papers publicly. For NTA exams you need either a candidate response sheet PDF or a coaching reconstruction.
- NTA's servers (nta.ac.in / exams.nta.ac.in) may be unreachable from this VPS — TLS reset or cert-authentication failures. If curl and both browsers fail, stop retrying and ask the user to provide the PDF (or point to a reachable mirror). Do not report 'I sourced the paper' when you could not actually fetch it."
- **The last question of a QP+AK PDF swallows the paper's tail.** Recent JAM files print
  the question paper and the master answer key in one document, so a text extraction that
  runs to the end appends `END OF THE QUESTION PAPER` and the whole key table to the final
  question. That renders as a wall of numbers on the exam screen and prints the key inside
  a question nobody has submitted. Trim every question's text at the first
  `END OF THE QUESTION PAPER` / `MASTER ANSWER KEY` / `Question No. Subject` marker, keep
  the `(in integer)` instruction that precedes it, and re-check: `lint_pack` warns
  `question text runs into the paper's tail` on any question that still carries one.
- **A numerical question's own instruction is data, not decoration.** When the paper says
  `(in integer)` or `(round off to two decimal places)`, copy it into the question text —
  the panel reads it to decide whether the answer field takes whole numbers or decimals —
  and state the field explicitly with `"input": "integer" | "decimal" | "text"` when the
  wording is ambiguous. `text` is for a key that is not a number at all (`2 to 3`, `x > 2`).
- Answer indices are **0-based**. An index past the last option is the most common silent paper bug — the validator refuses it, so never skip step 5.
- `question_count` per section must equal the actual count; the validator refuses a mismatch. If the real paper's structure can't be expressed (e.g. a true/false subpart), model it as its own section or type — do not force it.
- Never hardcode numbers across exams (GAT-B's "attempt 60 of 100" is not GATE's rule). Every pattern number comes from step 1 of THIS run.
- Memory-based papers carry wrong keys sometimes. Say so in the report; the paper's `provenance` already says it for the user.
- **NTA exams (GAT-B, BET, CUET, etc.) do NOT publish a master question paper PDF** — the question paper is only shown per-candidate behind login on exams.nta.ac.in (response sheet + recorded responses). Unlike GATE/JAM, which publish master papers + keys publicly. So for these exams you cannot extract real questions from an official source; the only routes are (a) a coaching-site reconstruction (label `"memory-based reconstruction by <source>; unverified"`) or (b) a candidate's own response-sheet PDF. If the user expects verified questions, say up front that only (b) or a memory-based paper is possible, and get consent before building.
- The official bulletin may be hard to reach on the NTA portal (rotates, times out). A coaching site mirroring the official NTA PDF is acceptable for *reading* the bulletin content — but verify the PDF header/NTA branding and that pattern numbers match the conducting body; never take a coaching site's *reconstructed* pattern as authoritative. If no bulletin can be found at all, STOP and ask the user (do not proceed on a coaching summary).

## Verification

- Validator prints PASS on the installed file path.
- The paper appears on the exam-desk home page after a `Refresh` (the HTTP API answers `401` to an unauthenticated caller — it proves nothing about the paper's existence).
- A 1-question smoke attempt starts and submits against it (the plugin's own flow; if in doubt, say so — don't fake it).
