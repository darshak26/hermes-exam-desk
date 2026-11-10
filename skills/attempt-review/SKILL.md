---
name: attempt-review
description: Post-exam review for the exam-desk plugin — walk a finished attempt, explain every miss, build the study plan.
version: 0.1.0
author: Swapnil Padmane (darshak26)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [cbt, exams, attempt-review, analysis]
    related_skills: []
---

# attempt-review Skill

Detailed post-exam review for the exam-desk plugin. The result page shows the score and the AI's basic analysis; the "Discuss in chat" button on that page opens a session primed with this skill. Your job is the depth the surface leaves out: every wrong and skipped question, why, and what to study.

## When to Use

- The exam-desk result page primes you with a turn that names `exam-desk:attempt-review` and carries the attempt id. Then analyse THAT attempt without asking for another id.
- The user asks about a specific finished attempt (" analyse my GAT-B attempt a-1a2b3c4d5", "why did I lose marks in section B").

Don't use for: an attempt still running (`exam-desk:exam-assist` and the live file cover that; there must be no help mid-exam) or sourcing a paper (`exam-desk:pyq-sourcing`).
If the user asks mid-exam questions through this skill's context while a mock is still running anywhere in the panel, decline: say the sitting must stay unaided by design, and answer after submission.

## Procedure

1. **Load the attempt with the tool.** The id is in the priming turn. The plugin registers an agent tool for this:
   call `exam_desk_attempt` with `attempt_id`. It answers `{"error": ...}` for unknown ids and refuses nothing
   else — a non-submitted attempt comes back with `result: null` and a note instead of rows; say so plainly and stop.
   The response carries the session ids too: `assisted_session_id` (the tutor chat) and `review_session_ids`.
   If the tool is missing (a plugin half that predates it), fall back to the script:
   `terminal(command="{venv-python} {skill}/scripts/load_attempt.py <ATTEMPT-ID>", timeout=30)`
   where `{venv-python}` is any working `python3` — the script is stdlib-only, so the
   system python runs it; the hardcoded gateway-venv path other skills mention is
   NOT needed here — and `{skill}` is this skill's directory.
   If the attempt does not exist or its status is not `submitted`, say so plainly and stop — do not reconstruct a result from memory.
   **Completion criterion:** the printed report carries the paper and its exam, score totals and per-question verdicts.

2. **Read the paper's key.** The tool's response (or the script's report) carries the paper's `provenance` and `key_status` and then every question with its full text, options, the answer and the explanation; per-question verdicts, awarded marks and the topic live on the attempt's `result.questions`.
   `provenance` and `key_status` matter: a paper declared `random` or `unverified` has no trustworthy key — say which items you could not audit instead of grading the student against placeholders.

3. **Walk the misses in the student's order, one by one.** For every wrong or skipped line, give: the question id, what the item tests, what the student chose (or "skipped"), why the recorded answer is right — a mechanism, not a letter — and the step to fix it. Keep the same rules the panel's AI analysis already followed: only a chosen option is evidence; a skip gets what the item tests, never an invented misconception; solve each item yourself and say so when the paper's key is wrong. Skip the ones the same misconception already covered — name it once and list the ids under it.
   **Completion criterion:** every `wrong`/`skipped`/`not_counted` non-correct row is either explained or folded under a named misconception.

4. **End with a study plan.** Prioritise the misconceptions by marks lost (awarded × occurrences), give each a concrete drill and rough dates in days from today, and keep it short — a plan someone would actually run, so two or three bullets per block and the block order justified in one line.

## The assisted chat

If the sitting was assisted, the tool response (and `load_attempt.py`) carries the **ASSISTED CHAT** field: the id
of the Hermes session where the tutor sat with the student. That transcript survives
(submit clears only the plugin's scratch pointer, never the chat) — open it when a
missed question has a recorded doubt, and read what you told them. It is the best
evidence of the gap; what it is **not** is evidence the student knew it afterwards — a
residual miss after being told is exactly the opinion you diagnose. Also treat the
sitting's scoreline as weaker proof than a mock's, on the same reasoning.

The tool response lists any **REVIEW CHATS** linked to this attempt under `review_session_ids`. If one
exists, open it before starting so this review continues the previous discussion
instead of re-inventing it.

## Report shape

Plain talk: one line per question under a heading per section, then the plan. The result page already shows the numbers — do not re-derive the scorecard; only total marks at the top and the plan. Cite ids as `A-07`, so the student can jump between the chat and the result page's review rows.
