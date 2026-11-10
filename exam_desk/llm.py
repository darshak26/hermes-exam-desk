"""The model-call policy for the post-exam evaluation: how a structured answer
is requested and how a provider's refusal is retried.

Two policies, applied over a list of request shapes:

* Richest constraint first: a real json_schema, then json_object mode, then
  plain text with the JSON block dug out of the prose afterward (`prompts.parse_json_block`).
* `plan()` returns every shape in try-order; the caller remembers per process
  which shape last worked (a provider that refuses json_schema refuses it on
  EVERY call — re-asking costs a wasted 400 round trip per evaluation) so the
  remembered shape goes first while the rest stay behind it, letting a provider
  change degrade and recover without a restart.
* The first shape gets a short budget: a provider that cannot answer in 90 s
  under a 2,000-token cap will not in 180 — falling through to the next shape
  fast beats half a call's ceiling stuck on the wrong shape.
"""
from .prompts import EVAL_SCHEMA

FIRST_SHAPE_TIMEOUT = 90
NEXT_SHAPE_TIMEOUT = 180


def plan(known=None):
    """[(shape, timeout, complete_structured kwargs)] in the order to try them.

    `known` is the shape name this process last got a usable answer from, or
    None at process start.
    """
    attempts = [
        ("json_schema", FIRST_SHAPE_TIMEOUT,
         {"json_schema": EVAL_SCHEMA, "schema_name": "cbt.evaluation"}),
        ("json_mode", NEXT_SHAPE_TIMEOUT,
         {"json_mode": True, "schema_name": "cbt.evaluation"}),
        ("text", NEXT_SHAPE_TIMEOUT, {}),
    ]
    if known:
        attempts.sort(key=lambda item: 0 if item[0] == known else 1)   # stable sort
    return attempts
