# Task — result page per exam, one attempt at a time

Repo: `~/src/exam-desk` (Hermes Desktop plugin "Exam Desk").
Read `desktop/plugin.js` fully before editing. Read `dashboard/plugin_api.py`
lines 120–180 and `exam_desk/store.py` `new_attempt` / `submit_attempt`.

Do not commit. Do not restart, stop or start any service (no gateway, no
dashboard, no systemd). Do not touch `packs/`, `skills/`, `__init__.py` or
`plugin.yaml`. No new dependencies — no chart library, no npm install.

## What exists now

`desktop/plugin.js` ≈ 2230 lines, plain JS (no JSX — `jsx()` / `jsxs()` calls),
one function per screen. The result screen is `CbtResult({attemptId})` at
~line 1827. It fetches `/attempts/{id}` (returns `{attempt, pack, stats}`),
renders:

- header row: title, mode badge, submitted time, Sidebar button, Retake, All exams
- two-column grid (`.cbt-result-grid`, `minmax(0,1fr) 640px`, gap 32):
  left = score strip + verdict tiles + `ResultMetrics` table;
  right = per-section table + `ResultTopics`
- "AI analysis" row (`EvaluationCard`, `Discuss in chat`)
- "Review" list, 25 rows a page, filter SegmentedControl, expandable rows

Entry points that must keep working:
`CbtPage` `onViewResult: id => setView({name:'result', attemptId:id})`,
`showResult(id)` (after submit / from the exam pane), and the sidebar Retake.

## What to build

One result page **per exam**, showing one attempt at a time. The user switches
attempts with ‹ › arrows; a bar chart of marks per attempt sits at the top;
clicking a bar selects that attempt and everything below re-renders for it.

### 1. Backend — one added query param

`GET /api/plugins/exam-desk/attempts` already returns, newest first, for each
attempt: `id, paper_id, mode, status, started_at, submitted_at, score, totals,
has_evaluation`. Add an optional `paper_id: str | None = None` query param that
filters that list, keeping the existing `limit` (default `HISTORY_LIMIT` = 50,
hard cap 500). Nothing else about the endpoint changes. Add one test to
`tests/test_api.py` proving: two packs, attempts on both, `?paper_id=` returns
only that pack's attempts and no `paper_id` still returns everything.

### 2. Result screen becomes exam-scoped

Keep `CbtResult({attemptId, onHome, onRetake})` as the entry and keep the
`attemptId` prop — it decides the *initially selected* attempt.

- Derive `paper_id` from the loaded attempt (the `/attempts/{id}` response
  carries `attempt.paper_id` and the full `pack`).
- Load siblings with `/attempts?paper_id=<paper_id>&limit=500` (react-query key
  `['cbt','attempts',paper_id]`).
- Hold the selected attempt in component state (`useState`), not in `view`.
  Switching attempts must NOT navigate, must NOT remount the page, and must keep
  the header/chart on screen. `CbtPage` renders `CbtResult` with
  `key={view.attemptId}` today — that key stays correct because it now only
  remounts on a genuinely new entry (retake, open from home). Do not add a key on
  the selected attempt.
- The attempt query becomes `/attempts/${selectedId}`. Keep the existing
  loading / error / not-submitted handling.

Attempt **sequence**: the ordered list of this exam's attempts with
`status === 'submitted'`, oldest first (`submitted_at` ascending). Positions in
that sequence are what "Attempt 3 of 5" means and what a bar is. In-progress and
abandoned attempts are NOT numbered and are NOT bars.

Entry behaviour: if the `attemptId` passed in is not submitted (an abandoned
attempt opened from the home "Details" button, or a live one), keep showing the
existing explanatory stub body, but still render the header arrows and the chart
so the reader can move to a graded attempt. The arrows then start from the
nearest submitted attempt.

### 3. Header — arrows

Directly under the existing header row (title / mode / Retake / All exams), one
row on the page's left edge:

```
[ ‹ ]   Attempt 3 of 5 · 18 Nov, 14:20 · Exam          [ › ]
```

- `‹` / `›` are icon buttons (`Button` variant `ghost`, size `sm`, with
  `aria-label` "Previous attempt" / "Next attempt"). Clamp at the ends: the
  disabled state, not wrap-around.
