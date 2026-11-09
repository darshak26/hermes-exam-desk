import sys, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from exam_desk.pack import validate_pack, sanitize_pack, summarize, SCHEMA, exam_of, pack_hash, YR, pack_exam, derived_kind, KINDS
from tests.helpers import base_pack

class PackTests(unittest.TestCase):
    def test_valid_pack_passes(self):
        self.assertEqual(validate_pack(base_pack()), [])

    def test_rejects_bad_schema_slug_duration(self):
        p = base_pack(); p["schema"] = "wrong"
        self.assertIn("schema must be", " ".join(validate_pack(p)))
        p = base_pack(); p["paper_id"] = "Bad Slug!"
        self.assertTrue(any("paper_id" for e in validate_pack(p)))
        p = base_pack(); p["pattern"]["duration_minutes"] = 0
        self.assertTrue(any("duration_minutes" for e in validate_pack(p)))

    def test_rejects_wrong_section_count(self):
        p = base_pack(); p["pattern"]["sections"][0]["question_count"] = 99
        self.assertTrue(any("question_count" for e in validate_pack(p)))

    def test_rejects_bad_answers_and_missing_provenance(self):
        p = base_pack(); p["questions"][0]["answer"] = 9
        self.assertTrue(any("mcq answer" for e in validate_pack(p)))
        p = base_pack(); p["questions"][4]["answer"] = [0, 0]
        self.assertTrue(any("msq answer" for e in validate_pack(p)))
        p = base_pack(); p["questions"][2].pop("source_url")
        self.assertTrue(any("source_url" for e in validate_pack(p)))
        p = base_pack(); p.pop("provenance")
        self.assertTrue(any("provenance" for e in validate_pack(p)))

    def test_sanitize_strips_answers_and_explanations(self):
        s = sanitize_pack(base_pack())
        for q in s["questions"]:
            self.assertNotIn("answer", q); self.assertNotIn("explanation", q)
        self.assertEqual(s["pattern"], base_pack()["pattern"])

    def test_summarize_shape(self):
        sm = summarize(base_pack())
        self.assertEqual(sm["paper_id"], "gat-b-demo")
        self.assertEqual(sm["question_count"], 6)
        self.assertEqual(sm["sections"][1]["attempt_limit"], 2)
        # the panel's Marks column reads these — omitting them rendered "+undefined"
        self.assertEqual(sm["sections"][0]["marks_correct"], 1)
        self.assertEqual(sm["sections"][1]["marks_correct"], 3)
        self.assertEqual(sm["sections"][1]["marks_wrong"], -1)
        self.assertEqual(sm["key_status"], "official", "an absent key_status means the key is official")

    def test_key_status_is_opt_out_and_validated(self):
        p = base_pack(); p["key_status"] = "random"
        self.assertEqual(validate_pack(p), [])

        p = base_pack(); p["key_status"] = "probably-fine"
        self.assertIn("key_status must be one of", " ".join(validate_pack(p)))

        p = base_pack(); p["key_status"] = "random"
        self.assertEqual(summarize(p)["key_status"], "random")

    def test_exam_of_rules_and_examples(self):
        self.assertEqual(exam_of("gat-b"), "gat-b")
        self.assertEqual(exam_of("gat-b-2023"), "gat-b")
        self.assertEqual(exam_of("gat-b-2023-shift1"), "gat-b")
        self.assertEqual(exam_of("gat-b-2023-drill"), "gat-b")
        self.assertEqual(exam_of("gat-b-2023-drill-2"), "gat-b")
        self.assertEqual(exam_of("gat-b-2023-superseded-4f2a9c1b0d3e"), "gat-b")
        self.assertEqual(exam_of("demo-basics"), "demo-basics")
        self.assertEqual(exam_of("csir-net-set-a"), "csir-net-set-a")
        self.assertTrue(YR.search("-2023"))

    def test_pack_hash(self):
        p1 = base_pack()
        p2 = {k: p1[k] for k in reversed(list(p1.keys()))}
        h1 = pack_hash(p1)
        h2 = pack_hash(p2)
        self.assertEqual(len(h1), 12)
        self.assertEqual(h1, h2)
        p3 = base_pack()
        p3["title"] = "Different Title"
        self.assertNotEqual(pack_hash(p3), h1)

    def test_summarize_has_family(self):
        p = base_pack()
        p["paper_id"] = "gat-b-2023"
        p["year"] = 2023
        sm = summarize(p)
        self.assertEqual(sm["exam"], "gat-b")

    def test_validate_pack_set_and_year(self):
        p = base_pack()
        p["set"] = "set-a"
        self.assertEqual(validate_pack(p), [])

        p["set"] = "Set A!"
        self.assertTrue(any("set" in e for e in validate_pack(p)))

        p = base_pack()
        p["paper_id"] = "gat-b-2023"
        p["year"] = 2023
        self.assertEqual(validate_pack(p), [])

        p["year"] = 2024
        self.assertTrue(any("year" in e for e in validate_pack(p)))

        p.pop("year")
        self.assertTrue(any("year" in e for e in validate_pack(p)))

        p_no_yr = base_pack()
        p_no_yr["paper_id"] = "demo-basics"
        p_no_yr.pop("year", None)
        self.assertEqual(validate_pack(p_no_yr), [])

    def test_pack_exam_stated_wins_and_legacy_fallback(self):
        # Stated family wins
        self.assertEqual(pack_exam({"paper_id": "csir-net-set-a", "exam": "csir-net"}), "csir-net")
        self.assertEqual(pack_exam({"paper_id": "gat-b-practice-bioinfo", "exam": "gat-b"}), "gat-b")
        # Legacy packs without family fall back to exam_of
        self.assertEqual(pack_exam({"paper_id": "gat-b-2023"}), "gat-b")
        self.assertEqual(pack_exam({"paper_id": "csir-net-set-a"}), "csir-net-set-a")
        self.assertEqual(pack_exam({"paper_id": "demo-basics"}), "demo-basics")

    def test_derived_kind_heuristics(self):
        # -drill in slug -> drill
        self.assertEqual(derived_kind("gat-b-2023-drill"), "drill")
        self.assertEqual(derived_kind("gat-b-drill-2"), "drill")
        # year token -> pyq
        self.assertEqual(derived_kind("gat-b-2023"), "pyq")
        self.assertEqual(derived_kind("gate-bt-2024-shift1"), "pyq")
        # practice token -> practice
        self.assertEqual(derived_kind("gat-b-practice-bioinfo"), "practice")
        self.assertEqual(derived_kind("demo-practice"), "practice")
        # else None
        self.assertIsNone(derived_kind("demo-basics"))
        self.assertIsNone(derived_kind("csir-net-set-a"))
        self.assertIsNone(derived_kind(None))

    def test_validate_pack_new_fields(self):
        # Legacy pack without kind/family validates clean
        legacy = base_pack()
        self.assertEqual(validate_pack(legacy), [])

        # kind enum enforcement
        p = base_pack()
        p["kind"] = "invalid_kind"
        errs = validate_pack(p)
        self.assertTrue(any("kind must be one of" in e for e in errs), errs)

        p["kind"] = "practice"
        p["exam"] = "gat-b"
        self.assertEqual(validate_pack(p), [])

        # exam/slug mismatch is an error
        p_mismatch = base_pack()
        p_mismatch["paper_id"] = "gat-b-2023"
        p_mismatch["year"] = 2023
        p_mismatch["exam"] = "csir-net"
        errs = validate_pack(p_mismatch)
        self.assertTrue(any("does not sit under exam" in e for e in errs), errs)

        # pyq requires year
        p_pyq = base_pack()
        p_pyq["kind"] = "pyq"
        p_pyq.pop("year", None)
        errs = validate_pack(p_pyq)
        self.assertTrue(any("kind 'pyq' requires year" in e for e in errs), errs)

        # scope non-empty
        p_scope = base_pack()
        p_scope["scope"] = ""
        errs = validate_pack(p_scope)
        self.assertTrue(any("scope must be a non-empty string" in e for e in errs), errs)

        p_scope["scope"] = "Photosynthesis"
        self.assertEqual(validate_pack(p_scope), [])

    def test_summarize_fields(self):
        p = base_pack()
        p["exam"] = "gat-b"
        p["kind"] = "practice"
        p["scope"] = "Photosynthesis"
        sm = summarize(p)
        self.assertEqual(sm["exam"], "gat-b")
        self.assertEqual(sm["kind"], "practice")
        self.assertEqual(sm["scope"], "Photosynthesis")

        # Legacy pack derives kind and has None scope
        p_leg = base_pack()
        p_leg["paper_id"] = "gat-b-2023"
        p_leg["year"] = 2023
        sm_leg = summarize(p_leg)
        self.assertEqual(sm_leg["exam"], "gat-b")
        self.assertEqual(sm_leg["kind"], "pyq")
        self.assertIsNone(sm_leg["scope"])

