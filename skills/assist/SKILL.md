---
name: assist
description: Answer mid-exam doubts from the live question.
version: 0.1.0
author: Swapnil Padmane (darshak26)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [exam-desk, tutor, assist]
    related_skills: []
---
# assist Skill

Mid-exam tutor for the exam-desk plugin's ASSISTED mode. The user sits the exam in the panel (route `/exam-desk`) and asks doubts in THIS chat. The plugin mirrors the question currently on screen into a live context file; you read it and answer like a hint-first tutor.

## When to Use

- The exam-desk plugin primes you with a message when an assisted attempt starts ("Load the skill exam-desk:assist — I am starting an assisted CBT exam"). After that, the user's doubts about exam questions are yours to answer.
- The user asks about a question ("what does this mean", "why is option B wrong here", "hint for B-03") while an assisted attempt is open.
Don't use for: mock mode — the headless mock has no live file and there must be no help; post-exam review (use the result page / evaluation instead); sourcing questions (`exam-desk:pyq`).
If the user asks an exam doubt while a MOCK attempt is running anywhere in the panel (a mock has no live file, and a mock's record says mode `mock`), decline to help mid-mock: say the sitting must stay unaided by design and offer to explain after submission.

## Procedure

1. **Load the live context with the tool** — the plugin registers an agent tool for exactly this:
   call `exam_desk_live` (no parameters). It reads the newest `live/` mirror for you and answers:
   - `{"live": false, "reason": ...}` when no assisted sitting is running — say so and stop;
   - the mirrored context text (question, options, saved answer), attempt id, mode and `remaining_seconds`.
   The handler re-checks the attempt is `in_progress` before answering, so the stale-mirror case is already
   caught. If the tool is missing (a plugin half that predates it), fall back to the file dance:
   `terminal(command="{venv-python} -c \"from plugins.plugin_storage import plugin_data_dir; import os; d = plugin_data_dir('exam-desk') / 'live'; print(sorted(d.glob('*.md'), key=os.path.getmtime)[-1] if d.exists() and list(d.glob('*.md')) else 'none')\"")` where `{venv-python}` is the interpreter the Hermes gateway itself runs under. **Completion criterion:** the live context (tool) or the newest live file's path (fallback).
   The plugin may also have injected an `[EXAM DESK — assisted sitting live]` block into this turn's context by
   itself — that IS the live context, no need to call the tool again.

2. **Answer like a tutor, not a solver:**
   - Default to a hint that nudges toward the answer (name the underlying concept the doubt is about; walk back from the wrong option the student chose).
   - If the student explicitly asks for the full solution or the direct answer, give it.
   - Keep it under ~150 words, plain English. Ground every claim in the file's question — don't invent additional question content, and don't "correct" the student's saved answer unless asked.
   - The context tells you the SAVED answer, not what's on screen. If the doubt implies they just changed something, note that answers only count once saved.
   **Completion criterion:** the doubt is answered without revealing any answer-key content beyond what the context shows.

3. **Log the doubt — once per doubt you answer.** The analysis after the exam is only as good as what was asked mid-exam, so append one event to the sitting's behaviour stream; never edit anything else about the attempt:
   call the `exam_desk_doubt` tool with `attempt_id` + `question_id` from the context and a one-phrase `note`. (Fallback when the tool is missing: `{skill}/scripts/log_doubt.py --attempt-id <ATTEMPT-ID> --qid <QUESTION-ID> --note "what was asked"`.)
   Skip the log when the doubt was about nothing on the paper (small talk, tech trouble). **Completion criterion:** one appended event per answered doubt.

4. **Stay in your lane:** no asking for exam photos; no editing the attempt or the panel's state from here (the exam panel owns state; the doubt log is the single exception and holds no answer-key content); no mid-exam tool calls beyond `exam_desk_live` / `exam_desk_doubt` (and `web_search` for a genuinely needed external fact). If the exam has been submitted, the mirror is gone — point the user at the result page and evaluation instead.
