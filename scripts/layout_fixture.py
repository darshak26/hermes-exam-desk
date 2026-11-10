#!/usr/bin/env python3
"""Build a layout fixture from the panel's CSS and print the measuring snippet.

Why this exists: a fresh browser profile has no desktop plugin enabled, so
`/exam-desk` falls back to the chat route and there is nothing on the page to
measure. The panel's entire stylesheet is one template string, so a fixture that
carries the same class names and representative content measures the REAL
geometry — say so when reporting: "measured on a fixture with the real stylesheet,
not on the live app".

Usage:
  python3 layout_fixture.py [--plugin ~/src/exam-desk/desktop/plugin.js] [--out /tmp/fixture.html]

Then, in browser_exec:
  goto_url("file:///tmp/fixture.html"); wait_for_load()
  <paste the printed snippet>
Md."""
import argparse
import json
import sys
from pathlib import Path

MARKER = "const CSS = `"

PAPERS_ONE = [("Demo paper — how this panel works", "6 questions · 15 min", "4 attempts · best +2 · 20 h ago", "", 0)]
PAPERS_FIVE = [
    ("GAT-B 2023 (Section A, test run)", "2023 · 37 questions · 180 min", "4 attempts · best 34.0 · 3 d ago", "PYQ", 2),
    ("GAT-B 2022 (Section A, test run)", "2022 · 37 questions · 180 min", "3 attempts · best 28.0 · 9 d ago", "PYQ", 0),
    ("GAT-B 2021 (Section A, test run)", "2021 · 37 questions · 180 min", "never sat", "PYQ", 1),
    ("GAT-B 2020 (Section A, test run)", "2020 · 37 questions · 180 min", "1 attempt · best 12.5 · 30 d ago", "PYQ", 0),
    ("GAT-B practice — genetics", "20 questions · 40 min", "2 attempts · best 18.0 · 5 d ago", "practice", 0),
]


def extract_css(plugin: Path) -> str:
    src = plugin.read_text(encoding="utf-8")
    if MARKER not in src:
        sys.exit(f"FAIL no `{MARKER}` in {plugin}")
    start = src.index(MARKER) + len(MARKER)
    end = src.index("`;", start)
    css = src[start:end]
    # An off-by-one here keeps the opening backtick in the HTML, the stylesheet then
    # fails to parse, and every number measured is of an unstyled full-width page.
    assert not css.lstrip().startswith("`"), "CSS slice kept the template backtick"
    assert "{" in css and "}" in css, "CSS slice looks empty"
    assert ".cbt" in css, "CSS slice does not contain the panel's rules"
    return css


def paper_row(title, meta, record, kind, warn):
    chip = f'<button class="cbt-b w">⚠ {warn}</button>' if warn else ""
    badge = f'<span class="cbt-badge">{kind}</span>' if kind else ""
    return f"""
      <article class="cbt-paper">
        <div class="cbt-paper-main">
          <div class="cbt-paper-head">
            <h4 class="cbt-paper-title">{title}</h4>{badge}
          </div>
          <div class="cbt-sub cbt-ellipsis">{meta}</div>
          <div class="cbt-sub">{record}</div>
        </div>
        <div class="cbt-paper-actions">{chip}
          <button class="cbt-b bb">Start mock</button>
          <button class="cbt-b">Start assisted</button>
        </div>
      </article>"""


def shelf(name, body, papers, agg):
    rows = "".join(paper_row(*p) for p in papers)
    return f"""
  <section class="cbt-shelf">
    <div class="cbt-exam-band">
      <div class="cbt-row cbt-gap-sm"><h3>{name}</h3>
        <span class="cbt-sub">{body}</span><span class="cbt-sub">{agg}</span></div>
      <button class="cbt-b">Add paper</button>
    </div>
    <div class="cbt-papers">{rows}</div>
    <div class="cbt-shelf-hist"><div class="cbt-row">
      <button class="cbt-b">History · {len(papers)}</button>
      <nav class="cbt-row" style="border:1px solid #3a3a3a;border-radius:4px;padding:1px;gap:1px">
        <button class="cbt-b">All {len(papers)}</button><button class="cbt-b">Mock</button><button class="cbt-b">Assisted</button></nav>
    </div></div>
  </section>"""