if __name__ == "__main__":
    unittest.main()


class MediaPackTests(unittest.TestCase):
    def test_question_media_round_trips(self):
        from exam_desk.pack import validate_pack
        p = base_pack()
        p["questions"][0]["media"] = [
            {"type": "image", "src": "figures/gel.png", "alt": "gel lanes", "caption": "Fig 1"},
            {"type": "table", "head": ["Lane", "bp"], "rows": [[1, 500], [2, 300]]},
            {"type": "text", "text": "Assume a 1 kb ladder."},
        ]
        self.assertEqual(validate_pack(p), [])

    def test_image_src_cannot_climb_out(self):
        from exam_desk.pack import validate_pack
        p = base_pack()
        p["questions"][0]["media"] = [{"type": "image", "src": "../../secret.png"}]
        errs = validate_pack(p)
        self.assertTrue(any("stay inside" in e for e in errs), errs)

    def test_uneven_table_is_an_error(self):
        from exam_desk.pack import validate_pack
        p = base_pack()
        p["questions"][0]["media"] = [{"type": "table", "head": ["a", "b"], "rows": [[1, 2], [3]]}]
        errs = validate_pack(p)
        self.assertTrue(any("cells" in e for e in errs), errs)

    def test_option_media_must_match_option_count(self):
        from exam_desk.pack import validate_pack
        p = base_pack()
        p["questions"][0]["option_media"] = [[{"type": "image", "src": "figures/a.png"}]]
        errs = validate_pack(p)
        self.assertTrue(any("option_media has" in e for e in errs), errs)

    def test_missing_alt_text_is_a_warning(self):
        from exam_desk.pack import lint_pack
        p = base_pack()
        p["questions"][0]["media"] = [{"type": "image", "src": "figures/a.png"}]
        warns = lint_pack(p)
        self.assertTrue(any("alt text" in w for w in warns), warns)
