# Changelog

One paragraph per release, in the words a user cares about. The commit history
carries the detail; this file carries the deltas worth reading before an update.

## 0.13.2 — math in papers

- **Pack text may carry LaTeX.** Question stems, options, media notes and
  explanations render `$…$` (inline) and `$$…$$` (display) through the app's own
  math pipeline — the same renderer chat uses, memoized KaTeX included. Text
  without a marker takes the plain path it always took, so papers without
  formulae pay nothing.
- **The demo paper shows it**: E-02's Beer–Lambert stem carries inline math,
  C-02's explanation a display equation.
- Delimiter rules for authors live in the pack schema ("Math in text"); the
  whitespace guard keeps currency literal.

## 0.13.1 — the demo shows everything

- **The bundled demo paper is a full capability tour.** 16 questions over 5 sections:
  MCQ (plain, short numeric options, a text-note block), MSQ with a data table, all
  three free-entry field shapes (integer, decimal with a tolerance, the GATE range
  key, text entry), figure questions (a stem figure, per-option figures, a nat on a
  figure) and an attempt-any-3-of-4 section carrying per-question mark overrides.
- **Figures seed with their paper.** `_seed_packs` copies `packs/*.assets/` alongside
  the JSON, so a fresh install of a figure paper is not half-installed.
- **A declared `input: "text"` silences the non-numeric-key lint warning.** The
  warning told the author to declare exactly that; the demo's text-entry question
  made the gap visible.

## 0.13.0 — one word per thing

- **Shorter names, no new concepts.** Tools: `exam_desk_live_context` → `exam_desk_live`,
  `exam_desk_log_doubt` → `exam_desk_doubt`. Skills: `pyq-sourcing` → `pyq`,
  `paper-gen` → `draft`, `exam-assist` → `assist`, `attempt-review` → `review`.
  Anything that names the old tools or skills must move with them — the manifest,
  the panel's prompt strings, the automation blueprint and the tests all did.
- **"Paper" everywhere the reader is a person.** The README, the panel's empty state
  and the skill text said "pack"; the glossary always said "paper". The on-disk
  field names (`paper_id`, `cbt-pack/1`, the `packs/` directory) are unchanged — a
  data migration buys nothing a label does not.
- **No repeated rules.** The "never replace a paper a running sitting is reading"
  paragraph lived in two skills and the "decline help mid-mock" rule in two others;
  each now lives where it belongs and the other points at it.

## 0.12.0 — the agent gets first-class access

- **Five real tools** (registered in the manifest, loadable by any Hermes agent on
  the host — no desktop app or panel needed): `exam_desk_live_context` (the live
  question mirror), `exam_desk_attempt` (one sitting's full record), `exam_desk_log_doubt`
  (the only agent-initiated write: one tutor-doubt event on a live sitting),
  `exam_desk_topics`, `exam_desk_papers`.
- **The tutor chat feeds itself**: a `pre_llm_call` hook injects the current
  question (never the key) into turns of the session an assisted sitting is
  linked to; other chats get nothing.
- **`/examdesk`** — the desk's status from any chat (papers, what's running,
  latest sittings, what keeps being flagged).
- **An automation blueprint** — "Exam Desk evening digest": an evening cron
  recipe that summarises sittings and the topics ledger using the tools.
- The exam-assist and attempt-review skills now lead with the tools and keep
  their scripts as explicit fallbacks.

## 0.11.0 — export, cross-process locks, the record leaves the desk

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
