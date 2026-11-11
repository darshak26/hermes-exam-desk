# Exam Desk

A computer based testing platform that runs inside Hermes Desktop. You add a
paper, sit it under exam conditions or with a tutor beside you, and get a scored
result page with an AI review of what you missed.

Any exam works. The pattern (sections, question types, marks, attempt limits)
lives in a JSON file, so a new exam is a new paper, not new code.

Needs Hermes 0.23.0 or newer. This is version 0.13.2.

## Three words, three things

| word | what it is |
|---|---|
| exam | the group you prepare for, `gat-b`. A field on every paper. |
| paper | one question file, `packs/<paper_id>.json`. The thing you sit. |
| attempt | one sitting of one paper, in `assisted` or `mock` mode. |

## Three parts

| part | file | job |
|---|---|---|
| Desktop panel | `desktop/plugin.js` | the route `/exam-desk`: home, instructions, exam shell, result |
| Dashboard API | `dashboard/plugin_api.py` | mounted at `/api/plugins/exam-desk/*` |
| Agent half | `__init__.py` + `skills/` | bundles the `pyq`, `draft`, `assist` and `review` skills, and exposes the plugin context to the LLM bridge |

## Install

```bash
hermes plugins install https://github.com/darshak26/hermes-exam-desk
hermes plugins enable exam-desk
hermes gateway restart          # binds the skills and the LLM bridge
```

**Exam Desk** then appears in the app's sidebar. Capabilities, Plugins also
shows it as enabled. A bare `curl` of the plugin API answers `401` before
routing, so it proves nothing either way.

The two halves install in different places, which is where people get stuck.

**The agent half** goes where Hermes runs. That is the two commands above, plus
the restart. Without the restart the panel still works, but the AI evaluation
stays off until the next gateway start.

**The desktop half** is a separate switch and ships disabled on purpose:

- On this machine the panel is already at
  `~/.hermes/desktop-plugins/exam-desk/`. Open Capabilities, Plugins, find Exam
  Desk under Desktop, and enable it.
- With the app on your laptop and Hermes on a server, the app has no copy yet
  and the Plugins page says unavailable (remote backend). Install again from the
  app with Desktop as the target, then enable it there. Enabling it on the
  server does nothing, because the panel runs in the app's renderer.

**After an update, restart the dashboard too.** The panel's HTTP routes are
mounted once, when the dashboard process boots. A route added since then answers
`Not Found` while the file on disk already has it. The panel's own buttons say
this instead of showing a bare 404.

## First run

Nothing here needs a model. A bundled 16 question demo paper is seeded on first
start so the panel is not empty. Five sections, every question type (MCQ, MSQ,
free entry in all three field shapes, figures, and a section where you attempt
any 3 of 4), marking on. Use it to see how the timer, palette and result page
behave, then delete it.

## Add a paper

Two buttons, one turn behind them.

- **Add exam** in the page header starts a new exam. The agent asks which exam
  and which year, one question at a time.
- **Add paper** on an exam card adds another year to an exam you already have.

Both routes name `pyq` first and `draft` second. The agent looks for the
official paper, labelled by what it could verify, and only drafts one when that
exam and year has no official paper, or when you ask for extra practice on a
topic. A drafted paper is badged AI-drafted and its key is `self-authored`. The
agent says which route it took before it starts.

Sourcing needs web tools on the agent. Without them, write a paper by hand
against `skills/pyq/references/pack-schema.md` and install it.

## Assisted or mock

**Assisted** docks the paper in a pane to the right and puts you back in the
chat, so the tutor is one message away while the timer runs. The paper pane
measures itself: below 780px the question palette becomes an overlay drawer
instead of a fixed column.

**Mock** takes the whole page. No chat, no help.

Both are scored. They never mix in analysis, so an assisted sitting never reads
as mock progress.

## The result page

One page per paper, showing one attempt at a time. Arrows and a bar chart of
marks per attempt move between sittings, and everything below follows the
selection. A card holds the score and the section split, statistics render as
tiles, and the AI Overview card runs a review on the sitting. From there
**Discuss in chat** hands the attempt to the agent.

**Drill misses** files a new paper holding every miss from this attempt, with the
source's answers kept as they were, and walks you into the instructions page.

## What the agent can do without the app

The plugin registers five tools, bound at gateway start:

- `exam_desk_papers` lists the papers; `exam_desk_topics` reads the weak topic ledger
- `exam_desk_live` reads the question on screen during an assisted sitting
- `exam_desk_attempt` reads one sitting's full record, key included once submitted
- `exam_desk_doubt` logs a tutor doubt on a live sitting. This is the only write.

`/examdesk` prints a one message status in any chat: papers, what is running,
the latest sittings, the weakest topics. There is also an automation blueprint,
"Exam Desk evening digest", under `/blueprint`. During an assisted sitting the
plugin injects the current question into the tutor's turns, and the answer key
never travels on that channel.

## Papers on disk

`~/.hermes/plugin-data/exam-desk/packs/<paper_id>.json`, or wherever
`$EXAM_DESK_DATA_DIR` points. The schema and every rule the grader enforces are
in `skills/pyq/references/pack-schema.md`.

```bash
python3 skills/pyq/scripts/validate_pack.py my-paper.json
# PASS, then WARN lines for OCR debris and placeholder topics that still grade
python3 skills/pyq/scripts/install_pack.py my-paper.json
# PASS installed <slug>
```

**A second paper** needs a slug naming its year or shift (`gat-b-2022` beside
`gat-b-2023`) and `exam: "gat-b"` in the file. Papers sharing that field sit in
one card and share one topic ledger.

