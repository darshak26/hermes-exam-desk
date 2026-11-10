# Development guide — exam-desk

Everything a second developer needs to change, verify and ship this plugin.
The user-facing half of the story (install, API, pack schema) lives in the
README and `skills/pyq-sourcing/references/pack-schema.md`; this file holds the
parts that used to live only in the author's head.

## Layout in one breath

| Piece | Where | Job |
|---|---|---|
| Domain | `exam_desk/` | pure logic: pack parse/validate, grading, store, timeline, topics, drill, prompts. No gateway imports. |
| HTTP | `dashboard/plugin_api.py` | FastAPI router mounted at `/api/plugins/exam-desk/*`. Imports the package as a separate module instance (`_exam_desk_http`) and reaches the gateway LLM through the `exam_desk_ctx_bridge` sys.modules handoff — that bridge is the ONLY thing shared between the two module instances. |
| Panel | `desktop/plugin.js` | one file, one CSS namespace (`.cbt …`), React via the plugin SDK's jsx helpers. |
| Skills | `skills/<name>/SKILL.md` | bundled agent skills, registered from `register(ctx)` as `exam-desk:<name>`. Read-only once installed — `skill_manage` refuses them; fix them here. |
| Tests | `tests/` | unittest classes run through pytest. `test_regressions.py` = one test per past audit finding, each naming the defect it pins. |

## Running the tests

They need fastapi/pydantic/pytest — the gateway venv provides those:

```bash
~/.hermes/hermes-agent/venv/bin/python -m pytest -q     # on this layout; find the venv on any install: the interpreter that runs the gateway
uvx ruff check .                                        # or ruff from the dev extra (config in pyproject.toml)
node --check desktop/plugin.js                          # parsing only — it CANNOT catch a missing jsx import or a CSS splice
```

`view` guards, run by the suite itself (`test_meta.py`): the three version
strings (`plugin.yaml` / `__init__.py::VERSION` / `plugin_api.py::VERSION`) must
agree, and the panel's `MODE_LABEL` table must match `exam_desk.vocab.MODE_LABELS`.

## The CSS is one namespace — audit it after any splice

The panel's whole stylesheet is one template string inside `desktop/plugin.js`.
A bad `s[:i] + new + s[j:]` deletes every rule between the anchors while tests
stay green. After ANY CSS edit:

```bash
python3 scripts/css_audit.py --repo ~/src/exam-desk --rev origin/master
```

Exit 0 requires every selector that vanished to be one you deliberately
replaced (`--allow .cbt-x`). If the sheet shrank unexpectedly, restore it and
re-apply the intended edit on top.

To measure layout when no plugin runs in your browser (fresh profile, remote
backend), build a fixture with the real stylesheet — never trust string-replace
throttling between measures, regenerate per pass:

```bash
python3 scripts/layout_fixture.py --plugin desktop/plugin.js --out /tmp/fixture.html
# it prints the measuring snippet to paste into a browser session; the script
# itself must stay importable — its JS bite is embedded via json.dumps.
```

## Shipping a change (the deploy chain)

`~/.hermes/plugins/exam-desk` is a separate git clone of this repo (its own
`.git`), and the desktop panel is a copied file. The chain, in order:

1. Commit + push in the repo.
2. `git -C ~/.hermes/plugins/exam-desk pull --ff-only origin master` — confirm
   both `git log --oneline -1` match.
3. Panel half: `cp desktop/plugin.js ~/.hermes/desktop-plugins/exam-desk/plugin.js`,
   then `md5sum` repo copy vs deployed copy — one hash. The panel updates on
   reload; the Python half does NOT.
4. The two services that can serve the plugin: `hermes-gateway` (:9120) and
   `hermes-dashboard` (:9119). Which one a pane reaches is decided by the host
   the app is opened at (a Caddy `reverse_proxy` line), not by "the webapp is
   9120". A Python-half change is not live until THE SERVING service restarts;
   identify it from the journal (`journalctl --user -u <unit> --since -20min`
   greps the plugin's own tracebacks) and never from which unit a restart
   happened to target. Compare `systemctl show <unit> -p ExecMainStartTimestamp`
   against the COMMIT's time (`git log -1 --format=%ci`), never a file mtime.

A panel that calls a route the running build does not serve gets a bare
"Not Found": that is a restart instruction, translated in one place
(`apiFailed()` beside the routes).

## Verification bar (the hard expectations)

- One left edge per page, proven by rects including glyph edges (`Range`), not
  by eye. A 4px drift is a finding.
- Spacing on the 4/8/12/16/24 scale; a footer's `margin-top` equals its
  container's `padding-bottom`.
- Tables scroll inside a wrapper; the page never scrolls sideways; rows are
  measured as a set (distinct lefts, rights, heights).
- Buttons weigh by role: primary creation/action = filled; secondary = outline;
  utility = ghost; a border never decorates text.
- The vocabulary is the contract: paper / exam / attempt, `mock` / `assisted`,
  kinds `pyq` / `practice` / `drill`. Any copy question is answered by
  `exam_desk/vocab.py` first — a new term is the wrong fix.

## Bundled skill texts carry their own portability rules

- Never hardcode machine paths (the gateway venv literal); name the role and
  let a probe resolve it — the import the text already carries is its own
  resolver.
- Never send verification through an authenticated route (401 before routing
  proves nothing); anchor on the script's own `PASS` line.
- Re-check what the text says the panel looks like against the panel's label
  strings — the UI changes faster than the text.

## Test-data hygiene

Never resume the user's live sitting to test something. Build a probe pack
(`paper_id: probe-*`, `exam: probe`) written straight into the data root,
drive it through the panel's own flow, then abandon + delete the attempt and
delete the pack — and re-list attempts and packs to prove the user's records
are intact. Destructive probes get one line each saying what was created and
that it was removed.
