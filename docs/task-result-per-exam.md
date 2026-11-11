# Design record — the result page, one attempt at a time

A sitting used to be a dead-end page: it showed the attempt you opened and
nothing around it, so "am I improving?" could only be answered from the home
table. This record holds the decisions that turned it into a page per paper,
with every graded sitting of that paper reachable from it. The numbers below are
the ones the code still carries; the file references are where to read them.

## The problem

The result screen rendered one attempt in a two-column grid (`.cbt-result-grid`,
`minmax(0,1fr) 640px`, gap 32), left column score + metrics, right column
sections + topics. Two consequences:

- Comparing sittings meant going back to the home table and opening each one.
- The right column held two tables that mostly repeated what the left column
  already said, and statistics read as a spreadsheet rather than a report.

## Decisions

**1. The page belongs to a paper, not to an attempt.** It loads the attempt it
was opened with, then loads its siblings with
`GET /api/plugins/exam-desk/attempts?paper_id=<paper_id>&limit=500` and renders
any of them. The route gained the optional `paper_id` filter for this; `limit`
keeps its default (`HISTORY_LIMIT` = 50) and its hard cap (500).

**2. Switching attempts does not navigate.** The selected attempt lives in
component state, so the header and the chart stay on screen while everything
below re-renders for the new selection. `CbtPage` keys `CbtResult` on
`view.attemptId`, which is still correct: the key changes only on a genuinely
new entry (Retake, opening a sitting from home), never on an in-page switch.

**3. Attempt sequence = submitted attempts, oldest first.** Positions in that
sequence are what the `‹ ›` arrows and the chart bars mean. In-progress and
abandoned sittings are neither numbered nor drawn — numbering them would make
"Attempt 3 of 5" depend on sittings that were never graded.

**4. An ungraded entry still gets the frame.** Opening an abandoned or live
attempt keeps the explanatory stub body, but the arrows and the chart still
render, starting from the nearest submitted attempt, so the reader can walk to a
graded one.

**5. Marks per attempt is a bar chart, one bar per submitted sitting.** Inline
`<svg>`, no chart library. Every dimension is a declared constant
(`desktop/plugin.js`, `AttemptsChart`): `BAR_W 28`, `BAR_GAP 12`,
`SLOT = BAR_W + BAR_GAP = 40`, `PLOT_H 160`, `VALUE_H 20`, `BASELINE_H 24`,
`AXIS_W 44`. The plot is `max(available - AXIS_W, n * SLOT)` wide and scrolls
horizontally past that — bars never shrink to fit.

**6. The scale spans zero.** Papers here carry negative marking, so the y-range
is `min(0, min score)` to `max(0, max score)` with three reference lines (top
tick, zero, bottom tick) right-aligned in the `AXIS_W` gutter. A 0-only baseline
would draw a penalised paper wrong.

**7. Each bar is a real control.** `role="button"`, `tabIndex=0`,
`aria-label="Attempt 3, 12.5 of 100"`, `aria-current` on the selected one,
Enter/Space selects it, focus ring matched to the file's other buttons. A
zero-score bar still draws 2px tall so the sitting stays clickable.

**8. The caption states live values.** One line under the plot on the same left
edge — `Showing attempt 3 — 12.5 marks · submitted 4 days ago. Click a bar to
switch.` — read from the selected attempt, never hardcoded prose.

## What changed afterwards

The two-column grid this record describes was later replaced by a single centred
card column; the statistics table and the topics table were converted with it.
That work is its own record — `task-2-centred-cards.md` — and the shipped result
page is the centred column at `--cbt-col-read` (820px), not the grid described
above. The arrow row, the chart and the attempt sequence are unchanged.
