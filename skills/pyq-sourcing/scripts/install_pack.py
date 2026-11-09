#!/usr/bin/env python3
"""Install a CBT question pack JSON into the plugin's data directory. Exit 0 = PASS.

Usage:
  python3 install_pack.py <pack.json> [--replace] [--data-dir DIR]
"""
import argparse
import json
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))   # plugin root → import exam_desk
from exam_desk import pack as pack_mod                         # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description="Install a CBT question pack JSON.")
    ap.add_argument("pack_file", help="Path to validated pack JSON")
    ap.add_argument("--replace", action="store_true", default=False,
                    help="Replace and retire an existing paper of the same paper_id")
    default_data = os.environ.get("EXAM_DESK_DATA_DIR") or os.path.expanduser("~/.hermes/plugin-data/exam-desk")
    ap.add_argument("--data-dir", default=default_data, help="Plugin data directory")
    args = ap.parse_args(argv)

    src_path = Path(args.pack_file)
    if not src_path.is_file():
        print(f"FAIL pack file not found: {src_path}")
        return 1

    try:
        pack = json.loads(src_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"FAIL cannot read/parse {src_path}: {e}")
        return 1

    if not isinstance(pack, dict):
        print("FAIL pack must be a JSON object")
        return 1

    paper_id = pack.get("paper_id")
    if not paper_id or src_path.stem != paper_id:
        print(f"FAIL paper_id {paper_id!r} does not match file stem {src_path.stem!r}")
        return 1

    errs = pack_mod.validate_pack(pack)
    if errs:
        for e in errs:
            print(f"ERROR: {e}")
        print(f"FAIL: {len(errs)} error(s) in {src_path}")
        return 1

    packs_dir = Path(args.data_dir) / "packs"
    packs_dir.mkdir(parents=True, exist_ok=True)
    target = packs_dir / f"{paper_id}.json"

    if target.exists():
        if not args.replace:
            try:
                old_pack = json.loads(target.read_text(encoding="utf-8"))
                old_title = old_pack.get("title", paper_id)
                old_year = old_pack.get("year")
                if old_year is None:
                    old_year = "no year"
            except Exception:
                old_title, old_year = paper_id, "unknown"
            print(f"REFUSED {paper_id} — a paper with that id already exists ({old_title}, {old_year}). "
                  "Re-run with --replace to retire it.")
            return 2

        try:
            old_pack = json.loads(target.read_text(encoding="utf-8"))
            old_hash = pack_mod.pack_hash(old_pack)
        except Exception:
            old_hash = "unknown"

        superseded_dir = packs_dir / "superseded"
        superseded_dir.mkdir(parents=True, exist_ok=True)
        retired_file = f"{paper_id}.{old_hash}.json"
        retired_path = superseded_dir / retired_file
        shutil.move(str(target), str(retired_path))

        tmp_target = packs_dir / f"{paper_id}.{os.getpid()}.tmp"
        tmp_target.write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp_target, target)
        print(f"PASS replaced {paper_id}; previous kept as superseded/{retired_file}")
        return 0

    if not pack.get("exam"):
        ex = pack_mod.pack_exam(pack)
        print(f"NOTE no exam field; derived '{ex}' from paper_id — state it in the pack to pin it. "
              "(To the installing agent: write exam/kind in the pack you hand over.)")

    ex = pack.get("exam") or pack_mod.pack_exam(pack)
    kind = pack.get("kind")
    scope = pack.get("scope")
    parts = [f"exam {ex}"]
    if kind:
        parts.append(str(kind))
    if scope:
        parts.append(f"scope {scope}")
    meta = f" ({', '.join(parts)})"

    tmp_target = packs_dir / f"{paper_id}.{os.getpid()}.tmp"
    tmp_target.write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp_target, target)
    print(f"PASS installed {paper_id}{meta}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