- Middle label: chronological position, `fmtWhen(submitted_at)`, mode label
  (`MODE_LABEL`). Centre-free: left-aligned after the ‹ button, one text size
  (`.cbt-sub`), tabular numerals. The `›` button sits immediately after the
  label, not pushed to the right edge.
- Keyboard: `ArrowLeft` / `ArrowRight` switch when focus is not in an input,
  textarea, select or contenteditable. Same clamping.

### 4. Bar chart — marks per attempt

Its own band, full content width, under the arrows, above the existing grid.
Inline `<svg>` (no library). Deterministic geometry — declare every number as a
named constant at the top of the chart component and use only those:

| constant | value | meaning |
|---|---|---|
| `BAR_W` | 28 | bar width, px |
| `BAR_GAP` | 12 | gap between bars, px |
| `SLOT` | 40 | `BAR_W + BAR_GAP` = one attempt's column |
| `PLOT_H` | 160 | bar area height, px |
| `VALUE_H` | 20 | value label row above the plot |
| `BASELINE_H` | 24 | attempt label row below the plot |
| `AXIS_W` | 44 | y-axis label gutter, px |

- Plot width = `max(available, n * SLOT)`. More attempts than fit scroll the
  chart horizontally (`overflow-x:auto`) — never shrink bars.
- Scale spans `min(0, min score)` to `max(0, max score)` so negative totals draw
  below a zero line (this paper has negative marking; a 0-only baseline is a
  wrong chart). Draw three reference lines: the top tick, zero, and the bottom
  tick, each with its value right-aligned in the `AXIS_W` gutter.
- Value above each bar (formatted with the existing `fmtScore`), attempt index
  below each bar (`1..n`).
- Selected bar: `var(--ui-accent)`, full opacity, 1px outline. Unselected:
  `color-mix(in srgb, var(--ui-accent) 35%, transparent)`. Negative-scoring bars
  use `var(--ui-red)` in the same two tints. Zero-score bar draws 2px tall so the
  attempt is still clickable.
- Each bar is a real control: `role="button"`, `tabIndex=0`,
  `aria-label="Attempt 3, 12.5 of 100"`, `aria-current` on the selected one,
  Enter/Space select it. Keyboard focus ring uses the same treatment as other
  buttons in the file.
- Caption under the plot, one line, on the same left edge:
  `Showing attempt 3 — 12.5 marks · submitted 4 days ago. Click a bar to switch.`
  The live values come from the selected attempt, not from prose.
- One submitted attempt = one bar. Do not hide the chart and do not invent an
  axis.

### 5. Everything below follows the selected attempt

Reuse without rewriting: `.cbt-result-grid` (score strip, verdict tiles,
`ResultMetrics`, section table, `ResultTopics`), the AI analysis row and
`EvaluationCard`, and the Review list with its filter and 25-row pager. They
already take `attempt` / `pack` props — pass the selected attempt's data.

On switch, reset the review list's own state (`filter` → `all`, `page` → 0,
open row → null) and scroll nothing (the reader stays where they are).

Do **not** restructure the rest of the page, rename classes, or restyle the
section/topic tables. The new band and the new arrow row must share the existing
left edge and the existing `max-width:1280px` cap (`.cbt.cbt-result > *`).

### 6. CSS

All new rules go in the same `CSS` string, in the result block near the existing
`.cbt-result-grid` rules, prefixed `.cbt` and using the existing tokens
(`--ui-accent`, `--ui-red`, `--ui-stroke-secondary`, `--ui-text-secondary`).
No hard-coded hex colours except where a token does not exist.

## Done when

1. `node --check desktop/plugin.js` passes.
2. `~/.hermes/hermes-agent/venv/bin/pytest -q` passes (123 tests now;
   your new API test makes it 124+). Report the actual output line.
3. `git diff --stat` shows changes only in `desktop/plugin.js`,
   `dashboard/plugin_api.py`, `tests/test_api.py`.
4. One short summary: what you changed per file, the constants you used for the
   chart, and anything in this brief you deliberately did not do (with the
   reason). No code dumps.
