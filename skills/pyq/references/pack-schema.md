# Pack schema (`cbt-pack/1`) — field reference

A plain-English mirror of what `exam_desk/pack.py` + `scripts/validate_pack.py` enforce. When in doubt, the validator's error line is the spec.

## Pack level

| Field | Rule |
|---|---|
| `schema` | exactly `"cbt-pack/1"` |
| `paper_id` | lowercase slug, and the filename: `<paper_id>.json` (`gat-b-2024`, `gate-bt-2023`). **This identifies the paper** — the thing you sit. |
| `exam` | lowercase slug of the exam the paper belongs to (`gat-b`). `paper_id` must be `exam` itself or start with `exam-`, so a paper can never belong to an exam it is not named under. Omit it and the slug is parsed for it (legacy only — always state it). |
| `kind` | `pyq` · `practice` · `drill`. Must be the kind the slug declares: a `pyq` carries a year (`gat-b-2024`), `practice` carries the word (`gat-b-practice-bioinfo`), `drill` carries `-drill`. Disagreeing is an error. Omit it and the slug is parsed (legacy only). |
| `scope` | free text — the syllabus area a practice paper covers (`Photosynthesis`), shown under the paper's title. |
| `title`, `year`, `body`, `language` | display strings. A `pyq` must carry `year`, and it must match the year in `paper_id`. |
| `source_url` | required — where the paper came from |
| `provenance` | required — official/memory-based label (see `sources.md`) |
| `key_status` | optional: `official` (the default when absent) · `unverified` · `self-authored` · `random`. `random` means the `answer` fields are placeholders — it still grades, but the AI evaluation refuses to run on a scoreline that means nothing. `unverified` analyses run and must flag mis-keyed items. `self-authored` marks an AI-drafted paper (the model wrote the questions *and* the key): analyses run and treat a wrong key as a finding; the panel badges the pack "AI-drafted". |
| `pattern.duration_minutes` | positive int (a full paper's full time) |
| `pattern.sections[].id/title/question_count` | `question_count` MUST equal the actual question count in that section |
| `pattern.sections[].attempt_limit` | `null` = every question counts; int N = only the first N saved answers are graded (NTA's "attempt 60 of 100" rule) |
| `pattern.sections[].marks_correct/marks_wrong/marks_unanswered` | numbers. **`marks_wrong` must be ≤ 0** (`-0.5`, not `0.5`) — a positive value is rejected, because the grader would otherwise *award* marks for a wrong answer. `marks_unanswered` must be `0`: unanswered never scores here. |

## Question level

| Field | Rule |
|---|---|
| `id` | unique within the pack (`A-01`, `B-03`) |
| `section` | must reference a section id |
| `type` | `mcq` (one correct) · `msq` (multi-correct) · `nat` (numerical answer) |
| `topic` | a real topic name — drives AI evaluation; sloppy topics, sloppy reports |
| `text` | non-empty question text |
| `options` | mcq/msq: ≥ 2, in order |
| `answer` | mcq: **0-based** option index · msq: non-empty list of distinct 0-based indices · nat: number or numeric string |
| `tolerance` | nat only, optional numeric tolerance ≥ 0. A non-numeric tolerance is rejected — an unparseable one used to make submission fail forever |
| `marks_correct/marks_wrong` | optional per-question overrides of the section defaults (GATE 1-mark/2-mark mixing). Same sign rule: `marks_wrong` ≤ 0 |
| `explanation` | optional, shown after submit |
| `source_url` | **required on every question** (provenance rule) |
| `difficulty` | optional: `easy` / `medium` / `hard` (anything else is rejected) |
| `media` | optional list of blocks shown under the stem: figure, data table, or a note |
| `option_media` | optional list parallel to `options`; each entry is a list of blocks or `null` |

### Media blocks (diagrams, tables)

A question is not always text. Papers carry gels, graphs, circuit diagrams and
data tables, and a stem like "the gel below shows…" is useless without them.

```json
"media": [
  {"type": "image", "src": "figures/A-23-gel.png", "alt": "four-lane agarose gel", "caption": "Fig. 1 — 1 kb ladder in lane 1"},
  {"type": "table", "caption": "Fragment sizes", "head": ["Lane", "bp"], "rows": [[2, 1200], [3, 800]]},
  {"type": "text", "text": "Assume the gel ran 40 min at 100 V."}
]
```

- **Where images live:** `packs/<paper_id>.assets/` next to the JSON — e.g.
  `packs/gat-b-2023.assets/figures/A-23-gel.png`, referenced as
  `figures/A-23-gel.png`. A path may not climb out of that directory (`..`,
  leading `/` and absolute paths are rejected), and `http(s)` URLs are allowed
  for figures that already live online.
- **Never base64 a figure into the JSON.** It bloats every model turn that reads
  the pack and the panel renders it through the plugin's own asset route.
- **`alt` matters:** it is what a screen reader says and what the panel shows if
  the file is missing. `lint_pack` warns when an image has no alt text or the
  file is absent.
- **Option figures:** set `option_media` on *every* option when the question
  compares figures (four gels, four circuits). A figure on one option only draws
  the eye to it — lint warns when coverage is partial.

### Math in text (`$…$`)

Question, option, note and explanation text may carry LaTeX math: `$…$` inline,
`$$…$$` display, `\(…\)` / `\[…\]` equivalently. The panel renders it through the
app's own math pipeline — the same renderer chat uses (KaTeX, memoized), not a
plugin-bundled copy. The agent half reads the raw source, which LLMs handle
natively. Authoring rules:

- The delimiter must hug its content: a `$` followed by whitespace, or one
  preceded by whitespace, is prose. Currency (`$5 and $10`) renders as a literal
  dollar sign, not math.
- Prefer unicode for simple sub/superscripts (`10⁻³`, `pKₐ`, `Mg²⁺`) — it renders
  with no math engine and copies cleanly into notes.
- Display math (`$$…$$`) renders as its own block: use it in stems and
  explanations, not inside an option label.
- `validate_pack` does not parse the delimiters — they are content, not markup. A
  TeX typo shows up on the panel as red source text, never as a grading problem.

## Rules the grader lives by (so the pack can express them)

- per-question marks override section marks; negative marking is data, not code.
- `attempt_limit` counts a candidate's first N saved answers (a cleared answer keeps its slot).
- "answered AND marked for review" is evaluated; marked *without* an answer is not.
- msq is exact-set match in v1 (GATE/JAM/GAT-B style; JEE-Advanced-style partial marking is not supported).
- a blank/whitespace NAT entry is not an answer: it grades as skipped, never as a wrong answer.

## Lint warnings (non-fatal)

`validate_pack.py` prints `WARN:` lines for a pack that will run but looks damaged.
They are the OCR guard: a freshly sourced paper is usually full of them.

- option text with fewer than 2 letters/digits (e.g. `"11001 . . :"`)
- duplicate option text inside one question
- a `topic` that just repeats the exam title (placeholder — the AI evaluation is only as good as the topics)
- question text shorter than 15 characters
- an image with no `alt` text
- an image whose file is missing from `packs/<paper_id>.assets/`
- only some options carrying a figure

Fix them before sitting the exam; they do not block grading.

## Compact example

```json
{
  "schema": "cbt-pack/1",
  "paper_id": "gat-b-2024",
  "exam": "gat-b",
  "kind": "pyq",
  "title": "GAT-B 2024",
  "year": 2024,
  "body": "NTA / RCB",
  "language": "en",
  "source_url": "https://dbt.nta.ac.in/...",
  "provenance": "official paper + official key",
  "pattern": {
    "duration_minutes": 180,
    "sections": [
      {"id": "A", "title": "Section A", "question_count": 60, "attempt_limit": null,
       "marks_correct": 1, "marks_wrong": -0.5, "marks_unanswered": 0},
      {"id": "B", "title": "Section B", "question_count": 100, "attempt_limit": 60,
       "marks_correct": 3, "marks_wrong": -1, "marks_unanswered": 0}
    ]
  },
  "questions": [
    {"id": "A-01", "section": "A", "type": "mcq", "topic": "Physics — kinematics",
     "text": "A ball is dropped from 20 m. Time to fall (g = 10 m/s²)?",
     "options": ["1 s", "2 s", "3 s", "4 s"], "answer": 1,
     "explanation": "s = ½gt² → t = √(2s/g) = 2 s.",
     "difficulty": "easy", "source_url": "https://..."}
  ]
}
```
(The full 160-question pack has one such object per question. The validator checks counts, ids, answer shapes, and provenance — run it before install.)
