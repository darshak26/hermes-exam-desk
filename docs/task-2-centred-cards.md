# Design record — one centred card column on the result page

The result page had grown three different alignment stories at once: a
two-column grid, statistics as a label/sentence table, and topics as a second
table beside it. This record holds the layout contract that replaced them: one
centred column of cards, one left edge, and statistics as tiles. The values here
are the ones in `desktop/plugin.js` today (the `.cbt-result` block of the `CSS`
string, plus `CbtResult`, `AttemptsChart`, `ResultMetrics`, `ResultTopics`).

## The problem

- Statistics were a table of label → sentence rows, spread across a grid column,
  so the numbers never lined up with each other.
- Topics were the second "too many tables" offender on the same page.
- Two columns meant two left edges and two right edges, and every block had to
  be read in the context of the column it happened to sit in.

## The contract

One column. Every block is a card at the same width, so the page has exactly one
left edge and one right edge, and the content inside each card starts on one
inner edge.

| token | value | carries |
|---|---|---|
| column | `--cbt-col-read` (820px) | the result page's only column |
| card padding | 20px | inside every card |
| card radius | 10px | with `1px solid var(--ui-stroke-secondary)` |
| card gap | 16px (`--cbt-gap`) | between stacked cards |
| tile grid | `repeat(3, minmax(0,1fr))`, gap 12px | statistics |
| tile padding | 12px, radius 8px | statistics |

820 is the reading column, not a leftover: data surfaces (home bands and rows,
history tables) run at `--cbt-col` 1040, while a page read top to bottom as
prose stays at 820. Both tokens live on `.cbt`, and no page declares its own
max-width.

The page root carries `cbt cbt-page cbt-result`, so the cap comes from
`.cbt.cbt-page.cbt-result > *` and the column centres inside the scroll box —
which is why the scrollbar sits at the pane's edge and not at the column's.

## Statistics as tiles

`ResultMetrics` left the table behind for a tile grid. Each tile is a label
(11px, uppercase, letter-spaced, secondary), a value (20px, 600, tabular
numerals) and a detail line (12px, secondary, at most two lines), in this order:

| label | value | detail |
|---|---|---|
| Answered | `4/6` | `67% of the paper` |
| Accuracy | `50%` | `2 right of 4 attempted` |
| Penalty paid | `-1.5` | `3 wrong answers` — only with negative marking and wrong > 0 |
| Time on question | `18s` | median, longest, questions touched — or the pace fallback |
| Mind changes | `2` | answers changed after a first save |
| Never reached | `2` | questions never visited |
| Over the limit (A) | `1` | beyond the first 2 — graded 0, one tile per section |

Rules that held: a tile appears only when its number exists (no empty `—`
tiles), and the metric wording moved as it was — no formatting helper was added,
`fmtScore` / `fmtPct` / `fmtFor` still do the work.

## Topics as rows, not a table

`ResultTopics` became one row per topic on the card's left edge: name
(truncating), then `correct/attempted`, accuracy and marks in fixed columns —
80px, 60px, 72px, right-aligned, tabular — so rows line up down the card. Under
each row sits a 4px track with a fill whose width is the topic's awarded marks
over the biggest award in the roll-up; a topic at zero draws no fill. Ordering
(most marks lost first) and the "show all N topics" toggle above six topics are
unchanged, and a single-topic roll-up still renders no card.

## Other decisions on the same pass

- **AI analysis → AI Overview.** The card is titled `AI Overview` with the
  `model output` badge, and its two buttons sit on the title row: Discuss in
  chat, and the analyse / re-analyse action. The evaluation is still free until
  asked for, and still retried on failure.
- **The review pager is the centred form** — `[‹] Page 1 of 2 [›]`, arrows
  `aria-label`led, disabled at the ends — replacing the Previous/Next text
  buttons. It carries spacing only: the row above already ends on a hairline, so
  a border here would draw two lines with nothing between them.
- **Only layout changed.** No computed number, metric meaning, review-row
  markup, evaluation flow or route/state wiring moved with it. The section table
  stayed a table, because it is a real matrix.

## Later payments on the same contract

The arrow row and the bar chart from the per-exam record stayed as they were.
The instructions page and the home page were brought onto the same axis
afterwards — one left edge per page, scrollbars at the container's edge — which
is where `--cbt-col` and `--cbt-col-read` became the only two widths in the
sheet.