**Replacing a paper** needs `--replace`. Without it the install is refused, so
nothing is overwritten by accident. The old file retires to
`packs/superseded/<slug>.<hash>.json`. Every attempt remembers the hash of the
paper it was sat against, so replacing a paper under an old attempt shows a
notice that the questions are the new file and the score is the original
grading.

## API

Responses are `{attempt, pack, remaining_seconds}`. `pack` carries no answers
until the attempt is submitted. Sittings identify the paper with `paper_id` and
the exam with `exam`, and also echo the 0.9.0 spellings `exam_id` and `family`
so an older panel keeps working. That compatibility is one function,
`plugin_api._legacy()`.

Every request takes the same pair: `paper_id` narrows to one paper, `exam` to one
exam. The old spellings are still accepted on input.

| method | path | notes |
|---|---|---|
| GET | `/health` | `{ok, llm, version}`. `llm:false` means the agent half is not loaded. |
| GET | `/packs` | summaries, plus non fatal `warnings` |
| GET | `/packs/{paper_id}` | sanitised, no `answer`, `explanation` or `tolerance` |
| DELETE | `/packs/{paper_id}` | removes the paper, its assets and its sittings; `409` while a sitting runs |
| DELETE | `/exams/{exam}` | removes every paper of the exam and their sittings; `409` while a sitting runs |
| POST | `/attempts` | `{paper_id, mode}`, mode `assisted` or `mock` |
| GET | `/attempts?limit=50` | newest first; `unreadable` lists corrupt files |
| GET | `/attempts/{aid}` | grades it first if the clock already ran out |
| GET | `/attempts/{aid}/export` | the whole record as downloadable JSON: attempt, pack with key, behaviour view |
| PATCH | `/attempts/{aid}` | `{answers?, marked?, visited?, current?}`, sparse |
| POST | `/attempts/{aid}/submit` | idempotent |
| POST | `/attempts/{aid}/abandon` | discards without grading, key stays hidden |
| POST | `/attempts/{aid}/evaluate?force=` | free when an evaluation already exists |
| POST | `/attempts/{aid}/drill` | files a drill paper from this attempt's misses |
| GET | `/topics?exam=&paper_id=&limit=` | the ledger view |

## Behaviour worth knowing

- **The modes never mix.** An evaluation's history comes from the same paper in
  the same mode, so a tutor assisted sitting never reads as mock progress.
- **A drill is a new paper, never an edit.** It passes the real validator before
  install, and it inherits the source key byte for byte, so an unverified key
  stays unverified.
- **The timer lives on the server.** `remaining_seconds` derives from
  `started_at`, and the server grades on expiry even if the panel never came
  back.
- **The attempt limit counts saved answers.** A cleared answer keeps its slot and
  grades as skipped. A whitespace answer is a clear, not a wrong answer.
- **`marks_wrong` must be zero or negative.** A positive value is rejected,
  otherwise a wrong answer would earn marks.
- **One answer shape rule.** The validator and the answer handler call the same
  function, `pack.answer_error()`, so a paper cannot pass authoring and then fail
  mid exam.
- **Writes are atomic; milestones are synced.** Create, submit, abandon and
  evaluation survive a crash. A routine answer save can lose its last write but
  never the file. On this host that is 0.31 ms against 1.12 ms per write.
- **Papers are cached on mtime and size.** A 160 question paper is parsed and
  validated once per change instead of once per answer save, 0.66 ms down to
  0.023 ms here.
- **Run the plugin in process.** With `plugins.isolation: host`, the dashboard
  routes cannot reach the gateway LLM bridge and post exam evaluation answers
  `503`. Set `plugins.isolation: in_process`.

## What it touches

The plugin makes no network calls of its own. Sourcing runs in a chat turn
through the agent's web tools, and evaluation goes through the agent's configured
model. It reads and writes only its own data directory, asks for no credentials,
and stores none.

## Develop

`~/.hermes/plugins/exam-desk` is a separate git clone of this repo, with its own
`.git`. Ship a change in two hops:

```bash
# in the repo: run the suite, check the catalog gate, commit and push
python -m pytest -q                  # 232 tests, about 6 s, needs the gateway venv
hermes plugins validate .            # the check catalog CI runs
git commit -m "..." && git push

# in the installed clone: bring the Python half live
git -C ~/.hermes/plugins/exam-desk pull --ff-only origin master
# the panel: cp desktop/plugin.js ~/.hermes/desktop-plugins/exam-desk/plugin.js
# then md5sum both copies. One hash. The panel appears on reload; the Python
# half only after the serving service restarts, since the dashboard mounts
# routes at boot.
```

Do not `rsync` or `cp` into the installed clone. That leaves the checkout dirty
and the next update refuses it.

`tests/test_meta.py` keeps the three version strings and the panel's mode labels
in agreement with the code, so a change that edits one version string and forgets
the others fails the suite. Each test in `tests/test_regressions.py` names the
failure it pins down.

After any CSS edit in the panel, run `scripts/css_audit.py --repo ~/src/exam-desk
--rev origin/master` and account for every selector it reports missing.
`scripts/layout_fixture.py` builds a measuring fixture for a browser profile with
no plugin enabled. Both carry their usage line at the top.

Data written by 0.9.0 is migrated by `python3 scripts/migrate_names.py`, which is
idempotent and takes `--dry-run`. It renames the fields, states `exam` and `kind`
on every paper, and carries each attempt's recorded paper hash over so no result
page gains a false "the questions changed" notice.
