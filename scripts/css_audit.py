#!/usr/bin/env python3
"""Diff the exam-desk panel's CSS selector set against a git revision.

The panel's whole stylesheet is one template string inside `desktop/plugin.js`,
shared by every screen. There is no compiler and no type system: a bad range
splice (`s[:i] + new + s[j:]`) deletes every rule between the anchors and
`node --check` plus the full test suite stay green while hundreds of rules are
gone. This is the audit that catches it.

Usage:
  python3 css_audit.py                       # working copy vs origin/master
  python3 css_audit.py --rev HEAD~3          # vs an older commit
  python3 css_audit.py --allow '.cbt-family-band' --allow '.cbt .cbt-card'

Exit 0 when every missing selector is explicitly allowed, 1 otherwise.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

MARKER = "const CSS = `"
COMMENT = re.compile(r"/\*.*?\*/", re.S)


def extract_css(js_text):
    """The template string between `const CSS = \`` and its closing backtick."""
    if MARKER not in js_text:
        raise SystemExit("no `const CSS = \`` marker in the file")
    start = js_text.index(MARKER) + len(MARKER)
    end = js_text.index("\n`;", start)
    return js_text[start:end]


def selectors(css):
    """Every selector in the sheet, normalised. At-rules are skipped, their
    inner rules are captured like any other because they carry their own `{`."""
    css = COMMENT.sub("", css)
    out = set()
    for match in re.finditer(r"([^{}]+)\{", css):
        block = match.group(1).strip()
        if not block or block.startswith("@"):
            continue
        for sel in block.split(","):
            sel = " ".join(sel.split())
            if sel:
                out.add(sel)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Audit the panel CSS against a git revision.")
    ap.add_argument("--repo", default=str(Path.home() / "src" / "exam-desk"))
    ap.add_argument("--file", default="desktop/plugin.js")
    ap.add_argument("--rev", default="origin/master")
    ap.add_argument("--allow", action="append", default=[],
                    help="selector that is deliberately gone (repeatable)")
    args = ap.parse_args(argv)

    repo = Path(args.repo).expanduser()
    target = repo / args.file
    now_js = target.read_text(encoding="utf-8")
    try:
        base_js = subprocess.run(["git", "show", f"{args.rev}:{args.file}"], cwd=repo,
                                 capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError as e:
        raise SystemExit(f"git show failed: {e.stderr.strip()}")

    base_css, now_css = extract_css(base_js), extract_css(now_js)
    base_sels, now_sels = selectors(base_css), selectors(now_css)
    allowed = {" ".join(a.split()) for a in args.allow}
    missing = sorted(base_sels - now_sels - allowed)

    print(f"revision {args.rev}: {len(base_css):>6} chars, {len(base_sels):>3} selectors")
    print(f"working copy : {len(now_css):>6} chars, {len(now_sels):>3} selectors")
    print(f"added: {len(now_sels - base_sels)}")

    if len(now_css) < len(base_css) * 0.6 and not allowed:
        print("\nWARNING: the stylesheet shrank by more than 40% — check for a bad splice")

    if missing:
        print(f"\nMISSING ({len(missing)}) — every one must be deliberate:")
        for sel in missing:
            print("  ", sel)
        print("\nRestore the sheet from the revision and re-apply your edits on top; "
              "patching a truncated copy keeps inventing new damage.")
        return 1

    print("\nok — every missing selector is accounted for")
    return 0


if __name__ == "__main__":
    sys.exit(main())
