"""Housekeeping tripwires — facts that must not drift between surfaces.

Nothing here tests behaviour; every failure is a copy-paste hygiene bug that
otherwise surfaces months later as "the panel says one word, the prompt says
another", or as three versions disagreeing about what is running.
"""
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("EXAM_DESK_DATA_DIR", tempfile.mkdtemp(prefix="cbt-test-"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "dashboard"))


def _root_version():
    """The `VERSION = "…"` line in the plugin-root __init__.py (the register(ctx) module).

    Read as text, not imported: the plugin root's whole job is gateway registration,
    and the test suite must not need the gateway to run.
    """
    m = re.search(r'^VERSION\s*=\s*"([^"]+)"', (ROOT / "__init__.py").read_text(encoding="utf-8"), re.M)
    return m.group(1) if m else None


class VersionAgreement(unittest.TestCase):
    """One plugin, one version: the manifest, the agent half and the HTTP half agree."""

    def test_three_files_say_the_same_version(self):
        import plugin_api
        import yaml
        manifest = yaml.safe_load((ROOT / "plugin.yaml").read_text())
        declared = str(manifest["version"])
        root, http = _root_version(), plugin_api.VERSION
        missing = [n for n, v in (("plugin.yaml", declared), ("__init__.py", root),
                                  ("plugin_api.py", http)) if not v]
        self.assertEqual(missing, [], "a version string is missing entirely")
        self.assertEqual(len({declared, root, http}), 1,
                         "plugin.yaml / __init__.py / plugin_api.py versions drifted")


class VocabParity(unittest.TestCase):
    """The panel cannot import exam_desk.vocab, so it carries its own copy of the
    two mode words. This asserts the copies never diverge — case-insensitively:
    vocab feeds sentence prose (mock), the panel headline-copies its labels (Mock)."""

    def test_panel_mode_labels_match_vocab(self):
        import exam_desk.vocab as vocab
        js = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")
        m = re.search(r"const MODE_LABEL\s*=\s*\{([^}]*?)\}", js)
        self.assertIsNotNone(m, "MODE_LABEL table vanished from the panel")
        panel = dict(re.findall(r"(\w+)\s*:\s*'([^']*)'", m.group(1)))
        self.assertEqual({k: v.casefold() for k, v in panel.items()},
                         {k: v.casefold() for k, v in vocab.MODE_LABELS.items()},
                         "panel MODE_LABEL and exam_desk.vocab.MODE_LABELS drifted")

    def test_keys_are_the_same_set(self):
        """A word dropped from either side would silently render an attempt as its
        raw mode value — the keys must be identical, not merely insync-len."""
        import exam_desk.vocab as vocab
        js = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")
        m = re.search(r"const MODE_LABEL\s*=\s*\{([^}]*?)\}", js)
        panel = re.findall(r"(\w+)\s*:", m.group(1))
        self.assertEqual(sorted(panel), sorted(vocab.MODE_LABELS))

    def test_panel_kind_labels_match_vocab(self):
        import exam_desk.vocab as vocab
        js = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")
        m = re.search(r"const KIND_LABELS\s*=\s*\{([^}]*?)\}", js)
        self.assertIsNotNone(m, "KIND_LABELS table vanished from the panel")
        panel = dict(re.findall(r"(\w+)\s*:\s*'([^']*)'", m.group(1)))
        self.assertEqual(panel, vocab.KIND_LABELS,
                         "panel KIND_LABELS and exam_desk.vocab.KIND_LABELS drifted")


class ManifestShape(unittest.TestCase):
    """Fields the catalog gate and the README both assume."""

    def test_bundled_skills_carry_valid_frontmatter_and_names(self):
        import yaml
        for skill_md in sorted((ROOT / "skills").glob("*/SKILL.md")):
            text = skill_md.read_text(encoding="utf-8")
            parts = text.split("---\n", 2)
            self.assertEqual(len(parts), 3, f"{skill_md}: frontmatter malformed")
            meta = yaml.safe_load(parts[1])
            self.assertEqual(str(meta.get("name")), skill_md.parent.name,
                             f"{skill_md}: directory and frontmatter name disagree")

    def test_readme_names_every_bundled_skill(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        for skill_md in (ROOT / "skills").glob("*/SKILL.md"):
            self.assertIn(skill_md.parent.name, readme,
                          f"README's three-parts line lists every skill; {skill_md.parent.name} missing")


if __name__ == "__main__":
    unittest.main()
