# Changelog

One paragraph per release, in the words a user cares about. The commit history
carries the detail; this file carries the deltas worth reading before an update.

## 0.11.0 — unreleased

- **Export a sitting.** `GET /attempts/{id}/export` (and an `Export JSON` button on
  the result page) downloads the full record — answers, verdicts, the paper with
  its key, and the behaviour view — so the records are portable, not just durable.
- **Cross-process attempt locks.** The per-attempt write lock now also takes a
  kernel file lock, so the gateway and its dashboard (two processes serving the
  same data root) can no longer interleave a save. On Windows the file lock is
  skipped and the in-process lock still guards the single-process case.
- **AI call policy left the HTTP file.** The structured-output shape order, the
  two timeout budgets and the degraded-retry rule moved from
  `dashboard/plugin_api.py` into `exam_desk/llm.py` (`plan()`), where the fake
  bridges in the tests already live.
- **Panel trust copy.** The AI Overview card states on its face that the
  scoreline is graded from recorded answers and that the analysis adds words,
  not numbers.
- Everything from the developer batch: machine-checkable install docs, a
  development guide, the CSS-audit and layout-fixture scripts in the repo, and
  CI running the suite, the panel syntax check and ruff.

## 0.10.0 — exam shelves, one history per exam, marks at the paper's precision

- The home page is one shelf per exam (band, papers, one history table), not one
  card per paper; papers state `exam` / `kind` / `scope` and the slug is only a
  label; deleting a paper or an exam reports what was removed and refuses while
  a sitting is running.
- Marks are per question and printed at the paper's precision (`+2 / -0.67`), so
  a pack that mixes 1- and 2-mark questions no longer inflates totals; the
  pattern table prints the pairs (`+1 / -0.33 · +2 / -0.67`).
- The nat answer field is a real field (`input: integer | decimal | text`
  resolved on the server, shape published without the key); filters inside the
  paper are words, not boxed controls; Enter/save&next is scoped to the paper's
  own fields so the chat's keystrokes stay the chat's.
- The primer for an assisted sitting is submitted, not staged, and the sitting
  links its tutor chat; every review opens one thread per sitting.
- Sourcing lint reads option text by shape, not length, so short genuine
  answers (a `2`, a `√3`) no longer fire the OCR-debris warning.

## 0.9.0 — drills, topics ledger, AI drafting, one vocabulary

- `Drill misses` files a new pack from one attempt's wrong / skipped /
  not-counted rows and walks you into it like any paper.
- The topics ledger (`topics.json`) records what the evaluations keep flagging,
  per exam, with the attempts that backed it.
- AI-drafted papers (`exam-desk:paper-gen`) sit next to sourced PYQs, badged,
  with `key_status: self-authored`; the evaluation names mis-keyed items
  instead of coaching toward them.
- One vocabulary everywhere: paper / exam / attempt, modes `mock` and
  `assisted`; the old field names are folded forward on read and rewritten by
  `scripts/migrate_names.py`.
