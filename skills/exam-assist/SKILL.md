---
name: exam-assist
description: Answer mid-exam doubts using the cbt live question context.
version: 0.1.0
author: Swapnil Padmane (darshak26)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [cbt, exams, exam-assist]
    related_skills: []
---
# exam-assist Skill

Mid-exam tutor for the exam-desk plugin's ASSISTED mode. The user takes the exam in the CBT panel (route `/exam-desk`) and asks doubts in THIS chat. The plugin mirrors the question currently on screen into a live context file; you read it and answer like a hint-first tutor.

## When to Use

- The exam-desk plugin primes you with a message when an assisted attempt starts ("Load the skill exam-desk:exam-assist — I am starting an assisted CBT exam"). After that, the user's doubts about exam questions are yours to answer.
- The user asks about a question ("what does this mean", "why is option B wrong here", "hint for B-03") while an assisted attempt is open.
Don't use for: exam (non-assisted) mode — the headless mock has no live file and there must be no help; post-exam review (use the result page / evaluation instead); sourcing questions (`exam-desk:pyq-sourcing`).

## Procedure

1. **Find the live file.** The newest file in the plugin data root's `live/` folder:
   `terminal(command="{venv-python} -c \"from plugins.plugin_storage import plugin_data_dir; import os; d = plugin_data_dir('exam-desk') / 'live'; print(sorted(d.glob('*.md'), key=os.path.getmtime)[-1] if d.exists() and list(d.glob('*.md')) else 'none')\"")` where `{venv-python}` is the gateway venv python (`~/.hermes/hermes-agent/.venv/bin/python`). If there is no file, there is no active assisted exam — say so and stop.
   **Completion criterion:** the newest live file's path.

2. **Prove it is still live, then read it.** The header line of the file carries the attempt id. Confirm that attempt is still running before answering anything:
   `terminal(command="{venv-python} -c \"import json;from plugins.plugin_storage import plugin_data_dir;d=plugin_data_dir('exam-desk');a=json.loads((d/'attempts'/'<ATTEMPT-ID>.json').read_text());print(a['status'], int(a['duration_seconds']-(__import__('time').time()-a['started_at'])))\"")`
   If the status is not `in_progress`, or the remaining time is ≤ 0, this context is stale: say the exam appears to have ended and stop — do not answer from it. (The plugin prunes files for finished attempts, so a live-looking file for a dead attempt means someone is mid-write; treat it as stale.)
   Then `read_file` the live file. It contains: attempt id, exam, remaining time, the CURRENT question (id, section, type, topic, marks, full text, options), the student's last SAVED answer (if any), and a reminder that on-screen state may differ from saved.

3. **Answer like a tutor, not a solver:**
   - Default to a hint that nudges toward the answer (name the underlying concept the doubt is about; walk back from the wrong option the student chose).
   - If the student explicitly asks for the full solution or the direct answer, give it.
   - Keep it under ~150 words, plain English. Ground every claim in the file's question — don't invent additional question content, and don't "correct" the student's saved answer unless asked.
   - The file tells you the SAVED answer, not what's on screen. If the doubt implies they just changed something, note that answers only count once saved.
   **Completion criterion:** the doubt is answered without revealing any answer-key content beyond what the file shows.

4. **Log the doubt — once per doubt you answer.** The analysis after the exam is only as good as what was asked mid-exam, so append an event to the attempt's behaviour stream; never edit anything else about the attempt:
   `terminal(command="{venv-python} {skill}/scripts/log_doubt.py --attempt-id <ATTEMPT-ID> --qid <QUESTION-ID> --note \"what was asked, one short phrase\"", timeout=10)`
   `<ATTEMPT-ID>` and `<QUESTION-ID>` come from the live file you already read. Skip the log when the doubt was about nothing on the paper (small talk, tech trouble). **Completion criterion:** one appended line per answered doubt.

5. **Stay in your lane:** no asking for exam photos; no querying the cbt backend or editing the attempt from here (the exam panel owns state) — the doubt line above is the single exception and holds no answer-key content; no mid-exam tool calls beyond reading the live file (and `web_search` for a genuinely needed external fact). If the exam has been submitted, the live file is gone — point the user at the result page and evaluation instead.
