"""Shared vocabulary — the plugin's one naming table.

Every surface (panel copy, evaluation prompts, skills, README) must say the same
word for the same thing. This module is the Python end of that table; the panel
keeps its own copy of the short display labels because it cannot import here.

  exam       one exam, as a slug and nothing else (`gat-b`): a family of papers,
             the thing a student prepares for and improves at. Field `exam`.
  paper      one question pack — the file a sitting is taken from (`gat-b-2023`).
             Field `paper_id`, filename `packs/<paper_id>.json`.
  attempt    one sitting of one paper. Belongs to an exam; records which paper it
             sat. Retaking the same paper = a new attempt.
  sitting    synonym for attempt, used in copy ("start a sitting").
  retake     a new attempt on a paper already sat.
  drill      a derived paper holding the misses (wrong/skipped/not counted) of one
             finished attempt. Kind `drill`; its attempts belong to the source exam.
  mock       mode `mock`: the full-page sitting with no help — the score that counts
  assisted   mode `assisted`: the side-pane sitting with the tutor one message away
  draft      an AI-generated paper (`provenance` says so, `key_status`
             `self-authored`): never an exam fact unless reconciled with a source
  pack       the FILE FORMAT word (`cbt-pack/1`), not a domain object. Functions
             that parse, validate or cache a file stay `*_pack`; every user-facing
             name says paper.

A paper states two ids — its own (`paper_id`) and the exam it belongs to
(`exam`). An attempt states the same pair plus its mode. That is the whole model:
exam → papers → attempts, with mode and kind as labels, never as levels.

Legacy names are READ but never written: `exam_id` (was the paper slug), `family`
(was the exam), `pack_hash`/`pack_title` (now `paper_hash`/`paper_title`), and mode
`exam` (now `mock`). `scripts/migrate_names.py` rewrites the files on disk; every
reader also tolerates the old keys in memory, so a half-migrated data directory
still answers correctly.
"""

MODE_VALUES = ("assisted", "mock")
MODE_LABELS = {"assisted": "assisted", "mock": "mock"}
MODE_ALIASES = {"exam": "mock"}          # legacy stored value → current spelling
KIND_VALUES = ("pyq", "practice", "drill")
KIND_LABELS = {"pyq": "PYQ", "practice": "practice", "drill": "drill"}

# Cosmetic shortforms for slugs and titles; never load-bearing — a slug that
# spells the word out is always correct. Presence in this table is the ONLY licence
# to abbreviate: anything not here (or ambiguous, like "gen") is spelled in full.
ABBREVIATIONS = {
    "bioinformatics": "bioinfo",
    "biochemistry": "biochem",
    "biotechnology": "biotech",
    "immunology": "immuno",
    "microbiology": "microbio",
    "molecular-biology": "molbio",
    "cell-biology": "cellbio",
}


def normalize_mode(mode):
    """The current stored spelling of an attempt mode; legacy `exam` folds to `mock`."""
    m = str(mode or "")
    return MODE_ALIASES.get(m, m)


def mode_label(mode):
    """Display word for an attempt mode ('' when the mode is unknown)."""
    return MODE_LABELS.get(normalize_mode(mode), "")


def kind_label(kind):
    """Display word for a paper kind ('' when unknown)."""
    return KIND_LABELS.get(kind, "")
