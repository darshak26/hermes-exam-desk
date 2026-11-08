"""Shared vocabulary — the plugin's one naming table.

Every surface (panel copy, evaluation prompts, skills, README) must say the same
word for the same thing. This module is the Python end of that table; the panel
keeps its own copy of the two short display labels because it cannot import here.

  paper      a question pack (file `packs/<exam_id>.json`) — the exam you can sit
  mock       mode `exam`: the full-page sitting with no help, the score that counts
  assisted   mode `assisted`: the side-pane sitting with the tutor one message away
  drill      a derived paper holding the misses (wrong/skipped/not counted) of one
             finished attempt, for targeted re-practice
  draft      an AI-generated paper (`provenance` says so, `key_status`
             `self-authored`): questions and key written by the model, never an
             exam fact unless it is reconciled against an official source
"""
MODE_LABELS = {"assisted": "assisted", "exam": "mock"}


def mode_label(mode):
    """Display word for an attempt mode ('' when the mode is unknown)."""
    return MODE_LABELS.get(mode, "")
