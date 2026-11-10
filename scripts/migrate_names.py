#!/usr/bin/env python3
"""Rewrite exam-desk data files to the 0.10.0 field names. Exit 0 = done.

0.9.0 used one word for two things and a second word for the third:

    exam_id   the PAPER slug          -> paper_id
    family    the EXAM slug           -> exam
    pack_hash / pack_title  (attempt) -> paper_hash / paper_title
    mode "exam"                       -> mode "mock"

Readers migrate in memory, so nothing is ever unreadable; this script makes the
files on disk say the same thing, and states `exam`/`kind` on every paper that
left them implied (so no code has to read a slug for meaning again).

**Hash carry-over.** Rewriting a paper changes its content hash, and an attempt
remembers the hash of the file it was sat against — so a plain rewrite makes every
old attempt read as `pack_changed: true` and puts a "the questions changed" notice
on a result page where nothing changed at all. So for each paper the script knows
both hashes (from the file it just read, or from `--old-packs` when the files were
already rewritten) and re-points the attempts that recorded the old one.

Usage:
  python3 scripts/migrate_names.py                     # the plugin's live data dir
  python3 scripts/migrate_names.py --data-dir DIR       # another data root
  python3 scripts/migrate_names.py --file pack.json     # one file
  python3 scripts/migrate_names.py --old-packs DIR      # fix hashes after an earlier run
  python3 scripts/migrate_names.py --dry-run
"""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from exam_desk import pack as pack_mod  # noqa: E402
from exam_desk import store as store_mod  # noqa: E402

PACK_RENAMES = (("exam_id", "paper_id"), ("family", "exam"))


def migrate_pack(pack):
    """Old names out, new names in, and state `exam`/`kind` instead of implying them."""
    changed = []
    for old, new in PACK_RENAMES:
        if old in pack:
            if not pack.get(new):
                pack[new] = pack[old]
                changed.append(f"{old}->{new}")
            del pack[old]

    if not pack.get("exam"):
        derived = pack_mod.exam_of(pack.get("paper_id"))
        if derived:
            pack["exam"] = derived
            changed.append(f"exam:={derived}")

    if not pack.get("kind"):
        derived = pack_mod.derived_kind(pack.get("paper_id"))
        if derived:
            pack["kind"] = derived
            changed.append(f"kind:={derived}")
    return changed


def _read(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return None, str(e)
    if not isinstance(data, dict):
        return None, "not a JSON object"
    return data, None


def _write(path, data):
    st = path.stat()
    tmp = path.with_name(f"{path.name}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)
    os.utime(path, (st.st_atime, st.st_mtime))


def run(jobs, dry_run=False, old_packs_dir=None):
    """Migrate `jobs` ([(path, 'paper'|'attempt')]) pending; returns (touched, repointed)."""
    pack_jobs = [(p, k) for p, k in jobs if k == "paper"]
    attempt_jobs = [(p, k) for p, k in jobs if k == "attempt"]
    touched, repointed = 0, 0
    hash_map = {}                      # old content hash -> current content hash

    # 1. papers first: their before/after hashes are what the attempts need
    for path, _ in pack_jobs:
        if not path.is_file():
            print(f"SKIP {path}: not a file")
            continue
        before, err = _read(path)
        if err:
            print(f"SKIP {path.name}: {err}")
            continue
        after = json.loads(json.dumps(before))       # deep copy
        changes = migrate_pack(after)
        # An already-migrated file only yields its pair if we are told the old copy.
        old_copy = Path(old_packs_dir) / path.name if old_packs_dir else None
        if not changes and old_copy and old_copy.is_file():
            prior, prior_err = _read(old_copy)
            if not prior_err:
                hash_map[pack_mod.pack_hash(prior)] = pack_mod.pack_hash(after)
        elif changes:
            hash_map[pack_mod.pack_hash(before)] = pack_mod.pack_hash(after)

        if changes and not dry_run:
            _write(path, after)
        touched += 1 if changes else 0
        print(f"{'WOULD ' if (changes and dry_run) else ''}"
              f"{'CHANGED' if changes else 'ok     '} {path.name}"
              f"{' — ' + ', '.join(changes) if changes else ''}")

    # 2. attempts, and re-point any that recorded a pre-rename paper hash
    for path, _ in attempt_jobs:
        if not path.is_file():
            print(f"SKIP {path}: not a file")
            continue
        data, err = _read(path)
        if err or data is None:
            print(f"SKIP {path.name}: {err or 'unreadable'}")
            continue
        before = json.dumps(data, sort_keys=True)
        store_mod.migrate_attempt(data)
        moved = False
        old_hash = data.get("paper_hash")
        if old_hash in hash_map and hash_map[old_hash] != old_hash:
            data["paper_hash"] = hash_map[old_hash]
            moved = True
        changed = moved or json.dumps(data, sort_keys=True) != before
        if changed and not dry_run:
            _write(path, data)
        touched += 1 if changed else 0
        repointed += 1 if moved else 0
        print(f"{'WOULD ' if (changed and dry_run) else ''}"
              f"{'CHANGED' if changed else 'ok     '} {path.name}"
              f"{' — fields, hash re-pointed' if moved else (' — fields' if changed else '')}")

    return touched, repointed, len(jobs)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Rewrite exam-desk files to the current field names.")
    ap.add_argument("--data-dir", default=os.environ.get("EXAM_DESK_DATA_DIR")
                    or os.path.expanduser("~/.hermes/plugin-data/exam-desk"))
    ap.add_argument("--file", action="append", default=[], help="Migrate one file (repeatable)")
    ap.add_argument("--old-packs", default=None,
                    help="Directory holding pre-migration pack copies (for hash carry-over)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    if args.file:
        jobs = [(Path(f), "attempt" if Path(f).parent.name == "attempts" else "paper")
                for f in args.file]
    else:
        root = Path(args.data_dir)
        jobs = [(p, "paper") for p in sorted((root / "packs").glob("*.json"))]
        jobs += [(p, "attempt") for p in sorted((root / "attempts").glob("*.json"))]
        if not jobs:
            print(f"NOTE nothing to look at under {root}")

    touched, repointed, total = run(jobs, dry_run=args.dry_run, old_packs_dir=args.old_packs)
    verb = "would change" if args.dry_run else "changed"
    print(f"{touched} of {total} file(s) {verb}"
          f"{f'; {repointed} attempt hash(es) re-pointed' if repointed else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
