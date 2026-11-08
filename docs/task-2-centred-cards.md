# Task 2 — result page: centred card column, statistics as tiles

Repo: `~/src/exam-desk`. Second pass on the screen `desktop/plugin.js`
just gained (`CbtResult`, `AttemptsChart`, ~lines 1830–2270). Read that code and
`docs/task-result-per-exam.md` first.

Do not commit. Do not restart any service. No new dependencies. No chart library.
Do not touch `packs/`, `skills/`, `dashboard/`, `tests/` — this task is the
desktop panel only (`desktop/plugin.js`, its `CSS` string, nothing else).

## What the owner said

> "we can do center aligned and there are too many tables in stats there may be
> better format for showing stats follow mockup closely"

The mockup (a hand-drawn wireframe) is a single **centred column of rounded
cards**, top to bottom:

1. one centred row: `[‹]` `name of the exam/attempt` `[›]`
2. card: `bar graph marks per attempt`
3. card: `stats`
4. card: `AI Overview` with a button on the right — "button for AI analysis chat"
5. card: `list of 10 question`, and at its footer a centred pager
   `[‹]  questions 10/100  [›]`

So: everything centres on one column, and statistics stop being a two-column
spreadsheet of label/sentence rows.

## Layout contract — use these numbers, declare them once

Put the whole page on one measured column. In the `CSS` string, near the existing
`.cbt-result` rules:

| token | value | meaning |
|---|---|---|
| `--rg-col` | `820px` | the column width |
| card padding | `20px` | inside every card |
| card radius | `10px` | `border:1px solid var(--ui-stroke-secondary)` |
| card gap | `16px` | between stacked cards |
| tile grid | `repeat(3, minmax(0,1fr))`, gap `12px` | statistics |
| tile padding | `12px` | |

- `.cbt-result` becomes a centred column: `max-width: var(--rg-col)`,
  `margin-inline:auto`, `display:flex; flex-direction:column; gap:16px`. Below
  900px viewport it takes the width it has (no fixed 820px, no horizontal
  scroll).
- Every block on the page is a card **at the same width**, so there is exactly
  one left edge (the column's) and one right edge. Nothing floats at a content
  width any more — the old `.cbt-result-grid` two-column split and its
  `max-width:1280px` band rule go away.
- Inside a card the content starts `20px` from the card edge, so the page has a
  single content left edge too. Keep every label, table and list on it.
- Delete `.cbt-result-grid`, `.cbt-rg`, and the `@media (max-width:1400px)`
  block that only served it, **only if nothing else uses them** (grep first).

## 1. Attempt row — centred

One row, centred as a group (`justify-content:center`, gap 8):

```
[‹]   Demo paper · Attempt 3 of 4 · 7 Nov, 03:45   [›]
```

- The middle item is a bordered pill (1px `var(--ui-stroke-secondary)`,
  radius `8px`, padding `6px 14px`, `.cbt-sub` size, tabular numerals).
- It names the exam and the attempt: pack title, then `Attempt n of m`, then
  `fmtWhen(submitted_at)`. Keep the mode out of it unless the string still fits
  on one line at 820px — one line, no wrap, is the requirement.
- Arrows keep the current behaviour and `aria-label`s: clamp at the ends, and
  `ArrowLeft` / `ArrowRight` still switch when focus is not in a field.
- Ungraded entry (`status !== 'submitted'`): the pill reads `pack title · not a
  graded attempt`; the stub body stays inside a card, the chart and arrows stay.

## 2. Card — marks per attempt

`AttemptsChart` keeps its geometry and behaviour exactly (declared BAR_W/SLOT/
PLOT_H/AXIS_W, measured band, zero-spanning scale, clickable `rect`s with
`aria-label` + `aria-current`, caption line). Only the wrapping changes:

- The band becomes a card titled **"Marks per attempt"** on the card's own left
  edge, with the existing subtitle line under the title (or on the same row if
  it fits — pick one, keep it consistent with the other cards).
- Chart width follows the card's content width (it already measures its
  container, so this should need no code change — verify it).

## 3. Card — statistics as tiles, not a table

Replace the `ResultMetrics` `<table class="cbt-stats">` with a tile grid. Same
numbers, same sources — this is presentation only, nothing recomputed and
nothing dropped. Each tile is `label` (11px, uppercase, letter-spaced,
secondary) over `value` (20px, 600, tabular numerals) over `detail` (12px,
secondary, max two lines).

