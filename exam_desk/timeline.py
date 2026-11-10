"""Timeline — derive *how* an attempt was taken from its event stream.

Storage keeps state and raw events; this module owns every derived number (one
place, or two copies drift):

* dwell per question: sum of the [open → next event about another question]
  windows; a revisit adds another window, so "opened twice, 20s + 40s" is 60s.
* mind-changes: `save` events whose `prev` differs from `value`.
* doubts: `doubt` events (appended by the assist tutor half).

Every view function is tolerant of absence: an attempt graded before the
stream existed yields the same shape with `None` where nothing is known —
callers decide whether to show "—" or fall back to wall-clock pace.

Events are trusted for shape, never for sense: unknown types are ignored, and
consecutive duplicates (`save` of the same value) are the record's job to keep.

  a `save` event arriving without its qid's window already open (a save without an
  opening visit — it happens when the writer half restarted) simply adds nothing.
  Events are trusted for shape, never for sense: unknown types are ignored, and
  sequence discipline (open-before-save) is the caller's — the module only sums
  windows, so a save of the same value twice is two saves and zero changes.
"""
import json
import statistics

from . import store as store_mod

OPEN, SAVE, MARK, DOUBT = "open", "save", "mark", "doubt"


def read_stream(aid):
    """The attempt's event stream from disk, through the store's tolerant reader."""
    return store_mod.read_events(aid)


def build(attempt, pack, stream=None, events=None):
    """One per-question/per-section view. `stream` (a list) overrides disk; `events`
    is an alias kept for call sites written before `stream` won the name."""
    if stream is None:
        stream = events if events is not None else read_stream(attempt.get("id", ""))
    stream = [e for e in stream if isinstance(e, dict) and isinstance(e.get("t"), (int, float))]

    qids = {q["id"] for q in pack.get("questions") or []}
    # Per question: dwell sums its own [open → other-event] windows.
    def _is_about(e, qid):
        return e.get("type") in (OPEN, SAVE, MARK, DOUBT) and e.get("qid") == qid

    window_start = None    # set on an open, consumed by any event about that qid,
    dwell_qid = None
    per = {qid: {"dwell": 0.0, "opens": 0, "saves": 0, "changes": 0, "doubts": 0, "marked": False}
           for qid in qids}
    for e in stream:
        kind, qid = e.get("type"), e.get("qid")
        known = qid in per
        if kind == OPEN and known:
            # the screen switched: close whatever window was running, then open a new one
            if dwell_qid is not None:
                per[dwell_qid]["dwell"] += max(0.0, e["t"] - window_start)
                window_start, dwell_qid = None, None
            per[qid]["opens"] += 1
            window_start, dwell_qid = e["t"], qid
            continue
        # attention left this question (an event about another/unknown qid): the window ends here
        if (not known or qid != dwell_qid) and dwell_qid is not None:
            per[dwell_qid]["dwell"] += max(0.0, e["t"] - window_start)
            window_start, dwell_qid = None, None
        if not known:
            continue
        if kind == SAVE:
            per[qid]["saves"] += 1
            prev, value = e.get("prev"), e.get("value")
            if prev is not None and value is not None and prev != value:
                per[qid]["changes"] += 1
        elif kind == DOUBT:
            per[qid]["doubts"] += 1
        elif kind == MARK:
            per[qid]["marked"] = bool(e.get("on"))
    # a window still open at the end of the stream simply ends where the stream does
    if dwell_qid is not None and stream:
        per[dwell_qid]["dwell"] += max(0.0, stream[-1]["t"] - window_start)

    sections = {}
    for s in pack.get("pattern", {}).get("sections") or []:
        sid = s.get("id")
        rows = [(qs["id"], per[qs["id"]]) for qs in pack.get("questions") or [] if qs.get("section") == sid]
        sections[sid] = {
            "dwell": round(sum(p["dwell"] for _, p in rows), 1),
            "questions": len(rows),
        }

    spent = sorted((p["dwell"] for p in per.values() if p["dwell"] > 0))
    return {
        "per_question": {qid: {
            "spent": round(p["dwell"], 1), "opens": p["opens"], "saves": p["saves"],
            "changes": p["changes"], "doubts": p["doubts"], "marked": p["marked"],
        } for qid, p in per.items()},
        "sections": sections,
        "totals": {
            "events": len(stream),
            "changed": sum(p["changes"] for p in per.values()),
            "doubts": sum(p["doubts"] for p in per.values()),
            "covered": len(spent),
            "median_spent": round(statistics.median(spent), 1) if spent else None,
            "longest_spent": round(max(spent), 1) if spent else None,
            "total_spent": round(sum(spent), 1),
        },
    }


def metric_lines(view):
    """The human/LLM wording over a `build` view — one list of (label, sentence)."""
    out = []
    totals = (view or {}).get("totals")
    if not totals or not totals.get("events"):
        return out
    if totals.get("changed"):
        out.append(("Mind changes",
                    f"{totals['changed']} question{'' if totals['changed'] == 1 else 's'} had an answer changed after a first save"))
    if totals.get("doubts"):
        out.append(("Asked the tutor", f"{totals['doubts']} doubt{'' if totals['doubts'] == 1 else 's'} during the attempt"))
    med = totals.get("median_spent")
    longest = totals.get("longest_spent")
    if med is not None:
        out.append(("Time on question",
                    f"median {round(med)}s, longest {round(longest or 0)}s across the {totals['covered']} touched"))
    for sid, sec in ((view or {}).get("sections") or {}).items():
        if not sec.get("dwell"):
            continue
        out.append((f"Time in section {sid}", f"{fmt_sec(sec['dwell'])} across {sec['questions']} questions"))
    return out


def per_question_text(view, qid):
    """One sentence about one question, for a row in the review/prompt. '' when unknown."""
    row = ((view or {}).get("per_question") or {}).get(qid) if view else None
    if not row or not row.get("spent"):
        return ""
    bits = [f"on screen {round(row['spent'])}s" if row.get("spent") else None,
            f"{row['opens']} visit{'' if row['opens'] == 1 else 's'}" if row.get("opens") else None]
    if row.get("changes"):
        bits.append("answer was changed before the final save")
    if row.get("doubts"):
        bits.append(f"asked the tutor {row['doubts']} question{'' if row['doubts'] == 1 else 's'} on it")
    bits = [b for b in bits if b]
    return "; ".join(bits) or ""


def fmt_sec(s):
    s = float(s or 0)
    if s >= 3600:
        return f"{s/3600:.1f} h"
    if s >= 60:
        return f"{s/60:.0f} min"
    return f"{s:.0f} s"


JSON = json.dumps  # re-exported for callers that stream events by hand