_SNIPPET_JS = """(() => {
  const X = e => Math.round(e.getBoundingClientRect().x * 10) / 10
  const R = e => Math.round(e.getBoundingClientRect().right * 10) / 10
  const H = e => Math.round(e.getBoundingClientRect().height * 10) / 10
  const one = v => [...new Set(v)]
  const rows = [...document.querySelectorAll('.cbt-paper')]
  return {
    column:  one([...document.querySelectorAll('.cbt-home > *')].map(X)),
    lefts:   one([...rows.map(X), ...[...document.querySelectorAll('.cbt-paper-title')].map(X),
                  ...[...document.querySelectorAll('.cbt-exam-band h3')].map(X)]),
    rights:  one([...rows.map(R), ...[...document.querySelectorAll('.cbt-exam-band button')].map(R)]),
    heights: one(rows.map(H)),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }
})()"""

_SNIPPET_NOTE = """One value in `lefts`, one in `rights`, one in `heights`, `overflow` 0 — anything
else is the finding. Check one computed style first (`.cbt-home > *` max-width
1040); if it is `none` the CSS never parsed."""


def measuring_snippet():
    """The browser_exec recipe as runnable text — the JS is embedded via json.dumps
    so the triple-quote nestings (markdown fence + python + JS) can never break
    the file's own parsing: this script must always be importable."""
    return "\n".join([
        "```python",
        "for w in (1920, 1520, 1440, 1366, 1280, 900):",
        "    cdp('Emulation.setDeviceMetricsOverride', width=w, height=1100, deviceScaleFactor=1, mobile=False)",
        f"    print(w, js({json.dumps(_SNIPPET_JS)}))",
        "```",
        "",
        _SNIPPET_NOTE,
    ])


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build a layout fixture from the panel CSS.")
    ap.add_argument("--plugin", default=str(Path.home() / "src/exam-desk/desktop/plugin.js"))
    ap.add_argument("--out", default="/tmp/exam-desk-fixture.html")
    args = ap.parse_args(argv)

    css = extract_css(Path(args.plugin))
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{height:100%;margin:0}}
:root{{--ui-text-primary:#e6e6e6;--ui-text-secondary:#9aa0a6;--ui-stroke-secondary:#3a3a3a;
--ui-accent:#2563eb;--chrome-action-hover:#242424;--font-sans:system-ui,sans-serif}}
/* stand-ins for the app's button/badge primitives, so the fixture has real heights */
.cbt-b{{font:inherit;font-size:12px;padding:4px 10px;border:1px solid #3a3a3a;border-radius:6px;background:transparent;color:inherit}}
.cbt-b.bb{{border-color:#5a5a5a;background:#2a2a2a}}
.cbt-b.w{{border-color:#f59e0b;color:#b45309;background:rgba(245,158,11,.18)}}
.cbt-badge{{font-size:11px;border:1px solid #3a3a3a;border-radius:999px;padding:1px 7px;white-space:nowrap}}
{css}
</style></head><body>
<div class="cbt cbt-page cbt-home">
  <div class="cbt-head-row"><h2>Exam Desk</h2>
    <span class="cbt-sub cbt-inline">exam-agnostic practice — any CBT, pattern is data</span>
    <span style="flex:1"></span><button class="cbt-b">Refresh</button><button class="cbt-b bb">Add exam</button></div>
{shelf("DEMO-BASICS", "bundled sample", PAPERS_ONE, "1 paper · 4 attempts · best +2 · last 20 h ago")}
{shelf("GAT-B", "NTA / RCB (DBT)", PAPERS_FIVE, "5 papers · 10 attempts · best 34.0 · last 3 d ago")}
</div></body></html>"""

    out = Path(args.out)
    out.write_text(html, encoding="utf-8")
    print(f"fixture: {out}  ({len(html)} bytes, css {len(css)})")
    print(f"open:    goto_url(\"file://{out}\")")
    print("measure:")
    print(measuring_snippet())
    print("\nReport it as: measured on a fixture with the real stylesheet, not the live app.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