The current table rows become these tiles, in this order (values are examples,
take the real ones from the code):

| label | value | detail |
|---|---|---|
| Answered | `4/6` | `67% of the paper` |
| Accuracy | `50%` | `2 right of 4 attempted` |
| Penalty paid | `-1.5` | `3 wrong answers` *(only when negative marking and wrong > 0)* |
| Time on question | `18s` | `median; longest 40s over 4 touched` *(or the pace fallback — keep the existing branch and its honest wording)* |
| Mind changes | `2` | `answers changed after a first save` *(only when the behaviour stream has them)* |
| Never reached | `2` | `questions never visited` |
| Over the limit (A) | `1` | `beyond the first 2 — graded 0` *(only when present; one tile per section as today)* |

Rules: a tile appears only when its number exists (no empty `—` tiles); the
"Seen but skipped" and "Medium dwell" wording stays as the current code says —
you are moving text, not rewriting it. If a metric has no single crisp number,
its value is the number and its detail is the rest of the sentence.

Keep `fmtScore`, `fmtPct`, `fmtFor` — do not add new formatting helpers.

## 4. Card — score

The score strip stays (big score, `/ max`, the four verdict tiles) but inside a
card, on the card's left edge: a `SCORE` section label, then
`score / max` and the four verdict tiles on one row, then the existing caption
(`n of m questions correct · pct%`, the marking note). No table here — the
verdict tiles already are the numbers.

## 5. Card — sections

The per-section table stays a table (it is a real matrix: Section, Score, Max,
Correct, Wrong, Skipped, Not counted), full card width, rendered only when the
paper has more than one section. Do not restyle row colours, do not change
columns.

## 6. Card — topics

Convert `ResultTopics` from a table to rows, because this is the other
"too many tables" offender. One row per topic, on the card's left edge:

```
Genetics                                 12/16     75%      +3.25
[──────────────                              ]  ← a share bar, 4px, rounded
```

- Row: topic name (left, truncate with ellipsis past the column), then
  `correct/attempted`, then accuracy, then marks with the existing `hit`/`miss`
  colouring. Fixed right-hand columns so rows line up — declare their widths
  (`80px`, `60px`, `72px`), right-aligned, tabular numerals.
- Under the row a 4px track (`var(--ui-stroke-secondary)`) with a fill of
  `var(--ui-accent)` whose width is `awarded / maxAwardedInRoll` of the row's
  marks — a topic at 0 draws no fill. Sorted exactly as today (biggest loss
  first), same "Show all N topics" toggle when there are more than six.
- If the roll-up is a single topic, the card does not render (as today).

## 7. Card — AI overview

- Card title `AI Overview` with the `model output` badge, and the two buttons on
  the right of the title row: **Discuss in chat** (opens the review chat, as
  today) and **Show analysis** / **Analyse this attempt** / **Re-analyse**.
- Mockup wording: the card is "AI Overview" — rename the section title from
  "AI analysis" to "AI Overview"; keep everything else about the flow
  (default closed, stored evaluation free, retry on failure, provider line).
- When there is no evaluation yet, the card body is one short line saying the
  analysis runs once and is not needed for the numbers — keep it to one line,
  no marketing.

## 8. Card — questions

- Card title `Questions` with the existing filter `SegmentedControl` on the
  right of the title row and the `x–y of n` count next to it.
- The review rows stay exactly as they are (expandable, verdict slot, answer vs
  key, explanation).
- The pager becomes the mockup's centred form: `[‹]  Page 1 of 2  [›]`,
  centred as a group, arrows `aria-label`led (`Previous page` / `Next page`),
  disabled at the ends. Drop the `Previous` / `Next` text buttons.

## Must not change

- Anything outside `desktop/plugin.js`.
- Any computed number, any metric's meaning, the review row markup, the
  evaluation flow, the route/state wiring in `CbtPage`, `Retake`, `All exams`,
  `SidebarButton`, or the `key={view.attemptId}` mount rule.
- Do not delete existing explanatory comments in the file. Do not "simplify"
  unrelated code. The diff should be the result screen's layout and the two
  table→tile/row conversions only.

## Done when

1. `node --check desktop/plugin.js` passes.
2. `~/.hermes/hermes-agent/venv/bin/pytest -q` still passes (124).
3. `git diff --stat` shows only `desktop/plugin.js` changed for this task.
4. Report: the column/card numbers you used, which blocks you converted, and any
   spec line you could not follow (with the reason). No code dumps.
