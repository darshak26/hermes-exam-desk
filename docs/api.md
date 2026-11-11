# API

The dashboard API, mounted at `/api/plugins/exam-desk/*`. Requests need the
dashboard session, so a bare `curl` answers `401` before routing.

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
