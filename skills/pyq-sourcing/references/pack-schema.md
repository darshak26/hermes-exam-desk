# Pack schema (`cbt-pack/1`) — field reference

A plain-English mirror of what `cbt_exam/pack.py` + `scripts/validate_pack.py` enforce. When in doubt, the validator's error line is the spec.

## Pack level

| Field | Rule |
|---|---|
| `schema` | exactly `"cbt-pack/1"` |
| `exam_id` | lowercase slug, filename is `<exam_id>.json` (`gat-b-2024`, `gate-bt-2023`) |
| `title`, `year`, `body`, `language` | display strings |
| `source_url` | required — where the paper came from |
| `provenance` | required — official/memory-based label (see `sources.md`) |
| `pattern.duration_minutes` | positive int (a full paper's full time) |
| `pattern.sections[].id/title/question_count` | `question_count` MUST equal the actual question count in that section |
| `pattern.sections[].attempt_limit` | `null` = every question counts; int N = only the first N saved answers are graded (NTA's "attempt 60 of 100" rule) |
| `pattern.sections[].marks_correct/marks_wrong/marks_unanswered` | numbers; `marks_unanswered` must be 0 |

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
| `tolerance` | nat only, optional numeric tolerance |
| `marks_correct/marks_wrong` | optional per-question overrides of the section defaults (GATE 1-mark/2-mark mixing) |
| `explanation` | optional, shown after submit |
| `source_url` | **required on every question** (provenance rule) |
| `difficulty` | optional: `easy` / `medium` / `hard` |

## Rules the grader lives by (so the pack can express them)

- per-question marks override section marks; negative marking is data, not code.
- `attempt_limit` counts a candidate's first N saved answers (a cleared answer keeps its slot).
- "answered AND marked for review" is evaluated; marked *without* an answer is not.
- msq is exact-set match in v1 (GATE/JAM/GAT-B style; JEE-Advanced-style partial marking is not supported).

## Compact example

```json
{
  "schema": "cbt-pack/1",
  "exam_id": "gat-b-2024",
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
