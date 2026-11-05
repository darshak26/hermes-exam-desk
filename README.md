# cbt-exam

Exam-agnostic CBT practice panel for Hermes Desktop. A question pack is data — the
pattern (sections, attempt limits, marking) lives in JSON, so a new exam is a new
file, not new code.

Three parts:

| Part | File | Job |
|---|---|---|
| Desktop panel | `desktop/plugin.js` | route `/cbt` — home, instructions, exam shell, result |
| Dashboard API | `dashboard/plugin_api.py` | mounted at `/api/plugins/cbt-exam/*` |
| Agent half | `__init__.py` + `skills/` | bundles `pyq-sourcing` and `exam-assist`, exposes the plugin `ctx` for the LLM bridge |

## Install

```bash
hermes plugins install https://github.com/darshak26/hermes-cbt-exam
hermes plugins enable cbt-exam          # add to plugins.enabled in config.yaml
```

Restart the gateway once so the agent half loads; the desktop app picks up
`desktop/plugin.js` on its own reload.

## Packs

`~/.hermes/plugin-data/cbt-exam/packs/<exam_id>.json` (or `$CBT_EXAM_DATA_DIR`).
Schema and every rule the grader enforces: `skills/pyq-sourcing/references/pack-schema.md`.

```bash
python3 skills/pyq-sourcing/scripts/validate_pack.py my-pack.json
# PASS ... then WARN lines for OCR debris / placeholder topics that still grade
```

## API

All responses are `{attempt, pack, remaining_seconds}`. `pack` is answer-free until
the attempt is submitted.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ok, llm, version}` — `llm:false` means the agent half isn't loaded |
| GET | `/packs` | summaries + non-fatal `warnings` |
| GET | `/packs/{exam_id}` | sanitised (no `answer` / `explanation` / `tolerance`) |
| POST | `/attempts` | `{exam_id, mode}` — `assisted` or `exam` |
| GET | `/attempts?limit=50` | newest first; `unreadable` lists corrupt files |
| GET | `/attempts/{aid}` | grades it first if the clock already ran out |
| PATCH | `/attempts/{aid}` | `{answers?, marked?, visited?, current?}` — sparse |
| POST | `/attempts/{aid}/submit` | idempotent |
| POST | `/attempts/{aid}/abandon` | discards without grading; key stays hidden |
| POST | `/attempts/{aid}/evaluate?force=` | free when an evaluation already exists |

## Assisted mode runs in a side pane

Starting an **assisted** attempt docks the paper into a pane to the right of the
workspace (`host.openWorkspace` with `dock: { pane: 'workspace', pos: 'right' }`)
and returns you to the chat, so the tutor is one message away while the timer
runs. Exam mode still takes the whole page — there is nothing to ask.

The pane measures itself: below 780px the question palette becomes an overlay
drawer (header button `Palette`) instead of a fixed 358px column, so the
question keeps the full width in a narrow split.

## Decisions worth knowing

- **One answer-shape rule.** `pack.answer_error()` is used by both the validator and
  the PATCH handler, so a pack cannot pass authoring and fail mid-exam.
- **`marks_wrong` must be ≤ 0.** A positive value is rejected — otherwise the grader
  awards marks for a wrong answer.
- **Attempt limit counts first *saved* answers.** A cleared answer keeps its slot and
  grades as skipped. A whitespace NAT entry is a clear, not a wrong answer.
- **`current` is the question on screen.** It drives the `live/*.md` file that the
  `exam-assist` skill reads; the skill verifies the attempt is still running before
  trusting it, and files for finished attempts are pruned.
- **Timer lives in the server.** `remaining_seconds` is derived from `started_at`;
  the panel renders a local countdown from it and the server grades on expiry even if
  the client never came back.
- **Writes are atomic; only milestones are fsynced.** Create / submit / abandon /
  evaluation are durable; routine answer saves are not (a crash can cost the last
  answer, never corrupt the file). On this host that is 0.31 ms vs 1.12 ms per write.
- **Packs are cached on mtime+size.** A 160-question paper is parsed and validated
  once per change instead of once per answer save (0.66 ms → 0.023 ms here).

## Develop

```bash
python -m pytest -q            # 75 tests, ~2 s
hermes plugins validate .      # catalog gate
```

Regressions for the 0.2.0 audit live in `tests/test_regressions.py`; each test names
the failure it pins down.
