#!/usr/bin/env python3
"""Validate a CBT question pack JSON against the cbt-pack/1 schema. Exit 0 = PASS.

Standalone on purpose (stdlib only, any python): the sourcing skill runs this
before installing a pack into the plugin's data directory.

Errors (exit 1) mean the pack cannot be graded. Warnings (exit 0) mean it will
run but the questions look damaged — OCR debris, placeholder topics, duplicate
options — which is normal for a freshly sourced paper and needs a human pass.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))   # plugin root → import exam_desk
from exam_desk.pack import lint_pack, validate_pack             # noqa: E402

def main(argv):
    if len(argv) != 2:
        print("usage: validate_pack.py <pack.json>")
        return 2
    try:
        pack = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    except Exception as e:
        print(f"FAIL: cannot read/parse {argv[1]}: {e}")
        return 1
    errs = validate_pack(pack)
    if errs:
        for e in errs:
            print(f"ERROR: {e}")
        print(f"FAIL: {len(errs)} error(s) in {argv[1]}")
        return 1
    print(f"PASS: {pack['exam_id']} — {len(pack['questions'])} questions, "
          f"{len(pack['pattern']['sections'])} sections, "
          f"{pack['pattern']['duration_minutes']} min")
    warns = lint_pack(pack)
    if warns:
        for w in warns:
            print(f"WARN: {w}")
        print(f"NOTE: {len(warns)} warning(s) — the pack grades, but fix these before the exam.")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv))
