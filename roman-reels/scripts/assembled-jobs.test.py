"""Real concatenated media plus synthetic test timings; no models/network/approval."""
import copy
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import factory_media as media


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


assembler = load("assembler", "assemble-source-set.py")
combined = load("combined", "prepare-assembled-jobs.py")


class AssembledJobTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.speech = {}
        for number, name in enumerate(["body", "h1", "h2", "h3"]):
            source = cls.root / f"{name}.mp4"
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                "color=c=black:s=108x192:r=25", "-f", "lavfi", "-i",
                f"sine=frequency={500 + number * 300}:sample_rate=48000", "-t", "0.16",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(source)],
                capture_output=True, timeout=30, check=True)
            text = "Основа" if number == 0 else f"Хук {number}"
            cls.speech[name] = {"artifactVersion": "1.0.0", "mode": "development",
                "alignmentMethod": "whisper_word_timestamps_not_forced_alignment",
                "sourceRelativePath": source.name, "sourceSha256": media.sha256(source),
                "sourceMetadata": media.probe(source), "transcriptText": text,
                "wordTimings": [{"text": text, "start": 0.02, "end": 0.12}],
                "speechSegments": [{"text": text, "start": 0.02, "end": 0.12}]}
        plan = {"assemblyVersion": "1.0.0", "mode": "development", "topicId": "test",
            "body": {"localPath": "body.mp4", "sha256": cls.speech["body"]["sourceSha256"]},
            "hooks": [{"hookNumber": n, "localPath": f"h{n}.mp4",
                       "sha256": cls.speech[f"h{n}"]["sourceSha256"]} for n in [1, 2, 3]]}
        with patch.object(media, "PUBLIC", cls.root):
            cls.manifest = assembler.assemble(plan, cls.root / "incoming")

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def prepare(self, manifest=None, body=None, hooks=None):
        with patch.object(media, "PUBLIC", self.root):
            return combined.prepare(manifest or self.manifest, body or self.speech["body"],
                hooks or {n: self.speech[f"h{n}"] for n in [1, 2, 3]}, "incoming")

    def test_correct_word_offsets_full_hashes_and_no_approval(self):
        original = copy.deepcopy(self.speech)
        jobs = self.prepare()
        self.assertEqual(len(jobs), 3)
        for n, (job, evidence) in enumerate(jobs, 1):
            self.assertEqual(job["hookNumber"], n)
            self.assertEqual(job["wordTimings"][0], self.speech[f"h{n}"]["wordTimings"][0])
            self.assertAlmostEqual(job["wordTimings"][1]["start"], evidence["bodyStart"] + 0.02)
            self.assertAlmostEqual(job["wordTimings"][1]["end"], evidence["bodyStart"] + 0.12)
            self.assertEqual(job["scriptText"], f"Хук {n}\n\nОснова")
            self.assertEqual(job["approvalStatus"], "pending_approval")
            self.assertNotIn("approval", job)
            self.assertFalse(evidence["productionReady"])
        self.assertEqual(self.speech, original)
        self.assertEqual(len({job["scriptHash"] for job, _ in jobs}), 3)

    def test_incomplete_production_wrong_identity_and_timeline_are_rejected(self):
        for change in [lambda m: m.update(complete=False), lambda m: m.update(mode="production"),
                       lambda m: m["variants"].pop(),
                       lambda m: m["variants"][1].update(hookNumber=1),
                       lambda m: m["variants"][0].update(reelId="R-other-h1"),
                       lambda m: m["variants"][0].update(bodyStart=0),
                       lambda m: m["variants"][0]["parts"][1].update(timelineStart=0)]:
            bad = copy.deepcopy(self.manifest)
            change(bad)
            with self.assertRaises(ValueError):
                self.prepare(manifest=bad)

    def test_swapped_hooks_changed_source_and_output_checksums_are_rejected(self):
        with self.assertRaises(ValueError):
            self.prepare(hooks={1: self.speech["h2"], 2: self.speech["h1"], 3: self.speech["h3"]})
        body = copy.deepcopy(self.speech["body"])
        body["sourceSha256"] = "0" * 64
        with self.assertRaises(ValueError):
            self.prepare(body=body)
        manifest = copy.deepcopy(self.manifest)
        manifest["variants"][2]["sha256"] = "0" * 64
        with self.assertRaises(ValueError):
            self.prepare(manifest=manifest)

    def test_timing_outside_part_is_not_clipped_to_assembly(self):
        body = copy.deepcopy(self.speech["body"])
        body["wordTimings"][0]["end"] = 0.3
        with self.assertRaises(ValueError):
            self.prepare(body=body)


if __name__ == "__main__":
    unittest.main()
