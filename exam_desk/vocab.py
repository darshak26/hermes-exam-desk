"""Shared vocabulary — the plugin's one naming table.

Every surface (panel copy, evaluation prompts, skills, README) must say the same
word for the same thing. This module is the Python end of that table; the panel
keeps its own copy of the two short display labels because it cannot import here.

  exam       a family of papers (`family_of(exam_id)`). The thing a student prepares
             for and improves at. E.g. `gat-b`.
  paper      one question pack (file `packs/<exam_id>.json`) — a sitting's source.
             E.g. `gat-b-2023`.
  attempt    one sitting. Belongs to an exam; records which paper it sat. Retaking
             the same paper = a new attempt.
  sitting    synonym for attempt, used in copy ("start a sitting").
  retake     a new attempt on a paper already sat.
  drill      a derived paper holding the misses (wrong/skipped/not counted) of one
             finished attempt, for targeted re-practice; its attempts belong to the
             drill paper's exam (the source exam).
  mock       mode `exam`: the full-page sitting with no help, the score that counts
  assisted   mode `assisted`: the side-pane sitting with the tutor one message away
  draft      an AI-generated paper (`provenance` says so, `key_status`
             `self-authored`): questions and key written by the model, never an
             exam fact unless it is reconciled against an official source

Note on storage and API naming:
Storage and API parameters retain the name `exam_id` (pointing at the paper slug)
for backward compatibility. Responses alias `paper_id = exam_id` for clarity, but
the stored key stays `exam_id`. Do not rename existing API parameters or storage keys.
"""
MODE_LABELS = {"assisted": "assisted", "exam": "mock"}
KIND_LABELS = {"pyq": "PYQ", "practice": "practice", "drill": "drill"}

# Cosmetic shortforms for slugs and titles; never load-bearing — a pack_state that
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


def mode_label(mode):
    """Display word for an attempt mode ('' when the mode is unknown)."""
    return MODE_LABELS.get(mode, "")


def kind_label(kind):
    """Display word for a paper kind ('' when unknown)."""
    return KIND_LABELS.get(kind, "")
